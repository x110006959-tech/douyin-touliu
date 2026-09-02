import { describe, expect, it } from "vitest";
import type { RealtimeMetricFrame, VisibleMetric } from "@douyin-local-life/shared";
import { buildDecisionInput } from "./decision.js";

describe("multi-route realtime decision evidence", () => {
  it("covers live and local-promotion routes without mixing or inventing metrics", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const input = buildDecisionInput({
      id: "task-realtime-routes",
      sourceUrl: null,
      pageTitle: "实时双路线",
      project: {
        id: "project-realtime-routes",
        businessType: "DOUYIN_LOCAL_LIFE",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        controlLevel: "MEDIUM",
        subjectConfidence: 1,
        serviceProviderName: "provider",
        serviceMode: "代播",
        serviceFee: null
      },
      snapshots: [],
      reviewedMetrics: [manualTargetRoi(50, now)],
      collectionRuns: [{
        id: "run-realtime-routes",
        requiredRoutesJson: ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN"],
        snapshots: [],
        routeHealth: []
      }]
    }, {
      now: now.getTime(),
      realtimeFrames: [
        frame("LIVE_DATA_SCREEN", [metric("gmv", 500), metric("gpm", 3200)], now),
        frame("LOCAL_PROMOTION_DASHBOARD", [
          metric("spend", 100),
          metric("full_domain_pay_roi", 62.76),
          metric("gmv", 800),
          metric("pay_roi", 2.3)
        ], now)
      ]
    });

    expect(input.realtimeEvidenceItems).toMatchObject([
      { routeKey: "LOCAL_PROMOTION_DASHBOARD", source: "LOCAL_PROMOTION_INTERNAL_API", metricCount: 3 },
      { routeKey: "LIVE_DATA_SCREEN", source: "LIVE_SCREEN_INTERNAL_API", metricCount: 2 }
    ]);
    expect(input.targetRoi).toBe(50);
    expect(input.metrics.map((item) => item.key).sort()).toEqual(["full_domain_pay_roi", "gmv", "gmv", "gpm", "spend", "target_roi"]);
    expect(input.metrics.find((item) => item.key === "target_roi")).toMatchObject({
      value: "50",
      metricSource: "MANUAL_INPUT",
      rawEvidence: { routeKey: "LOCAL_PROMOTION_DASHBOARD", validationStatus: "TRUSTED" }
    });
    expect(input.metrics.filter((item) => item.key === "gmv")).toMatchObject([
      { value: 800, rawEvidence: { routeKey: "LOCAL_PROMOTION_DASHBOARD" } },
      { value: 500, rawEvidence: { routeKey: "LIVE_DATA_SCREEN" } }
    ]);
    expect(input.metrics.some((item) => item.key === "daily_budget")).toBe(false);
    expect(input.collectionQuality).toMatchObject({ completeness: 1, missingRoutes: [], staleRoutes: [] });
    expect(input.reviewCoverage).toMatchObject({ totalCount: 5, confirmedCount: 5, pendingCount: 0 });
  });
});

function frame(routeKey: "LOCAL_PROMOTION_DASHBOARD" | "LIVE_DATA_SCREEN", metrics: VisibleMetric[], now: Date): RealtimeMetricFrame {
  return {
    collectionTaskId: "task-realtime-routes",
    routeKey,
    pageType: routeKey,
    observedAt: now.toISOString(),
    receivedAt: now.toISOString(),
    successfulEndpoints: routeKey === "LOCAL_PROMOTION_DASHBOARD" ? ["pageMetrics", "statQuery"] : ["key_index"],
    metrics
  };
}

function metric(key: string, value: number): VisibleMetric {
  return {
    key,
    name: key,
    value,
    unit: null,
    source: "network",
    metricSource: "XHR_JSON",
    confidence: 1,
    rawEvidence: {
      sourceType: "INTERNAL_API",
      bindingKind: "CARD",
      validationStatus: "TRUSTED",
      validationReasons: [],
      sourceStatus: "INTERNAL_API",
      evidencePurpose: "PULSE_ONLY",
      routeKey: key === "spend" || key === "pay_roi" || key === "full_domain_pay_roi" ? "LOCAL_PROMOTION_DASHBOARD" : undefined
    }
  };
}

function manualTargetRoi(value: number, now: Date) {
  return {
    id: "manual-target-roi",
    taskId: "task-realtime-routes",
    snapshotId: null,
    normalizedMetricId: null,
    metricKey: "target_roi",
    metricName: "目标 ROI",
    originalValue: String(value),
    reviewedValue: String(value),
    metricUnit: "ROI",
    metricSource: "MANUAL_INPUT" as const,
    confidence: 1,
    rawEvidence: {
      sourceType: "MANUAL_INPUT",
      bindingKind: "MANUAL",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      validationStatus: "TRUSTED",
      validationReasons: []
    },
    pageType: "LOCAL_PROMOTION_DASHBOARD",
    scope: "TASK_TARGET",
    timeRange: "当前任务",
    reviewStatus: "CONFIRMED" as const,
    reviewerId: "user-1",
    reviewedAt: now,
    createdAt: now,
    updatedAt: now
  };
}
