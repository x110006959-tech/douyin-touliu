import type { CollectionSnapshotPayload } from "@douyin-local-life/shared";
import { MESSAGE, STORAGE } from "./messages";
import { normalizeApiBaseUrl, sanitizeSnapshotPayload } from "./safety";

type ExtensionConfig = {
  apiBaseUrl?: string;
  collectionTaskId?: string;
};

chrome.runtime.onInstalled.addListener(() => {
  void appendLog("extension.installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE.SNAPSHOT_CAPTURED) {
    void saveSnapshot(message.payload as CollectionSnapshotPayload, sender.tab?.id).then(sendResponse);
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
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.LATEST_SNAPSHOT, STORAGE.LOGS]);
  const session = await chrome.storage.session.get([STORAGE.TOKEN]);
  return {
    ok: true,
    config: local[STORAGE.CONFIG] || {},
    latestSnapshot: local[STORAGE.LATEST_SNAPSHOT] || null,
    logs: local[STORAGE.LOGS] || [],
    hasToken: Boolean(session[STORAGE.TOKEN])
  };
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

  const response = await fetch(`${apiBaseUrl}/collection-tasks/${config.collectionTaskId}/snapshots`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `snapshot:${config.collectionTaskId}:${snapshot.localCollectedAt}`.slice(0, 128),
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(sanitizeSnapshotPayload(snapshot))
  });
  const payload = await response.json();
  await appendLog("snapshot.uploaded", { ok: response.ok, status: response.status });
  return response.ok ? { ok: true, data: payload } : { ok: false, error: payload?.error?.message || "Upload failed." };
}

async function appendLog(action: string, detail?: unknown) {
  const current = await chrome.storage.local.get([STORAGE.LOGS]);
  const logs = Array.isArray(current[STORAGE.LOGS]) ? current[STORAGE.LOGS] : [];
  logs.unshift({ action, detail, createdAt: new Date().toISOString() });
  await chrome.storage.local.set({ [STORAGE.LOGS]: logs.slice(0, 100) });
}
