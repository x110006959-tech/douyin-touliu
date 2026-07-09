"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MESSAGE = {
    PAGE_NETWORK_CAPTURED: "AI_DIAGNOSIS_PAGE_NETWORK_CAPTURED",
    START_COLLECTION: "AI_DIAGNOSIS_START_COLLECTION",
    SNAPSHOT_CAPTURED: "AI_DIAGNOSIS_SNAPSHOT_CAPTURED",
    GET_STATE: "AI_DIAGNOSIS_GET_STATE",
    SAVE_CONFIG: "AI_DIAGNOSIS_SAVE_CONFIG",
    UPLOAD_SNAPSHOT: "AI_DIAGNOSIS_UPLOAD_SNAPSHOT",
    CLEAR_SNAPSHOT: "AI_DIAGNOSIS_CLEAR_SNAPSHOT"
};
const STORAGE = {
    CONFIG: "douyinLocalLifeDiagnosisConfig",
    TOKEN: "douyinLocalLifeDiagnosisToken",
    LATEST_SNAPSHOT: "douyinLocalLifeDiagnosisLatestSnapshot",
    LOGS: "douyinLocalLifeDiagnosisLogs"
};
const allowedHostSuffixes = ["douyin.com", "douyinlife.com", "juliangengine.com", "oceanengine.com", "bytedance.com"];
const networkRecordLimit = 50;
const redacted = "[REDACTED]";
const sensitiveContains = ["token", "cookie", "password", "passwd", "authorization", "secret", "session", "credential"];
const sensitiveExact = new Set([
    "accesstoken",
    "refreshtoken",
    "phone",
    "mobile",
    "idcard",
    "identitycard",
    "email",
    "name",
    "realname",
    "username",
    "nickname",
    "contactname",
    "legalperson",
    "\u8eab\u4efd\u8bc1",
    "\u624b\u673a\u53f7"
]);
function isAllowedCaptureUrl(inputUrl, pageHref = globalThis.location?.href || "") {
    try {
        const url = new URL(inputUrl, pageHref);
        const pageUrl = new URL(pageHref || url.href);
        return url.origin === pageUrl.origin || allowedHostSuffixes.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
    }
    catch {
        return false;
    }
}
function isJsonContentType(contentType) {
    return /\bjson\b|\+json\b/i.test(contentType || "");
}
function shouldRedactKey(key) {
    const normalized = normalizeKey(key);
    return sensitiveExact.has(normalized) || sensitiveContains.some((part) => normalized.includes(part));
}
function sanitizeSensitiveFields(value) {
    if (Array.isArray(value))
        return value.slice(0, 200).map(sanitizeSensitiveFields);
    if (typeof value === "string")
        return sanitizeVisibleText(value);
    if (!value || typeof value !== "object")
        return value;
    const result = {};
    for (const [key, raw] of Object.entries(value)) {
        result[key] = shouldRedactKey(key) ? redacted : sanitizeSensitiveFields(raw);
    }
    return result;
}
function sanitizeVisibleText(text) {
    return text
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, redacted)
        .replace(/\b1[3-9]\d{9}\b/g, redacted)
        .replace(/\b\d{17}[\dXx]\b/g, redacted)
        .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${redacted}`);
}
function sanitizeNetworkRecord(record) {
    return {
        url: sanitizeUrl(record.url),
        method: String(record.method || "GET").toUpperCase(),
        status: record.status,
        responseJson: sanitizeSensitiveFields(record.responseJson),
        capturedAt: record.capturedAt || new Date().toISOString()
    };
}
function addNetworkRecord(records, record, limit = networkRecordLimit) {
    records.unshift(sanitizeNetworkRecord(record));
    if (records.length > limit)
        records.length = limit;
    return records;
}
function sanitizeSnapshotPayload(snapshot) {
    return {
        ...snapshot,
        rawDomText: sanitizeVisibleText(snapshot.rawDomText || ""),
        rawNetworkJson: snapshot.rawNetworkJson.slice(0, networkRecordLimit).map((record) => sanitizeNetworkRecord(record)),
        rawTableData: sanitizeSensitiveFields(snapshot.rawTableData)
    };
}
function sanitizeUrl(inputUrl) {
    try {
        const url = new URL(inputUrl, globalThis.location?.href || "https://example.invalid");
        url.username = url.username ? redacted : "";
        url.password = url.password ? redacted : "";
        for (const key of [...url.searchParams.keys()]) {
            if (shouldRedactKey(key))
                url.searchParams.set(key, redacted);
        }
        return url.href;
    }
    catch {
        return inputUrl;
    }
}
function normalizeKey(key) {
    return key.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "").toLowerCase();
}
chrome.runtime.onInstalled.addListener(() => {
    void appendLog("extension.installed");
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === MESSAGE.SNAPSHOT_CAPTURED) {
        void saveSnapshot(message.payload, sender.tab?.id).then(sendResponse);
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
async function saveSnapshot(snapshot, tabId) {
    const safeSnapshot = sanitizeSnapshotPayload(snapshot);
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
async function saveConfig(payload) {
    const config = {
        apiBaseUrl: payload.apiBaseUrl || "http://localhost:4000",
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
    const config = (local[STORAGE.CONFIG] || {});
    const snapshot = local[STORAGE.LATEST_SNAPSHOT];
    const token = session[STORAGE.TOKEN];
    if (!config.apiBaseUrl || !config.collectionTaskId)
        return { ok: false, error: "Configure API base URL and collection task ID first." };
    if (!token)
        return { ok: false, error: "Missing SaaS API token. Configure it in the popup." };
    if (!snapshot)
        return { ok: false, error: "No local snapshot available." };
    const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/collection-tasks/${config.collectionTaskId}/snapshots`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(sanitizeSnapshotPayload(snapshot))
    });
    const payload = await response.json();
    await appendLog("snapshot.uploaded", { ok: response.ok, status: response.status });
    return response.ok ? { ok: true, data: payload } : { ok: false, error: payload?.error?.message || "Upload failed." };
}
async function appendLog(action, detail) {
    const current = await chrome.storage.local.get([STORAGE.LOGS]);
    const logs = Array.isArray(current[STORAGE.LOGS]) ? current[STORAGE.LOGS] : [];
    logs.unshift({ action, detail, createdAt: new Date().toISOString() });
    await chrome.storage.local.set({ [STORAGE.LOGS]: logs.slice(0, 100) });
}
