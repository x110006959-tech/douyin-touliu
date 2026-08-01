import { describe, expect, it } from "vitest";
import { collectionDashboardCalibrationState, collectionDashboardRefreshMode } from "./refresh-policy";

describe("collection dashboard refresh policy", () => {
  it("refreshes an active collection run when there are no drafts", () => {
    expect(collectionDashboardRefreshMode("ACTIVE", false)).toBe("REFRESH");
    expect(collectionDashboardRefreshMode("DEGRADED", false)).toBe("REFRESH");
  });

  it("checks for new data without replacing unsaved drafts", () => {
    expect(collectionDashboardRefreshMode("ACTIVE", true)).toBe("CHECK_ONLY");
  });

  it("does not poll completed or stopped runs", () => {
    expect(collectionDashboardRefreshMode("COMPLETED", false)).toBe("IDLE");
    expect(collectionDashboardRefreshMode("STOPPED", true)).toBe("IDLE");
    expect(collectionDashboardRefreshMode(null, false)).toBe("IDLE");
  });

  it("does not describe an empty task as calibration complete", () => {
    expect(collectionDashboardCalibrationState(0, 0)).toBe("EMPTY");
    expect(collectionDashboardCalibrationState(1, 2)).toBe("PENDING");
    expect(collectionDashboardCalibrationState(1, 0)).toBe("COMPLETE");
  });
});
