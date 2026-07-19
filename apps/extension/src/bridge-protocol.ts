import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";
import { developmentLoopbackHostnames, isLocalBuild } from "./build-target";

export const extensionBridgeEvents = {
  READY: "PXXIS_EXTENSION_READY",
  LEGACY_PING: "PXXIS_EXTENSION_PING",
  REQUEST: "PXXIS_EXTENSION_REQUEST",
  RESPONSE: "PXXIS_EXTENSION_RESPONSE"
} as const;

export type ExtensionBridgeRequest = {
  requestId: string;
  protocolVersion: number;
  type: "GET_STATUS" | "PAIR_TASK";
  payload?: { code?: string; apiBaseUrl?: string };
};

export type ExtensionBridgeResponse = {
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

export function isAllowedBridgeOrigin(origin: string, allowedLoopbackHostnames = developmentLoopbackHostnames) {
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && url.hostname === "www.pxxis.cn") return true;
    return isLocalBuild && url.protocol === "http:" && allowedLoopbackHostnames.includes(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedBridgeApiBaseUrl(value: string, allowedLoopbackHostnames = developmentLoopbackHostnames) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === "api.pxxis.cn") return true;
    return isLocalBuild && url.protocol === "http:" && allowedLoopbackHostnames.includes(url.hostname);
  } catch {
    return false;
  }
}

export function parseBridgeRequest(value: unknown): ExtensionBridgeRequest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ExtensionBridgeRequest>;
  if (typeof candidate.requestId !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(candidate.requestId)) return null;
  if (candidate.protocolVersion !== extensionBridgeProtocolVersion) return null;
  if (candidate.type !== "GET_STATUS" && candidate.type !== "PAIR_TASK") return null;
  return candidate as ExtensionBridgeRequest;
}

export function sanitizeBridgeResponse(input: {
  requestId: string;
  runtimeResult?: unknown;
  extensionVersion: string;
  buildFingerprint: string;
  fallbackErrorCode?: string;
  fallbackMessage?: string;
}): ExtensionBridgeResponse {
  const result = input.runtimeResult && typeof input.runtimeResult === "object"
    ? input.runtimeResult as Record<string, unknown>
    : {};
  const config = result.config && typeof result.config === "object" ? result.config as Record<string, unknown> : {};
  const ok = result.ok === true;
  return {
    requestId: input.requestId,
    ok,
    protocolVersion: extensionBridgeProtocolVersion,
    extensionVersion: input.extensionVersion,
    buildFingerprint: input.buildFingerprint,
    paired: result.paired === true || result.hasToken === true || (ok && typeof config.accountProfileId === "string"),
    pendingConfirmation: result.pendingConfirmation === true,
    boundTaskId: typeof result.boundTaskId === "string"
      ? result.boundTaskId
      : typeof config.collectionTaskId === "string"
        ? config.collectionTaskId
        : null,
    errorCode: ok ? null : typeof result.errorCode === "string" ? result.errorCode : input.fallbackErrorCode || "BRIDGE_REQUEST_FAILED",
    message: ok
      ? typeof result.message === "string" ? result.message : "插件后台连接正常"
      : typeof result.error === "string" ? result.error : input.fallbackMessage || "插件后台未响应，请重新加载插件"
  };
}
