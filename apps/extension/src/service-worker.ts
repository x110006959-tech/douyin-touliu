import type {
  CollectionRouteFailureCode,
  CollectionRouteKey,
  CollectionSnapshotPayload
} from "@douyin-local-life/shared";
import { extensionBridgeProtocolVersion, extensionCollectionProtocolVersion } from "@douyin-local-life/shared";
import { defaultRequiredCollectionRoutes, normalizeCollectionRouteKey } from "@douyin-local-life/shared/collection-routes";
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
let uploadQueue: Promise<unknown> = Promise.resolve();
const captureSingleFlight = createKeyedSingleFlight();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
    .then(() => appendLog("extension.installed"));
});
void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE.PAGE_ACTIVITY) {
    void savePageActivity(message.payload as PageActivity, sender.tab?.id).then(sendResponse);
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
  if (message?.type === MESSAGE.GET_STATE) {
    void getState().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.GET_BRIDGE_STATUS) {
    void getBridgeStatus().then(sendResponse);
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
  try {
    const response = await fetch(`${apiBaseUrl}/extension/pairing-codes/preview`, {
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
  try {
    const response = await fetch(`${confirmation.apiBaseUrl}/extension/pairing-codes/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: confirmation.code, label: confirmation.label })
    });
    const body = await response.json();
    if (!response.ok) return { ok: false, error: body?.error?.message || "配对失败，请在任务页重新生成配对码。" };
    const token = body?.data?.token as string | undefined;
    if (!token) return { ok: false, error: "服务器未返回插件凭证，请重新配对。" };
    const contextResponse = await fetch(`${confirmation.apiBaseUrl}/extension/context`, { headers: { Authorization: `Bearer ${token}` } });
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
  const nextConfig: ExtensionConfig = { ...config, collectionTaskId: task.id, projectId: project.id, projectName: project.name };
  await chrome.storage.local.set({ [STORAGE.CONFIG]: nextConfig });
  await chrome.storage.local.remove([STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.ROUTE_UPLOAD_STATE, STORAGE.LATEST_SNAPSHOT]);
  await appendLog("task.selected", { accountProfileId: context.account.id, projectId: project.id, collectionTaskId: task.id });
  await reportExtensionHeartbeatFromStoredActivity();
  return { ok: true, config: nextConfig };
}

async function clearPairing() {
  await chrome.storage.local.remove([STORAGE.TOKEN, STORAGE.CONFIG, STORAGE.CONTEXT, STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.PENDING_PAIRING_CONFIRMATION]);
  await appendLog("extension.unpaired");
  return { ok: true };
}

async function getState() {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.LATEST_SNAPSHOT, STORAGE.LOGS, STORAGE.ROUTE_UPLOAD_STATE, STORAGE.PAGE_ACTIVITY, STORAGE.TOKEN, STORAGE.CONTEXT, STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.PENDING_PAIRING_CONFIRMATION]);
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
    activeCollectionSession: local[STORAGE.ACTIVE_COLLECTION_SESSION] || null,
    context: local[STORAGE.CONTEXT] || null,
    hasToken: Boolean(local[STORAGE.TOKEN]),
    pendingPairingConfirmation: pending && new Date(pending.expiresAt).getTime() > Date.now()
      ? { apiBaseUrl: pending.apiBaseUrl, account: pending.account, task: pending.task, expiresAt: pending.expiresAt }
      : null
  };
}

async function getBridgeStatus() {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.TOKEN, STORAGE.PENDING_PAIRING_CONFIRMATION]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const paired = Boolean(local[STORAGE.TOKEN]);
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
  if (payload.routeOverride) {
    const allowedRoutes = await currentTaskRouteKeys();
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
        routeOverride: payload.routeOverride ? routeOverride : undefined
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
    return { ok: false, error: "无法确认当前分栏，请在插件中为本次采集选择“概览、商品或流量”后重试。" };
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
  const serverSnapshot = (upload as { data?: { data?: { normalizedMetrics?: unknown[] } } }).data?.data;
  return {
    ok: true,
    skipped: (upload as { skipped?: boolean }).skipped || false,
    routeKey: snapshot.routeKey || "UNKNOWN",
    metricCount: serverSnapshot?.normalizedMetrics?.length || snapshot.visibleMetricsJson.length,
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

async function ensureCollectionSession(): Promise<
  | { ok: true; session: CollectionSessionState }
  | { ok: false; error: string }
> {
  const api = await apiContext();
  if (!api.ok) return api;
  const local = await chrome.storage.local.get([STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.CONTEXT]);
  const existing = local[STORAGE.ACTIVE_COLLECTION_SESSION] as CollectionSessionState | undefined;
  if (existing?.taskId === api.collectionTaskId && Date.now() - new Date(existing.startedAt).getTime() < 30 * 60_000) {
    return { ok: true, session: existing };
  }
  const context = local[STORAGE.CONTEXT] as ExtensionContext | undefined;
  const task = context?.account.projects.flatMap((project) => project.tasks).find((item) => item.id === api.collectionTaskId);
  const requiredRoutes = task?.routeSources
    .filter((route) => route.required)
    .map((route) => normalizeCollectionRouteKey(route.routeKey))
    .filter((route) => route !== "UNKNOWN");
  try {
    const response = await fetch(`${api.apiBaseUrl}/collection-tasks/${api.collectionTaskId}/collection-runs`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${api.token}` },
      body: JSON.stringify({ requiredRoutes: requiredRoutes?.length ? requiredRoutes : defaultRequiredCollectionRoutes })
    });
    const body = await response.json();
    if (!response.ok || !body?.data?.id) return { ok: false, error: body?.error?.message || "无法创建本次采集批次。" };
    const session: CollectionSessionState = {
      taskId: api.collectionTaskId,
      collectionRunId: body.data.id,
      requiredRoutes: requiredRoutes?.length ? requiredRoutes : [...defaultRequiredCollectionRoutes],
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

async function reportExtensionHeartbeat(activity: PageActivity) {
  const api = await apiContext();
  if (!api.ok) return { ok: false, skipped: true, error: api.error };
  try {
    const response = await fetch(`${api.apiBaseUrl}/extension/heartbeat`, {
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
  } catch {
    return { ok: false, error: "插件状态暂时无法同步到网页。" };
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
    .filter((route): route is CollectionRouteKey => route !== "UNKNOWN"))];
}

async function refreshBoundContext(): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = await apiContext();
  if (!api.ok) return api;
  try {
    const response = await fetch(`${api.apiBaseUrl}/extension/context`, {
      headers: { Authorization: `Bearer ${api.token}` }
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
    return { ok: true };
  } catch {
    return { ok: false, error: "无法刷新当前账号信息，请检查诊断服务后重试。" };
  }
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
