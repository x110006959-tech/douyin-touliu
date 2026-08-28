import { describe, expect, it } from "vitest";
import { advanceLivePulseFailure, fatalLivePulseFailureReason, isFatalLivePulseFailure } from "./live-pulse-failure";

describe("live pulse failure progression", () => {
  it("stops immediately for local-promotion contract, identity, and page rejection codes", () => {
    expect(isFatalLivePulseFailure("LOCAL_PROMOTION_INTERNAL_API_CONTRACT_MISMATCH")).toBe(true);
    expect(isFatalLivePulseFailure("LOCAL_PROMOTION_IDENTITY_INVALID")).toBe(true);
    expect(isFatalLivePulseFailure("LOCAL_PROMOTION_INTERNAL_API_PAGE_FORBIDDEN")).toBe(true);
    expect(isFatalLivePulseFailure("PULSE_METRICS_MISSING")).toBe(false);
  });

  it("normalizes fatal HTTP statuses and rejects arbitrary text containing a fixed code", () => {
    expect(fatalLivePulseFailureReason("private response", 401)).toBe("HTTP_401");
    expect(fatalLivePulseFailureReason("RATE_LIMITED", 429)).toBe("RATE_LIMITED");
    expect(fatalLivePulseFailureReason("private SCHEMA_MISMATCH token=secret")).toBeNull();
    expect(isFatalLivePulseFailure("private SCHEMA_MISMATCH token=secret")).toBe(false);
  });
  it("keeps the first two failures visible and stops on the third", () => {
    const first = advanceLivePulseFailure(0, "PULSE_KEY_INDEX_NO_USABLE_METRICS", "key_index");
    const second = advanceLivePulseFailure(first.consecutiveFailures, "PULSE_KEY_INDEX_NO_USABLE_METRICS", "key_index");
    const third = advanceLivePulseFailure(second.consecutiveFailures, "PULSE_KEY_INDEX_NO_USABLE_METRICS", "key_index");

    expect(first).toMatchObject({ consecutiveFailures: 1, shouldStop: false, lastFailureEndpoint: "key_index" });
    expect(second).toMatchObject({ consecutiveFailures: 2, shouldStop: false, lastFailureEndpoint: "key_index" });
    expect(third).toMatchObject({ consecutiveFailures: 3, shouldStop: true, lastFailureEndpoint: "key_index" });
  });

  it("does not persist arbitrary response text as a failure reason", () => {
    expect(advanceLivePulseFailure(0, "response body: token=secret", "key_index").lastFailureReason)
      .toBe("PULSE_CAPTURE_FAILED");
  });
});
