import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";

const bridgeWindowMessageChannel = "PXXIS_EXTENSION_BRIDGE";
const bridgeTaskIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const bridgeConnectionSessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type BridgeWindowMessageType = "READY" | "PING" | "REQUEST" | "RESPONSE";
type BridgeWindowMessage = { channel: typeof bridgeWindowMessageChannel; type: BridgeWindowMessageType; payload?: unknown };

export type WebExtensionBridgeResponse = {
  requestId: string;
  ok: boolean;
  protocolVersion: number;
  extensionVersion: string;
  buildFingerprint: string;
  connectionSessionId: string | null;
  paired: boolean;
  pendingConfirmation: boolean;
  boundTaskId: string | null;
  errorCode: string | null;
  message: string;
};

export type WebExtensionBridgeMarker = {
  active: boolean;
  extensionVersion: string | null;
  protocolVersion: number | null;
  buildFingerprint: string | null;
  compatible: boolean;
};

export class ExtensionBridgeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ExtensionBridgeError";
  }
}

export function readExtensionBridgeMarker(): WebExtensionBridgeMarker {
  const root = document.documentElement;
  const extensionVersion = root.getAttribute("data-pxxis-extension-version");
  const protocolValue = root.getAttribute("data-pxxis-extension-protocol");
  const protocolVersion = protocolValue ? Number(protocolValue) : null;
  const buildFingerprint = root.getAttribute("data-pxxis-extension-build");
  return {
    active: Boolean(extensionVersion),
    extensionVersion,
    protocolVersion: Number.isInteger(protocolVersion) ? protocolVersion : null,
    buildFingerprint,
    compatible: protocolVersion === extensionBridgeProtocolVersion
  };
}

export function announceExtensionBridge() {
  window.postMessage(serializeBridgeWindowMessage("PING"), window.location.origin);
}

export function onExtensionBridgeReady(listener: () => void) {
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (parseBridgeWindowMessage(event.data)?.type === "READY") listener();
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

export function getExtensionBridgeStatus() {
  return requestExtensionBridge("GET_STATUS");
}

export function syncExtensionCurrentTask() {
  return requestExtensionBridge("SYNC_CURRENT_TASK");
}

export function pairExtensionTask(code: string, apiBaseUrl: string) {
  return requestExtensionBridge("PAIR_TASK", { code, apiBaseUrl });
}

function requestExtensionBridge(type: "GET_STATUS" | "PAIR_TASK" | "SYNC_CURRENT_TASK", payload?: { code?: string; apiBaseUrl?: string }) {
  const marker = readExtensionBridgeMarker();
  if (!marker.active) throw new ExtensionBridgeError("插件未在当前网页激活，请重新加载本地扩展并刷新本页", "BRIDGE_NOT_ACTIVE");
  if (!marker.compatible) throw new ExtensionBridgeError("插件协议版本过旧，请重新加载当前本地版本", "PROTOCOL_MISMATCH");
  const requestId = `web:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  return new Promise<WebExtensionBridgeResponse>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onResponse);
    };
    const onResponse = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = parseBridgeWindowMessage(event.data);
      if (message?.type !== "RESPONSE") return;
      const response = parseBridgeResponse(message.payload);
      if (!response || response.requestId !== requestId) return;
      cleanup();
      resolve(response);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new ExtensionBridgeError("插件后台未响应，请在扩展管理页重新加载插件", "BACKGROUND_UNRESPONSIVE"));
    }, 5_000);
    window.addEventListener("message", onResponse);
    window.postMessage(
      serializeBridgeWindowMessage("REQUEST", { requestId, protocolVersion: extensionBridgeProtocolVersion, type, payload }),
      window.location.origin
    );
  });
}

function serializeBridgeWindowMessage(type: BridgeWindowMessageType, payload?: unknown) {
  return JSON.stringify({ channel: bridgeWindowMessageChannel, type, payload });
}

function parseBridgeWindowMessage(value: unknown): BridgeWindowMessage | null {
  if (typeof value !== "string") return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== "object") return null;
    const message = candidate as Partial<BridgeWindowMessage>;
    if (message.channel !== bridgeWindowMessageChannel) return null;
    if (message.type !== "READY" && message.type !== "PING" && message.type !== "REQUEST" && message.type !== "RESPONSE") return null;
    return message as BridgeWindowMessage;
  } catch {
    return null;
  }
}

export function parseBridgeResponse(value: unknown): WebExtensionBridgeResponse | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Partial<WebExtensionBridgeResponse>;
  if (typeof response.requestId !== "string" || typeof response.ok !== "boolean") return null;
  if (response.protocolVersion !== extensionBridgeProtocolVersion || typeof response.extensionVersion !== "string" || !response.extensionVersion.trim()) return null;
  if (typeof response.buildFingerprint !== "string" || typeof response.paired !== "boolean") return null;
  if (response.connectionSessionId !== null && (typeof response.connectionSessionId !== "string" || !bridgeConnectionSessionIdPattern.test(response.connectionSessionId))) return null;
  if (typeof response.pendingConfirmation !== "boolean" || typeof response.message !== "string") return null;
  if (response.message.length > 200) return null;
  if (response.boundTaskId !== null && (typeof response.boundTaskId !== "string" || !bridgeTaskIdPattern.test(response.boundTaskId))) return null;
  if (response.errorCode !== null && typeof response.errorCode !== "string") return null;
  return response as WebExtensionBridgeResponse;
}
