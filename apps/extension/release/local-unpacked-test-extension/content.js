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
            const style = window.getComputedStyle(parent);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
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
    return [...document.querySelectorAll("table")].slice(0, 20).map((table) => {
        return [...table.querySelectorAll("tr")].slice(0, 200).map((row) => {
            return [...row.querySelectorAll("th,td")].map((cell) => (cell.textContent || "").trim());
        });
    });
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
