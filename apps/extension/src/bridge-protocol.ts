import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";
import { developmentLoopbackHostnames, isLocalBuild } from "./build-target";

const bridgeWindowMessageChannel = "PXXIS_EXTENSION_BRIDGE";

export type BridgeWindowMessageType = "READY" | "PING" | "REQUEST" | "RESPONSE";

export type BridgeWindowMessage = {
  channel: typeof bridgeWindowMessageChannel;
  type: BridgeWindowMessageType;
  payload?: unknown;
};

export type ExtensionBridgeRequest = {
  requestId: string;
  protocolVersion: number;
  type: "GET_STATUS" | "PAIR_TASK" | "SYNC_CURRENT_TASK";
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

const bridgeErrorCodes = new Set([
  "BRIDGE_REQUEST_FAILED",
  "BACKGROUND_UNRESPONSIVE",
  "EXTENSION_CONTEXT_INVALIDATED",
  "INVALID_PAIRING_REQUEST",
  "TASK_PAGE_REQUIRED",
  "PAIRING_CODE_INVALID",
  "PAIRING_RATE_LIMITED",
  "PAIRING_API_TIMEOUT",
  "PAIRING_SERVICE_UNAVAILABLE",
  "PAIRING_SERVICE_ERROR",
  "PAIRING_REQUEST_FAILED",
  "PAIRING_RESPONSE_INVALID",
  "PAIRING_CREDENTIAL_REJECTED",
  "TASK_PAGE_MISMATCH",
  "TASK_ACCOUNT_MISMATCH",
  "ACTIVE_PULSE_STOP_REQUIRED",
  "HEARTBEAT_FAILED",
  "HEARTBEAT_TIMEOUT",
  "PAIRING_REQUIRED",
  "CONTEXT_TIMEOUT",
  "CONTEXT_REFRESH_FAILED",
  "SERVICE_UPDATE_REQUIRED",
  "EXTENSION_UPDATE_REQUIRED",
  "PROTOCOL_MISMATCH",
  "INVALID_CONTEXT"
]);

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

export function serializeBridgeWindowMessage(type: BridgeWindowMessageType, payload?: unknown) {
  return JSON.stringify({ channel: bridgeWindowMessageChannel, type, payload });
}

export function parseBridgeWindowMessage(value: unknown): BridgeWindowMessage | null {
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

export function parseBridgeRequest(value: unknown): ExtensionBridgeRequest | null {
  if (!isRecord(value)) return null;
  const candidate = value as Partial<ExtensionBridgeRequest>;
  if (typeof candidate.requestId !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(candidate.requestId)) return null;
  if (candidate.protocolVersion !== extensionBridgeProtocolVersion) return null;
  if (candidate.type !== "GET_STATUS" && candidate.type !== "PAIR_TASK" && candidate.type !== "SYNC_CURRENT_TASK") return null;
  if (candidate.type !== "PAIR_TASK") {
    return candidate.payload === undefined
      ? { requestId: candidate.requestId, protocolVersion: candidate.protocolVersion, type: candidate.type }
      : null;
  }
  if (!isRecord(candidate.payload)) return null;
  const keys = Object.keys(candidate.payload);
  if (!keys.every((key) => key === "code" || key === "apiBaseUrl")) return null;
  const code = candidate.payload.code;
  const apiBaseUrl = candidate.payload.apiBaseUrl;
  if (code !== undefined && typeof code !== "string") return null;
  if (apiBaseUrl !== undefined && typeof apiBaseUrl !== "string") return null;
  return {
    requestId: candidate.requestId,
    protocolVersion: candidate.protocolVersion,
    type: "PAIR_TASK",
    payload: {
      ...(typeof code === "string" ? { code } : {}),
      ...(typeof apiBaseUrl === "string" ? { apiBaseUrl } : {})
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  const errorCode = ok
    ? null
    : safeBridgeErrorCode(result.errorCode) || safeBridgeErrorCode(input.fallbackErrorCode) || "BRIDGE_REQUEST_FAILED";
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
    errorCode,
    message: ok
      ? typeof result.message === "string" ? result.message : "插件后台连接正常"
      : bridgeErrorMessage(errorCode, input.fallbackMessage)
  };
}

function safeBridgeErrorCode(value: unknown) {
  return typeof value === "string" && bridgeErrorCodes.has(value) ? value : null;
}

function bridgeErrorMessage(code: string | null, fallback?: string) {
  const messages: Record<string, string> = {
    BRIDGE_REQUEST_FAILED: "插件后台请求失败，请重试。",
    BACKGROUND_UNRESPONSIVE: "插件后台未响应，请在扩展管理页重新加载插件。",
    EXTENSION_CONTEXT_INVALIDATED: "插件已重新加载，请刷新当前任务页。",
    INVALID_PAIRING_REQUEST: "配对码或服务器地址不符合安全要求。",
    TASK_PAGE_REQUIRED: "只能在当前采集任务页面自动连接插件。",
    PAIRING_CODE_INVALID: "配对码错误、已使用或已过期，请在任务页重新生成。",
    PAIRING_RATE_LIMITED: "配对请求过于频繁，请稍后重试。",
    PAIRING_API_TIMEOUT: "诊断服务响应超时，请检查本机 API 后重试。",
    PAIRING_SERVICE_UNAVAILABLE: "无法读取本地服务版本，请确认 API 正常运行。",
    PAIRING_SERVICE_ERROR: "无法连接诊断服务，请检查网络或服务器地址。",
    PAIRING_REQUEST_FAILED: "无法连接诊断服务，请检查网络或服务器地址。",
    PAIRING_RESPONSE_INVALID: "服务器未返回有效插件凭证，请重新配对。",
    PAIRING_CREDENTIAL_REJECTED: "插件凭证未被服务端接受，请重新配对。",
    TASK_PAGE_MISMATCH: "配对码不属于当前任务页面，已阻止自动连接。",
    TASK_ACCOUNT_MISMATCH: "当前任务不属于已配对账号，未完成自动连接。",
    ACTIVE_PULSE_STOP_REQUIRED: "另一任务正在持续采集，请先在插件 Popup 手动停止后再试。",
    HEARTBEAT_FAILED: "任务页心跳未被服务端确认，请检查本机 API 后重试。",
    HEARTBEAT_TIMEOUT: "任务页心跳响应超时，请检查本机 API 后重试。",
    PAIRING_REQUIRED: "当前浏览器尚未连接采集插件，请完成一次账号配对。",
    CONTEXT_TIMEOUT: "本机 API 响应超时，请稍后重试。",
    CONTEXT_REFRESH_FAILED: "无法验证已配对账号，请检查本机 API。",
    SERVICE_UPDATE_REQUIRED: "本地服务需更新后才能连接插件。",
    EXTENSION_UPDATE_REQUIRED: "采集插件需更新后才能连接。",
    PROTOCOL_MISMATCH: "插件协议不兼容，请重新加载当前版本。",
    INVALID_CONTEXT: "服务器返回的账号上下文无效，已停止连接。"
  };
  return (code ? messages[code] : undefined) || fallback || "插件后台请求失败，请重试。";
}
