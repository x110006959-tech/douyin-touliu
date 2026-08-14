import type {
  CollectionRouteFailureCode,
  CollectionRouteKey,
  CollectionSnapshotPayload,
  MetricPulse,
  LiveScreenInternalApiEndpointKey
} from "@douyin-local-life/shared";
import {
  extensionBridgeProtocolVersion,
  extensionCollectionProtocolVersion,
  liveScreenInternalApiEndpointKeys,
  liveScreenPulseCoreMetricKeys
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
import { nextLivePulseAfter, nextLivePulseAfterRateLimit } from "./live-pulse-schedule";
import { advanceLivePulseFailure } from "./live-pulse-failure";
import { bridgeRecoveryRequestTimeoutMs, extensionRequestTimeoutMs, fetchWithTimeout, isRequestTimeout } from "./request-timeout";
import { uploadMetricPulseRequest, type MetricPulseUploadResult } from "./metric-pulse-upload";
import { restoreBoundTaskPageConnection, restoreTaskPageConnection } from "./task-page-bridge-recovery";
import { normalizeLivePulseMetricKeys, parseLivePulseOutcome, type LivePulseOutcome } from "./live-pulse-status";
import { isLivePulseActivityReporter, livePulseActivityForTab, type LivePulseActivity } from "./live-pulse-activity";
import { isExactLiveScreenPage } from "./live-screen-pulse-page";
import { resolveLiveScreenRoomId } from "./live-screen-room-id";

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
type LivePulseState = {
  loopId: string;
  tabId: number;
  taskId: string;
  roomId: string;
  currentUrl: string;
  collectionRunId: string | null;
  startedAt: string;
  consecutiveFailures: number;
  successCount: number;
  lastSuccessAt: string | null;
  lastMetricCount: number;
  lastMetricKeys: string[];
  lastFailureReason: string | null;
  lastFailureEndpoint: LiveScreenInternalApiEndpointKey | null;
  rateLimitedUntil: string | null;
  uploadController: AbortController | null;
};
type StoredLivePulseState = Omit<LivePulseState, "uploadController"> & {
  buildFingerprint: string;
  collectionProtocolVersion: number;
};
let uploadQueue: Promise<unknown> = Promise.resolve();
const captureSingleFlight = createKeyedSingleFlight();
let livePulseState: LivePulseState | null = null;
let latestLivePulseOutcome: LivePulseOutcome | null = null;

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
  if (message?.type === MESSAGE.STOP_LIVE_PULSE) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "实时脉冲只能在插件 Popup 中停止。" });
      return false;
    }
    void stopLivePulse("USER_STOPPED").then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === MESSAGE.SUBMIT_LIVE_PULSE) {
    void submitLivePulse(message.payload || {}, sender.tab?.id, sender.tab?.url).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.GET_STATE) {
    void getState().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.VERIFY_BOUND_CONTEXT) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "配对校验只能在插件 Popup 中完成。" });
      return false;
    }
    void verifyBoundContext().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.GET_BRIDGE_STATUS) {
    void getBridgeStatus(sender).then(sendResponse);
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
    void confirmPairing().then(sendResponse);
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
    void selectTask(message.payload || {}).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.CLEAR_PAIRING) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "解除配对只能在插件 Popup 中完成。" });
      return false;
    }
    void clearPairing().then(sendResponse);
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
    const body = await response.json();
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

async function confirmPairing() {
  const stored = await chrome.storage.local.get([STORAGE.PENDING_PAIRING_CONFIRMATION]);
  const confirmation = stored[STORAGE.PENDING_PAIRING_CONFIRMATION] as PendingPairingConfirmation | undefined;
  if (!confirmation || new Date(confirmation.expiresAt).getTime() <= Date.now()) {
    await chrome.storage.local.remove(STORAGE.PENDING_PAIRING_CONFIRMATION);
    return { ok: false, error: "待确认配对请求已过期，请返回任务页重新生成配对码。" };
  }
  const protocol = await checkPairingServiceProtocol(confirmation.apiBaseUrl);
  if (!protocol.ok) return protocol;
  try {
    const response = await fetchWithTimeout(`${confirmation.apiBaseUrl}/extension/pairing-codes/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: confirmation.code, label: confirmation.label })
    });
    const body = await response.json();
    if (!response.ok) return { ok: false, error: body?.error?.message || "配对失败，请在任务页重新生成配对码。" };
    const token = body?.data?.token as string | undefined;
    if (!token) return { ok: false, error: "服务器未返回插件凭证，请重新配对。" };
    const contextResponse = await fetchWithTimeout(`${confirmation.apiBaseUrl}/extension/context`, {
      headers: extensionContextRequestHeaders(token)
    });
    const contextBody = await contextResponse.json();
    if (!contextResponse.ok) return { ok: false, error: contextBody?.error?.message || "无法读取绑定账号。" };
    const protocolCheck = checkExtensionContextProtocol(contextBody.data, extensionCollectionProtocolVersion);
    if (!protocolCheck.ok) return { ok: false, error: protocolErrorMessage(protocolCheck.code) };
    const context = parseExtensionContext(contextBody.data);
    if (!context) return { ok: false, error: "服务器返回的任务上下文无效，已停止配对。" };
    const suggestedTaskId = body?.data?.suggestedTask?.id as string | undefined;
    const suggestedProject = suggestedTaskId
      ? context.account.projects.find((project) => project.tasks.some((task) => task.id === suggestedTaskId))
      : undefined;
    const suggestedTask = suggestedProject?.tasks.find((task) => task.id === suggestedTaskId);
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
    await chrome.storage.local.set({ [STORAGE.TOKEN]: token, [STORAGE.CONFIG]: config, [STORAGE.CONTEXT]: context });
    await chrome.storage.local.remove([STORAGE.PENDING_PAIRING_CONFIRMATION, STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.ROUTE_UPLOAD_STATE, STORAGE.LATEST_SNAPSHOT]);
    await appendLog("extension.paired", { accountProfileId: context.account.id, expiresAt: body?.data?.expiresAt });
    await reportExtensionHeartbeatFromStoredActivity();
    return { ok: true, config, context };
  } catch {
    return { ok: false, error: "无法连接诊断服务，请检查网络或服务器地址。" };
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
    const payload = body && typeof body === "object" && "data" in body
      ? (body as { data?: unknown }).data
      : null;
    const collectionProtocolVersion = payload && typeof payload === "object" && "collectionProtocolVersion" in payload
      ? (payload as { collectionProtocolVersion?: unknown }).collectionProtocolVersion
      : undefined;
    const protocolCheck = checkExtensionContextProtocol({ collectionProtocolVersion }, extensionCollectionProtocolVersion);
    if (!response.ok || !protocolCheck.ok) {
      return {
        ok: false as const,
        error: protocolCheck.ok ? "无法读取本地服务版本，请确认 API 正常运行。" : protocolErrorMessage(protocolCheck.code)
      };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "无法读取本地服务版本，请确认 API 正常运行。" };
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
  await stopLivePulse("TASK_CHANGED");
  const nextConfig: ExtensionConfig = { ...config, collectionTaskId: task.id, projectId: project.id, projectName: project.name };
  await chrome.storage.local.set({ [STORAGE.CONFIG]: nextConfig });
  await chrome.storage.local.remove([STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.ROUTE_UPLOAD_STATE, STORAGE.LATEST_SNAPSHOT, STORAGE.LIVE_PULSE_LAST_OUTCOME, STORAGE.LIVE_PULSE_ACTIVITY, STORAGE.LIVE_PULSE_STATE]);
  latestLivePulseOutcome = null;
  await appendLog("task.selected", { accountProfileId: context.account.id, projectId: project.id, collectionTaskId: task.id });
  await reportExtensionHeartbeatFromStoredActivity();
  return { ok: true, config: nextConfig };
}

async function clearPairing() {
  await stopLivePulse("UNPAIRED");
  await chrome.storage.local.remove([STORAGE.TOKEN, STORAGE.CONFIG, STORAGE.CONTEXT, STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.PENDING_PAIRING_CONFIRMATION, STORAGE.LIVE_PULSE_LAST_OUTCOME, STORAGE.LIVE_PULSE_ACTIVITY, STORAGE.LIVE_PULSE_STATE]);
  latestLivePulseOutcome = null;
  await appendLog("extension.unpaired");
  return { ok: true };
}

async function getState() {
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
  const activeLivePulseState = await hydrateLivePulseState();
  const rawLivePulseOutcome = local[STORAGE.LIVE_PULSE_LAST_OUTCOME];
  const parsedLivePulseOutcome = parseLivePulseOutcome(rawLivePulseOutcome, {
    buildFingerprint: __PXXIS_EXTENSION_BUILD__,
    collectionProtocolVersion: extensionCollectionProtocolVersion,
    endpointKeys: liveScreenInternalApiEndpointKeys
  });
  if (rawLivePulseOutcome && !parsedLivePulseOutcome) {
    await chrome.storage.local.remove(STORAGE.LIVE_PULSE_LAST_OUTCOME).catch(() => undefined);
  }
  const storedLivePulseOutcome = latestLivePulseOutcome || parsedLivePulseOutcome;
  const lastLivePulseOutcome = storedLivePulseOutcome?.taskId === local[STORAGE.CONFIG]?.collectionTaskId
    ? storedLivePulseOutcome
    : null;
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
    livePulseActivity: local[STORAGE.LIVE_PULSE_ACTIVITY] || null,
    activeCollectionSession: local[STORAGE.ACTIVE_COLLECTION_SESSION] || null,
    livePulse: activeLivePulseState ? {
      active: true,
      tabId: activeLivePulseState.tabId,
      startedAt: activeLivePulseState.startedAt,
      successCount: activeLivePulseState.successCount,
      lastSuccessAt: activeLivePulseState.lastSuccessAt,
      lastMetricCount: activeLivePulseState.lastMetricCount,
      lastMetricKeys: activeLivePulseState.lastMetricKeys,
      lastFailureReason: activeLivePulseState.lastFailureReason,
      lastFailureEndpoint: activeLivePulseState.lastFailureEndpoint,
      rateLimitedUntil: activeLivePulseState.rateLimitedUntil,
      lastOutcome: null
    } : { active: false, lastOutcome: lastLivePulseOutcome },
    context: local[STORAGE.CONTEXT] || null,
    hasToken: Boolean(local[STORAGE.TOKEN]),
    pendingPairingConfirmation: pending && new Date(pending.expiresAt).getTime() > Date.now()
      ? { apiBaseUrl: pending.apiBaseUrl, account: pending.account, task: pending.task, expiresAt: pending.expiresAt }
      : null
  };
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

async function getBridgeStatus(sender: chrome.runtime.MessageSender) {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.TOKEN, STORAGE.PENDING_PAIRING_CONFIRMATION]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const paired = Boolean(local[STORAGE.TOKEN]);
  const recovery = await restoreBoundTaskPageConnection({
    paired,
    boundTaskId: config.collectionTaskId,
    sender,
    restore: (taskPageUrl) => restoreTaskPageConnection({
      taskPageUrl,
      timeoutMs: bridgeRecoveryRequestTimeoutMs,
      refreshContext: refreshBoundContext,
      reportHeartbeat: reportExtensionHeartbeat,
      appendLog
    })
  });
  if (recovery.attempted && !recovery.result.ok) {
      await appendLog("extension.connection_restore_failed", { error: recovery.result.error });
      return {
        ok: false,
        paired,
        boundTaskId: config.collectionTaskId,
        error: recovery.result.error
      };
  }
  return {
    ok: true,
    paired,
    pendingConfirmation: Boolean((local[STORAGE.PENDING_PAIRING_CONFIRMATION] as PendingPairingConfirmation | undefined)?.expiresAt && new Date((local[STORAGE.PENDING_PAIRING_CONFIRMATION] as PendingPairingConfirmation).expiresAt).getTime() > Date.now()),
    boundTaskId: config.collectionTaskId || null,
    protocolVersion: extensionBridgeProtocolVersion,
    extensionVersion: chrome.runtime.getManifest().version,
    buildFingerprint: __PXXIS_EXTENSION_BUILD__,
    message: paired
      ? config.collectionTaskId ? "插件已配对并绑定当前任务" : "插件已配对，尚未选择采集任务"
      : "插件运行正常，尚未配对"
  };
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
  const activeLivePulseState = livePulseState || await hydrateLivePulseState();
  if (!isLivePulseActivityReporter(activeLivePulseState?.tabId, tabId)) return savePageActivity(activity, tabId);
  if (shouldStopLivePulseForActivity(activity)) {
    await stopLivePulse("PAGE_INACTIVE");
    return savePageActivity(activity, tabId);
  }
  const liveActivity = livePulseActivityForTab(activity, tabId!);
  if (liveActivity) await chrome.storage.local.set({ [STORAGE.LIVE_PULSE_ACTIVITY]: liveActivity });
  return savePageActivity(activity, tabId);
}

async function captureAndUpload(
  payload: { tabId?: number; currentUrl?: string; routeOverride?: CollectionRouteKey },
  routeHint: CollectionRouteKey = "UNKNOWN"
) {
  const tabId = Number(payload.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) return { ok: false, error: "无法识别当前标签页，请关闭插件弹窗后重试。" };
  if (!isSupportedExtensionCollectionUrl(payload.currentUrl || "")) return { ok: false, error: "当前页面不在已授权的精确采集路线中。" };
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

async function startLivePulse(payload: { tabId?: number; currentUrl?: string }) {
  const tabId = Number(payload.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) return { ok: false, error: "无法识别当前标签页，请关闭插件弹窗后重试。" };
  if (!isExactLiveScreenPage(payload.currentUrl || "")) return { ok: false, error: "实时脉冲仅支持直播数据大屏的精确页面。" };
  const refreshedContext = await refreshBoundContext();
  if (!refreshedContext.ok) return refreshedContext;
  if (!refreshedContext.context.liveScreenInternalApi.enabled) {
    return { ok: false, error: "服务端 API 开关未开启；未启动实时脉冲，也不会静默改用 DOM。" };
  }
  const session = await ensureCollectionSession();
  if (!session.ok) return session;
  const pageContext = await chrome.tabs.sendMessage(tabId, { type: MESSAGE.GET_PAGE_CONTEXT }).catch(() => null);
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
  await stopLivePulse("REPLACED");
  await clearLivePulseOutcome();
  const api = await apiContext();
  if (!api.ok) return api;
  const roomId = typeof pageContext?.livePulseRoomId === "string" && pageContext.livePulseRoomId.trim()
    ? pageContext.livePulseRoomId.trim()
    : roomIdFromLiveScreenUrl(pageContext?.currentUrl || payload.currentUrl || "");
  if (!roomId) {
    return { ok: false, error: "当前直播页未提供可信 room_id；未启动 API 采集，也不会改用 DOM。" };
  }
  await chrome.storage.local.set({ [STORAGE.LIVE_PULSE_ACTIVITY]: initialLiveActivity });
  livePulseState = {
    loopId: `${tabId}:${Date.now()}`,
    tabId,
    taskId: api.collectionTaskId,
    roomId,
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
  await persistLivePulseState();
  await appendLog("live_pulse.started", { tabId, taskId: api.collectionTaskId });
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE.BEGIN_LIVE_PULSE_LOOP,
      payload: {
        collectionRunId: livePulseState.collectionRunId,
        liveScreenInternalApiEnabled: refreshedContext.context.liveScreenInternalApi.enabled
      }
    });
  } catch {
    await stopLivePulse("CONTENT_SCRIPT_UNAVAILABLE");
    return { ok: false, error: "插件尚未注入当前页面，请刷新目标网页后重试。" };
  }
  return { ok: true, nextRefreshAt: new Date().toISOString() };
}

async function submitLivePulse(payload: { pulseStartedAt?: number; snapshot?: CollectionSnapshotPayload; error?: string }, tabId?: number, senderUrl?: string) {
  const state = await hydrateLivePulseState();
  if (!state || tabId !== state.tabId) return { ok: false, stop: true, error: "LIVE_PULSE_NOT_ACTIVE" };
  const pulseStartedAt = Number.isFinite(payload.pulseStartedAt) ? Number(payload.pulseStartedAt) : Date.now();
  const activityStore = await chrome.storage.local.get([STORAGE.LIVE_PULSE_ACTIVITY]);
  const activity = activityStore[STORAGE.LIVE_PULSE_ACTIVITY] as LivePulseActivity | undefined;
  if (
    !activity
    || activity.tabId !== state.tabId
    || shouldStopLivePulseForActivity(activity)
    || !isExactLiveScreenPage(senderUrl || activity.currentUrl)
  ) {
    await stopLivePulse("PAGE_INACTIVE");
    return { ok: false, stop: true, error: "PAGE_INACTIVE" };
  }
  if (payload.error || !payload.snapshot) {
    const failure = await handleLivePulseFailure(state, payload.error || "PULSE_CAPTURE_FAILED", undefined, undefined, undefined, pulseStartedAt);
    return { ok: false, ...failure };
  }
  if (livePulseState !== state) return { ok: false, stop: true, error: "LIVE_PULSE_REPLACED" };
  const snapshot = payload.snapshot;
  if (!isExactLiveScreenPage(snapshot.sourceUrl || "") || livePulseRoomIdFromSnapshot(snapshot) !== state.roomId) {
    await stopLivePulse("PAGE_NAVIGATED");
    return { ok: false, stop: true, error: "PAGE_NAVIGATED" };
  }
  const fatalEndpointStatus = snapshot.captureMeta?.liveScreenInternalApi?.endpointStatuses.find((item) => (
    ["HTTP_401", "HTTP_429", "SENSITIVE_RESPONSE", "BYTE_LIMIT", "TOTAL_BYTE_LIMIT", "SCHEMA_MISMATCH", "LIVE_ENDED"].includes(item.reason || "")
  ));
  if (fatalEndpointStatus) {
    await stopLivePulse(fatalEndpointStatus.reason || "API_ABORTED", fatalEndpointStatus.endpoint);
    return { ok: false, stop: true, error: fatalEndpointStatus.reason || "API_ABORTED" };
  }
  if (!snapshot.captureMeta?.liveScreenInternalApi || snapshot.visibleMetricsJson.length === 0) {
    const endpointFailure = snapshot.captureMeta?.liveScreenInternalApi?.endpointStatuses.find((item) => item.reason);
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
  if (livePulseState !== state) return { ok: false, stop: true, error: "LIVE_PULSE_REPLACED" };
  if (!result.ok) {
    const failure = await handleLivePulseFailure(state, result.error || "PULSE_UPLOAD_FAILED", result.status, undefined, result.retryAfterMs, pulseStartedAt);
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
  state: LivePulseState,
  error: string,
  status?: number,
  endpoint?: LiveScreenInternalApiEndpointKey,
  retryAfterMs?: number,
  pulseStartedAt = Date.now()
) {
  if (livePulseState !== state) return { stop: true, error: "LIVE_PULSE_REPLACED" };
  if (status === 429 && error === "RATE_LIMITED" && retryAfterMs) {
    const rateLimitedUntil = nextLivePulseAfterRateLimit(Date.now(), retryAfterMs);
    state.consecutiveFailures = 0;
    state.lastFailureReason = null;
    state.lastFailureEndpoint = null;
    state.rateLimitedUntil = new Date(rateLimitedUntil).toISOString();
    await appendLog("live_pulse.rate_limited", {
      tabId: state.tabId,
      retryAfterMs
    });
    await persistLivePulseState();
    return { nextDelayMs: Math.max(0, rateLimitedUntil - Date.now()), error: "RATE_LIMITED" };
  }
  if (status === 401 || status === 429 || /HTTP_401|HTTP_429|SCHEMA_MISMATCH|SENSITIVE_RESPONSE|BYTE_LIMIT|TOTAL_BYTE_LIMIT|LIVE_ENDED|PAGE_INACTIVE|LIVE_SCREEN_INTERNAL_API_(?:DISABLED|CONTRACT_MISMATCH|EVIDENCE_INVALID|PAGE_FORBIDDEN)|LIVE_SCREEN_(?:ROOM_ID_INVALID|PULSE_PURPOSE_INVALID)/.test(error)) {
    await stopLivePulse(error);
    return { stop: true, error };
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
      state.lastFailureReason
    );
    return { stop: true, error: "THREE_CONSECUTIVE_FAILURES" };
  }
  await persistLivePulseState();
  return { nextDelayMs: Math.max(0, nextLivePulseAfter(pulseStartedAt) - Date.now()), error: failure.lastFailureReason };
}

async function stopLivePulse(reason: string, endpoint?: LiveScreenInternalApiEndpointKey, lastFailureReason?: string) {
  const state = livePulseState || await hydrateLivePulseState();
  livePulseState = null;
  await chrome.storage.local.remove([STORAGE.LIVE_PULSE_ACTIVITY, STORAGE.LIVE_PULSE_STATE]).catch(() => undefined);
  if (!state) return;
  state.uploadController?.abort();
  state.uploadController = null;
  await chrome.tabs.sendMessage(state.tabId, { type: MESSAGE.STOP_LIVE_PULSE }).catch(() => undefined);
  await saveLivePulseOutcome({
    taskId: state.taskId,
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

async function clearLivePulseOutcome() {
  latestLivePulseOutcome = null;
  await chrome.storage.local.remove(STORAGE.LIVE_PULSE_LAST_OUTCOME).catch(() => undefined);
}

async function clearLivePulseActivity() {
  await chrome.storage.local.remove([STORAGE.LIVE_PULSE_ACTIVITY, STORAGE.LIVE_PULSE_STATE]).catch(() => undefined);
}

async function persistLivePulseState() {
  const state = livePulseState;
  if (!state) {
    await chrome.storage.local.remove(STORAGE.LIVE_PULSE_STATE).catch(() => undefined);
    return;
  }
  const stored: StoredLivePulseState = {
    loopId: state.loopId,
    tabId: state.tabId,
    taskId: state.taskId,
    roomId: state.roomId,
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
  await chrome.storage.local.set({ [STORAGE.LIVE_PULSE_STATE]: stored }).catch(() => undefined);
}

async function hydrateLivePulseState() {
  if (livePulseState) return livePulseState;
  const local = await chrome.storage.local.get([STORAGE.LIVE_PULSE_STATE]);
  const parsed = parseStoredLivePulseState(local[STORAGE.LIVE_PULSE_STATE]);
  if (!parsed) {
    await chrome.storage.local.remove(STORAGE.LIVE_PULSE_STATE).catch(() => undefined);
    return null;
  }
  livePulseState = { ...parsed, uploadController: null };
  return livePulseState;
}

function parseStoredLivePulseState(value: unknown): Omit<LivePulseState, "uploadController"> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.buildFingerprint !== __PXXIS_EXTENSION_BUILD__
    || candidate.collectionProtocolVersion !== extensionCollectionProtocolVersion
    || typeof candidate.loopId !== "string"
    || !Number.isInteger(candidate.tabId)
    || typeof candidate.taskId !== "string"
    || typeof candidate.roomId !== "string"
    || typeof candidate.currentUrl !== "string"
    || !isExactLiveScreenPage(candidate.currentUrl)
    || typeof candidate.startedAt !== "string"
    || !Number.isSafeInteger(candidate.successCount)
    || !Number.isSafeInteger(candidate.lastMetricCount)
    || !Array.isArray(candidate.lastMetricKeys)
  ) {
    return null;
  }
  const lastMetricKeys = normalizeLivePulseMetricKeys(candidate.lastMetricKeys);
  if (lastMetricKeys.length !== candidate.lastMetricKeys.length) return null;
  const endpoint = typeof candidate.lastFailureEndpoint === "string" && liveScreenInternalApiEndpointKeys.includes(candidate.lastFailureEndpoint as LiveScreenInternalApiEndpointKey)
    ? candidate.lastFailureEndpoint as LiveScreenInternalApiEndpointKey
    : null;
  return {
    loopId: candidate.loopId,
    tabId: Number(candidate.tabId),
    taskId: candidate.taskId,
    roomId: candidate.roomId,
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
  const versionedOutcome: LivePulseOutcome = {
    ...outcome,
    buildFingerprint: __PXXIS_EXTENSION_BUILD__,
    collectionProtocolVersion: extensionCollectionProtocolVersion
  };
  latestLivePulseOutcome = versionedOutcome;
  await chrome.storage.local.set({ [STORAGE.LIVE_PULSE_LAST_OUTCOME]: versionedOutcome }).catch(() => undefined);
}

function isLivePulseFailure(reason: string) {
  return !["USER_STOPPED", "REPLACED"].includes(reason);
}

function shouldStopLivePulseForActivity(activity: PageActivity) {
  return !isExactLiveScreenPage(activity.currentUrl) || activity.pageType !== "LIVE_DATA_SCREEN";
}

async function stopLivePulseForTab(tabId: number, reason: string) {
  const state = livePulseState || await hydrateLivePulseState();
  if (state?.tabId === tabId) await stopLivePulse(reason);
}

async function stopLivePulseForTabUpdate(tabId: number, changeInfo: chrome.tabs.TabChangeInfo) {
  const state = livePulseState || await hydrateLivePulseState();
  if (state?.tabId !== tabId) return;
  if (changeInfo.status === "loading" || changeInfo.url) await stopLivePulse("PAGE_NAVIGATED");
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
  try {
    const response = await fetchWithTimeout(`${api.apiBaseUrl}/extension/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${api.token}` },
      body: JSON.stringify({
        collectionTaskId: api.collectionTaskId,
        extensionVersion: chrome.runtime.getManifest().version,
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: __PXXIS_EXTENSION_BUILD__,
        currentUrl: activity.currentUrl,
        pageType: activity.pageType,
        routeKey: activity.routeKey,
        collectable: activity.collectable,
        tabState: activity.tabState,
        lastError: activity.lastError || null,
        observedAt: activity.observedAt
      })
    });
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
    .filter((route): route is CollectionRouteKey => route === "LOCAL_PROMOTION_DASHBOARD"))];
}

function sameRouteKeys(left: readonly CollectionRouteKey[], right: readonly CollectionRouteKey[]) {
  return [...new Set(left)].sort().join("|") === [...new Set(right)].sort().join("|");
}

function routeLabel(routeKey: CollectionRouteKey) {
  return collectionRouteLabels[routeKey] || routeKey;
}

async function refreshBoundContext(timeoutMs = extensionRequestTimeoutMs): Promise<{ ok: true; context: ExtensionContext } | { ok: false; error: string }> {
  const api = await apiContext();
  if (!api.ok) return api;
  try {
    const response = await fetchWithTimeout(`${api.apiBaseUrl}/extension/context`, {
      headers: extensionContextRequestHeaders(api.token)
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body
        ? (body as { error?: { message?: unknown } }).error?.message
        : null;
      return { ok: false, error: typeof message === "string" ? message : "无法刷新当前账号信息，请重新配对后重试。" };
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
