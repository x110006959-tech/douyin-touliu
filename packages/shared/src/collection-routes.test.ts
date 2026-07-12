import { describe, expect, it } from "vitest";
import { assessCollectionQuality, inferCollectionRoute } from "./collection-routes";

describe("collection routes", () => {
  it("prefers fixed target page semantics over a broad page type", () => {
    expect(inferCollectionRoute({ pageType: "LOCAL_PROMOTION_DASHBOARD", sourceUrl: "https://example.com/material/list" })).toBe("MATERIAL_LIBRARY");
    expect(inferCollectionRoute({ pageType: "UNKNOWN", sourceUrl: "https://example.com/hourly-trend" })).toBe("HOURLY_TREND");
  });

  it("marks missing and stale required routes as blocking", () => {
    const now = new Date("2026-07-12T04:00:00.000Z");
    const quality = assessCollectionQuality(
      ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN", "TASK_TABLE"],
      [
        { routeKey: "LOCAL_PROMOTION_DASHBOARD", localCollectedAt: "2026-07-12T03:58:00.000Z" },
        { routeKey: "LIVE_DATA_SCREEN", localCollectedAt: "2026-07-12T03:49:00.000Z" }
      ],
      now
    );
    expect(quality.completeness).toBe(0.33);
    expect(quality.staleRoutes).toEqual(["LIVE_DATA_SCREEN"]);
    expect(quality.missingRoutes).toEqual(["TASK_TABLE"]);
    expect(quality.blocksStrongActions).toBe(true);
  });

  it("accepts fresh and aging routes as a complete batch", () => {
    const now = new Date("2026-07-12T04:00:00.000Z");
    const quality = assessCollectionQuality(
      ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN"],
      [
        { routeKey: "LOCAL_PROMOTION_DASHBOARD", localCollectedAt: "2026-07-12T03:59:00.000Z" },
        { routeKey: "LIVE_DATA_SCREEN", localCollectedAt: "2026-07-12T03:54:00.000Z" }
      ],
      now
    );
    expect(quality.completeness).toBe(1);
    expect(quality.routes.map((route) => route.state)).toEqual(["FRESH", "AGING"]);
    expect(quality.blocksStrongActions).toBe(false);
  });
});
