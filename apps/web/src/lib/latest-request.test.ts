import { describe, expect, it } from "vitest";
import { createLatestRequestGuard } from "./latest-request";

describe("latest request guard", () => {
  it("prevents an older response from overwriting a newer request", () => {
    const guard = createLatestRequestGuard();
    const older = guard.begin();
    const newer = guard.begin();

    expect(guard.isCurrent(older)).toBe(false);
    expect(guard.isCurrent(newer)).toBe(true);
  });

  it("invalidates an in-flight response when the consumer unmounts", () => {
    const guard = createLatestRequestGuard();
    const inFlight = guard.begin();
    guard.invalidate();

    expect(guard.isCurrent(inFlight)).toBe(false);
  });
});
