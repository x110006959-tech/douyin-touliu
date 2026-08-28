import { safeLivePulseFailureReason } from "./live-pulse-status";

export type LivePulseFailureProgress = {
  consecutiveFailures: number;
  lastFailureReason: string;
  lastFailureEndpoint: string | null;
  shouldStop: boolean;
};

export function fatalLivePulseFailureReason(error: string, status?: number) {
  if (status === 401) return "HTTP_401";
  if (status === 429) return error === "RATE_LIMITED" ? "RATE_LIMITED" : "HTTP_429";
  return /^(?:HTTP_401|HTTP_429|SCHEMA_MISMATCH|SENSITIVE_RESPONSE|BYTE_LIMIT|TOTAL_BYTE_LIMIT|LIVE_ENDED|PAGE_INACTIVE|PULSE_TRANSPORT_UNAVAILABLE|LIVE_SCREEN_INTERNAL_API_(?:DISABLED|CONTRACT_MISMATCH|EVIDENCE_INVALID|PAGE_FORBIDDEN)|LIVE_SCREEN_(?:ROOM_ID_INVALID|PULSE_PURPOSE_INVALID)|LOCAL_PROMOTION_INTERNAL_API_(?:DISABLED|CONTRACT_MISMATCH|EVIDENCE_INVALID|PAGE_FORBIDDEN|EXTENSION_REQUIRED)|LOCAL_PROMOTION_(?:IDENTITY_INVALID|PULSE_PURPOSE_INVALID))$/.test(error)
    ? error
    : null;
}

export function isFatalLivePulseFailure(error: string, status?: number) {
  return fatalLivePulseFailureReason(error, status) !== null;
}

export function advanceLivePulseFailure(
  previousFailures: number,
  reason: string,
  endpoint?: string
): LivePulseFailureProgress {
  const consecutiveFailures = Math.max(0, previousFailures) + 1;
  return {
    consecutiveFailures,
    lastFailureReason: safeLivePulseFailureReason(reason) || "PULSE_CAPTURE_FAILED",
    lastFailureEndpoint: endpoint || null,
    shouldStop: consecutiveFailures >= 3
  };
}
