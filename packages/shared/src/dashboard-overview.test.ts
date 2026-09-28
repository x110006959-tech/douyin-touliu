import { describe, expect, it } from "vitest";
import type { CaptureSummaryMetricDTO, MetricReviewStatus, RealtimeMetricFrame, VisibleMetric } from "./index";
import { buildDashboardOverviewCards } from "./dashboard-overview";

describe("dashboard overview projection", () => {
  it("deduplicates live and local same-key values into one card while retaining candidates", () => {
    const cards = buildDashboardOverviewCards([
      summaryMetric("LOCAL_PROMOTION_DASHBOARD", "gmv", "100", "整体成交金额(元)"),
      summaryMetric("LIVE_DATA_SCREEN", "gmv", "200", "直播间成交金额")
    ]);
    const card = overviewCard(cards, "live_gmv");

    expect(cards.filter((item) => item.label === "直播间成交金额")).toHaveLength(1);
    expect(card.value).toBe("200");
    expect(card.candidates.map((candidate) => candidate.routeKey)).toEqual([
      "LIVE_DATA_SCREEN",
      "LOCAL_PROMOTION_DASHBOARD"
    ]);
    expect(card.status).toBe("CONFLICT");
    expect(card.value).not.toBe("300");
  });

  it("prefers fresh live realtime data, then falls back to the latest snapshot after expiry", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const snapshot = summaryMetric("LIVE_DATA_SCREEN", "gmv", "200", "直播间成交金额", "2026-08-28T11:55:00.000Z");
    const freshFrame = frame(now - 5_000, "LIVE_DATA_SCREEN", [visibleMetric("gmv", 320, "直播间成交金额")]);
    const freshCard = overviewCard(buildDashboardOverviewCards([snapshot], [freshFrame], now), "live_gmv");
    expect(freshCard.status).toBe("CONFLICT");
    expect(freshCard.value).toBe("320");
    expect(freshCard.sourceType).toBe("REALTIME_API");
    expect(freshCard.hasConflict).toBe(true);

    const staleFrame = frame(now - 120_000, "LIVE_DATA_SCREEN", [visibleMetric("gmv", 320, "直播间成交金额")]);
    const staleCard = overviewCard(buildDashboardOverviewCards([snapshot], [staleFrame], now), "live_gmv");
    expect(staleCard.status).toBe("SNAPSHOT");
    expect(staleCard.value).toBe("200");
    expect(staleCard.sourceType).toBe("SNAPSHOT");
  });

  it("keeps full-domain values separate from live-room values and does not add them", () => {
    const cards = buildDashboardOverviewCards([
      summaryMetric("LIVE_DATA_SCREEN", "gmv", "300", "直播间成交金额"),
      summaryMetric("LOCAL_PROMOTION_DASHBOARD", "full_domain_gmv", "1,000", "全域成交金额(元)")
    ]);
    const liveCard = overviewCard(cards, "live_gmv");
    const fullDomainCard = overviewCard(cards, "local_full_domain_gmv");

    expect(liveCard.value).toBe("300");
    expect(fullDomainCard.value).toBe("1,000");
    expect(fullDomainCard.scopeLabel).toBe("全域");
    expect(fullDomainCard.candidates.every((candidate) => candidate.routeKey === "LOCAL_PROMOTION_DASHBOARD")).toBe(true);
  });

  it("keeps zero as a valid value and leaves ignored or invalid values out of the primary value", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const cards = buildDashboardOverviewCards([
      summaryMetric("LOCAL_PROMOTION_DASHBOARD", "full_domain_orders", "0", "全域成交订单数"),
      summaryMetric("LOCAL_PROMOTION_DASHBOARD", "full_domain_gmv", "900", "全域成交金额(元)", undefined, "IGNORED")
    ], [frame(now - 5_000, "LIVE_DATA_SCREEN", [
      { ...visibleMetric("gmv", "--", "直播间成交金额"), rawEvidence: { validationStatus: "INVALID", displayValue: "--" } }
    ])], now);

    const zeroCard = overviewCard(cards, "local_full_domain_orders");
    const ignoredCard = overviewCard(cards, "local_full_domain_gmv");
    const invalidLiveCard = overviewCard(cards, "live_gmv");
    expect(zeroCard.value).toBe("0");
    expect(zeroCard.status).toBe("SNAPSHOT");
    expect(ignoredCard.value).toBeNull();
    expect(ignoredCard.status).toBe("MISSING");
    expect(ignoredCard.candidates[0]?.valueStatus).toBe("IGNORED");
    expect(invalidLiveCard.value).toBeNull();
    expect(invalidLiveCard.candidates[0]?.valueStatus).toBe("INVALID");

    const emptyCard = overviewCard(buildDashboardOverviewCards([
      summaryMetric("LOCAL_PROMOTION_DASHBOARD", "full_domain_gmv", "--", "全域成交金额(元)")
    ]), "local_full_domain_gmv");
    expect(emptyCard.status).toBe("MISSING");
    expect(emptyCard.candidates[0]?.valueStatus).toBe("EMPTY");
  });

  it("accepts only route-matched fresh realtime frames", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const mismatched = frame(now - 5_000, "LIVE_DATA_SCREEN", [visibleMetric("gmv", 500, "直播间成交金额")]);
    const invalidPage = { ...mismatched, pageType: "LOCAL_PROMOTION_DASHBOARD" as const };
    const cards = buildDashboardOverviewCards([], [invalidPage], now);
    expect(overviewCard(cards, "live_gmv").status).toBe("MISSING");
  });

  it("uses the reviewed semantic scope for generic overview candidates", () => {
    const cards = buildDashboardOverviewCards([
      summaryMetric("LIVE_DATA_SCREEN", "custom_gmv", "1200", "自定义成交金额", "2026-08-28T11:59:00.000Z", "PENDING", "全域自定义成交金额")
    ]);

    expect(overviewCard(cards, "other:LIVE_DATA_SCREEN:custom_gmv").scopeLabel).toBe("全域");
  });
});

function overviewCard(cards: ReturnType<typeof buildDashboardOverviewCards>, displayKey: string) {
  const card = cards.find((item) => item.displayKey === displayKey);
  if (!card) throw new Error(`missing overview card: ${displayKey}`);
  return card;
}

function summaryMetric(
  routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD",
  metricKey: string,
  metricValue: string,
  metricName: string,
  capturedAt = "2026-08-28T11:59:00.000Z",
  reviewStatus: MetricReviewStatus = "PENDING",
  semanticScope?: string
): CaptureSummaryMetricDTO {
  return {
    metricKey,
    metricName,
    metricValue,
    displayValue: null,
    originalValue: null,
    metricUnit: metricKey.includes("gmv") ? "yuan" : null,
    semanticScope: semanticScope || null,
    category: "UNKNOWN",
    confidence: 1,
    metricSource: "DOM_TEXT",
    routeKey,
    pageType: routeKey,
    capturedAt,
    reviewStatus,
    provenance: {
      snapshotId: `${routeKey}-snapshot`,
      routeKey,
      capturedAt,
      adapterId: null,
      adapterVersion: null,
      pageFingerprint: null
    }
  };
}

function frame(at: number, routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD", metrics: VisibleMetric[]): RealtimeMetricFrame {
  return {
    collectionTaskId: "task-1",
    routeKey,
    pageType: routeKey,
    observedAt: new Date(at).toISOString(),
    receivedAt: new Date(at).toISOString(),
    metrics,
    successfulEndpoints: []
  };
}

function visibleMetric(key: string, value: string | number, name: string): VisibleMetric {
  return { key, name, value, source: "network", metricSource: "XHR_JSON", confidence: 1 };
}
