"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MESSAGE = {
    PAGE_NETWORK_CAPTURED: "AI_DIAGNOSIS_PAGE_NETWORK_CAPTURED",
    PAGE_CAPTURE_CONTROL: "AI_DIAGNOSIS_PAGE_CAPTURE_CONTROL",
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
const snapshotSafetyLimits = {
    rawDomTextChars: 200000,
    pageTitleChars: 500,
    urlChars: 2048,
    networkRecords: 50,
    networkRecordChars: 256000,
    networkTotalChars: 1000000,
    tableItems: 20,
    visibleMetrics: 200,
    arrayItems: 200,
    objectKeys: 500,
    depth: 12,
    stringChars: 200000
};
const redacted = "[REDACTED]";
const truncated = "[TRUNCATED]";
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
    "身份证",
    "手机号",
    "姓名"
]);
function shouldRedactSensitiveKey(key) {
    const normalized = normalizeKey(key);
    return sensitiveExact.has(normalized) || sensitiveContains.some((part) => normalized.includes(part));
}
function sanitizeVisibleText(text, maxChars = snapshotSafetyLimits.stringChars) {
    let sanitized = truncateText(text, maxChars);
    if (sanitized.includes("@"))
        sanitized = sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, redacted);
    if (/\d/.test(sanitized)) {
        sanitized = sanitized.replace(/\b1[3-9]\d{9}\b/g, redacted).replace(/\b\d{17}[\dXx]\b/g, redacted);
    }
    if (/bearer/i.test(sanitized))
        sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${redacted}`);
    if (/password|passwd|token|authorization|cookie|secret|session|credential/i.test(sanitized)) {
        sanitized = sanitized.replace(/((?:password|passwd|token|authorization|cookie|secret|session|credential)\s*[:=]\s*)[^\s,;&]+/gi, `$1${redacted}`);
    }
    return truncateText(sanitized, maxChars);
}
function sanitizeSensitiveData(value, depth = 0) {
    if (depth > snapshotSafetyLimits.depth)
        return truncated;
    if (Array.isArray(value)) {
        return value.slice(0, snapshotSafetyLimits.arrayItems).map((item) => sanitizeSensitiveData(item, depth + 1));
    }
    if (typeof value === "string")
        return sanitizeVisibleText(value);
    if (!value || typeof value !== "object")
        return value;
    const result = {};
    for (const [key, raw] of Object.entries(value).slice(0, snapshotSafetyLimits.objectKeys)) {
        result[key] = shouldRedactSensitiveKey(key) ? redacted : sanitizeSensitiveData(raw, depth + 1);
    }
    return result;
}
function sanitizeCaptureUrl(inputUrl, baseUrl = "https://example.invalid") {
    try {
        const url = new URL(inputUrl, baseUrl);
        url.username = url.username ? redacted : "";
        url.password = url.password ? redacted : "";
        for (const key of [...url.searchParams.keys()]) {
            if (shouldRedactSensitiveKey(key))
                url.searchParams.set(key, redacted);
        }
        return truncateText(url.href, snapshotSafetyLimits.urlChars);
    }
    catch {
        return sanitizeVisibleText(inputUrl, snapshotSafetyLimits.urlChars);
    }
}
function sanitizeCapturedNetworkRecord(record) {
    const responseJson = limitSerializedValue(sanitizeSensitiveData(record.responseJson), snapshotSafetyLimits.networkRecordChars);
    return {
        ...record,
        url: sanitizeCaptureUrl(String(record.url || "")),
        method: String(record.method || "GET").toUpperCase().slice(0, 16),
        status: Number.isInteger(record.status) ? record.status : 0,
        responseJson,
        capturedAt: record.capturedAt || new Date().toISOString()
    };
}
function addSafeNetworkRecord(records, record, limit = snapshotSafetyLimits.networkRecords) {
    records.unshift(sanitizeCapturedNetworkRecord(record));
    if (records.length > limit)
        records.length = limit;
    trimNetworkRecordsToTotalLimit(records);
    return records;
}
function sanitizeCollectionSnapshotPayload(snapshot) {
    const networkRecords = [];
    for (const record of snapshot.rawNetworkJson.slice(0, snapshotSafetyLimits.networkRecords)) {
        networkRecords.push(sanitizeCapturedNetworkRecord(record));
    }
    trimNetworkRecordsToTotalLimit(networkRecords);
    return {
        ...snapshot,
        sourceUrl: sanitizeCaptureUrl(snapshot.sourceUrl || ""),
        pageTitle: sanitizeVisibleText(snapshot.pageTitle || "", snapshotSafetyLimits.pageTitleChars),
        rawDomText: sanitizeVisibleText(snapshot.rawDomText || "", snapshotSafetyLimits.rawDomTextChars),
        rawNetworkJson: networkRecords,
        rawTableData: limitArrayValue(sanitizeSensitiveData(snapshot.rawTableData.slice(0, snapshotSafetyLimits.tableItems)), snapshotSafetyLimits.networkTotalChars),
        visibleMetricsJson: (snapshot.visibleMetricsJson || []).slice(0, snapshotSafetyLimits.visibleMetrics).map(sanitizeVisibleMetric),
        screenshotUrl: snapshot.screenshotUrl ? sanitizeCaptureUrl(snapshot.screenshotUrl) : snapshot.screenshotUrl
    };
}
function sanitizeVisibleMetric(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return sanitizeSensitiveData(value);
    const metric = value;
    const sanitized = sanitizeSensitiveData(metric);
    return {
        ...sanitized,
        key: sanitizeVisibleText(String(metric.key || "unknown"), 100),
        name: sanitizeVisibleText(String(metric.name || ""), 200)
    };
}
function trimNetworkRecordsToTotalLimit(records) {
    let total = 0;
    const kept = [];
    for (const record of records) {
        const size = serializedLength(record);
        if (total + size > snapshotSafetyLimits.networkTotalChars)
            break;
        kept.push(record);
        total += size;
    }
    records.splice(0, records.length, ...kept);
}
function limitSerializedValue(value, maxChars) {
    const serialized = safeStringify(value);
    if (serialized.length <= maxChars)
        return value;
    return {
        truncated: true,
        originalChars: serialized.length,
        preview: truncateText(serialized, Math.min(10000, maxChars))
    };
}
function limitArrayValue(value, maxChars) {
    const limited = limitSerializedValue(value, maxChars);
    return Array.isArray(limited) ? limited : [limited];
}
function serializedLength(value) {
    return safeStringify(value).length;
}
function safeStringify(value) {
    try {
        return JSON.stringify(value) || "";
    }
    catch {
        return JSON.stringify({ truncated: true, reason: "non_serializable" });
    }
}
function truncateText(value, maxChars) {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars)}${truncated}`;
}
function normalizeKey(key) {
    return key.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "").toLowerCase();
}
const sanitizeSnapshotPayload = sanitizeCollectionSnapshotPayload;
const sanitizeSensitiveFields = sanitizeSensitiveData;
const shouldRedactKey = shouldRedactSensitiveKey;
const sanitizeNetworkRecord = sanitizeCapturedNetworkRecord;
const allowedHostSuffixes = ["douyin.com", "douyinlife.com", "juliangengine.com", "oceanengine.com", "bytedance.com"];
const networkRecordLimit = snapshotSafetyLimits.networkRecords;
const networkResponseByteLimit = snapshotSafetyLimits.networkRecordChars;
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
function normalizeApiBaseUrl(value) {
    try {
        const url = new URL(value);
        const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)))
            return null;
        return url.href.replace(/\/$/, "");
    }
    catch {
        return null;
    }
}
function addNetworkRecord(records, record, limit = networkRecordLimit) {
    return addSafeNetworkRecord(records, record, limit);
}
// Keep these imports visible to the extension's source-concatenating build script.
void sanitizeVisibleText;
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
    const apiBaseUrl = normalizeApiBaseUrl(payload.apiBaseUrl || "http://localhost:4000");
    if (!apiBaseUrl)
        return { ok: false, error: "API address must use HTTPS, except for localhost development." };
    const config = {
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
    const config = (local[STORAGE.CONFIG] || {});
    const snapshot = local[STORAGE.LATEST_SNAPSHOT];
    const token = session[STORAGE.TOKEN];
    if (!config.apiBaseUrl || !config.collectionTaskId)
        return { ok: false, error: "Configure API base URL and collection task ID first." };
    const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
    if (!apiBaseUrl)
        return { ok: false, error: "Configured API address is not allowed." };
    if (!token)
        return { ok: false, error: "Missing SaaS API token. Configure it in the popup." };
    if (!snapshot)
        return { ok: false, error: "No local snapshot available." };
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
async function appendLog(action, detail) {
    const current = await chrome.storage.local.get([STORAGE.LOGS]);
    const logs = Array.isArray(current[STORAGE.LOGS]) ? current[STORAGE.LOGS] : [];
    logs.unshift({ action, detail, createdAt: new Date().toISOString() });
    await chrome.storage.local.set({ [STORAGE.LOGS]: logs.slice(0, 100) });
}
