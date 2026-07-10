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
const allowedHostPattern = /(douyin|douyinlife|juliangengine|oceanengine|bytedance)\.com$/i;
const els = {
    status: document.getElementById("status"),
    currentUrl: document.getElementById("currentUrl"),
    pageType: document.getElementById("pageType"),
    collectable: document.getElementById("collectable"),
    hasToken: document.getElementById("hasToken"),
    taskId: document.getElementById("taskId"),
    snapshot: document.getElementById("snapshot"),
    configBtn: document.getElementById("configBtn"),
    startBtn: document.getElementById("startBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    uploadBtn: document.getElementById("uploadBtn"),
    clearBtn: document.getElementById("clearBtn")
};
void render();
els.configBtn.addEventListener("click", configure);
els.startBtn.addEventListener("click", startCollection);
els.refreshBtn.addEventListener("click", render);
els.uploadBtn.addEventListener("click", uploadSnapshot);
els.clearBtn.addEventListener("click", clearSnapshot);
async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}
async function render() {
    const tab = await activeTab();
    const state = await chrome.runtime.sendMessage({ type: MESSAGE.GET_STATE });
    const url = tab?.url || "";
    els.currentUrl.textContent = url || "-";
    els.pageType.textContent = state?.latestSnapshot?.pageType || inferPageTypeFromUrl(url);
    els.collectable.textContent = isCollectable(url) ? "YES" : "NO";
    els.hasToken.textContent = state?.hasToken ? "Configured in session storage" : "Not configured";
    els.taskId.textContent = state?.config?.collectionTaskId || "-";
    els.snapshot.textContent = JSON.stringify(state?.latestSnapshot || {}, null, 2);
    els.status.textContent = "Ready";
}
async function configure() {
    const state = await chrome.runtime.sendMessage({ type: MESSAGE.GET_STATE });
    const apiBaseUrl = prompt("API base URL", state?.config?.apiBaseUrl || "http://localhost:4000");
    if (!apiBaseUrl)
        return;
    const collectionTaskId = prompt("Collection task ID", state?.config?.collectionTaskId || "");
    if (!collectionTaskId)
        return;
    const token = prompt("SaaS API token. Stored only in chrome.storage.session.", "");
    await chrome.runtime.sendMessage({
        type: MESSAGE.SAVE_CONFIG,
        payload: { apiBaseUrl, collectionTaskId, token: token || undefined }
    });
    await render();
}
async function startCollection() {
    const tab = await activeTab();
    if (!tab?.id || !isCollectable(tab.url || "")) {
        els.status.textContent = "Current page is outside the allowlist";
        return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: MESSAGE.START_COLLECTION });
    els.status.textContent = response?.ok ? "Local snapshot captured" : "Capture failed";
    await render();
}
async function uploadSnapshot() {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE.UPLOAD_SNAPSHOT });
    els.status.textContent = response?.ok ? "Snapshot uploaded" : response?.error || "Upload failed";
    await render();
}
async function clearSnapshot() {
    await chrome.runtime.sendMessage({ type: MESSAGE.CLEAR_SNAPSHOT });
    els.status.textContent = "Local snapshot cleared";
    await render();
}
function isCollectable(url) {
    try {
        return allowedHostPattern.test(new URL(url).hostname);
    }
    catch {
        return false;
    }
}
function inferPageTypeFromUrl(url) {
    if (/live|room|screen|dashboard/i.test(url))
        return "LIVE_DATA_SCREEN";
    if (/task|campaign|ad|promotion|local/i.test(url))
        return "LOCAL_PROMOTION_DASHBOARD";
    return "UNKNOWN";
}
