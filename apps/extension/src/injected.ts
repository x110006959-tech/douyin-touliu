import { MESSAGE } from "./messages";
import { isAllowedCaptureUrl, isJsonContentType, networkResponseByteLimit, sanitizeNetworkRecord } from "./safety";

const hookFlag = "__DOUYIN_LOCAL_LIFE_DIAGNOSIS_NETWORK_HOOKED__";
let captureEnabled = false;

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

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (message?.source === "DOUYIN_LOCAL_LIFE_DIAGNOSIS_CONTENT" && message?.type === MESSAGE.PAGE_CAPTURE_CONTROL) {
    captureEnabled = message.enabled === true;
  }
});

function postRecord(record: { url: string; method: string; status: number; responseJson: unknown }) {
  if (!captureEnabled) return;
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
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > networkResponseByteLimit) return response;
      response
        .clone()
        .text()
        .then((body) => {
          if (body.length > networkResponseByteLimit) return;
          const json = JSON.parse(body) as unknown;
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
  const prototype = window.XMLHttpRequest.prototype;
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
  const nativeOpen = prototype.open as (...args: unknown[]) => unknown;
  const nativeSend = prototype.send as (...args: unknown[]) => unknown;

  prototype.open = function open(this: XMLHttpRequest, method: string, url: string | URL) {
    meta.set(this, { method: String(method || "GET").toUpperCase(), url: normalizeRequestUrl(url) });
    return nativeOpen.apply(this, Array.from(arguments));
  } as typeof prototype.open;

  prototype.send = function send(this: XMLHttpRequest) {
    const xhr = this;
    xhr.addEventListener(
        "loadend",
        () => {
          if (!captureEnabled) return;
          const request = meta.get(xhr) || { method: "GET", url: xhr.responseURL || "" };
          const contentType = safeHeader(xhr, "content-type");
          const contentLength = Number(safeHeader(xhr, "content-length") || 0);
          if (contentLength > networkResponseByteLimit) return;
          if (!isAllowedCaptureUrl(request.url, window.location.href) || !isJsonContentType(contentType)) return;
          const json = parseXhrJson(xhr);
          if (json === null) return;
          postRecord({
            url: request.url,
            method: request.method,
            status: xhr.status,
            responseJson: json
          });
        },
        { once: true }
      );
    return nativeSend.apply(xhr, Array.from(arguments));
  } as typeof prototype.send;
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
    if (xhr.responseType === "json") {
      const serialized = JSON.stringify(xhr.response);
      return serialized && serialized.length <= networkResponseByteLimit ? xhr.response : null;
    }
    if (xhr.responseType === "" || xhr.responseType === "text") {
      if (xhr.responseText.length > networkResponseByteLimit) return null;
      return JSON.parse(xhr.responseText);
    }
  } catch {
    return null;
  }
  return null;
}
