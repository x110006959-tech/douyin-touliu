import type { LiveScreenInternalApiEndpointKey } from "@douyin-local-life/shared";
import { safeLivePulseFailureReason } from "./live-pulse-status";

export type LivePulseFailureProgress = {
  consecutiveFailures: number;
  lastFailureReason: string;
  lastFailureEndpoint: LiveScreenInternalApiEndpointKey | null;
  shouldStop: boolean;
};

export function advanceLivePulseFailure(
  previousFailures: number,
  reason: string,
  endpoint?: LiveScreenInternalApiEndpointKey
): LivePulseFailureProgress {
  const consecutiveFailures = Math.max(0, previousFailures) + 1;
  return {
    consecutiveFailures,
    lastFailureReason: safeLivePulseFailureReason(reason) || "PULSE_CAPTURE_FAILED",
    lastFailureEndpoint: endpoint || null,
    shouldStop: consecutiveFailures >= 3
  };
}
