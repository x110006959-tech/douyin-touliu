import { describe, expect, it } from "vitest";
import { selectOverviewMetrics, summaryDisplayValue } from "./capture-summary.js";
import { selectLatestSnapshotsByRoute } from "./current-snapshots.js";

describe("capture summary overview", () => {
  it("uses one preferred source route instead of adding same-name metrics", () => {
    const result = selectOverviewMetrics([
      metric("LIVE_DATA_SCREEN", "spend", "20"),
      metric("LOCAL_PROMOTION_DASHBOARD", "spend", "100"),
      metric("LOCAL_PROMOTION_DASHBOARD", "gmv", "600")
    ]);

    expect(result.routeKey).toBe("LOCAL_PROMOTION_DASHBOARD");
    expect(result.metrics.map((item) => item.metricValue)).toEqual(["100", "600"]);
  });

  it("falls back to the live overview only when promotion overview is absent", () => {
    const result = selectOverviewMetrics([metric("LIVE_DATA_SCREEN", "gmv", "300")]);
    expect(result.routeKey).toBe("LIVE_DATA_SCREEN");
    expect(result.metrics).toHaveLength(1);
  });

  it("keeps the backend display text separate from the exact normalized value", () => {
    expect(summaryDisplayValue({ metricValue: "0.04", rawEvidence: { displayValue: "4%" } })).toBe("4%");
    expect(summaryDisplayValue(
      { metricValue: "0.04", rawEvidence: { displayValue: "4%" } },
      { reviewStatus: "MODIFIED", reviewedValue: "3.50" }
    )).toBe("3.50");
  });

  it("keeps repeated collection on one route separate from the other current routes", () => {
    const selected = selectLatestSnapshotsByRoute([
      snapshot("live-first", "LIVE_DATA_SCREEN", "2026-07-28T12:00:00Z"),
      snapshot("live-repeat", "LIVE_DATA_SCREEN", "2026-07-28T12:05:00Z"),
      snapshot("product", "LIVE_PRODUCT_TAB", "2026-07-28T12:02:00Z"),
      snapshot("traffic", "LIVE_TRAFFIC_TAB", "2026-07-28T12:03:00Z"),
      snapshot("promotion", "LOCAL_PROMOTION_DASHBOARD", "2026-07-28T12:04:00Z"),
      snapshot("tasks", "TASK_TABLE", "2026-07-28T12:04:30Z")
    ], "run-1");

    expect(selected.map((item) => item.id).sort()).toEqual([
      "live-repeat",
      "product",
      "promotion",
      "tasks",
      "traffic"
    ]);
  });
});

function metric(routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD", metricKey: string, metricValue: string) {
  return {
    metricKey,
    metricName: metricKey,
    metricValue,
    displayValue: null,
    metricUnit: null,
    category: "UNKNOWN" as const,
    confidence: 0.8,
    metricSource: "DOM_TEXT" as const,
    routeKey,
    pageType: routeKey,
    capturedAt: "2026-07-28T12:00:00.000Z",
    reviewStatus: "PENDING" as const,
    provenance: { snapshotId: "snapshot", routeKey, capturedAt: "2026-07-28T12:00:00.000Z", adapterId: null, adapterVersion: null, pageFingerprint: null }
  };
}

function snapshot(id: string, routeKey: string, localCollectedAt: string) {
  return {
    id,
    routeKey,
    collectionRunId: "run-1",
    localCollectedAt: new Date(localCollectedAt),
    createdAt: new Date(localCollectedAt)
  };
}
