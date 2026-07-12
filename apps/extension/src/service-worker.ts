import type {
  CollectionRouteKey,
  CollectionSnapshotPayload,
  MetricPulse,
  RealtimeSignal
} from "@douyin-local-life/shared";
import { collectionFreshnessPolicy, defaultRequiredCollectionRoutes } from "@douyin-local-life/shared/collection-routes";
import { MESSAGE, STORAGE } from "./messages";
import { normalizeApiBaseUrl, sanitizeSnapshotPayload } from "./safety";

type ExtensionConfig = {
  apiBaseUrl?: string;
  collectionTaskId?: string;
};

type PatrolState = {
  enabled: boolean;
  collectionRunId: string | null;
  requiredRoutes: CollectionRouteKey[];
  intervalMs: number;
  startedAt: string | null;
};

type RouteUploadState = Record<string, { fingerprint: string; lastUploadAt: number; consecutiveFailures: number }>;
let uploadQueue: Promise<unknown> = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  void appendLog("extension.installed");
});

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
    void chrome.storage.local.set({ [STORAGE.PAGE_ACTIVITY]: message.payload }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === MESSAGE.GET_STATE) {
    void getState().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.SAVE_CONFIG) {
    void saveConfig(message.payload || {}).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.UPLOAD_SNAPSHOT) {
    void uploadLatestSnapshot().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.START_PATROL) {
    void startPatrol(message.payload || {}).then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.STOP_PATROL) {
    void stopPatrol().then(sendResponse);
    return true;
  }
  if (message?.type === MESSAGE.CLEAR_SNAPSHOT) {
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
  const local = await chrome.storage.local.get([STORAGE.PATROL]);
  const patrol = (local[STORAGE.PATROL] || {}) as PatrolState;
  if (patrol.enabled && patrol.collectionRunId && safeSnapshot.collectionRunId === patrol.collectionRunId) {
    const upload = await enqueueSnapshotUpload(safeSnapshot);
    return { ok: true, upload };
  }
  return { ok: true };
}

async function saveConfig(payload: ExtensionConfig & { token?: string }) {
  const apiBaseUrl = normalizeApiBaseUrl(payload.apiBaseUrl || "http://localhost:4000");
  if (!apiBaseUrl) return { ok: false, error: "API address must use HTTPS, except for localhost development." };
  const config: ExtensionConfig = {
    apiBaseUrl,
    collectionTaskId: payload.collectionTaskId
  };
  await chrome.storage.local.set({ [STORAGE.CONFIG]: config });
  if (payload.token) {
    await chrome.storage.session.set({ [STORAGE.TOKEN]: payload.token });
  }
  await appendLog("config.saved", { apiBaseUrl: config.apiBaseUrl, collectionTaskId: config.collectionTaskId, tokenStoredInSession: Boolean(payload.token) });
  return { ok: true };
}

async function getState() {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.LATEST_SNAPSHOT, STORAGE.LOGS, STORAGE.PATROL, STORAGE.ROUTE_UPLOAD_STATE, STORAGE.LATEST_SIGNALS, STORAGE.PAGE_ACTIVITY]);
  const session = await chrome.storage.session.get([STORAGE.TOKEN]);
  return {
    ok: true,
    config: local[STORAGE.CONFIG] || {},
    latestSnapshot: local[STORAGE.LATEST_SNAPSHOT] || null,
    logs: local[STORAGE.LOGS] || [],
    patrol: local[STORAGE.PATROL] || { enabled: false },
    routeUploadState: local[STORAGE.ROUTE_UPLOAD_STATE] || {},
    latestSignals: local[STORAGE.LATEST_SIGNALS] || [],
    pageActivity: local[STORAGE.PAGE_ACTIVITY] || null,
    hasToken: Boolean(session[STORAGE.TOKEN])
  };
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
    return { ok: false, error: error instanceof Error ? error.message : "Metric pulse upload failed" };
  }
}

async function uploadLatestSnapshot() {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.LATEST_SNAPSHOT]);
  const session = await chrome.storage.session.get([STORAGE.TOKEN]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const snapshot = local[STORAGE.LATEST_SNAPSHOT] as CollectionSnapshotPayload | undefined;
  const token = session[STORAGE.TOKEN] as string | undefined;

  if (!config.apiBaseUrl || !config.collectionTaskId) return { ok: false, error: "Configure API base URL and collection task ID first." };
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!apiBaseUrl) return { ok: false, error: "Configured API address is not allowed." };
  if (!token) return { ok: false, error: "Missing SaaS API token. Configure it in the popup." };
  if (!snapshot) return { ok: false, error: "No local snapshot available." };

  return enqueueSnapshotUpload(snapshot);
}

function enqueueSnapshotUpload(snapshot: CollectionSnapshotPayload) {
  const next = uploadQueue.then(() => uploadSnapshot(snapshot));
  uploadQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function uploadSnapshot(snapshot: CollectionSnapshotPayload) {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.ROUTE_UPLOAD_STATE]);
  const session = await chrome.storage.session.get([STORAGE.TOKEN]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const token = session[STORAGE.TOKEN] as string | undefined;
  if (!config.apiBaseUrl || !config.collectionTaskId) return { ok: false, error: "Configure API base URL and collection task ID first." };
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!apiBaseUrl) return { ok: false, error: "Configured API address is not allowed." };
  if (!token) return { ok: false, error: "Missing SaaS API token. Configure it in the popup." };
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
    const message = error instanceof Error ? error.message : "Network upload failed";
    routeState[routeKey] = {
      fingerprint,
      lastUploadAt: previous?.lastUploadAt || 0,
      consecutiveFailures: (previous?.consecutiveFailures || 0) + 1
    };
    await chrome.storage.local.set({ [STORAGE.ROUTE_UPLOAD_STATE]: routeState });
    await appendLog("snapshot.upload_failed", { routeKey, error: message });
    if (snapshot.collectionRunId) await reportRouteFailure(apiBaseUrl, token, snapshot.collectionRunId, routeKey as CollectionRouteKey, message);
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
    await reportRouteFailure(apiBaseUrl, token, snapshot.collectionRunId, routeKey as CollectionRouteKey, payload?.error?.message || `HTTP ${response.status}`);
  }
  return response.ok ? { ok: true, data: payload } : { ok: false, error: payload?.error?.message || "Upload failed." };
}

async function startPatrol(payload: { requiredRoutes?: CollectionRouteKey[]; intervalMs?: number }) {
  const context = await apiContext();
  if (!context.ok) return context;
  const requiredRoutes = payload.requiredRoutes?.length ? payload.requiredRoutes : [...defaultRequiredCollectionRoutes];
  const response = await fetch(`${context.apiBaseUrl}/collection-tasks/${context.collectionTaskId}/collection-runs`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${context.token}` },
    body: JSON.stringify({ requiredRoutes })
  });
  const body = await response.json();
  if (!response.ok) return { ok: false, error: body?.error?.message || "Unable to start patrol." };
  const run = body?.data;
  const patrol: PatrolState = {
    enabled: true,
    collectionRunId: run.id,
    requiredRoutes,
    intervalMs: Math.max(30_000, payload.intervalMs || collectionFreshnessPolicy.patrolIntervalMs),
    startedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ [STORAGE.PATROL]: patrol, [STORAGE.ROUTE_UPLOAD_STATE]: {} });
  await appendLog("patrol.started", { collectionRunId: run.id, requiredRoutes });
  return { ok: true, patrol, run };
}

async function stopPatrol() {
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
  await appendLog("patrol.stopped", { collectionRunId: patrol.collectionRunId || null });
  return { ok: true, patrol: stopped };
}

async function apiContext(): Promise<
  | { ok: true; apiBaseUrl: string; collectionTaskId: string; token: string }
  | { ok: false; error: string }
> {
  const local = await chrome.storage.local.get([STORAGE.CONFIG]);
  const session = await chrome.storage.session.get([STORAGE.TOKEN]);
  const config = (local[STORAGE.CONFIG] || {}) as ExtensionConfig;
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl || "");
  const token = session[STORAGE.TOKEN] as string | undefined;
  if (!apiBaseUrl || !config.collectionTaskId) return { ok: false, error: "Configure API base URL and collection task ID first." };
  if (!token) return { ok: false, error: "Missing SaaS API token. Configure it in the popup." };
  return { ok: true, apiBaseUrl, collectionTaskId: config.collectionTaskId, token };
}

async function reportRouteFailure(apiBaseUrl: string, token: string, collectionRunId: string, routeKey: CollectionRouteKey, error: string) {
  await fetch(`${apiBaseUrl}/collection-runs/${collectionRunId}/failures`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ routeKey, error: String(error).slice(0, 500) })
  }).catch(() => undefined);
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
