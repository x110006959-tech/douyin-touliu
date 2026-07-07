import { MESSAGE } from "./messages";
import { isAllowedCaptureUrl, isJsonContentType, sanitizeNetworkRecord } from "./safety";

const hookFlag = "__DOUYIN_LOCAL_LIFE_DIAGNOSIS_NETWORK_HOOKED__";

declare global {
  interface Window {
    [hookFlag]?: boolean;
  }
}

if (!window[hookFlag]) {
  window[hookFlag] = true;
  patchFetch();
  patchXhr();
}

function postRecord(record: { url: string; method: string; status: number; responseJson: unknown }) {
  const sanitized = sanitizeNetworkRecord({
    ...record,
    capturedAt: new Date().toISOString()
  });
  window.postMessage(
    {
      source: "DOUYIN_LOCAL_LIFE_DIAGNOSIS_PAGE",
      type: MESSAGE.PAGE_NETWORK_CAPTURED,
      payload: sanitized
    },
    window.location.origin
  );
}

function patchFetch() {
  const nativeFetch = window.fetch;
  if (typeof nativeFetch !== "function") return;

  window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
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
    const nativeOpen = xhr.open as (...args: unknown[]) => unknown;
    const nativeSend = xhr.send as (...args: unknown[]) => unknown;

    xhr.open = function open(method: string, url: string | URL) {
      meta.method = String(method || "GET").toUpperCase();
      meta.url = normalizeRequestUrl(url);
      return nativeOpen.apply(xhr, Array.from(arguments));
    };

    xhr.send = function send() {
      xhr.addEventListener(
        "loadend",
        () => {
          const contentType = safeHeader(xhr, "content-type");
          if (!isAllowedCaptureUrl(meta.url, window.location.href) || !isJsonContentType(contentType)) return;
          const json = parseXhrJson(xhr);
          if (json === null) return;
          postRecord({
            url: meta.url,
            method: meta.method,
            status: xhr.status,
            responseJson: json
          });
        },
        { once: true }
      );
      return nativeSend.apply(xhr, Array.from(arguments));
    };

    return xhr;
  }

  PatchedXhr.prototype = NativeXhr.prototype;
  window.XMLHttpRequest = PatchedXhr as unknown as typeof XMLHttpRequest;
}

function normalizeRequestUrl(input: RequestInfo | URL | string) {
  if (typeof input === "string") return new URL(input, window.location.href).href;
  if (typeof URL !== "undefined" && input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function safeHeader(xhr: XMLHttpRequest, name: string) {
  try {
    return xhr.getResponseHeader(name) || "";
  } catch {
    return "";
  }
}

function parseXhrJson(xhr: XMLHttpRequest) {
  try {
    if (xhr.responseType === "json") return xhr.response;
    if (xhr.responseType === "" || xhr.responseType === "text") return JSON.parse(xhr.responseText);
  } catch {
    return null;
  }
  return null;
}
