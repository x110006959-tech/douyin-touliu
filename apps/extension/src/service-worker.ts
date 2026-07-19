import type {
  AccountMatchEvidence,
  AccountMatchStatus,
  CollectionRouteFailureCode,
  CollectionRouteKey,
  CollectionSnapshotPayload,
  MetricPulse,
  RealtimeSignal
} from "@douyin-local-life/shared";
import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";
import { collectionFreshnessPolicy, defaultRequiredCollectionRoutes, normalizeCollectionRouteKey } from "@douyin-local-life/shared/collection-routes";
import { apiBaseUrlGuidance, defaultApiBaseUrl } from "./build-target";
import { MESSAGE, STORAGE } from "./messages";
import { isSupportedExtensionCollectionUrl, normalizeApiBaseUrl, sanitizeSnapshotPayload } from "./safety";
import { compareAccountIdentity } from "./account-identity";
import { createKeyedSingleFlight } from "./single-flight";

type ExtensionConfig = {
  apiBaseUrl?: string;
  collectionTaskId?: string;
  accountProfileId?: string;
  accountName?: string;
  platformAccountId?: string | null;
  projectId?: string;
  projectName?: string;
};

type ExtensionContext = {
  account: {
    id: string;
    accountName: string;
    platformAccountId: string | null;
    projects: Array<{
      id: string;
      name: string;
      tasks: Array<{
        id: string;
        pageTitle: string | null;
        routeSources: Array<{ routeKey: string; required: boolean }>;
      }>;
    }>;
  };
};

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
  detectedAccountId?: string | null;
  detectedAccountName?: string | null;
  accountMatchEvidence?: AccountMatchEvidence | null;
  observedAt: string;
  lastError?: string | null;
};

type PatrolState = {
  enabled: boolean;
  collectionRunId: string | null;
  requiredRoutes: CollectionRouteKey[];
  intervalMs: number;
  startedAt: string | null;
};

type RouteUploadState = Record<string, { fingerprint: string; lastUploadAt: number; consecutiveFailures: number }>;
type PendingPairingConfirmation = {
  apiBaseUrl: string;
  code: string;
  label: string;
  account: { id: string; accountName: string; platformAccountId: string | null };
  task: { id: string; pageTitle: string | null; projectId: string; projectName: string } | null;
  expiresAt: string;
  requestedAt: string;
};
let uploadQueue: Promise<unknown> = Promise.resolve();
const captureSingleFlight = createKeyedSingleFlight();
const patrolSingleFlight = createKeyedSingleFlight();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
    .then(() => appendLog("extension.installed"));
});
void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE.SNAPSHOT_CAPTURED) {
    void saveSnapshot(message.payload as CollectionSnapshotPayload, sender.tab?.id).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.METRIC_PULSE_CAPTURED) {
    void uploadMetricPulse(message.payload as MetricPulse).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.PAGE_ACTIVITY) {
    void savePageActivity(message.payload as PageActivity, sender.tab?.id).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.GET_PATROL_STATE) {
    void getPatrolState().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.CAPTURE_AND_UPLOAD) {
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
  if (message?.type === MESSAGE.UPLOAD_SNAPSHOT) {
    void uploadLatestSnapshot().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.START_PATROL) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "启动巡检只能在插件 Popup 中完成。" });
      return false;
    }
    void patrolActionSingleFlight("start", message.payload || {}).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.STOP_PATROL) {
    if (!isPopupSender(sender)) {
      sendResponse({ ok: false, error: "停止巡检只能在插件 Popup 中完成。" });
      return false;
    }
    void patrolActionSingleFlight("stop", message.payload || {}).then(sendResponse);
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

async function saveSnapshot(snapshot: CollectionSnapshotPayload, tabId?: number, options: { autoUpload?: boolean } = {}) {
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
  const local = await chrome.storage.local.get([STORAGE.PATROL]);
  const patrol = (local[STORAGE.PATROL] || {}) as PatrolState;
  if (options.autoUpload !== false && patrol.enabled && patrol.collectionRunId && safeSnapshot.collectionRunId === patrol.collectionRunId) {
    const upload = await enqueueSnapshotUpload(safeSnapshot);
    return { ok: true, upload };
  }
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
    const context = contextBody.data as ExtensionContext;
    const suggestedTaskId = body?.data?.suggestedTask?.id as string | undefined;
    const suggestedProject = suggestedTaskId
      ? context.account.projects.find((project) => project.tasks.some((task) => task.id === suggestedTaskId))
      : undefined;
    const suggestedTask = suggestedProject?.tasks.find((task) => task.id === suggestedTaskId);
    const config: ExtensionConfig = {
      apiBaseUrl: confirmation.apiBaseUrl,
      accountProfileId: context.account.id,
      accountName: context.account.accountName,
      platformAccountId: context.account.platformAccountId,
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
  await chrome.storage.local.remove([STORAGE.TOKEN, STORAGE.CONFIG, STORAGE.CONTEXT, STORAGE.PATROL, STORAGE.LATEST_SIGNALS, STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.PENDING_PAIRING_CONFIRMATION]);
  await appendLog("extension.unpaired");
  return { ok: true };
}

async function getState() {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.LATEST_SNAPSHOT, STORAGE.LOGS, STORAGE.PATROL, STORAGE.ROUTE_UPLOAD_STATE, STORAGE.LATEST_SIGNALS, STORAGE.PAGE_ACTIVITY, STORAGE.TOKEN, STORAGE.CONTEXT, STORAGE.ACTIVE_COLLECTION_SESSION, STORAGE.PENDING_PAIRING_CONFIRMATION]);
  const pending = local[STORAGE.PENDING_PAIRING_CONFIRMATION] as PendingPairingConfirmation | undefined;
  if (pending && new Date(pending.expiresAt).getTime() <= Date.now()) {
    await chrome.storage.local.remove(STORAGE.PENDING_PAIRING_CONFIRMATION);
  }
  return {
    ok: true,
    config: local[STORAGE.CONFIG] || {},
    latestSnapshot: local[STORAGE.LATEST_SNAPSHOT] || null,
    logs: local[STORAGE.LOGS] || [],
    patrol: local[STORAGE.PATROL] || { enabled: false },
    routeUploadState: local[STORAGE.ROUTE_UPLOAD_STATE] || {},
    latestSignals: local[STORAGE.LATEST_SIGNALS] || [],
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

async function getPatrolState() {
  const local = await chrome.storage.local.get([STORAGE.PATROL]);
  const patrol = (local[STORAGE.PATROL] || {}) as PatrolState;
  return {
    enabled: Boolean(patrol.enabled),
    collectionRunId: patrol.collectionRunId || null,
    requiredRoutes: patrol.requiredRoutes || [],
    intervalMs: patrol.intervalMs || collectionFreshnessPolicy.patrolIntervalMs
  };
}

async function captureAndUpload(
  payload: { tabId?: number; currentUrl?: string; routeOverride?: CollectionRouteKey },
  routeHint: CollectionRouteKey = "UNKNOWN"
) {
  const tabId = Number(payload.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) return { ok: false, error: "无法识别当前标签页，请关闭插件弹窗后重试。" };
  if (!isSupportedExtensionCollectionUrl(payload.currentUrl || "")) return { ok: false, error: "当前页面不在已授权的精确采集路线中。" };
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
  const snapshot = { ...captureResponse.snapshot, collectionRunId: session.session.collectionRunId };
  if (!snapshot.routeKey || snapshot.routeKey === "UNKNOWN") {
    await reportCaptureFailure(session.session.collectionRunId, routeHint, "ROUTE_UNVERIFIED", "Captured route was not verified");
    return { ok: false, error: "无法确认当前分栏，请在插件中为本次采集选择“概览、商品或流量”后重试。" };
  }
  await saveSnapshot(snapshot, tabId, { autoUpload: false });
  const upload = await enqueueSnapshotUpload(snapshot);
  if (!upload.ok) {
    await reportExtensionHeartbeat({
      currentUrl: snapshot.sourceUrl,
      pageType: snapshot.pageType,
      routeKey: snapshot.routeKey,
      collectable: true,
      tabState: "VISIBLE",
      detectedAccountId: snapshot.detectedAccountId || null,
      detectedAccountName: snapshot.detectedAccountName || null,
      accountMatchEvidence: snapshot.accountMatchEvidence || null,
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
    detectedAccountId: snapshot.detectedAccountId || null,
    detectedAccountName: snapshot.detectedAccountName || null,
    accountMatchEvidence: snapshot.accountMatchEvidence || null,
    observedAt: new Date().toISOString(),
    lastError: null
  }, tabId);
  const serverSnapshot = (upload as { data?: { data?: { normalizedMetrics?: unknown[]; accountMatchStatus?: string } } }).data?.data;
  return {
    ok: true,
    skipped: (upload as { skipped?: boolean }).skipped || false,
    routeKey: snapshot.routeKey || "UNKNOWN",
    metricCount: serverSnapshot?.normalizedMetrics?.length || snapshot.visibleMetricsJson.length,
    coverageRatio: snapshot.captureMeta?.coverageRatio ?? null,
    accountMatchStatus: serverSnapshot?.accountMatchStatus || "UNVERIFIED",
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
  const local = await chrome.storage.local.get([STORAGE.CONFIG]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const accountMatchStatus = compareAccountIdentity(config, activity) as AccountMatchStatus;
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
        detectedAccountId: activity.detectedAccountId || null,
        detectedAccountName: activity.detectedAccountName || null,
        accountMatchEvidence: activity.accountMatchEvidence || null,
        accountMatchStatus,
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

async function uploadMetricPulse(pulse: MetricPulse) {
  const context = await apiContext();
  if (!context.ok) return context;
  if (pulse.tabState !== "VISIBLE") return { ok: true, skipped: true, reason: "PAGE_INACTIVE" };
  try {
    const response = await fetch(`${context.apiBaseUrl}/collection-tasks/${context.collectionTaskId}/metric-pulses`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${context.token}` },
      body: JSON.stringify(pulse)
    });
    const body = await response.json();
    if (!response.ok) return { ok: false, error: body?.error?.message || `HTTP ${response.status}` };
    const signals = (body?.data?.signals || []) as RealtimeSignal[];
    await chrome.storage.local.set({ [STORAGE.LATEST_SIGNALS]: signals, [STORAGE.PAGE_ACTIVITY]: { tabState: pulse.tabState, observedAt: pulse.localCapturedAt } });
    return { ok: true, signals };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "实时指标上传失败" };
  }
}

async function uploadLatestSnapshot() {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.LATEST_SNAPSHOT]);
  const session = await chrome.storage.local.get([STORAGE.TOKEN]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const snapshot = local[STORAGE.LATEST_SNAPSHOT] as CollectionSnapshotPayload | undefined;
  const token = session[STORAGE.TOKEN] as string | undefined;

  if (!config.apiBaseUrl || !config.collectionTaskId) return { ok: false, error: "请先配对账号并选择采集任务。" };
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!apiBaseUrl) return { ok: false, error: "服务器地址不受支持。" };
  if (!token) return { ok: false, error: "插件授权已丢失，请重新配对。" };
  if (!snapshot) return { ok: false, error: "暂无可上传的本地快照。" };

  return enqueueSnapshotUpload(snapshot);
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
  const localMatch = compareAccountIdentity(config, snapshot);
  if (localMatch === "MISMATCHED") {
    await appendLog("snapshot.account_mismatch_blocked", { accountProfileId: config.accountProfileId, detectedAccountId: snapshot.detectedAccountId || null, detectedAccountName: snapshot.detectedAccountName || null });
    return { ok: false, error: `当前页面账号与任务账号“${config.accountName || "未命名账号"}”不一致，已阻止上传。` };
  }
  const routeKey = snapshot.routeKey || snapshot.pageType || "UNKNOWN";
  const routeState = (local[STORAGE.ROUTE_UPLOAD_STATE] || {}) as RouteUploadState;
  const fingerprint = snapshotFingerprint(snapshot);
  const previous = routeState[routeKey];
  if (previous?.fingerprint === fingerprint && Date.now() - previous.lastUploadAt < collectionFreshnessPolicy.heartbeatUploadMs) {
    return { ok: true, skipped: true, reason: "UNCHANGED" };
  }
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


async function startPatrol(payload: { requiredRoutes?: CollectionRouteKey[]; intervalMs?: number; tabId?: number }) {
  const context = await apiContext();
  if (!context.ok) return context;
  const configuredRoutes = await currentTaskRouteKeys();
  const calibratedRoutes = new Set<CollectionRouteKey>([
    "LOCAL_PROMOTION_DASHBOARD",
    "LIVE_DATA_SCREEN",
    "LIVE_PRODUCT_TAB",
    "LIVE_TRAFFIC_TAB",
    "TASK_TABLE"
  ]);
  const requiredRoutes = [...new Set((payload.requiredRoutes?.length ? payload.requiredRoutes : defaultRequiredCollectionRoutes)
    .map(normalizeCollectionRouteKey)
    .filter((route): route is CollectionRouteKey => route !== "UNKNOWN"))];
  if (!requiredRoutes.length
    || requiredRoutes.some((route) => !configuredRoutes.includes(route) || !calibratedRoutes.has(route))) {
    return { ok: false, error: "巡检路线必须来自当前任务已配置且已校准的页面。" };
  }
  const response = await fetch(`${context.apiBaseUrl}/collection-tasks/${context.collectionTaskId}/collection-runs`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${context.token}` },
    body: JSON.stringify({ requiredRoutes })
  });
  const body = await response.json();
  if (!response.ok) return { ok: false, error: body?.error?.message || "无法启动巡检。" };
  const run = body?.data;
  const patrol: PatrolState = {
    enabled: true,
    collectionRunId: run.id,
    requiredRoutes,
    intervalMs: Math.max(30_000, payload.intervalMs || collectionFreshnessPolicy.patrolIntervalMs),
    startedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({
    [STORAGE.PATROL]: patrol,
    [STORAGE.ROUTE_UPLOAD_STATE]: {},
    [STORAGE.ACTIVE_COLLECTION_SESSION]: {
      taskId: context.collectionTaskId,
      collectionRunId: run.id,
      requiredRoutes,
      startedAt: patrol.startedAt!
    } satisfies CollectionSessionState
  });
  await syncPatrolToTab(payload.tabId, patrol);
  await appendLog("patrol.started", { collectionRunId: run.id, requiredRoutes });
  return { ok: true, patrol, run };
}

async function stopPatrol(payload: { tabId?: number } = {}) {
  const local = await chrome.storage.local.get([STORAGE.PATROL]);
  const patrol = (local[STORAGE.PATROL] || {}) as PatrolState;
  const context = await apiContext();
  if (patrol.collectionRunId && context.ok) {
    await fetch(`${context.apiBaseUrl}/collection-runs/${patrol.collectionRunId}/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${context.token}` }
    });
  }
  const stopped: PatrolState = {
    enabled: false,
    collectionRunId: null,
    requiredRoutes: patrol.requiredRoutes || [...defaultRequiredCollectionRoutes],
    intervalMs: patrol.intervalMs || collectionFreshnessPolicy.patrolIntervalMs,
    startedAt: null
  };
  await chrome.storage.local.set({ [STORAGE.PATROL]: stopped });
  await syncPatrolToTab(payload.tabId, stopped);
  await appendLog("patrol.stopped", { collectionRunId: patrol.collectionRunId || null });
  return { ok: true, patrol: stopped };
}

async function patrolActionSingleFlight(
  action: "start" | "stop",
  payload: { requiredRoutes?: CollectionRouteKey[]; intervalMs?: number; tabId?: number }
) {
  const local = await chrome.storage.local.get([STORAGE.CONFIG]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const key = `${config.collectionTaskId || "unbound"}:${action}`;
  if (action === "start") return patrolSingleFlight.run(key, () => startPatrol(payload));
  return patrolSingleFlight.run(key, () => stopPatrol(payload));
}

async function syncPatrolToTab(tabId: unknown, patrol: PatrolState) {
  const normalizedTabId = Number(tabId);
  if (!Number.isInteger(normalizedTabId) || normalizedTabId <= 0) return;
  try {
    await chrome.tabs.sendMessage(normalizedTabId, { type: MESSAGE.SYNC_PATROL_STATE, payload: patrol });
  } catch {
    // The user may start a patrol before refreshing a target page with the current extension.
  }
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
