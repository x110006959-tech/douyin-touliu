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
const networkRecords = [];
injectMainWorldScript();
window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin)
        return;
    const message = event.data;
    if (!message || message.source !== "DOUYIN_LOCAL_LIFE_DIAGNOSIS_PAGE" || message.type !== MESSAGE.PAGE_NETWORK_CAPTURED)
        return;
    addNetworkRecord(networkRecords, message.payload);
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE.START_COLLECTION)
        return false;
    enableNetworkCapture();
    const snapshot = collectSnapshot();
    chrome.runtime.sendMessage({ type: MESSAGE.SNAPSHOT_CAPTURED, payload: snapshot }, () => void chrome.runtime.lastError);
    sendResponse({ ok: true, snapshot });
    return true;
});
function injectMainWorldScript() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("injected.js");
    script.dataset.owner = "douyin-local-life-diagnosis";
    script.onload = () => script.remove();
    (document.documentElement || document.head).appendChild(script);
}
function enableNetworkCapture() {
    window.postMessage({
        source: "DOUYIN_LOCAL_LIFE_DIAGNOSIS_CONTENT",
        type: MESSAGE.PAGE_CAPTURE_CONTROL,
        enabled: true
    }, window.location.origin);
}
function collectSnapshot() {
    const rawDomText = visibleText();
    return sanitizeSnapshotPayload({
        pageType: detectPageType(rawDomText),
        sourceUrl: window.location.href,
        pageTitle: document.title,
        rawDomText,
        rawNetworkJson: [...networkRecords],
        rawTableData: collectTables(),
        visibleMetricsJson: extractMetrics(rawDomText),
        screenshotUrl: null,
        localCollectedAt: new Date().toISOString()
    });
}
function detectPageType(text) {
    const combined = `${document.title}\n${window.location.href}\n${text}`;
    if (hasAny(combined, [s("\u76f4\u64ad\u6570\u636e\u5927\u5c4f"), s("\u76f4\u64ad\u95f4"), s("\u770b\u64ad"), s("\u66dd\u5149\u4eba\u6570"), s("\u6210\u4ea4\u4eba\u6570")]))
        return "LIVE_DATA_SCREEN";
    if (hasAny(combined, [s("\u5de8\u91cf\u672c\u5730\u63a8"), s("\u672c\u5730\u63a8"), s("\u8ba1\u5212"), s("\u6295\u653e"), s("\u51fa\u4ef7"), s("\u9884\u7b97"), s("\u6d88\u8017"), "ROI"])) {
        return "LOCAL_PROMOTION_DASHBOARD";
    }
    if (hasAny(combined, [s("\u4efb\u52a1\u5217\u8868"), s("\u8ba1\u5212\u5217\u8868"), s("\u5e7f\u544a\u7ec4"), s("\u5355\u5143"), s("\u521b\u610f"), s("\u72b6\u6001")]))
        return "TASK_TABLE";
    return "UNKNOWN";
}
function visibleText() {
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const text = node.textContent?.trim();
            if (!text)
                return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent)
                return NodeFilter.FILTER_REJECT;
            if (!isVisibleElement(parent))
                return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const chunks = [];
    let length = 0;
    while (walker.nextNode() && length < 200000) {
        const chunk = walker.currentNode.textContent?.trim() || "";
        chunks.push(chunk);
        length += chunk.length + 1;
    }
    return chunks.join("\n");
}
function collectTables() {
    return [...document.querySelectorAll("table")]
        .filter(isVisibleElement)
        .slice(0, 20)
        .map((table) => {
        return [...table.querySelectorAll("tr")].slice(0, 200).map((row) => {
            return [...row.querySelectorAll("th,td")]
                .filter(isVisibleElement)
                .slice(0, 100)
                .map((cell) => (cell.textContent || "").trim());
        });
    });
}
function isVisibleElement(element) {
    let current = element;
    while (current) {
        if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true")
            return false;
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(current.tagName))
            return false;
        const style = window.getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0")
            return false;
        current = current.parentElement;
    }
    return true;
}
function extractMetrics(text) {
    const definitions = [
        { key: "spend", name: "ad spend", unit: "yuan", labels: [s("\u6d88\u8017"), s("\u5e7f\u544a\u6d88\u8017"), s("\u4eca\u65e5\u6d88\u8017")] },
        { key: "daily_budget", name: "daily budget", unit: "yuan", labels: [s("\u65e5\u9884\u7b97"), s("\u9884\u7b97")] },
        { key: "remaining_budget", name: "remaining budget", unit: "yuan", labels: [s("\u5269\u4f59\u9884\u7b97")] },
        { key: "impressions", name: "impressions", labels: [s("\u66dd\u5149\u6b21\u6570"), s("\u66dd\u5149\u91cf"), s("\u5546\u54c1\u66dd\u5149\u4eba\u6570"), s("\u76f4\u64ad\u66dd\u5149\u4eba\u6570")] },
        { key: "clicks", name: "clicks", labels: [s("\u70b9\u51fb\u4eba\u6570"), s("\u5546\u54c1\u70b9\u51fb\u4eba\u6570"), s("\u70b9\u51fb\u6b21\u6570")] },
        { key: "ctr", name: "click through rate", unit: "%", labels: [s("\u5546\u54c1\u70b9\u51fb\u7387"), s("\u70b9\u51fb\u7387"), "CTR"] },
        { key: "conversions", name: "conversions", labels: [s("\u6210\u4ea4\u4eba\u6570"), s("\u6210\u4ea4\u8ba2\u5355\u6570"), s("\u652f\u4ed8\u8ba2\u5355"), s("\u652f\u4ed8\u8ba2\u5355\u6570")] },
        { key: "pay_roi", name: "pay ROI", labels: [s("\u652f\u4ed8 ROI"), s("\u4ed8\u6b3e ROI"), "ROI"] },
        { key: "verify_roi", name: "verify ROI", labels: [s("\u6838\u9500 ROI")] },
        { key: "gross_profit_roi", name: "gross profit ROI", labels: [s("\u6bdb\u5229 ROI")] },
        { key: "gmv", name: "GMV", unit: "yuan", labels: [s("\u6210\u4ea4\u91d1\u989d"), s("\u652f\u4ed8\u91d1\u989d"), "GMV"] },
        { key: "live_viewers", name: "live viewers", labels: [s("\u76f4\u64ad\u95f4\u89c2\u770b\u4eba\u6570"), s("\u89c2\u770b\u4eba\u6570"), s("\u770b\u64ad\u4eba\u6570"), s("\u6574\u573a\u7d2f\u8ba1\u770b\u64ad\u4eba\u6570")] },
        { key: "store_searches", name: "store searches", labels: [s("\u95e8\u5e97\u641c\u7d22\u91cf"), s("\u641c\u7d22\u91cf")] },
        { key: "poi_visits", name: "POI visits", labels: [s("POI\u8bbf\u95ee"), s("POI \u8bbf\u95ee"), s("\u95e8\u5e97\u8bbf\u95ee")] },
        { key: "shelf_gmv", name: "shelf GMV", unit: "yuan", labels: [s("\u8d27\u67b6\u6210\u4ea4"), s("\u56e2\u8d2d\u8d27\u67b6")] },
        { key: "search_gmv", name: "search GMV", unit: "yuan", labels: [s("\u641c\u7d22\u6210\u4ea4")] }
    ];
    return definitions.flatMap((definition) => {
        const evidence = extractValueAfterAnyLabel(text, definition.labels);
        if (!evidence)
            return [];
        return [
            {
                key: definition.key,
                name: definition.name,
                value: parseValue(evidence.raw, definition.unit),
                unit: definition.unit || null,
                source: "dom",
                metricSource: "DOM_TEXT",
                confidence: 0.6,
                rawEvidence: {
                    sourceType: "DOM_TEXT",
                    textSnippet: evidence.textSnippet
                }
            }
        ];
    });
}
function extractValueAfterAnyLabel(text, labels) {
    for (const label of labels) {
        const index = text.indexOf(label);
        if (index < 0)
            continue;
        const slice = text.slice(index + label.length, index + label.length + 120);
        const matched = slice.match(/[\u00a5\uffe5]?\s*-?\d[\d,]*(?:\.\d+)?\s*(?:\u4e07|w|W|%)?/);
        if (matched?.[0]) {
            return {
                raw: matched[0],
                textSnippet: text.slice(Math.max(0, index - 40), Math.min(text.length, index + label.length + 120))
            };
        }
    }
    return null;
}
function parseValue(raw, unit) {
    const multiplier = /\u4e07|w/i.test(raw) ? 10000 : 1;
    const percent = raw.includes("%") || unit === "%";
    const value = Number(raw.replace(/[\u00a5\uffe5,\s%\u4e07wW]/g, ""));
    if (!Number.isFinite(value))
        return raw;
    const normalized = value * multiplier;
    return percent ? normalized / 100 : normalized;
}
function hasAny(text, needles) {
    return needles.some((needle) => text.includes(needle));
}
function s(value) {
    return value;
}
