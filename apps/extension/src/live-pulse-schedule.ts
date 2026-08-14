export const livePulseCadenceMs = 5_000;
// The API rejects a second receive inside its four-second window. Keep a small
// margin for timer and network jitter instead of attempting an exact boundary.
export const livePulseUploadSafetyIntervalMs = 4_100;

export function nextLivePulseAt(now: number, cadenceMs = livePulseCadenceMs) {
  if (!Number.isFinite(now) || !Number.isInteger(cadenceMs) || cadenceMs <= 0) throw new Error("LIVE_PULSE_CADENCE_INVALID");
  return Math.ceil(now / cadenceMs) * cadenceMs;
}

// Preserve the normal five-second cadence from the start of a pulse. When the
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
