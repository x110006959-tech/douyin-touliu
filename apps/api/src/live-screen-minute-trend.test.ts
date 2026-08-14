import { describe, expect, it } from "vitest";
import { structureLiveScreenMinuteTrend } from "./live-screen-minute-trend.js";

describe("live screen minute trend projection", () => {
  it("projects only formal live-screen capture minute rows into structured hourly data", () => {
    expect(structureLiveScreenMinuteTrend({
      routeKey: "LIVE_DATA_SCREEN",
      capturedAt: "2026-08-06T13:35:00.000Z",
      adapterId: "live-screen-api",
      adapterVersion: "1.0.0",
      minuteRows: [
        { intervalLabel: "13:33", liveViews: "12" },
        { intervalLabel: "13:34", liveViews: "15.5" }
      ]
    })).toMatchObject({
      kind: "HOURLY_ROWS",
      routeKey: "LIVE_DATA_SCREEN",
      acceptedRowCount: 2,
      rejectedRowCount: 0,
      rows: [
        expect.objectContaining({ intervalLabel: "13:33", liveViews: 12 }),
        expect.objectContaining({ intervalLabel: "13:34", liveViews: 15.5 })
      ]
    });
  });

  it("does not create a trend projection without live-screen minute evidence", () => {
    expect(structureLiveScreenMinuteTrend({
      routeKey: "LIVE_PRODUCT_TAB",
      capturedAt: "2026-08-06T13:35:00.000Z",
      minuteRows: [{ intervalLabel: "13:34", liveViews: "15" }]
    })).toBeNull();
    expect(structureLiveScreenMinuteTrend({
      routeKey: "LIVE_DATA_SCREEN",
      capturedAt: "2026-08-06T13:35:00.000Z"
    })).toBeNull();
  });
});
