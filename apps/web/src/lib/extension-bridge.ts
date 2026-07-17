import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";

const events = {
  READY: "PXXIS_EXTENSION_READY",
  LEGACY_PING: "PXXIS_EXTENSION_PING",
  REQUEST: "PXXIS_EXTENSION_REQUEST",
  RESPONSE: "PXXIS_EXTENSION_RESPONSE"
} as const;

export type WebExtensionBridgeResponse = {
  requestId: string;
  ok: boolean;
  protocolVersion: number;
  extensionVersion: string;
  buildFingerprint: string;
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
  window.dispatchEvent(new CustomEvent(events.LEGACY_PING));
}

export function onExtensionBridgeReady(listener: () => void) {
  window.addEventListener(events.READY, listener);
  return () => window.removeEventListener(events.READY, listener);
}

export function getExtensionBridgeStatus() {
  return requestExtensionBridge("GET_STATUS");
}

export function pairExtensionTask(code: string, apiBaseUrl: string) {
  return requestExtensionBridge("PAIR_TASK", { code, apiBaseUrl });
}

function requestExtensionBridge(type: "GET_STATUS" | "PAIR_TASK", payload?: { code?: string; apiBaseUrl?: string }) {
  const marker = readExtensionBridgeMarker();
  if (!marker.active) throw new ExtensionBridgeError("插件未在当前网页激活，请重新加载本地扩展并刷新本页", "BRIDGE_NOT_ACTIVE");
  if (!marker.compatible) throw new ExtensionBridgeError("插件协议版本过旧，请重新加载当前本地版本", "PROTOCOL_MISMATCH");
  const requestId = `web:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  return new Promise<WebExtensionBridgeResponse>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener(events.RESPONSE, onResponse as EventListener);
    };
    const onResponse = (event: CustomEvent<WebExtensionBridgeResponse>) => {
      if (event.detail?.requestId !== requestId) return;
      cleanup();
      resolve(event.detail);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new ExtensionBridgeError("插件后台未响应，请在扩展管理页重新加载插件", "BACKGROUND_UNRESPONSIVE"));
    }, 5_000);
    window.addEventListener(events.RESPONSE, onResponse as EventListener);
    window.dispatchEvent(new CustomEvent(events.REQUEST, {
      detail: { requestId, protocolVersion: extensionBridgeProtocolVersion, type, payload }
    }));
  });
}
