import type {
  CollectionRouteFailureCode,
  CollectionRouteKey,
  CollectionSnapshotPayload,
  MetricPulse,
} from "@douyin-local-life/shared";
import {
  extensionBridgeProtocolVersion,
  extensionCollectionProtocolVersion,
  liveScreenInternalApiEndpointKeys,
  liveScreenPulseCoreMetricKeys
} from "@douyin-local-life/shared";
import {
  isExactLocalPromotionInternalApiPage,
  localPromotionInternalApiAdapterVersion,
  localPromotionInternalApiContractVersion,
  localPromotionIdentityKey,
  localPromotionApiMetricKeys,
  localPromotionInternalApiEndpointKeys,
  localPromotionPulseMetricKeys,
} from "@douyin-local-life/shared";
import { collectionRouteLabels, defaultRequiredCollectionRoutes, normalizeCollectionRouteKey } from "@douyin-local-life/shared/collection-routes";
import { apiBaseUrlGuidance, defaultApiBaseUrl } from "./build-target";
import { MESSAGE, STORAGE } from "./messages";
import { isSupportedExtensionCollectionUrl, normalizeApiBaseUrl, sanitizeSnapshotPayload } from "./safety";
import {
  checkExtensionContextProtocol,
  parseExtensionContext,
  refreshConfigFromContext,
  type ExtensionConfig,
  type ExtensionContext
} from "./extension-context";
import { createKeyedSingleFlight } from "./single-flight";
import {
  localPromotionPulseCadenceMs,
  localPromotionRateLimitCooldownRemaining,
  nextLivePulseAfter
} from "./live-pulse-schedule";
import { advanceLivePulseFailure, fatalLivePulseFailureReason } from "./live-pulse-failure";
import { bridgeRecoveryRequestTimeoutMs, extensionRequestTimeoutMs, fetchWithTimeout, isRequestTimeout } from "./request-timeout";
import { uploadMetricPulseRequest, type MetricPulseUploadResult } from "./metric-pulse-upload";
import {
  contextRefreshErrorCode,
  createTaskPageConnectionActivity,
  resolveTaskPageBinding,
  shouldBlockTaskSwitchForActivePulse,
  taskIdFromBridgePageUrl
} from "./task-page-bridge-recovery";
import { normalizeLivePulseMetricKeys, parseLivePulseOutcome, type LivePulseOutcome } from "./live-pulse-status";
import { isLivePulseActivityReporter, livePulseActivityForTab, type LivePulseActivity } from "./live-pulse-activity";
import { isExactLiveScreenPage } from "./live-screen-pulse-page";
import { resolveLiveScreenRoomId } from "./live-screen-room-id";
import { canKeepLivePulseForUrlUpdate } from "./live-pulse-tab-update";
import { collectLocalPromotionInternalApi } from "./local-promotion-internal-api";
import { createLocalPromotionPulseSnapshot } from "./local-promotion-pulse-snapshot";

type CollectionSessionState = {
  taskId: string;
  collectionRunId: string;
  requiredRoutes: CollectionRouteKey[];
  startedAt: string;
};

type PageActivity = {
  currentUrl: string;
  pageType: CollectionSnapshotPayload["pageType"];
  routeKey?: CollectionRouteKey;
  collectable: boolean;
  tabState: "VISIBLE" | "HIDDEN" | "FROZEN" | "DISCARDED" | "UNKNOWN";
  observedAt: string;
  lastError?: string | null;
};

type RouteUploadState = Record<string, { fingerprint: string; lastUploadAt: number; consecutiveFailures: number }>;
type PendingPairingConfirmation = {
  apiBaseUrl: string;
  code: string;
  label: string;
  account: { id: string; accountName: string };
  task: { id: string; pageTitle: string | null; projectId: string; projectName: string } | null;
  expiresAt: string;
  requestedAt: string;
};
type PairingExchangeInput = Pick<PendingPairingConfirmation, "apiBaseUrl" | "code" | "label">;
type PulseState = {
  loopId: string;
  tabId: number;
  taskId: string;
  identityKey: string;
  routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD";
  currentUrl: string;
  collectionRunId: string | null;
  startedAt: string;
  consecutiveFailures: number;
  successCount: number;
  lastSuccessAt: string | null;
  lastMetricCount: number;
  lastMetricKeys: string[];
  lastFailureReason: string | null;
  lastFailureEndpoint: string | null;
  rateLimitedUntil: string | null;
  uploadController: AbortController | null;
};
type StoredPulseState = Omit<PulseState, "uploadController"> & {
  buildFingerprint: string;
  collectionProtocolVersion: number;
};
type StoredPulseStateMap = Record<string, StoredPulseState>;
type StoredPulseActivityMap = Record<string, LivePulseActivity>;
type StoredPulseOutcomeMap = Record<string, LivePulseOutcome>;
let uploadQueue: Promise<unknown> = Promise.resolve();
const captureSingleFlight = createKeyedSingleFlight();
const livePulseStates = new Map<number, PulseState>();
const livePulseActivities = new Map<number, LivePulseActivity>();
const latestLivePulseOutcomes = new Map<number, LivePulseOutcome>();
let livePulseStorageHydrated = false;
let livePulseStorageHydration: Promise<void> | null = null;
let livePulseStorageWriteQueue: Promise<void> = Promise.resolve();
let latestLivePulseOutcome: LivePulseOutcome | null = null;
const connectionSessionId = crypto.randomUUID();
let bindingQueue: Promise<unknown> = Promise.resolve();

function updateBinding<T>(operation: () => Promise<T>) {
  const result = bindingQueue.then(operation);
  bindingQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function bridgeBindingResponse(operation: () => Promise<object>) {
  try {
    const result = await updateBinding(operation);
    return { ...await getBridgeStatus(), ...result };
  } catch {
    return { ok: false, errorCode: "BRIDGE_REQUEST_FAILED" };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
    .then(() => appendLog("extension.installed"));
});
void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

chrome.tabs.onRemoved.addListener((tabId) => {
  void stopLivePulseForTab(tabId, "TAB_CLOSED");
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  void stopLivePulseForTabUpdate(tabId, changeInfo);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE.PAGE_ACTIVITY) {
    void handlePageActivity(message.payload as PageActivity, sender.tab?.id).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.CAPTURE_AND_UPLOAD) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "采集确认只能在插件 Popup 中完成。" });
      return false;
    }
    void captureAndUploadSingleFlight(message.payload || {}).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.START_LIVE_PULSE) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "实时脉冲只能在插件 Popup 中开启。" });
      return false;
    }
    void startLivePulse(message.payload || {}).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.START_LOCAL_PROMOTION_PULSE) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "实时脉冲只能在插件 Popup 中开启。" });
      return false;
    }
    void startLocalPromotionPulse(message.payload || {}).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.STOP_LIVE_PULSE) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "实时脉冲只能在插件 Popup 中停止。" });
      return false;
    }
    void stopLivePulse("USER_STOPPED", undefined, undefined, undefined, message.payload?.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === MESSAGE.STOP_LOCAL_PROMOTION_PULSE) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "实时脉冲只能在插件 Popup 中停止。" });
      return false;
    }
    void stopLivePulse("USER_STOPPED", undefined, undefined, undefined, message.payload?.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === MESSAGE.SUBMIT_LIVE_PULSE) {
    void submitLivePulse(message.payload || {}, sender.tab?.id, sender.tab?.url).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.SUBMIT_LOCAL_PROMOTION_PULSE) {
    void submitLocalPromotionPulse(message.payload || {}, sender.tab?.id, sender.tab?.url).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.GET_STATE) {
    void getState(Number.isInteger(message.payload?.tabId) ? Number(message.payload.tabId) : undefined).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.VERIFY_BOUND_CONTEXT) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "配对校验只能在插件 Popup 中完成。" });
      return false;
    }
    void updateBinding(verifyBoundContext).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.GET_BRIDGE_STATUS) {
    void getBridgeStatus().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.SYNC_CURRENT_TASK) {
    void bridgeBindingResponse(() => syncCurrentTaskFromBridge(sender)).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.PAIR_TASK_FROM_WEB) {
    void bridgeBindingResponse(() => pairTaskFromWeb(message.payload || {}, sender)).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.REQUEST_PAIRING_CONFIRMATION) {
    void requestPairingConfirmation(message.payload || {}).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.CONFIRM_PAIRING) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "配对确认只能在插件 Popup 中完成。" });
      return false;
    }
    void updateBinding(() => confirmPairing(sender)).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.CANCEL_PAIRING) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "配对取消只能在插件 Popup 中完成。" });
      return false;
    }
    void cancelPairingConfirmation().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.SELECT_TASK) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "任务切换只能在插件 Popup 中完成。" });
      return false;
    }
    void updateBinding(() => selectTask(message.payload || {})).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.CLEAR_PAIRING) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "解除配对只能在插件 Popup 中完成。" });
      return false;
    }
    void updateBinding(clearPairing).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.CLEAR_SNAPSHOT) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "清空本地快照只能在插件 Popup 中完成。" });
      return false;
    }
    void chrome.storage.local.remove(STORAGE.LATEST_SNAPSHOT).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function saveSnapshot(snapshot: CollectionSnapshotPayload, tabId?: number) {
  const safeSnapshot = sanitizeSnapshotPayload(snapshot) as CollectionSnapshotPayload;
  await chrome.storage.local.set({
    [STORAGE.LATEST_SNAPSHOT]: {
      ...safeSnapshot,
      extensionMeta: {
        tabId: tabId ?? null,
        savedAt: new Date().toISOString()
      }
    }
  });
  await appendLog("snapshot.saved", { sourceUrl: safeSnapshot.sourceUrl, metricCount: safeSnapshot.visibleMetricsJson.length, pageType: safeSnapshot.pageType });
  return { ok: true };
}

async function requestPairingConfirmation(payload: { apiBaseUrl?: string; code?: string; label?: string }) {
  const apiBaseUrl = normalizeApiBaseUrl(payload.apiBaseUrl || defaultApiBaseUrl);
  if (!apiBaseUrl) return { ok: false, error: apiBaseUrlGuidance };
  const code = String(payload.code || "").trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "请输入网页生成的 6 位配对码。" };
  const protocol = await checkPairingServiceProtocol(apiBaseUrl);
  if (!protocol.ok) return protocol;
  try {
    const response = await fetchWithTimeout(`${apiBaseUrl}/extension/pairing-codes/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, error: body?.error?.message || "配对码无效，请在任务页重新生成。" };
    const preview = body?.data as Omit<PendingPairingConfirmation, "apiBaseUrl" | "code" | "label" | "requestedAt"> | undefined;
    if (!preview?.account || !preview.expiresAt) return { ok: false, error: "服务器未返回可核对的配对信息。" };
    const expiresAt = new Date(preview.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { ok: false, error: "配对码已过期，请在任务页重新生成。" };
    const existing = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.TOKEN]);
    const existingConfig = (existing[STORAGE.CONFIG] || {}) as ExtensionConfig;
    if (
      existing[STORAGE.TOKEN]
      && existingConfig.accountProfileId === preview.account.id
      && existingConfig.collectionTaskId === preview.task?.id
    ) {
      return {
        ok: true,
        paired: true,
        boundTaskId: existingConfig.collectionTaskId,
        message: "插件已配对并绑定当前任务，无需重复确认。"
      };
    }
    const confirmation: PendingPairingConfirmation = {
      apiBaseUrl,
      code,
      label: String(payload.label || "Chrome 采集插件").trim().slice(0, 100) || "Chrome 采集插件",
      account: preview.account,
      task: preview.task || null,
      expiresAt: new Date(Math.min(expiresAt, Date.now() + 2 * 60_000)).toISOString(),
      requestedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ [STORAGE.PENDING_PAIRING_CONFIRMATION]: confirmation });
    return {
      ok: true,
      pendingConfirmation: true,
      message: "已创建两分钟有效的待确认配对请求，请打开插件 Popup 核对服务器、账号和任务后确认。"
    };
  } catch {
    return { ok: false, error: "无法读取配对信息，请检查网络或服务器地址。" };
  }
}

async function pairTaskFromWeb(
  payload: { apiBaseUrl?: string; code?: string },
  sender: chrome.runtime.MessageSender
) {
  // Only a content-script sender with a real browser tab may authorize the
  // direct web pairing flow; never trust a caller-supplied URL.
  const taskPageUrl = sender.tab?.url;
  const taskId = taskIdFromBridgePageUrl(taskPageUrl);
  if (!taskPageUrl || !taskId) {
    return { ok: false, errorCode: "TASK_PAGE_REQUIRED", error: "只能在当前采集任务页面自动连接插件。" };
  }
  const apiBaseUrl = normalizeApiBaseUrl(payload.apiBaseUrl || defaultApiBaseUrl);
  const code = String(payload.code || "").trim();
  if (!apiBaseUrl) return { ok: false, errorCode: "INVALID_PAIRING_REQUEST", error: apiBaseUrlGuidance };
  if (!/^\d{6}$/.test(code)) return { ok: false, errorCode: "INVALID_PAIRING_REQUEST", error: "网页配对码无效，请重新生成。" };
  const protocol = await checkPairingServiceProtocol(apiBaseUrl);
  if (!protocol.ok) return protocol;
  try {
    const previewResponse = await fetchWithTimeout(`${apiBaseUrl}/extension/pairing-codes/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code })
    });
    const previewBody = await previewResponse.json().catch(() => null);
    if (!previewResponse.ok) {
      return {
        ok: false,
        errorCode: previewResponse.status === 429 ? "PAIRING_RATE_LIMITED" : "PAIRING_CODE_INVALID",
        error: previewResponse.status === 429 ? "配对请求过于频繁，请稍后重试。" : "配对码错误、已使用或已过期，请在任务页重新生成。"
      };
    }
    const preview = previewBody?.data as { task?: { id?: string } | null; expiresAt?: string } | undefined;
    if (!preview?.task?.id || preview.task.id !== taskId) {
      return { ok: false, errorCode: "TASK_PAGE_MISMATCH", error: "配对码不属于当前任务页面，已阻止自动连接。" };
    }
    const pulseConflict = await pairingPulseConflict(taskId);
    if (pulseConflict) return pulseConflict;
    const exchangeInput: PairingExchangeInput = {
      apiBaseUrl,
      code,
      label: "网页任务一键配对"
    };
    const result = await exchangePairingConfirmation(exchangeInput, taskId, taskPageUrl);
    return result.ok
      ? { ...result, autoConnected: true, taskPageUrl }
      : result;
  } catch (error: unknown) {
    return isRequestTimeout(error)
      ? { ok: false, errorCode: "PAIRING_API_TIMEOUT", error: "诊断服务响应超时，请检查本机 API 后重试。" }
      : { ok: false, errorCode: "PAIRING_REQUEST_FAILED", error: "无法连接诊断服务，请检查网络或服务器地址。" };
  }
}

async function confirmPairing(sender: chrome.runtime.MessageSender) {
  const stored = await chrome.storage.local.get([STORAGE.PENDING_PAIRING_CONFIRMATION]);
  const confirmation = stored[STORAGE.PENDING_PAIRING_CONFIRMATION] as PendingPairingConfirmation | undefined;
  if (!confirmation || new Date(confirmation.expiresAt).getTime() <= Date.now()) {
    await chrome.storage.local.remove(STORAGE.PENDING_PAIRING_CONFIRMATION);
    return { ok: false, error: "待确认配对请求已过期，请返回任务页重新生成配对码。" };
  }
  const protocol = await checkPairingServiceProtocol(confirmation.apiBaseUrl);
  if (!protocol.ok) return protocol;
  const taskId = confirmation.task?.id;
  const taskPageUrl = taskId ? await currentTaskPageUrl(taskId, sender.tab?.url) : null;
  const pulseConflict = await pairingPulseConflict(taskId);
  if (pulseConflict) return pulseConflict;
  return exchangePairingConfirmation(confirmation, taskId, taskPageUrl || undefined);
}

async function pairingPulseConflict(targetTaskId?: string) {
  await hydrateLivePulseStorage();
  if (livePulseStates.size === 0) return null;
  const local = await chrome.storage.local.get([STORAGE.CONFIG]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const hasDifferentTask = [...livePulseStates.values()].some((activePulse) => (
    !targetTaskId || activePulse.taskId !== targetTaskId || config.collectionTaskId !== targetTaskId
  ));
  if (!hasDifferentTask) return null;
  return {
    ok: false as const,
    errorCode: "ACTIVE_PULSE_STOP_REQUIRED",
    error: "已有其他任务正在持续采集，请先在插件 Popup 手动停止后再配对。"
  };
}

async function currentTaskPageUrl(expectedTaskId: string, senderUrl?: string) {
  const candidates = [senderUrl];
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    candidates.push(tabs[0]?.url);
  } catch {
    // A popup may be opened without a queryable focused window. Pairing can
    // still complete, but it must not invent a task-page heartbeat URL.
  }
  return candidates.find((url) => taskIdFromBridgePageUrl(url) === expectedTaskId) || null;
}

async function exchangePairingConfirmation(
  confirmation: PairingExchangeInput,
  expectedTaskId?: string,
  taskPageUrl?: string
) {
  try {
    const response = await fetchWithTimeout(`${confirmation.apiBaseUrl}/extension/pairing-codes/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: confirmation.code, label: confirmation.label })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        errorCode: response.status === 429 ? "PAIRING_RATE_LIMITED" : "PAIRING_CODE_INVALID",
        error: response.status === 429 ? "配对请求过于频繁，请稍后重试。" : "配对码错误、已使用或已过期，请在任务页重新生成。"
      };
    }
    const token: unknown = body?.data?.token;
    if (typeof token !== "string" || !token.trim()) return { ok: false, errorCode: "PAIRING_RESPONSE_INVALID", error: "服务器未返回有效插件凭证，请重新配对。" };
    const suggestedTaskId = expectedTaskId || (typeof body?.data?.suggestedTask?.id === "string" ? body.data.suggestedTask.id : undefined);
    // The code is already consumed. Persist the credential before any further
    // network request so a restart or failed heartbeat can resume verification.
    await chrome.storage.local.set({
      [STORAGE.TOKEN]: token,
      [STORAGE.CONFIG]: { apiBaseUrl: confirmation.apiBaseUrl, collectionTaskId: suggestedTaskId },
      [STORAGE.CONTEXT]: null
    });
    await chrome.storage.local.remove([STORAGE.PENDING_PAIRING_CONFIRMATION, STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.ROUTE_UPLOAD_STATE, STORAGE.LATEST_SNAPSHOT]);
    const contextResponse = await fetchWithTimeout(`${confirmation.apiBaseUrl}/extension/context`, {
      headers: extensionContextRequestHeaders(token)
    });
    const contextBody = await contextResponse.json().catch(() => null);
    if (!contextResponse.ok) {
      return {
        ok: false,
        errorCode: contextResponse.status === 401 || contextResponse.status === 403 ? "PAIRING_CREDENTIAL_REJECTED" : "PAIRING_SERVICE_ERROR",
        error: contextResponse.status === 401 || contextResponse.status === 403 ? "插件凭证未被服务端接受，请重新配对。" : "无法读取已配对账号，请检查本机 API。"
      };
    }
    const protocolCheck = checkExtensionContextProtocol(contextBody.data, extensionCollectionProtocolVersion);
    if (!protocolCheck.ok) return { ok: false, errorCode: protocolCheck.code, error: protocolErrorMessage(protocolCheck.code) };
    const context = parseExtensionContext(contextBody.data);
    if (!context) return { ok: false, errorCode: "INVALID_CONTEXT", error: "服务器返回的账号上下文无效，已停止配对。" };
    const suggestedProject = suggestedTaskId
      ? context.account.projects.find((project) => project.tasks.some((task) => task.id === suggestedTaskId))
      : undefined;
    const suggestedTask = suggestedProject?.tasks.find((task) => task.id === suggestedTaskId);
    if (expectedTaskId && (!suggestedProject || !suggestedTask)) {
      return { ok: false, errorCode: "TASK_ACCOUNT_MISMATCH", error: "当前任务不属于已配对账号，未完成自动连接。" };
    }
    const config: ExtensionConfig = {
      apiBaseUrl: confirmation.apiBaseUrl,
      accountProfileId: context.account.id,
      accountName: context.account.accountName,
      ...(suggestedProject && suggestedTask
        ? {
            collectionTaskId: suggestedTask.id,
            projectId: suggestedProject.id,
            projectName: suggestedProject.name
          }
        : {})
    };
    const pulseConflict = await pairingPulseConflict(config.collectionTaskId);
    if (pulseConflict) return pulseConflict;
    await chrome.storage.local.set({ [STORAGE.CONFIG]: config, [STORAGE.CONTEXT]: context });
    const heartbeat = taskPageUrl
      ? await reportExtensionHeartbeatForCredentials({
          apiBaseUrl: confirmation.apiBaseUrl,
          collectionTaskId: config.collectionTaskId,
          token
        }, createTaskPageConnectionActivity(taskPageUrl))
      : { ok: true as const, skipped: true as const };
    if (!heartbeat.ok) {
      const heartbeatError = "error" in heartbeat && typeof heartbeat.error === "string" ? heartbeat.error : "任务页心跳未被服务端确认。";
      return {
        ok: false,
        errorCode: /超时/.test(heartbeatError) ? "HEARTBEAT_TIMEOUT" : "HEARTBEAT_FAILED",
        error: /超时/.test(heartbeatError) ? "任务页心跳响应超时，请检查本机 API 后重试。" : "任务页心跳未被服务端确认，请检查本机 API 后重试。"
      };
    }
    await appendLog("extension.paired", { accountProfileId: context.account.id, expiresAt: body?.data?.expiresAt });
    return { ok: true, paired: true, config, context };
  } catch (error: unknown) {
    return isRequestTimeout(error)
      ? { ok: false, errorCode: "PAIRING_API_TIMEOUT", error: "诊断服务响应超时，请检查本机 API 后重试。" }
      : { ok: false, errorCode: "PAIRING_SERVICE_ERROR", error: "无法连接诊断服务，请检查网络或服务器地址。" };
  }
}

async function cancelPairingConfirmation() {
  await chrome.storage.local.remove(STORAGE.PENDING_PAIRING_CONFIRMATION);
  return { ok: true, message: "已取消待确认配对请求。" };
}

async function checkPairingServiceProtocol(apiBaseUrl: string) {
  try {
    const response = await fetchWithTimeout(`${apiBaseUrl}/version`);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false as const, errorCode: "PAIRING_SERVICE_UNAVAILABLE", error: "无法读取本地服务版本，请确认 API 正常运行。" };
    }
    const payload = body && typeof body === "object" && "data" in body
      ? (body as { data?: unknown }).data
      : null;
    const serviceExtensionVersion = payload && typeof payload === "object" && "extensionVersion" in payload
      ? (payload as { extensionVersion?: unknown }).extensionVersion
      : undefined;
    if (typeof serviceExtensionVersion !== "string") {
      return { ok: false as const, errorCode: "SERVICE_UPDATE_REQUIRED", error: "本地服务版本信息不完整，请先更新并重启本地服务。" };
    }
    if (serviceExtensionVersion !== chrome.runtime.getManifest().version) {
      return { ok: false as const, errorCode: "EXTENSION_UPDATE_REQUIRED", error: "采集插件版本与本地服务不一致，请重新加载当前版本插件。" };
    }
    const collectionProtocolVersion = payload && typeof payload === "object" && "collectionProtocolVersion" in payload
      ? (payload as { collectionProtocolVersion?: unknown }).collectionProtocolVersion
      : undefined;
    const protocolCheck = checkExtensionContextProtocol({ collectionProtocolVersion }, extensionCollectionProtocolVersion);
    if (!protocolCheck.ok) {
      return {
        ok: false as const,
        errorCode: protocolCheck.ok ? "PAIRING_SERVICE_UNAVAILABLE" : protocolCheck.code,
        error: protocolCheck.ok ? "无法读取本地服务版本，请确认 API 正常运行。" : protocolErrorMessage(protocolCheck.code)
      };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, errorCode: "PAIRING_SERVICE_UNAVAILABLE", error: "无法读取本地服务版本，请确认 API 正常运行。" };
  }
}

async function selectTask(payload: { collectionTaskId?: string }) {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.CONTEXT, STORAGE.TOKEN]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const context = local[STORAGE.CONTEXT] as ExtensionContext | undefined;
  const token = local[STORAGE.TOKEN] as string | undefined;
  if (!token || !context) return { ok: false, error: "请先使用配对码绑定账号。" };
  const taskId = String(payload.collectionTaskId || "").trim();
  const project = context.account.projects.find((item) => item.tasks.some((task) => task.id === taskId));
  const task = project?.tasks.find((item) => item.id === taskId);
  if (!project || !task) return { ok: false, error: "所选任务不属于当前绑定账号，已阻止切换。" };
  await hydrateLivePulseStorage();
  if (shouldBlockTaskSwitchForActivePulse({
    boundTaskId: config.collectionTaskId,
    targetTaskId: task.id,
    hasActivePulse: livePulseStates.size > 0
  })) {
    return { ok: false, error: "另一任务正在持续采集，请先在插件 Popup 手动停止后再切换任务。" };
  }
  const nextConfig: ExtensionConfig = { ...config, collectionTaskId: task.id, projectId: project.id, projectName: project.name };
  await chrome.storage.local.set({ [STORAGE.CONFIG]: nextConfig });
  await chrome.storage.local.remove([STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.ROUTE_UPLOAD_STATE, STORAGE.LATEST_SNAPSHOT, STORAGE.LIVE_PULSE_LAST_OUTCOME, STORAGE.LIVE_PULSE_ACTIVITY, STORAGE.LIVE_PULSE_STATE]);
  resetLivePulseStorage();
  await appendLog("task.selected", { accountProfileId: context.account.id, projectId: project.id, collectionTaskId: task.id });
  await reportExtensionHeartbeatFromStoredActivity();
  return { ok: true, config: nextConfig };
}

async function clearPairing() {
  await stopLivePulse("UNPAIRED");
  await chrome.storage.local.remove([STORAGE.TOKEN, STORAGE.CONFIG, STORAGE.CONTEXT, STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.PENDING_PAIRING_CONFIRMATION, STORAGE.LIVE_PULSE_LAST_OUTCOME, STORAGE.LIVE_PULSE_ACTIVITY, STORAGE.LIVE_PULSE_STATE]);
  resetLivePulseStorage();
  await appendLog("extension.unpaired");
  return { ok: true };
}

async function getState(tabId?: number) {
  const local = await chrome.storage.local.get([
    STORAGE.CONFIG,
    STORAGE.LATEST_SNAPSHOT,
    STORAGE.LOGS,
    STORAGE.ROUTE_UPLOAD_STATE,
    STORAGE.PAGE_ACTIVITY,
    STORAGE.TOKEN,
    STORAGE.CONTEXT,
    STORAGE.ACTIVE_COLLECTION_SESSION,
    STORAGE.PENDING_PAIRING_CONFIRMATION,
    STORAGE.LIVE_PULSE_LAST_OUTCOME,
    STORAGE.LIVE_PULSE_ACTIVITY,
    STORAGE.LIVE_PULSE_STATE
  ]);
  await hydrateLivePulseStorage();
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const selectedTabId = Number.isInteger(tabId) && Number(tabId) > 0
    ? Number(tabId)
    : await activeBrowserTabId();
  const currentTaskId = typeof config.collectionTaskId === "string" ? config.collectionTaskId : null;
  const selectedState = selectedTabId ? livePulseStates.get(selectedTabId) || null : null;
  const activeLivePulseState = selectedState && (!currentTaskId || selectedState.taskId === currentTaskId)
    ? selectedState
    : null;
  const pulseDisplays = new Map<number, Record<string, unknown>>();
  for (const state of livePulseStates.values()) {
    if (currentTaskId && state.taskId !== currentTaskId) continue;
    pulseDisplays.set(state.tabId, livePulseDisplayForState(state));
  }
  for (const outcome of latestLivePulseOutcomes.values()) {
    if (currentTaskId && outcome.taskId !== currentTaskId) continue;
    if (!pulseDisplays.has(outcome.tabId || -1) && Number.isInteger(outcome.tabId)) {
      pulseDisplays.set(Number(outcome.tabId), livePulseDisplayForOutcome(outcome));
    }
  }
  const livePulses = [...pulseDisplays.values()];
  const selectedOutcome = selectedTabId ? latestLivePulseOutcomes.get(selectedTabId) || null : latestLivePulseOutcome;
  const lastLivePulseOutcome = selectedOutcome && (!currentTaskId || selectedOutcome.taskId === currentTaskId)
    ? selectedOutcome
    : null;
  const selectedLivePulse = activeLivePulseState
    ? livePulseDisplayForState(activeLivePulseState)
    : livePulseDisplayForOutcome(lastLivePulseOutcome);
  const pending = local[STORAGE.PENDING_PAIRING_CONFIRMATION] as PendingPairingConfirmation | undefined;
  if (pending && new Date(pending.expiresAt).getTime() <= Date.now()) {
    await chrome.storage.local.remove(STORAGE.PENDING_PAIRING_CONFIRMATION);
  }
  return {
    ok: true,
    config: local[STORAGE.CONFIG] || {},
    latestSnapshot: local[STORAGE.LATEST_SNAPSHOT] || null,
    logs: local[STORAGE.LOGS] || [],
    routeUploadState: local[STORAGE.ROUTE_UPLOAD_STATE] || {},
    pageActivity: local[STORAGE.PAGE_ACTIVITY] || null,
    livePulseActivity: selectedTabId ? livePulseActivities.get(selectedTabId) || null : null,
    activeCollectionSession: local[STORAGE.ACTIVE_COLLECTION_SESSION] || null,
    livePulse: selectedLivePulse,
    livePulses,
    context: local[STORAGE.CONTEXT] || null,
    hasToken: Boolean(local[STORAGE.TOKEN]),
    pendingPairingConfirmation: pending && new Date(pending.expiresAt).getTime() > Date.now()
      ? { apiBaseUrl: pending.apiBaseUrl, account: pending.account, task: pending.task, expiresAt: pending.expiresAt }
      : null
  };
}

async function activeBrowserTabId() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const id = tab?.id;
    return Number.isInteger(id) && Number(id) > 0 ? Number(id) : null;
  } catch {
    return null;
  }
}

async function verifyBoundContext() {
  const verified = await refreshBoundContext();
  if (!verified.ok) {
    await appendLog("extension.binding_verification_failed", { error: verified.error });
    return verified;
  }
  const state = await getState();
  await appendLog("extension.binding_verified", {
    accountProfileId: state.config.accountProfileId || null,
    collectionTaskId: state.config.collectionTaskId || null
  });
  return { ok: true, state, verifiedAt: new Date().toISOString() };
}

async function getBridgeStatus() {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.TOKEN, STORAGE.PENDING_PAIRING_CONFIRMATION]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const paired = Boolean(local[STORAGE.TOKEN]);
  return {
    ok: true,
    paired,
    pendingConfirmation: Boolean((local[STORAGE.PENDING_PAIRING_CONFIRMATION] as PendingPairingConfirmation | undefined)?.expiresAt && new Date((local[STORAGE.PENDING_PAIRING_CONFIRMATION] as PendingPairingConfirmation).expiresAt).getTime() > Date.now()),
    boundTaskId: paired ? config.collectionTaskId || null : null,
    connectionSessionId,
    protocolVersion: extensionBridgeProtocolVersion,
    extensionVersion: chrome.runtime.getManifest().version,
    buildFingerprint: __PXXIS_EXTENSION_BUILD__,
    message: paired
      ? config.collectionTaskId ? "插件已有本地凭证，正在核对任务连接" : "插件已有本地凭证，尚未选择采集任务"
      : "插件运行正常，尚未配对"
  };
}

async function syncCurrentTaskFromBridge(sender: chrome.runtime.MessageSender) {
  const taskPageUrl = sender.tab?.url || sender.url;
  const taskId = taskIdFromBridgePageUrl(taskPageUrl);
  if (!taskPageUrl || !taskId) {
    return { ok: false, errorCode: "TASK_PAGE_REQUIRED", error: "只能在当前采集任务页面自动连接插件。" };
  }

  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.TOKEN]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const token = local[STORAGE.TOKEN] as string | undefined;
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl || "");
  if (!token || !apiBaseUrl) {
    return { ok: false, errorCode: "PAIRING_REQUIRED", error: "当前浏览器尚未连接采集插件，请完成一次账号配对。" };
  }

  try {
    const response = await fetchWithTimeout(`${apiBaseUrl}/extension/context`, {
      headers: extensionContextRequestHeaders(token)
    }, bridgeRecoveryRequestTimeoutMs);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const errorCode = contextRefreshErrorCode(response.status);
      return {
        ok: false,
        errorCode,
        error: errorCode === "PAIRING_REQUIRED"
          ? "插件凭证已失效，请重新连接采集账号。"
          : "无法验证已配对账号，请检查本机 API。"
      };
    }
    const payload = body && typeof body === "object" && "data" in body
      ? (body as { data?: unknown }).data
      : null;
    const protocolCheck = checkExtensionContextProtocol(payload, extensionCollectionProtocolVersion);
    if (!protocolCheck.ok) {
      return { ok: false, errorCode: protocolCheck.code, error: protocolErrorMessage(protocolCheck.code) };
    }
    const context = parseExtensionContext(payload);
    if (!context) return { ok: false, errorCode: "INVALID_CONTEXT", error: "服务器返回的账号上下文无效，未切换任务。" };
    const binding = resolveTaskPageBinding(context, taskId);
    if (!binding) {
      return { ok: false, errorCode: "TASK_ACCOUNT_MISMATCH", error: "当前任务不属于已配对账号，未切换插件。" };
    }

    const { project, task } = binding;
    const changed = config.collectionTaskId !== task.id;
    await hydrateLivePulseStorage();
    if (shouldBlockTaskSwitchForActivePulse({
      boundTaskId: config.collectionTaskId,
      targetTaskId: task.id,
      hasActivePulse: livePulseStates.size > 0
    })) {
      return { ok: false, errorCode: "ACTIVE_PULSE_STOP_REQUIRED", error: "另一任务正在持续采集，请先在插件 Popup 手动停止后再切换任务。" };
    }
    const nextConfig: ExtensionConfig = {
      ...config,
      apiBaseUrl,
      accountProfileId: context.account.id,
      accountName: context.account.accountName,
      collectionTaskId: task.id,
      projectId: project.id,
      projectName: project.name
    };
    const heartbeat = await reportExtensionHeartbeatForCredentials({
      apiBaseUrl,
      collectionTaskId: task.id,
      token
    }, createTaskPageConnectionActivity(taskPageUrl), bridgeRecoveryRequestTimeoutMs);
    if (!heartbeat.ok) {
      return { ok: false, errorCode: "HEARTBEAT_FAILED", error: heartbeat.error || "当前任务心跳未被服务端确认，未切换插件任务。" };
    }
    await chrome.storage.local.set({ [STORAGE.CONFIG]: nextConfig, [STORAGE.CONTEXT]: context });
    if (changed) {
      await chrome.storage.local.remove([
        STORAGE.ACTIVE_COLLECTION_SESSION,
        STORAGE.ROUTE_UPLOAD_STATE,
        STORAGE.LATEST_SNAPSHOT,
        STORAGE.LIVE_PULSE_LAST_OUTCOME,
        STORAGE.LIVE_PULSE_ACTIVITY,
        STORAGE.LIVE_PULSE_STATE
      ]);
      resetLivePulseStorage();
      await appendLog("task.auto_selected", { accountProfileId: context.account.id, projectId: project.id, collectionTaskId: task.id });
    }
    return {
      ok: true,
      paired: true,
      boundTaskId: task.id,
      config: nextConfig,
      message: changed ? "已自动连接当前任务。" : "插件已连接当前任务。"
    };
  } catch (error: unknown) {
    return {
      ok: false,
      errorCode: isRequestTimeout(error) ? "CONTEXT_TIMEOUT" : "CONTEXT_REFRESH_FAILED",
      error: isRequestTimeout(error) ? "本机 API 响应超时，请检查本地服务是否仍在运行。" : "无法验证已配对账号，请检查本机 API。"
    };
  }
}

function isPopupSender(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && typeof sender.url === "string" && sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/popup.html`);
}

async function savePageActivity(activity: PageActivity, tabId?: number) {
  const current = await chrome.storage.local.get([STORAGE.PAGE_ACTIVITY]);
  const previous = current[STORAGE.PAGE_ACTIVITY] as (PageActivity & { tabId?: number }) | undefined;
  const previousIsFreshVisible = previous?.tabState === "VISIBLE"
    && Date.now() - new Date(previous.observedAt).getTime() < 10_000;
  if (activity.tabState !== "VISIBLE" && previousIsFreshVisible && previous?.tabId !== tabId) {
    return { ok: true, skipped: true, reason: "VISIBLE_TAB_PREFERRED" };
  }
  const next = { ...activity, tabId: tabId ?? null };
  await chrome.storage.local.set({ [STORAGE.PAGE_ACTIVITY]: next });
  const heartbeat = await reportExtensionHeartbeat(activity);
  return { ok: true, heartbeatReported: heartbeat.ok };
}

async function handlePageActivity(activity: PageActivity, tabId?: number) {
  const activeLivePulseState = await hydrateLivePulseState(tabId);
  if (!isLivePulseActivityReporter(activeLivePulseState?.tabId, tabId)) return savePageActivity(activity, tabId);
  if (shouldStopLivePulseForActivity(activity, activeLivePulseState?.routeKey)) {
    await stopLivePulse("PAGE_INACTIVE", undefined, undefined, activeLivePulseState || undefined);
    return savePageActivity(activity, tabId);
  }
  const liveActivity = livePulseActivityForTab(activity, tabId!);
  if (liveActivity) await setLivePulseActivity(liveActivity);
  return savePageActivity(activity, tabId);
}

async function captureAndUpload(
  payload: { tabId?: number; currentUrl?: string; routeOverride?: CollectionRouteKey },
  routeHint: CollectionRouteKey = "UNKNOWN"
) {
  const tabId = Number(payload.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) return { ok: false, error: "无法识别当前标签页，请关闭插件弹窗后重试。" };
  if (!isSupportedExtensionCollectionUrl(payload.currentUrl || "")) return { ok: false, error: "当前页面不在已授权的精确采集路线中。" };
  if (isExactLocalPromotionInternalApiPage(payload.currentUrl || "")) {
    return { ok: false, error: "巨量本地推仅支持 API 持续采集，不再创建 DOM 快照。" };
  }
  const refreshedContext = await refreshBoundContext();
  if (!refreshedContext.ok) return refreshedContext;
  const routeOverride = normalizeCollectionRouteKey(payload.routeOverride);
  const allowedRoutes = await currentTaskRouteKeys();
  if (payload.routeOverride) {
    if (routeOverride === "UNKNOWN" || !allowedRoutes.includes(routeOverride)) {
      return { ok: false, error: "本次人工路线选择无效，请重新选择当前任务中的采集路线。" };
    }
  }
  const session = await ensureCollectionSession();
  if (!session.ok) return session;
  let captureResponse: { ok?: boolean; snapshot?: CollectionSnapshotPayload; error?: string };
  try {
    captureResponse = await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE.START_COLLECTION,
      payload: {
        collectionRunId: session.session.collectionRunId,
        routeOverride: payload.routeOverride ? routeOverride : undefined,
        liveScreenInternalApiEnabled: refreshedContext.context.liveScreenInternalApi.enabled
      }
    });
  } catch {
    await reportCaptureFailure(session.session.collectionRunId, routeHint, "CONTENT_SCRIPT_UNAVAILABLE", "Content script unavailable");
    return { ok: false, error: "插件尚未注入当前页面，请刷新目标网页后重试。" };
  }
  if (!captureResponse?.ok || !captureResponse.snapshot) {
    await reportCaptureFailure(
      session.session.collectionRunId,
      routeHint,
      "PAGE_NOT_READY",
      captureResponse?.error || "Page capture did not return a snapshot"
    );
    return { ok: false, error: captureResponse?.error || "页面采集失败，请等待页面加载完成后重试。" };
  }
  const snapshot = {
    ...captureResponse.snapshot,
    collectionRunId: session.session.collectionRunId,
    captureProtocolVersion: extensionCollectionProtocolVersion
  };
  if (!snapshot.routeKey || snapshot.routeKey === "UNKNOWN") {
    await reportCaptureFailure(session.session.collectionRunId, routeHint, "ROUTE_UNVERIFIED", "Captured route was not verified");
    return { ok: false, error: "无法确认当前页面路线，请在插件中选择当前任务允许的采集路线后重试。" };
  }
  const snapshotRouteKey = normalizeCollectionRouteKey(snapshot.routeKey);
  if (!allowedRoutes.includes(snapshotRouteKey)) {
    await reportCaptureFailure(session.session.collectionRunId, snapshotRouteKey, "ROUTE_UNVERIFIED", "Captured route is not enabled for the current task");
    return { ok: false, error: `当前任务已取消“${routeLabel(snapshotRouteKey)}”采集路线，请刷新插件状态后采集任务页列出的路线。` };
  }
  await saveSnapshot(snapshot, tabId);
  const upload = await enqueueSnapshotUpload(snapshot);
  if (!upload.ok) {
    await reportExtensionHeartbeat({
      currentUrl: snapshot.sourceUrl,
      pageType: snapshot.pageType,
      routeKey: snapshot.routeKey,
      collectable: true,
      tabState: "VISIBLE",
      observedAt: new Date().toISOString(),
      lastError: upload.error || "快照上传失败"
    });
    return upload;
  }
  await savePageActivity({
    currentUrl: snapshot.sourceUrl,
    pageType: snapshot.pageType,
    routeKey: snapshot.routeKey,
    collectable: true,
    tabState: "VISIBLE",
    observedAt: new Date().toISOString(),
    lastError: null
  }, tabId);
  const recognizedMetricCount = snapshot.visibleMetricsJson.length;
  const metricCount = snapshot.visibleMetricsJson.filter((metric) => metric.value != null && String(metric.value).trim() !== "").length;
  const apiMeta = snapshot.captureMeta?.liveScreenInternalApi;
  const apiEndpointSuccessCount = apiMeta?.endpointStatuses.filter((status) => status.status === "SUCCESS").length || 0;
  const hasApiMetric = snapshot.visibleMetricsJson.some((metric) => (
    metric.metricSource === "XHR_JSON" || ["INTERNAL_API", "API_AND_DOM", "SOURCE_CONFLICT"].includes(metric.rawEvidence?.sourceStatus || "")
  ));
  const hasDomMetric = snapshot.visibleMetricsJson.some((metric) => (
    metric.metricSource === "DOM_TEXT" || Boolean(metric.rawEvidence?.domCandidate)
  ));
  const captureSource = hasApiMetric
    ? hasDomMetric ? "API_AND_DOM" : "API"
    : apiMeta?.enabled === true ? "API_FAILED_DOM_FALLBACK" : "DOM";
  return {
    ok: true,
    skipped: (upload as { skipped?: boolean }).skipped || false,
    routeKey: snapshot.routeKey || "UNKNOWN",
    metricCount,
    recognizedMetricCount,
    missingMetricCount: recognizedMetricCount - metricCount,
    captureSource,
    apiEndpointSuccessCount,
    coverageRatio: snapshot.captureMeta?.coverageRatio ?? null,
    uploadedAt: new Date().toISOString()
  };
}

async function captureAndUploadSingleFlight(payload: { tabId?: number; currentUrl?: string; routeOverride?: CollectionRouteKey }) {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.ACTIVE_COLLECTION_SESSION]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const session = local[STORAGE.ACTIVE_COLLECTION_SESSION] as CollectionSessionState | undefined;
  let routeKey = normalizeCollectionRouteKey(payload.routeOverride);
  const tabId = Number(payload.tabId);
  if (routeKey === "UNKNOWN" && Number.isInteger(tabId) && tabId > 0) {
    const pageContext = await chrome.tabs.sendMessage(tabId, { type: MESSAGE.GET_PAGE_CONTEXT }).catch(() => null);
    routeKey = normalizeCollectionRouteKey(pageContext?.routeKey);
  }
  const key = [
    config.collectionTaskId || "unbound",
    tabId || "unknown-tab",
    routeKey,
    session?.collectionRunId || "new-run"
  ].join(":");
  return captureSingleFlight.run(key, () => captureAndUpload(payload, routeKey));
}

async function livePulseStartConflict(tabId: number, routeKey: PulseState["routeKey"]) {
  await hydrateLivePulseStorage();
  const active = livePulseStates.get(tabId) || null;
  if (!active) return null;
  return active.routeKey === routeKey
    ? "当前页面已有 API 持续采集，请先停止后再启动。"
    : "当前标签页已有另一条 API 持续采集，请先停止后再启动。";
}

async function startLivePulse(payload: { tabId?: number; currentUrl?: string }) {
  const tabId = Number(payload.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) return { ok: false, error: "无法识别当前标签页，请关闭插件弹窗后重试。" };
  if (!isExactLiveScreenPage(payload.currentUrl || "")) return { ok: false, error: "实时脉冲仅支持直播数据大屏的精确页面。" };
  const refreshedContext = await refreshBoundContext();
  if (!refreshedContext.ok) return refreshedContext;
  if (!refreshedContext.context.liveScreenInternalApi.enabled) {
    return { ok: false, error: "服务端 API 开关未开启；未启动实时脉冲，也不会静默改用 DOM。" };
  }
  const pageContext = await chrome.tabs.sendMessage(tabId, { type: MESSAGE.GET_PAGE_CONTEXT }).catch(() => null);
  if (pageContext?.buildFingerprint !== __PXXIS_EXTENSION_BUILD__) {
    return { ok: false, error: "目标直播页仍在运行旧版插件脚本；请刷新当前直播页后再开始 API 持续采集。" };
  }
  const initialLiveActivity = livePulseActivityForTab({
    currentUrl: pageContext?.currentUrl || "",
    pageType: pageContext?.pageType || "UNKNOWN",
    routeKey: normalizeCollectionRouteKey(pageContext?.routeKey),
    collectable: true,
    tabState: pageContext?.tabState === "VISIBLE" ? "VISIBLE" : "HIDDEN",
    observedAt: new Date().toISOString()
  }, tabId);
  if (
    pageContext?.pageType !== "LIVE_DATA_SCREEN"
    || !isExactLiveScreenPage(pageContext?.currentUrl || "")
    || !initialLiveActivity
    || shouldStopLivePulseForActivity(initialLiveActivity)
  ) {
    return { ok: false, error: "当前标签页不是可用的直播数据大屏。" };
  }
  if (pageContext?.livePulseEligible !== true) {
    return { ok: false, error: "当前直播页未提供可信 room_id；未启动 API 采集，也不会改用 DOM。" };
  }
  const session = await ensureCollectionSession();
  if (!session.ok) return session;
  const livePulseConflict = await livePulseStartConflict(tabId, "LIVE_DATA_SCREEN");
  if (livePulseConflict) return { ok: false, error: livePulseConflict };
  await clearLivePulseOutcome(tabId);
  const api = await apiContext();
  if (!api.ok) return api;
  const roomId = typeof pageContext?.livePulseRoomId === "string" && pageContext.livePulseRoomId.trim()
    ? pageContext.livePulseRoomId.trim()
    : roomIdFromLiveScreenUrl(pageContext?.currentUrl || payload.currentUrl || "");
  if (!roomId) {
    return { ok: false, error: "当前直播页未提供可信 room_id；未启动 API 采集，也不会改用 DOM。" };
  }
  await setLivePulseActivity(initialLiveActivity);
  const state: PulseState = {
    loopId: `${tabId}:${Date.now()}`,
    tabId,
    taskId: api.collectionTaskId,
    identityKey: roomId,
    routeKey: "LIVE_DATA_SCREEN" as const,
    currentUrl: pageContext.currentUrl,
    collectionRunId: session.session.collectionRunId,
    startedAt: new Date().toISOString(),
    consecutiveFailures: 0,
    successCount: 0,
    lastSuccessAt: null,
    lastMetricCount: 0,
    lastMetricKeys: [],
    lastFailureReason: null,
    lastFailureEndpoint: null,
    rateLimitedUntil: null,
    uploadController: null
  };
  livePulseStates.set(tabId, state);
  await persistLivePulseState();
  await appendLog("live_pulse.started", { tabId, taskId: api.collectionTaskId });
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE.BEGIN_LIVE_PULSE_LOOP,
      payload: {
        loopId: state.loopId,
        collectionRunId: state.collectionRunId,
        liveScreenInternalApiEnabled: refreshedContext.context.liveScreenInternalApi.enabled
      }
    });
  } catch {
    await stopLivePulse("CONTENT_SCRIPT_UNAVAILABLE", undefined, undefined, state);
    return { ok: false, error: "插件尚未注入当前页面，请刷新目标网页后重试。" };
  }
  return { ok: true, nextRefreshAt: new Date().toISOString() };
}

async function submitLivePulse(payload: { loopId?: string; pulseStartedAt?: number; snapshot?: CollectionSnapshotPayload; error?: string }, tabId?: number, senderUrl?: string) {
  const state = await hydrateLivePulseState(tabId);
  if (!state || tabId !== state.tabId) return { ok: false, stop: true, error: "LIVE_PULSE_NOT_ACTIVE" };
  if (payload.loopId !== state.loopId) return { ok: false, stop: true, error: "LIVE_PULSE_REPLACED" };
  const pulseStartedAt = Number.isFinite(payload.pulseStartedAt) ? Number(payload.pulseStartedAt) : Date.now();
  const activity = await hydrateLivePulseActivity(tabId);
  if (
    !activity
    || activity.tabId !== state.tabId
    || shouldStopLivePulseForActivity(activity)
    || !isExactLiveScreenPage(senderUrl || activity.currentUrl)
  ) {
    await stopLivePulse("PAGE_INACTIVE", undefined, undefined, state);
    return { ok: false, stop: true, error: "PAGE_INACTIVE" };
  }
  if (payload.error || !payload.snapshot) {
    const failure = await handleLivePulseFailure(state, payload.error || "PULSE_CAPTURE_FAILED", undefined, undefined, undefined, pulseStartedAt);
    return { ok: false, ...failure };
  }
  if (!isLivePulseStateActive(state)) return { ok: false, stop: true, error: "LIVE_PULSE_REPLACED" };
  const snapshot = payload.snapshot;
  if (!isExactLiveScreenPage(snapshot.sourceUrl || "") || livePulseRoomIdFromSnapshot(snapshot) !== state.identityKey) {
    await stopLivePulse("PAGE_NAVIGATED", undefined, undefined, state);
    return { ok: false, stop: true, error: "PAGE_NAVIGATED" };
  }
  const fatalEndpointStatus = snapshot.captureMeta?.liveScreenInternalApi?.endpointStatuses.find((item) => (
    ["HTTP_401", "HTTP_429", "SENSITIVE_RESPONSE", "BYTE_LIMIT", "TOTAL_BYTE_LIMIT", "SCHEMA_MISMATCH", "LIVE_ENDED"].includes(item.reason || "")
  ));
  if (fatalEndpointStatus) {
    await stopLivePulse(fatalEndpointStatus.reason || "API_ABORTED", fatalEndpointStatus.endpoint, undefined, state);
    return { ok: false, stop: true, error: fatalEndpointStatus.reason || "API_ABORTED" };
  }
  if (!snapshot.captureMeta?.liveScreenInternalApi || snapshot.visibleMetricsJson.length === 0) {
    const endpointFailure = [...(snapshot.captureMeta?.liveScreenInternalApi?.endpointStatuses || [])].reverse().find((item) => item.reason);
    const failure = await handleLivePulseFailure(
      state,
      endpointFailure?.reason || "PULSE_METRICS_MISSING",
      undefined,
      endpointFailure?.endpoint
    );
    return { ok: false, ...failure };
  }
  const uploadController = new AbortController();
  state.uploadController = uploadController;
  const result = await uploadMetricPulse(snapshot, uploadController.signal);
  if (state.uploadController === uploadController) state.uploadController = null;
  if (!isLivePulseStateActive(state)) return { ok: false, stop: true, error: "LIVE_PULSE_REPLACED" };
  if (!result.ok) {
    const failure = await handleLivePulseFailure(state, result.error || "PULSE_UPLOAD_FAILED", result.status, "metric-pulses", result.retryAfterMs, pulseStartedAt);
    return { ok: false, ...failure };
  }
  const firstSuccess = state.successCount === 0;
  state.consecutiveFailures = 0;
  state.lastFailureReason = null;
  state.lastFailureEndpoint = null;
  state.rateLimitedUntil = null;
  state.successCount += 1;
  state.lastSuccessAt = new Date().toISOString();
  state.lastMetricCount = snapshot.visibleMetricsJson.length;
  const uploadedMetricKeys = new Set(snapshot.visibleMetricsJson.map((metric) => String(metric.key)));
  state.lastMetricKeys = liveScreenPulseCoreMetricKeys.filter((key) => uploadedMetricKeys.has(key));
  if (firstSuccess) {
    await appendLog("live_pulse.first_success", {
      tabId: state.tabId,
      metricCount: state.lastMetricCount
    });
  }
  await persistLivePulseState();
  return { ok: true, nextDelayMs: Math.max(0, nextLivePulseAfter(pulseStartedAt, Date.now()) - Date.now()) };
}

async function startLocalPromotionPulse(payload: { tabId?: number; currentUrl?: string }) {
  const tabId = Number(payload.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) return { ok: false, error: "无法识别当前标签页，请关闭插件弹窗后重试。" };
  if (!isExactLocalPromotionInternalApiPage(payload.currentUrl || "")) return { ok: false, error: "实时脉冲仅支持本地推数据总览精确页面。" };
  const refreshedContext = await refreshBoundContext();
  if (!refreshedContext.ok) return refreshedContext;
  if (!refreshedContext.context.localPromotionInternalApi.enabled) {
    return { ok: false, error: "服务端本地推 API 开关未开启；未启动实时脉冲，也不会静默改用 DOM。" };
  }
  const localPromotionApi = refreshedContext.context.localPromotionInternalApi;
  if (localPromotionApi.contractVersion !== localPromotionInternalApiContractVersion
    || localPromotionApi.adapterVersion !== localPromotionInternalApiAdapterVersion) {
    return { ok: false, error: "本地推 API 契约或适配器版本不匹配；请更新并重启本地服务、重新加载插件后再试。" };
  }
  const pageContext = await chrome.tabs.sendMessage(tabId, { type: MESSAGE.GET_PAGE_CONTEXT }).catch(() => null);
  if (pageContext?.buildFingerprint !== __PXXIS_EXTENSION_BUILD__) {
    return { ok: false, error: "目标后台页仍在运行旧版插件脚本；请刷新当前本地推页面后再开始 API 持续采集。" };
  }
  if (pageContext?.pageType !== "LOCAL_PROMOTION_DASHBOARD" || !isExactLocalPromotionInternalApiPage(pageContext?.currentUrl || "") || pageContext?.localPromotionPulseEligible !== true) {
    return { ok: false, error: "当前标签页不是可用的本地推数据总览。" };
  }
  const session = await ensureCollectionSession();
  if (!session.ok) return session;
  const identityKey = typeof pageContext.localPromotionPulseIdentityKey === "string"
    ? pageContext.localPromotionPulseIdentityKey
    : null;
  if (!identityKey) {
    return { ok: false, error: "当前本地推页面缺少可信广告身份；未启动 API 采集，也不会改用 DOM。" };
  }
  const localPromotionPulseConflict = await livePulseStartConflict(tabId, "LOCAL_PROMOTION_DASHBOARD");
  if (localPromotionPulseConflict) return { ok: false, error: localPromotionPulseConflict };
  await hydrateLivePulseStorage();
  const lastOutcome = latestLivePulseOutcomes.get(tabId);
  const cooldownRemaining = lastOutcome?.routeKey === "LOCAL_PROMOTION_DASHBOARD" && lastOutcome.reason === "HTTP_429"
    ? localPromotionRateLimitCooldownRemaining(new Date(lastOutcome.occurredAt).getTime())
    : 0;
  if (cooldownRemaining > 0) {
    return {
      ok: false,
      error: `平台 API 刚返回限流，请等待 ${Math.ceil(cooldownRemaining / 1_000)} 秒后再手动开始；系统不会自动重试。`
    };
  }
  await clearLivePulseOutcome(tabId);
  const api = await apiContext();
  if (!api.ok) return api;
  const activity = livePulseActivityForTab({
    currentUrl: pageContext.currentUrl,
    pageType: "LOCAL_PROMOTION_DASHBOARD",
    routeKey: "LOCAL_PROMOTION_DASHBOARD",
    collectable: true,
    tabState: pageContext.tabState === "VISIBLE" ? "VISIBLE" : "HIDDEN",
    observedAt: new Date().toISOString()
  }, tabId);
  if (!activity) return { ok: false, error: "无法记录当前本地推标签页状态。" };
  await setLivePulseActivity(activity);
  const state: PulseState = {
    loopId: `${tabId}:${Date.now()}`,
    tabId,
    taskId: api.collectionTaskId,
    identityKey,
    routeKey: "LOCAL_PROMOTION_DASHBOARD",
    currentUrl: pageContext.currentUrl,
    collectionRunId: session.session.collectionRunId,
    startedAt: new Date().toISOString(),
    consecutiveFailures: 0,
    successCount: 0,
    lastSuccessAt: null,
    lastMetricCount: 0,
    lastMetricKeys: [],
    lastFailureReason: null,
    lastFailureEndpoint: null,
    rateLimitedUntil: null,
    uploadController: null
  };
  livePulseStates.set(tabId, state);
  await persistLivePulseState();
  await appendLog("local_promotion_pulse.started", { tabId, taskId: api.collectionTaskId });
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE.BEGIN_LOCAL_PROMOTION_PULSE_LOOP,
      payload: { loopId: state.loopId, collectionRunId: state.collectionRunId }
    });
  } catch {
    await stopLivePulse("CONTENT_SCRIPT_UNAVAILABLE", undefined, undefined, state);
    return { ok: false, error: "插件尚未注入当前页面，请刷新目标网页后重试。" };
  }
  return { ok: true, nextRefreshAt: new Date().toISOString() };
}

async function submitLocalPromotionPulse(payload: { loopId?: string; pulseStartedAt?: number; snapshot?: CollectionSnapshotPayload; error?: string }, tabId?: number, senderUrl?: string) {
  const state = await hydrateLivePulseState(tabId);
  if (!state || state.routeKey !== "LOCAL_PROMOTION_DASHBOARD" || tabId !== state.tabId) return { ok: false, stop: true, error: "LOCAL_PROMOTION_PULSE_NOT_ACTIVE" };
  if (payload.loopId !== state.loopId) return { ok: false, stop: true, error: "PULSE_REPLACED" };
  const pulseStartedAt = Number.isFinite(payload.pulseStartedAt) ? Number(payload.pulseStartedAt) : Date.now();
  const activity = await hydrateLivePulseActivity(tabId);
  if (!activity || activity.tabId !== state.tabId || activity.pageType !== "LOCAL_PROMOTION_DASHBOARD" || !isExactLocalPromotionInternalApiPage(senderUrl || activity.currentUrl)) {
    await stopLivePulse("PAGE_INACTIVE", undefined, undefined, state);
    return { ok: false, stop: true, error: "PAGE_INACTIVE" };
  }
  if (payload.error) {
    const failure = await handleLivePulseFailure(state, payload.error, undefined, undefined, undefined, pulseStartedAt);
    return { ok: false, ...failure };
  }
  const sourceUrl = senderUrl || activity.currentUrl;
  if (!isExactLocalPromotionInternalApiPage(sourceUrl)) {
    await stopLivePulse("PAGE_NAVIGATED", undefined, undefined, state);
    return { ok: false, stop: true, error: "PAGE_NAVIGATED" };
  }
  const collectionController = new AbortController();
  state.uploadController = collectionController;
  let collection: Awaited<ReturnType<typeof collectLocalPromotionInternalApi>>;
  try {
    collection = await collectLocalPromotionInternalApi({
      enabled: true,
      url: sourceUrl,
      signal: collectionController.signal
    });
  } catch {
    state.uploadController = null;
    return { ok: false, ...(await handleLivePulseFailure(state, "REQUEST_FAILED", undefined, undefined, undefined, pulseStartedAt)) };
  }
  if (!isLivePulseStateActive(state)) return { ok: false, stop: true, error: "PULSE_REPLACED" };
  const snapshot = createLocalPromotionPulseSnapshot({
    collection,
    collectionRunId: state.collectionRunId,
    sourceUrl,
    tabState: activity.tabState,
    collectedAt: new Date().toISOString()
  });
  const hasCollectionDiagnostics = collection.captureMeta.endpointStatuses.some((status) => Boolean(status.reason));
  if (collection.diagnostics && (
    collection.diagnostics.missingMetricKeys.length > 0
    || collection.metrics.length === 0
    || Boolean(collection.diagnostics.statQueryFallback)
    || hasCollectionDiagnostics
  )) {
    await appendLog("local_promotion_pulse.capture_diagnostics", {
      metricCount: collection.metrics.length,
      matchedMetricKeys: collection.diagnostics.matchedMetricKeys,
      missingMetricKeys: collection.diagnostics.missingMetricKeys,
      statQueryFallback: collection.diagnostics.statQueryFallback,
      metadataGroups: collection.diagnostics.metadataGroups,
      endpointStatuses: collection.captureMeta.endpointStatuses.map(({ endpoint, status, reason }) => ({ endpoint, status, ...(reason ? { reason } : {}) }))
    });
  }
  if (localPromotionIdentityKey(collection.captureMeta.identity) !== state.identityKey) {
    await stopLivePulse("IDENTITY_CHANGED", undefined, undefined, state);
    return { ok: false, stop: true, error: "IDENTITY_CHANGED" };
  }
  const fatal = collection.captureMeta.endpointStatuses.find((item) => ["HTTP_401", "HTTP_429", "SENSITIVE_RESPONSE", "BYTE_LIMIT", "TOTAL_BYTE_LIMIT", "SCHEMA_MISMATCH"].includes(item.reason || ""));
  if (fatal) {
    await stopLivePulse(fatal.reason || "API_ABORTED", fatal.endpoint, undefined, state);
    return { ok: false, stop: true, error: fatal.reason || "API_ABORTED" };
  }
  if (!snapshot.visibleMetricsJson.length) {
    state.uploadController = null;
    const endpointFailure = [...collection.captureMeta.endpointStatuses].reverse().find((item) => item.reason);
    const failure = await handleLivePulseFailure(state, endpointFailure?.reason || "PULSE_METRICS_MISSING", undefined, endpointFailure?.endpoint, undefined, pulseStartedAt);
    return { ok: false, ...failure };
  }
  const result = await uploadMetricPulse(snapshot, collectionController.signal);
  if (state.uploadController === collectionController) state.uploadController = null;
  if (!isLivePulseStateActive(state)) return { ok: false, stop: true, error: "PULSE_REPLACED" };
  if (!result.ok) return { ok: false, ...(await handleLivePulseFailure(state, result.error || "PULSE_UPLOAD_FAILED", result.status, "metric-pulses", result.retryAfterMs, pulseStartedAt)) };
  state.consecutiveFailures = 0;
  state.lastFailureReason = null;
  state.lastFailureEndpoint = null;
  state.rateLimitedUntil = null;
  state.successCount += 1;
  state.lastSuccessAt = new Date().toISOString();
  state.lastMetricCount = snapshot.visibleMetricsJson.length;
  const uploadedKeys = new Set(snapshot.visibleMetricsJson.map((metric) => String(metric.key)));
  state.lastMetricKeys = localPromotionApiMetricKeys.filter((key) => uploadedKeys.has(key));
  await persistLivePulseState();
  return {
    ok: true,
    nextDelayMs: Math.max(0, nextLivePulseAfter(pulseStartedAt, Date.now(), localPromotionPulseCadenceMs) - Date.now())
  };
}

async function uploadMetricPulse(snapshot: CollectionSnapshotPayload, signal: AbortSignal): Promise<MetricPulseUploadResult> {
  const api = await apiContext();
  if (!api.ok) return { ok: false, error: api.error };
  const pulse: MetricPulse = {
    collectionRunId: snapshot.collectionRunId || null,
    routeKey: snapshot.routeKey || "LIVE_DATA_SCREEN",
    pageType: snapshot.pageType,
    localCapturedAt: snapshot.localCollectedAt,
    tabState: snapshot.captureMeta?.tabState || "VISIBLE",
    metrics: snapshot.visibleMetricsJson,
    captureMeta: snapshot.captureMeta!,
    sourceUrl: snapshot.sourceUrl,
    captureProtocolVersion: extensionCollectionProtocolVersion
  };
  return uploadMetricPulseRequest({
    url: `${api.apiBaseUrl}/collection-tasks/${api.collectionTaskId}/metric-pulses`,
    token: api.token,
    pulse,
    signal
  });
}

async function handleLivePulseFailure(
  state: PulseState,
  error: string,
  status?: number,
  endpoint?: string,
  retryAfterMs?: number,
  pulseStartedAt = Date.now()
) {
  if (!isLivePulseStateActive(state)) return { stop: true, error: "LIVE_PULSE_REPLACED" };
  const fatalReason = fatalLivePulseFailureReason(error, status);
  if (fatalReason) {
    await stopLivePulse(fatalReason, endpoint, undefined, state);
    return { stop: true, error: fatalReason };
  }
  const failure = advanceLivePulseFailure(state.consecutiveFailures, error, endpoint);
  state.consecutiveFailures = failure.consecutiveFailures;
  state.lastFailureReason = failure.lastFailureReason;
  state.lastFailureEndpoint = failure.lastFailureEndpoint;
  await appendLog("live_pulse.failure", {
    tabId: state.tabId,
    consecutiveFailures: failure.consecutiveFailures,
    ...(failure.lastFailureEndpoint ? { endpoint: failure.lastFailureEndpoint } : {}),
    reason: failure.lastFailureReason
  });
  if (failure.shouldStop) {
    await stopLivePulse(
      "THREE_CONSECUTIVE_FAILURES",
      state.lastFailureEndpoint || undefined,
      state.lastFailureReason,
      state
    );
    return { stop: true, error: "THREE_CONSECUTIVE_FAILURES" };
  }
  await persistLivePulseState();
  const cadenceMs = state.routeKey === "LOCAL_PROMOTION_DASHBOARD" ? localPromotionPulseCadenceMs : undefined;
  return {
    nextDelayMs: Math.max(0, nextLivePulseAfter(pulseStartedAt, Date.now(), cadenceMs) - Date.now()),
    error: failure.lastFailureReason
  };
}

async function stopLivePulse(reason: string, endpoint?: string, lastFailureReason?: string, expectedState?: PulseState, tabId?: unknown) {
  await hydrateLivePulseStorage();
  // A late page/activity/API callback from a previous loop must not clear a
  // newer loop. Without a tabId, this function intentionally stops every
  // session; that path is reserved for unpairing and task resets.
  const normalizedTabId = Number.isInteger(tabId) && Number(tabId) > 0 ? Number(tabId) : null;
  if (expectedState && !isLivePulseStateActive(expectedState)) return;
  const states = expectedState
    ? [expectedState]
    : normalizedTabId
      ? [livePulseStates.get(normalizedTabId)].filter((state): state is PulseState => Boolean(state))
      : [...livePulseStates.values()];
  for (const state of states) {
    if (!isLivePulseStateActive(state)) continue;
    livePulseStates.delete(state.tabId);
    livePulseActivities.delete(state.tabId);
    state.uploadController?.abort();
    state.uploadController = null;
    await persistLivePulseState();
    await persistLivePulseActivities();
    await chrome.tabs.sendMessage(state.tabId, {
      type: state.routeKey === "LOCAL_PROMOTION_DASHBOARD"
        ? MESSAGE.STOP_LOCAL_PROMOTION_PULSE
        : MESSAGE.STOP_LIVE_PULSE
    }).catch(() => undefined);
    await saveLivePulseOutcome({
      taskId: state.taskId,
      routeKey: state.routeKey,
      tabId: state.tabId,
      reason,
      ...(endpoint ? { endpoint } : {}),
      ...(lastFailureReason ? { lastFailureReason } : {}),
      occurredAt: new Date().toISOString(),
      failure: isLivePulseFailure(reason)
    });
    await appendLog("live_pulse.stopped", {
      tabId: state.tabId,
      reason,
      ...(endpoint ? { endpoint } : {}),
      ...(lastFailureReason ? { lastFailureReason } : {})
    });
  }
}

async function clearLivePulseOutcome(tabId?: number) {
  await hydrateLivePulseStorage();
  if (Number.isInteger(tabId) && Number(tabId) > 0) latestLivePulseOutcomes.delete(Number(tabId));
  else latestLivePulseOutcomes.clear();
  latestLivePulseOutcome = findLatestLivePulseOutcome();
  await persistLivePulseOutcomes();
}

async function clearLivePulseActivity(tabId?: number) {
  await hydrateLivePulseStorage();
  if (Number.isInteger(tabId) && Number(tabId) > 0) livePulseActivities.delete(Number(tabId));
  else livePulseActivities.clear();
  await persistLivePulseActivities();
}

function resetLivePulseStorage() {
  livePulseStates.clear();
  livePulseActivities.clear();
  latestLivePulseOutcomes.clear();
  latestLivePulseOutcome = null;
  livePulseStorageHydrated = true;
  livePulseStorageHydration = null;
}

async function persistLivePulseState() {
  await hydrateLivePulseStorage();
  await enqueueLivePulseStorageWrite(async () => {
    const stored: StoredPulseStateMap = {};
    for (const state of livePulseStates.values()) stored[String(state.tabId)] = storedPulseState(state);
    if (Object.keys(stored).length === 0) await chrome.storage.local.remove(STORAGE.LIVE_PULSE_STATE);
    else await chrome.storage.local.set({ [STORAGE.LIVE_PULSE_STATE]: stored });
  });
}

async function persistLivePulseActivities() {
  await hydrateLivePulseStorage();
  await enqueueLivePulseStorageWrite(async () => {
    const stored: StoredPulseActivityMap = Object.fromEntries(
      [...livePulseActivities.entries()].map(([tabId, activity]) => [String(tabId), activity])
    );
    if (Object.keys(stored).length === 0) await chrome.storage.local.remove(STORAGE.LIVE_PULSE_ACTIVITY);
    else await chrome.storage.local.set({ [STORAGE.LIVE_PULSE_ACTIVITY]: stored });
  });
}

async function setLivePulseActivity(activity: LivePulseActivity) {
  await hydrateLivePulseStorage();
  livePulseActivities.set(activity.tabId, activity);
  await persistLivePulseActivities();
}

async function persistLivePulseOutcomes() {
  await hydrateLivePulseStorage();
  await enqueueLivePulseStorageWrite(async () => {
    const stored: StoredPulseOutcomeMap = Object.fromEntries(
      [...latestLivePulseOutcomes.entries()].map(([tabId, outcome]) => [String(tabId), outcome])
    );
    if (Object.keys(stored).length === 0) await chrome.storage.local.remove(STORAGE.LIVE_PULSE_LAST_OUTCOME);
    else await chrome.storage.local.set({ [STORAGE.LIVE_PULSE_LAST_OUTCOME]: stored });
  });
}

function enqueueLivePulseStorageWrite(writer: () => Promise<void>) {
  const next = livePulseStorageWriteQueue.then(writer);
  livePulseStorageWriteQueue = next.catch(() => undefined);
  return next;
}

function storedPulseState(state: PulseState): StoredPulseState {
  return {
    loopId: state.loopId,
    tabId: state.tabId,
    taskId: state.taskId,
    identityKey: state.identityKey,
    routeKey: state.routeKey,
    currentUrl: state.currentUrl,
    collectionRunId: state.collectionRunId,
    startedAt: state.startedAt,
    consecutiveFailures: state.consecutiveFailures,
    successCount: state.successCount,
    lastSuccessAt: state.lastSuccessAt,
    lastMetricCount: state.lastMetricCount,
    lastMetricKeys: state.lastMetricKeys,
    lastFailureReason: state.lastFailureReason,
    lastFailureEndpoint: state.lastFailureEndpoint,
    rateLimitedUntil: state.rateLimitedUntil,
    buildFingerprint: __PXXIS_EXTENSION_BUILD__,
    collectionProtocolVersion: extensionCollectionProtocolVersion
  };
}

async function hydrateLivePulseStorage() {
  if (livePulseStorageHydrated) return;
  if (livePulseStorageHydration) return livePulseStorageHydration;
  livePulseStorageHydration = (async () => {
    const local = await chrome.storage.local.get([
      STORAGE.LIVE_PULSE_STATE,
      STORAGE.LIVE_PULSE_ACTIVITY,
      STORAGE.LIVE_PULSE_LAST_OUTCOME
    ]);
    for (const parsed of parseStoredLivePulseStates(local[STORAGE.LIVE_PULSE_STATE])) {
      livePulseStates.set(parsed.tabId, { ...parsed, uploadController: null });
    }
    for (const activity of parseStoredLivePulseActivities(local[STORAGE.LIVE_PULSE_ACTIVITY])) {
      livePulseActivities.set(activity.tabId, activity);
    }
    for (const outcome of parseStoredLivePulseOutcomes(local[STORAGE.LIVE_PULSE_LAST_OUTCOME])) {
      if (!Number.isInteger(outcome.tabId) || Number(outcome.tabId) <= 0) continue;
      latestLivePulseOutcomes.set(Number(outcome.tabId), outcome);
      if (!latestLivePulseOutcome || new Date(outcome.occurredAt).getTime() >= new Date(latestLivePulseOutcome.occurredAt).getTime()) {
        latestLivePulseOutcome = outcome;
      }
    }
    livePulseStorageHydrated = true;
  })();
  try {
    await livePulseStorageHydration;
  } finally {
    livePulseStorageHydration = null;
  }
}

async function hydrateLivePulseState(tabId?: number) {
  await hydrateLivePulseStorage();
  if (Number.isInteger(tabId) && Number(tabId) > 0) return livePulseStates.get(Number(tabId)) || null;
  return livePulseStates.values().next().value || null;
}

async function hydrateLivePulseActivity(tabId?: number) {
  await hydrateLivePulseStorage();
  if (Number.isInteger(tabId) && Number(tabId) > 0) return livePulseActivities.get(Number(tabId)) || null;
  return livePulseActivities.values().next().value || null;
}

function isLivePulseStateActive(state: PulseState) {
  return livePulseStates.get(state.tabId) === state;
}

function parseStoredLivePulseStates(value: unknown) {
  return storageValueCandidates(value)
    .map((candidate) => parseStoredLivePulseState(candidate))
    .filter((state): state is Omit<PulseState, "uploadController"> => Boolean(state));
}

function parseStoredLivePulseActivities(value: unknown) {
  return storageValueCandidates(value)
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
      const record = candidate as Record<string, unknown>;
      const pageType = record.pageType === "LIVE_DATA_SCREEN" || record.pageType === "LOCAL_PROMOTION_DASHBOARD"
        ? record.pageType
        : null;
      const routeKey = record.routeKey === "LIVE_DATA_SCREEN" || record.routeKey === "LOCAL_PROMOTION_DASHBOARD"
        ? record.routeKey
        : undefined;
      const tabState = ["VISIBLE", "HIDDEN", "FROZEN", "DISCARDED", "UNKNOWN"].includes(String(record.tabState))
        ? record.tabState
        : null;
      if (
        !Number.isInteger(record.tabId)
        || Number(record.tabId) <= 0
        || typeof record.currentUrl !== "string"
        || !record.currentUrl
        || !pageType
        || !tabState
        || typeof record.collectable !== "boolean"
      ) return null;
      return {
        ...record,
        tabId: Number(record.tabId),
        pageType,
        ...(routeKey ? { routeKey } : {}),
        tabState
      } as LivePulseActivity;
    })
    .filter((activity): activity is LivePulseActivity => Boolean(activity));
}

function parseStoredLivePulseOutcomes(value: unknown) {
  const context = {
    buildFingerprint: __PXXIS_EXTENSION_BUILD__,
    collectionProtocolVersion: extensionCollectionProtocolVersion,
    endpointKeys: [
      ...liveScreenInternalApiEndpointKeys,
      ...localPromotionInternalApiEndpointKeys,
      "metric-pulses"
    ]
  } as const;
  return storageValueCandidates(value)
    .map((candidate) => parseLivePulseOutcome(candidate, context))
    .filter((outcome): outcome is LivePulseOutcome => Boolean(outcome));
}

function storageValueCandidates(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return "tabId" in record || "loopId" in record || "routeKey" in record
    ? [value]
    : Object.values(record);
}

function findLatestLivePulseOutcome() {
  return [...latestLivePulseOutcomes.values()]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0] || null;
}

function parseStoredLivePulseState(value: unknown): Omit<PulseState, "uploadController"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const routeKey = candidate.routeKey === "LOCAL_PROMOTION_DASHBOARD" || candidate.routeKey === "LIVE_DATA_SCREEN"
    ? candidate.routeKey
    : null;
  if (
    candidate.buildFingerprint !== __PXXIS_EXTENSION_BUILD__
    || candidate.collectionProtocolVersion !== extensionCollectionProtocolVersion
    || typeof candidate.loopId !== "string"
    || !Number.isInteger(candidate.tabId)
    || Number(candidate.tabId) <= 0
    || typeof candidate.taskId !== "string"
    || typeof candidate.identityKey !== "string"
    || !routeKey
    || typeof candidate.currentUrl !== "string"
    || !(routeKey === "LOCAL_PROMOTION_DASHBOARD"
      ? isExactLocalPromotionInternalApiPage(candidate.currentUrl)
      : isExactLiveScreenPage(candidate.currentUrl))
    || typeof candidate.startedAt !== "string"
    || !Number.isSafeInteger(candidate.successCount)
    || !Number.isSafeInteger(candidate.lastMetricCount)
    || !Array.isArray(candidate.lastMetricKeys)
  ) {
    return null;
  }
  const allowedMetricKeys: readonly string[] = routeKey === "LOCAL_PROMOTION_DASHBOARD"
    ? localPromotionPulseMetricKeys
    : liveScreenPulseCoreMetricKeys;
  const storedMetricKeys = Array.isArray(candidate.lastMetricKeys)
    ? candidate.lastMetricKeys.filter((key): key is string => typeof key === "string")
    : [];
  const lastMetricKeys = Array.isArray(candidate.lastMetricKeys) && storedMetricKeys.length === candidate.lastMetricKeys.length
    ? allowedMetricKeys.filter((key) => storedMetricKeys.includes(key))
    : [];
  if (lastMetricKeys.length !== storedMetricKeys.length) return null;
  const endpointKeys: readonly string[] = routeKey === "LOCAL_PROMOTION_DASHBOARD"
    ? localPromotionInternalApiEndpointKeys
    : liveScreenInternalApiEndpointKeys;
  const endpoint = typeof candidate.lastFailureEndpoint === "string" && endpointKeys.includes(candidate.lastFailureEndpoint)
    ? candidate.lastFailureEndpoint
    : null;
  return {
    loopId: candidate.loopId,
    tabId: Number(candidate.tabId),
    taskId: candidate.taskId,
    identityKey: candidate.identityKey,
    routeKey,
    currentUrl: candidate.currentUrl,
    collectionRunId: typeof candidate.collectionRunId === "string" ? candidate.collectionRunId : null,
    startedAt: candidate.startedAt,
    consecutiveFailures: Number.isSafeInteger(candidate.consecutiveFailures) ? Number(candidate.consecutiveFailures) : 0,
    successCount: Number(candidate.successCount),
    lastSuccessAt: typeof candidate.lastSuccessAt === "string" ? candidate.lastSuccessAt : null,
    lastMetricCount: Number(candidate.lastMetricCount),
    lastMetricKeys,
    lastFailureReason: typeof candidate.lastFailureReason === "string" ? candidate.lastFailureReason : null,
    lastFailureEndpoint: endpoint,
    rateLimitedUntil: typeof candidate.rateLimitedUntil === "string" ? candidate.rateLimitedUntil : null
  };
}

async function saveLivePulseOutcome(outcome: Omit<LivePulseOutcome, "buildFingerprint" | "collectionProtocolVersion">) {
  await hydrateLivePulseStorage();
  const versionedOutcome: LivePulseOutcome = {
    ...outcome,
    buildFingerprint: __PXXIS_EXTENSION_BUILD__,
    collectionProtocolVersion: extensionCollectionProtocolVersion
  };
  latestLivePulseOutcome = versionedOutcome;
  if (Number.isInteger(versionedOutcome.tabId) && Number(versionedOutcome.tabId) > 0) {
    latestLivePulseOutcomes.set(Number(versionedOutcome.tabId), versionedOutcome);
  }
  await persistLivePulseOutcomes();
}

function livePulseDisplayForState(state: PulseState) {
  return {
    active: true,
    routeKey: state.routeKey,
    tabId: state.tabId,
    startedAt: state.startedAt,
    successCount: state.successCount,
    lastSuccessAt: state.lastSuccessAt,
    lastMetricCount: state.lastMetricCount,
    lastMetricKeys: state.lastMetricKeys,
    lastFailureReason: state.lastFailureReason,
    lastFailureEndpoint: state.lastFailureEndpoint,
    rateLimitedUntil: state.rateLimitedUntil,
    lastOutcome: null
  };
}

function livePulseDisplayForOutcome(outcome: LivePulseOutcome | null) {
  return {
    active: false,
    ...(outcome?.routeKey ? { routeKey: outcome.routeKey } : {}),
    ...(outcome?.tabId ? { tabId: outcome.tabId } : {}),
    lastOutcome: outcome
  };
}

function isLivePulseFailure(reason: string) {
  return !["USER_STOPPED", "REPLACED"].includes(reason);
}

function shouldStopLivePulseForActivity(activity: PageActivity, routeKey?: PulseState["routeKey"] | null) {
  if (routeKey === "LOCAL_PROMOTION_DASHBOARD") {
    return !isExactLocalPromotionInternalApiPage(activity.currentUrl) || activity.pageType !== "LOCAL_PROMOTION_DASHBOARD";
  }
  return !isExactLiveScreenPage(activity.currentUrl) || activity.pageType !== "LIVE_DATA_SCREEN";
}

async function stopLivePulseForTab(tabId: number, reason: string) {
  const state = await hydrateLivePulseState(tabId);
  if (state?.tabId === tabId) await stopLivePulse(reason, undefined, undefined, state);
}

async function stopLivePulseForTabUpdate(tabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
  const state = await hydrateLivePulseState(tabId);
  if (state?.tabId !== tabId) return;
  if (changeInfo.status === "loading") {
    await stopLivePulse("PAGE_NAVIGATED", undefined, undefined, state);
    return;
  }
  if (!changeInfo.url) return;
  if (!canKeepLivePulseForUrlUpdate(state, changeInfo.url)) {
    await stopLivePulse("PAGE_NAVIGATED", undefined, undefined, state);
    return;
  }
  if (!isLivePulseStateActive(state)) return;
  state.currentUrl = changeInfo.url;
  const activity = await hydrateLivePulseActivity(tabId);
  if (!isLivePulseStateActive(state)) return;
  if (activity?.tabId === tabId) {
    await setLivePulseActivity({
      ...activity,
      currentUrl: changeInfo.url,
      observedAt: new Date().toISOString()
    });
  }
  await persistLivePulseState();
}

function roomIdFromLiveScreenUrl(value: string) {
  try {
    const url = new URL(value);
    return resolveLiveScreenRoomId({
      urlRoomIds: url.searchParams.getAll("room_id"),
      domRoomIds: []
    }).value;
  } catch {
    return null;
  }
}

function livePulseRoomIdFromSnapshot(snapshot: CollectionSnapshotPayload) {
  const apiMeta = snapshot.captureMeta?.liveScreenInternalApi;
  if (!apiMeta?.roomId || !apiMeta.roomIdEvidence) return null;
  const resolved = resolveLiveScreenRoomId(apiMeta.roomIdEvidence);
  return resolved.value === apiMeta.roomId ? apiMeta.roomId : null;
}


async function ensureCollectionSession(): Promise<
  | { ok: true; session: CollectionSessionState }
  | { ok: false; error: string }
> {
  const api = await apiContext();
  if (!api.ok) return api;
  const local = await chrome.storage.local.get([STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.CONTEXT]);
  const context = local[STORAGE.CONTEXT] as ExtensionContext | undefined;
  const task = context?.account.projects.flatMap((project) => project.tasks).find((item) => item.id === api.collectionTaskId);
  const requiredRoutes = task?.routeSources
    .filter((route) => route.required)
    .map((route) => normalizeCollectionRouteKey(route.routeKey))
    .filter((route) => defaultRequiredCollectionRoutes.includes(route));
  const desiredRequiredRoutes = requiredRoutes?.length ? requiredRoutes : [...defaultRequiredCollectionRoutes];
  const existing = local[STORAGE.ACTIVE_COLLECTION_SESSION] as CollectionSessionState | undefined;
  if (
    existing?.taskId === api.collectionTaskId
    && Date.now() - new Date(existing.startedAt).getTime() < 30 * 60_000
    && sameRouteKeys(existing.requiredRoutes, desiredRequiredRoutes)
  ) {
    return { ok: true, session: existing };
  }
  try {
    const response = await fetch(`${api.apiBaseUrl}/collection-tasks/${api.collectionTaskId}/collection-runs`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${api.token}` },
      body: JSON.stringify({ requiredRoutes: desiredRequiredRoutes })
    });
    const body = await response.json();
    if (!response.ok || !body?.data?.id) return { ok: false, error: body?.error?.message || "无法创建本次采集批次。" };
    const session: CollectionSessionState = {
      taskId: api.collectionTaskId,
      collectionRunId: body.data.id,
      requiredRoutes: desiredRequiredRoutes,
      startedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ [STORAGE.ACTIVE_COLLECTION_SESSION]: session });
    return { ok: true, session };
  } catch {
    return { ok: false, error: "无法连接诊断服务，请检查 API 是否运行。" };
  }
}

async function reportExtensionHeartbeatFromStoredActivity() {
  const local = await chrome.storage.local.get([STORAGE.PAGE_ACTIVITY]);
  const activity = local[STORAGE.PAGE_ACTIVITY] as PageActivity | undefined;
  if (!activity) return { ok: false, skipped: true };
  return reportExtensionHeartbeat(activity);
}

async function reportExtensionHeartbeat(activity: PageActivity, timeoutMs = extensionRequestTimeoutMs) {
  const api = await apiContext();
  if (!api.ok) return { ok: false, skipped: true, error: api.error };
  return reportExtensionHeartbeatForCredentials(api, activity, timeoutMs);
}

async function reportExtensionHeartbeatForCredentials(
  credentials: { apiBaseUrl: string; collectionTaskId?: string; token: string },
  activity: PageActivity,
  timeoutMs = extensionRequestTimeoutMs
) {
  if (!credentials.collectionTaskId) return { ok: false, skipped: true, error: "请先绑定采集任务。" };
  try {
    const response = await fetchWithTimeout(`${credentials.apiBaseUrl}/extension/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${credentials.token}` },
      body: JSON.stringify({
        collectionTaskId: credentials.collectionTaskId,
        extensionVersion: chrome.runtime.getManifest().version,
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: __PXXIS_EXTENSION_BUILD__,
        connectionSessionId,
        currentUrl: activity.currentUrl,
        pageType: activity.pageType,
        routeKey: activity.routeKey,
        collectable: activity.collectable,
        tabState: activity.tabState,
        lastError: activity.lastError || null,
        observedAt: activity.observedAt
      })
      }, timeoutMs);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { ok: false, error: body?.error?.message || `状态上报失败（${response.status}）` };
    }
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: isRequestTimeout(error) ? "本机 API 响应超时，请检查本地服务是否仍在运行。" : "插件状态暂时无法同步到网页。" };
  }
}

function enqueueSnapshotUpload(snapshot: CollectionSnapshotPayload) {
  const next = uploadQueue.then(() => uploadSnapshot(snapshot));
  uploadQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function uploadSnapshot(snapshot: CollectionSnapshotPayload) {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.ROUTE_UPLOAD_STATE]);
  const session = await chrome.storage.local.get([STORAGE.TOKEN]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const token = session[STORAGE.TOKEN] as string | undefined;
  if (!config.apiBaseUrl || !config.collectionTaskId) return { ok: false, error: "请先配对账号并选择采集任务。" };
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!apiBaseUrl) return { ok: false, error: "服务器地址不受支持。" };
  if (!token) return { ok: false, error: "插件授权已丢失，请重新配对。" };
  const routeKey = snapshot.routeKey || snapshot.pageType || "UNKNOWN";
  const routeState = (local[STORAGE.ROUTE_UPLOAD_STATE] || {}) as RouteUploadState;
  const fingerprint = snapshotFingerprint(snapshot);
  const previous = routeState[routeKey];
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/collection-tasks/${config.collectionTaskId}/snapshots`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `snapshot:${config.collectionTaskId}:${snapshot.localCollectedAt}`.slice(0, 128),
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(sanitizeSnapshotPayload(snapshot))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "网络上传失败";
    routeState[routeKey] = {
      fingerprint,
      lastUploadAt: previous?.lastUploadAt || 0,
      consecutiveFailures: (previous?.consecutiveFailures || 0) + 1
    };
    await chrome.storage.local.set({ [STORAGE.ROUTE_UPLOAD_STATE]: routeState });
    await appendLog("snapshot.upload_failed", { routeKey, error: message });
    if (snapshot.collectionRunId) {
      await reportRouteFailure(apiBaseUrl, token, snapshot.collectionRunId, routeKey as CollectionRouteKey, "UPLOAD_NETWORK_ERROR", message);
    }
    return { ok: false, error: message };
  }
  const payload = await response.json();
  await appendLog("snapshot.uploaded", { ok: response.ok, status: response.status });
  routeState[routeKey] = {
    fingerprint,
    lastUploadAt: response.ok ? Date.now() : previous?.lastUploadAt || 0,
    consecutiveFailures: response.ok ? 0 : (previous?.consecutiveFailures || 0) + 1
  };
  await chrome.storage.local.set({ [STORAGE.ROUTE_UPLOAD_STATE]: routeState });
  if (!response.ok && snapshot.collectionRunId) {
    await reportRouteFailure(
      apiBaseUrl,
      token,
      snapshot.collectionRunId,
      routeKey as CollectionRouteKey,
      "UPLOAD_HTTP_ERROR",
      payload?.error?.message || `HTTP ${response.status}`
    );
  }
  return response.ok ? { ok: true, data: payload } : { ok: false, error: payload?.error?.message || "快照上传失败。" };
}


async function currentTaskRouteKeys(): Promise<CollectionRouteKey[]> {
  const api = await apiContext();
  if (!api.ok) return [] as CollectionRouteKey[];
  const local = await chrome.storage.local.get([STORAGE.CONTEXT]);
  const context = local[STORAGE.CONTEXT] as ExtensionContext | undefined;
  const task = context?.account.projects
    .flatMap((project) => project.tasks)
    .find((item) => item.id === api.collectionTaskId);
  return [...new Set((task?.routeSources || [])
    .map((route) => normalizeCollectionRouteKey(route.routeKey))
    .filter((route): route is CollectionRouteKey => route === "LOCAL_PROMOTION_DASHBOARD" || route === "LIVE_DATA_SCREEN"))];
}

function sameRouteKeys(left: readonly CollectionRouteKey[], right: readonly CollectionRouteKey[]) {
  return [...new Set(left)].sort().join("|") === [...new Set(right)].sort().join("|");
}

function routeLabel(routeKey: CollectionRouteKey) {
  return collectionRouteLabels[routeKey] || routeKey;
}

async function refreshBoundContext(timeoutMs = extensionRequestTimeoutMs): Promise<{ ok: true; context: ExtensionContext } | { ok: false; error: string; errorCode?: string }> {
  const api = await apiContext();
  if (!api.ok) return api;
  try {
    const response = await fetchWithTimeout(`${api.apiBaseUrl}/extension/context`, {
      headers: extensionContextRequestHeaders(api.token)
    }, timeoutMs);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body
        ? (body as { error?: { message?: unknown } }).error?.message
        : null;
      return { ok: false, errorCode: contextRefreshErrorCode(response.status), error: typeof message === "string" ? message : "无法刷新当前账号信息，请检查服务后重试。" };
    }
    const payload = body && typeof body === "object" && "data" in body
      ? (body as { data?: unknown }).data
      : null;
    const protocolCheck = checkExtensionContextProtocol(payload, extensionCollectionProtocolVersion);
    if (!protocolCheck.ok) return { ok: false, error: protocolErrorMessage(protocolCheck.code) };
    const context = parseExtensionContext(payload);
    if (!context) return { ok: false, error: "服务器返回的账号上下文无效，已停止本次采集。" };
    const local = await chrome.storage.local.get([STORAGE.CONFIG]);
    const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
    const refreshedConfig = refreshConfigFromContext(config, context);
    if (!refreshedConfig) return { ok: false, error: "当前任务已不属于绑定账号，请在插件中重新选择任务。" };
    await chrome.storage.local.set({ [STORAGE.CONFIG]: refreshedConfig, [STORAGE.CONTEXT]: context });
    return { ok: true, context };
  } catch (error: unknown) {
    return { ok: false, error: isRequestTimeout(error) ? "本机 API 响应超时，请检查本地服务是否仍在运行。" : "无法刷新当前账号信息，请检查诊断服务后重试。" };
  }
}

function extensionContextRequestHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "x-pxxis-collection-protocol": String(extensionCollectionProtocolVersion)
  };
}

function protocolErrorMessage(code: "SERVICE_UPDATE_REQUIRED" | "EXTENSION_UPDATE_REQUIRED" | "INVALID_CONTEXT") {
  if (code === "SERVICE_UPDATE_REQUIRED") {
    return "本地服务需更新：当前 API 不支持此采集协议。请先更新并重启本地服务，再重新加载插件。";
  }
  if (code === "EXTENSION_UPDATE_REQUIRED") {
    return "采集插件需更新：当前插件版本低于服务要求。请更新插件并在扩展管理页重新加载。";
  }
  return "服务器返回的采集协议无效，已停止本次采集。";
}

async function apiContext(): Promise<
  | { ok: true; apiBaseUrl: string; collectionTaskId: string; token: string }
  | { ok: false; error: string }
> {
  const local = await chrome.storage.local.get([STORAGE.CONFIG]);
  const session = await chrome.storage.local.get([STORAGE.TOKEN]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl || "");
  const token = session[STORAGE.TOKEN] as string | undefined;
  if (!apiBaseUrl || !config.collectionTaskId) return { ok: false, error: "请先配对账号并选择采集任务。" };
  if (!token) return { ok: false, error: "插件授权已丢失，请重新配对。" };
  return { ok: true, apiBaseUrl, collectionTaskId: config.collectionTaskId, token };
}

async function reportRouteFailure(
  apiBaseUrl: string,
  token: string,
  collectionRunId: string,
  routeKey: CollectionRouteKey,
  errorCode: CollectionRouteFailureCode,
  error?: string
) {
  await fetch(`${apiBaseUrl}/collection-runs/${collectionRunId}/failures`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ routeKey, errorCode, error: error ? String(error).slice(0, 500) : undefined })
  }).catch(() => undefined);
}

async function reportCaptureFailure(
  collectionRunId: string,
  routeKey: CollectionRouteKey,
  errorCode: CollectionRouteFailureCode,
  error?: string
) {
  if (routeKey === "UNKNOWN") return;
  const context = await apiContext();
  if (!context.ok) return;
  await reportRouteFailure(context.apiBaseUrl, context.token, collectionRunId, routeKey, errorCode, error);
}

function snapshotFingerprint(snapshot: CollectionSnapshotPayload) {
  const value = JSON.stringify({ routeKey: snapshot.routeKey, metrics: snapshot.visibleMetricsJson, tables: snapshot.rawTableData });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function appendLog(action: string, detail?: unknown) {
  const current = await chrome.storage.local.get([STORAGE.LOGS]);
  const logs = Array.isArray(current[STORAGE.LOGS]) ? current[STORAGE.LOGS] : [];
  logs.unshift({ action, detail, createdAt: new Date().toISOString() });
  await chrome.storage.local.set({ [STORAGE.LOGS]: logs.slice(0, 100) });
}
