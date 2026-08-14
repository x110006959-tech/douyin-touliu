import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";
import {
  isAllowedBridgeApiBaseUrl,
  isAllowedBridgeOrigin,
  parseBridgeRequest,
  parseBridgeWindowMessage,
  sanitizeBridgeResponse,
  serializeBridgeWindowMessage
} from "./bridge-protocol";
import { MESSAGE } from "./messages";

const markerAttribute = "data-pxxis-extension-version";
const protocolAttribute = "data-pxxis-extension-protocol";
const buildAttribute = "data-pxxis-extension-build";
const responseTimeoutMs = 5_000;

function announce() {
  document.documentElement.setAttribute(markerAttribute, chrome.runtime.getManifest().version);
  document.documentElement.setAttribute(protocolAttribute, String(extensionBridgeProtocolVersion));
  document.documentElement.setAttribute(buildAttribute, __PXXIS_EXTENSION_BUILD__);
  window.postMessage(serializeBridgeWindowMessage("READY"), window.location.origin);
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = parseBridgeWindowMessage(event.data);
  if (!message) return;
  if (message.type === "PING") {
    announce();
    return;
  }
  if (message.type !== "REQUEST") return;
  void handleBridgeRequest(message.payload);
});
announce();

async function handleBridgeRequest(rawRequest: unknown) {
  if (!isAllowedBridgeOrigin(window.location.origin)) return;
  const request = parseBridgeRequest(rawRequest);
  if (!request) return;
  if (request.type === "PAIR_TASK") {
    const code = String(request.payload?.code || "").trim();
    const apiBaseUrl = String(request.payload?.apiBaseUrl || "").trim();
    if (!/^\d{6}$/.test(code) || !isAllowedBridgeApiBaseUrl(apiBaseUrl)) {
      dispatchResponse(sanitizeBridgeResponse({
        requestId: request.requestId,
        extensionVersion: chrome.runtime.getManifest().version,
        buildFingerprint: __PXXIS_EXTENSION_BUILD__,
        fallbackErrorCode: "INVALID_PAIRING_REQUEST",
        fallbackMessage: "配对码或服务器地址不符合安全要求"
      }));
      return;
    }
  }

  try {
    const runtimeResult = await withTimeout(chrome.runtime.sendMessage({
        type: request.type === "GET_STATUS" ? MESSAGE.GET_BRIDGE_STATUS : MESSAGE.REQUEST_PAIRING_CONFIRMATION,
      payload: request.type === "PAIR_TASK" ? {
        code: request.payload?.code,
        apiBaseUrl: request.payload?.apiBaseUrl,
        label: "网页任务一键配对"
      } : undefined
    }), responseTimeoutMs);
    dispatchResponse(sanitizeBridgeResponse({
      requestId: request.requestId,
      runtimeResult,
      extensionVersion: chrome.runtime.getManifest().version,
      buildFingerprint: __PXXIS_EXTENSION_BUILD__
    }));
  } catch {
    dispatchResponse(sanitizeBridgeResponse({
      requestId: request.requestId,
      extensionVersion: chrome.runtime.getManifest().version,
      buildFingerprint: __PXXIS_EXTENSION_BUILD__,
      fallbackErrorCode: "BACKGROUND_UNRESPONSIVE",
      fallbackMessage: "插件后台未响应，请在扩展管理页重新加载插件"
    }));
  }
}

function dispatchResponse(detail: ReturnType<typeof sanitizeBridgeResponse>) {
  // postMessage reliably crosses Chrome's isolated-world boundary. The page
  // receives only this sanitized JSON response, never extension credentials.
  window.postMessage(serializeBridgeWindowMessage("RESPONSE", detail), window.location.origin);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("BRIDGE_TIMEOUT")), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });
}
