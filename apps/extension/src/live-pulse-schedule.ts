export const livePulseCadenceMs = 30_000;
// 两条实时采集路线均使用三十秒节拍。本地推每轮还会调用受限的 liveReportPromoteMeta，
// 所以 429 仍必须立即停止，绝不自动重试。
export const localPromotionPulseCadenceMs = 30_000;
export const localPromotionRateLimitCooldownMs = 60_000;
// The API rejects a second receive inside its four-second window. Keep a small
// margin for timer and network jitter instead of attempting an exact boundary.
export const livePulseUploadSafetyIntervalMs = 4_100;

export function nextLivePulseAt(now: number, cadenceMs = livePulseCadenceMs) {
  if (!Number.isFinite(now) || !Number.isInteger(cadenceMs) || cadenceMs <= 0) throw new Error("LIVE_PULSE_CADENCE_INVALID");
  return Math.ceil(now / cadenceMs) * cadenceMs;
}

// Preserve the normal thirty-second cadence from the start of a pulse. When the
// platform request itself runs slowly, also leave the API's receive-time safety
// window after the preceding upload completes. This prevents two uploads from
// arriving as a burst solely because their platform request durations differ.
export function nextLivePulseAfter(
  pulseStartedAt: number,
  uploadCompletedAt = pulseStartedAt,
  cadenceMs = livePulseCadenceMs,
  uploadSafetyIntervalMs = livePulseUploadSafetyIntervalMs
) {
  if (
    !Number.isFinite(pulseStartedAt)
    || !Number.isFinite(uploadCompletedAt)
    || !Number.isInteger(cadenceMs)
    || cadenceMs <= 0
    || !Number.isInteger(uploadSafetyIntervalMs)
    || uploadSafetyIntervalMs <= 0
  ) {
    throw new Error("LIVE_PULSE_CADENCE_INVALID");
  }
  return Math.max(pulseStartedAt + cadenceMs, uploadCompletedAt + uploadSafetyIntervalMs);
}

export function nextLivePulseAfterRateLimit(now: number, retryAfterMs: number) {
  if (!Number.isFinite(now) || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) throw new Error("LIVE_PULSE_RETRY_AFTER_INVALID");
  return now + Math.ceil(retryAfterMs);
}

export function localPromotionRateLimitCooldownRemaining(occurredAt: number, now = Date.now()) {
  if (!Number.isFinite(occurredAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, occurredAt + localPromotionRateLimitCooldownMs - now);
}
