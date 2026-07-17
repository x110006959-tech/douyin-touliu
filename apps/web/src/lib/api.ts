import type { ApiResponse } from "@douyin-local-life/shared";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const cookieSessionMarker = "__http_only_cookie_session__";
let csrfToken: string | null = null;

export function setCsrfToken(value: string | null) {
  csrfToken = value;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly fieldErrors: Record<string, string> = {},
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createIdempotencyKey(scope: string) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${scope}:${random}`.slice(0, 128);
}

export async function apiFetch<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: init.credentials || "include",
      signal: init.signal || controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token && token !== cookieSessionMarker ? { authorization: `Bearer ${token}` } : {}),
        ...(token === cookieSessionMarker && csrfToken ? { "x-csrf-token": csrfToken } : {}),
        ...(init.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) throw new Error(`服务返回了无法识别的响应（HTTP ${response.status}）`);
  const payload = (await response.json()) as ApiResponse<T>;
  if (!payload.success) {
    const requestId = payload.error.requestId ? `（请求 ${payload.error.requestId}）` : "";
    throw new ApiError(`${payload.error.message}${requestId}`, payload.error.code, payload.error.fieldErrors || {}, payload.error.requestId);
  }
  return payload.data;
}
