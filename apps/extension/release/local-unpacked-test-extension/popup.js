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
