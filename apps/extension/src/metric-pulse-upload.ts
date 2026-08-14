import type { MetricPulse } from "@douyin-local-life/shared";

export const metricPulseUploadTimeoutMs = 4_000;
const maxMetricPulseRetryAfterMs = 15 * 60 * 1000;

export type MetricPulseUploadResult =
  | { ok: true }
  | { ok: false; error: string; status?: number; retryAfterMs?: number };

export async function uploadMetricPulseRequest(input: {
  url: string;
  token: string;
  pulse: MetricPulse;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<MetricPulseUploadResult> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (input.signal?.aborted) controller.abort();
  else input.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs ?? metricPulseUploadTimeoutMs);

  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${input.token}` },
      body: JSON.stringify(input.pulse),
      signal: controller.signal
    });
    if (response.ok) {
      return { ok: true };
    }
    const body: unknown = await response.json().catch(() => null);
    const retryAfterMs = response.status === 429 ? retryAfterMsFromHeader(response.headers.get("Retry-After")) : undefined;
    return {
      ok: false,
      status: response.status,
      error: apiError(body) || `HTTP_${response.status}`,
      ...(retryAfterMs ? { retryAfterMs } : {})
    };
  } catch {
    if (timedOut) return { ok: false, error: "PULSE_UPLOAD_TIMEOUT" };
    if (controller.signal.aborted) return { ok: false, error: "PULSE_UPLOAD_ABORTED" };
    return { ok: false, error: "PULSE_NETWORK_ERROR" };
  } finally {
    globalThis.clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function retryAfterMsFromHeader(value: string | null, now = Date.now()) {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(maxMetricPulseRetryAfterMs, Math.ceil(seconds * 1000));
  }
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt) || retryAt <= now) return undefined;
  return Math.min(maxMetricPulseRetryAfterMs, retryAt - now);
}

function apiError(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("error" in value)) return null;
  const error = value.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  if ("code" in error && typeof error.code === "string" && error.code.trim()) return error.code;
  if ("message" in error && typeof error.message === "string" && error.message.trim()) return error.message;
  return null;
}
