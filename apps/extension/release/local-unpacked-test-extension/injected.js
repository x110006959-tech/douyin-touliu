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
const hookFlag = "__DOUYIN_LOCAL_LIFE_DIAGNOSIS_NETWORK_HOOKED__";
if (!window[hookFlag]) {
    window[hookFlag] = true;
    patchFetch();
    patchXhr();
}
function postRecord(record) {
    const sanitized = sanitizeNetworkRecord({
        ...record,
        capturedAt: new Date().toISOString()
    });
    window.postMessage({
        source: "DOUYIN_LOCAL_LIFE_DIAGNOSIS_PAGE",
        type: MESSAGE.PAGE_NETWORK_CAPTURED,
        payload: sanitized
    }, window.location.origin);
}
function patchFetch() {
    const nativeFetch = window.fetch;
    if (typeof nativeFetch !== "function")
        return;
    window.fetch = async function patchedFetch(input, init) {
        const response = await nativeFetch.apply(this, [input, init]);
        const url = response.url || normalizeRequestUrl(input);
        if (isAllowedCaptureUrl(url, window.location.href) && isJsonContentType(response.headers.get("content-type"))) {
            response
                .clone()
                .json()
                .then((json) => {
                postRecord({
                    url,
                    method: String(init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase(),
                    status: response.status,
                    responseJson: json
                });
            })
                .catch(() => undefined);
        }
        return response;
    };
}
function patchXhr() {
    const NativeXhr = window.XMLHttpRequest;
    function PatchedXhr() {
        const xhr = new NativeXhr();
        const meta = { method: "GET", url: "" };
        const nativeOpen = xhr.open;
        const nativeSend = xhr.send;
        xhr.open = function open(method, url) {
            meta.method = String(method || "GET").toUpperCase();
            meta.url = normalizeRequestUrl(url);
            return nativeOpen.apply(xhr, Array.from(arguments));
        };
        xhr.send = function send() {
            xhr.addEventListener("loadend", () => {
                const contentType = safeHeader(xhr, "content-type");
                if (!isAllowedCaptureUrl(meta.url, window.location.href) || !isJsonContentType(contentType))
                    return;
                const json = parseXhrJson(xhr);
                if (json === null)
                    return;
                postRecord({
                    url: meta.url,
                    method: meta.method,
                    status: xhr.status,
                    responseJson: json
                });
            }, { once: true });
            return nativeSend.apply(xhr, Array.from(arguments));
        };
        return xhr;
    }
    PatchedXhr.prototype = NativeXhr.prototype;
    window.XMLHttpRequest = PatchedXhr;
}
function normalizeRequestUrl(input) {
    if (typeof input === "string")
        return new URL(input, window.location.href).href;
    if (typeof URL !== "undefined" && input instanceof URL)
        return input.href;
    if (typeof Request !== "undefined" && input instanceof Request)
        return input.url;
    return String(input);
}
function safeHeader(xhr, name) {
    try {
        return xhr.getResponseHeader(name) || "";
    }
    catch {
        return "";
    }
}
function parseXhrJson(xhr) {
    try {
        if (xhr.responseType === "json")
            return xhr.response;
        if (xhr.responseType === "" || xhr.responseType === "text")
            return JSON.parse(xhr.responseText);
    }
    catch {
        return null;
    }
    return null;
}
