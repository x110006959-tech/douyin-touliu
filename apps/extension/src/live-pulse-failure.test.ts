import { describe, expect, it } from "vitest";
import { advanceLivePulseFailure } from "./live-pulse-failure";

describe("live pulse failure progression", () => {
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
