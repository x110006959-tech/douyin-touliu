import type { DecisionEngineInput, MetricKey, VisibleMetric } from "@douyin-local-life/shared";
import type { DiagnosisFinalResult } from "@douyin-local-life/shared/diagnosis";
import type { CollectionRouteKey } from "@douyin-local-life/shared/collection-routes";

export type SyntheticDiagnosisCase = {
  id: string;
  group: "HEALTHY" | "TRAFFIC" | "LIVE_ROOM" | "PRODUCT" | "DELIVERY_ROI" | "DATA_CONFLICT_SAFETY";
  expectedMainProblemTag: DiagnosisFinalResult["mainProblemTag"];
  input: DecisionEngineInput;
};

const fiveRoutes: CollectionRouteKey[] = [
  "LIVE_DATA_SCREEN",
  "LIVE_PRODUCT_TAB",
  "LIVE_TRAFFIC_TAB",
  "LOCAL_PROMOTION_DASHBOARD",
  "TASK_TABLE"
];

const scenarios: Array<{
  group: SyntheticDiagnosisCase["group"];
  expected: DiagnosisFinalResult["mainProblemTag"];
  variants: Array<Record<string, number | null>>;
}> = [
  {
    group: "HEALTHY",
    expected: "HEALTHY",
    variants: [
      { impressions: 50_000, ctr: 0.04, live_viewers: 5_000, orders: 180, gpm: 1_200, spend: 2_000, pay_roi: 3.2, target_roi: 2.5 },
      { impressions: 80_000, ctr: 0.035, live_viewers: 7_000, orders: 220, gpm: 1_050, spend: 3_000, pay_roi: 3, target_roi: 2.4 },
      { impressions: 35_000, ctr: 0.05, live_viewers: 4_200, orders: 145, gpm: 1_350, spend: 1_500, pay_roi: 3.5, target_roi: 2.6 },
      { impressions: 100_000, ctr: 0.03, live_viewers: 9_000, orders: 300, gpm: 980, spend: 4_500, pay_roi: 2.9, target_roi: 2.5 }
    ]
  },
  {
    group: "TRAFFIC",
    expected: "TRAFFIC",
    variants: [
      { impressions: 2_000, ctr: 0.04, live_viewers: 120, orders: 8, gpm: 1_100, spend: 500, pay_roi: 2.6, target_roi: 2.5 },
      { impressions: 60_000, ctr: 0.003, live_viewers: 160, orders: 6, gpm: 1_000, spend: 1_800, pay_roi: 1.5, target_roi: 2.5 },
      { impressions: 12_000, ctr: 0.01, live_viewers: 100, orders: 5, gpm: 1_300, spend: 700, pay_roi: 2, target_roi: 2.5 },
      { impressions: 90_000, ctr: 0.002, live_viewers: 150, orders: 4, gpm: 900, spend: 2_200, pay_roi: 1.2, target_roi: 2.5 }
    ]
  },
  {
    group: "LIVE_ROOM",
    expected: "LIVE_ROOM",
    variants: [
      { impressions: 80_000, ctr: 0.05, live_viewers: 8_000, orders: 3, gpm: 40, spend: 2_000, pay_roi: 0.5, target_roi: 2.5 },
      { impressions: 50_000, ctr: 0.04, live_viewers: 5_000, orders: 0, gpm: 0, spend: 1_400, pay_roi: 0.2, target_roi: 2.5 },
      { impressions: 45_000, ctr: 0.045, live_viewers: 4_000, orders: 8, gpm: 80, spend: 1_200, pay_roi: 0.8, target_roi: 2.5 },
      { impressions: 70_000, ctr: 0.035, live_viewers: 6_500, orders: 12, gpm: 120, spend: 2_300, pay_roi: 1, target_roi: 2.5 }
    ]
  },
  {
    group: "PRODUCT",
    expected: "PRODUCT",
    variants: [
      { impressions: 60_000, ctr: 0.04, live_viewers: 5_500, orders: 20, gpm: 250, spend: 1_800, pay_roi: 1.1, target_roi: 2.5 },
      { impressions: 55_000, ctr: 0.038, live_viewers: 5_000, orders: 18, gpm: 220, spend: 1_600, pay_roi: 1, target_roi: 2.4 },
      { impressions: 75_000, ctr: 0.042, live_viewers: 6_000, orders: 24, gpm: 260, spend: 2_100, pay_roi: 1.2, target_roi: 2.6 },
      { impressions: 40_000, ctr: 0.05, live_viewers: 4_500, orders: 15, gpm: 180, spend: 1_300, pay_roi: 0.9, target_roi: 2.3 }
    ]
  },
  {
    group: "DELIVERY_ROI",
    expected: "DELIVERY_ROI",
    variants: [
      { impressions: 80_000, ctr: 0.04, live_viewers: 6_000, orders: 80, gpm: 900, spend: 8_000, pay_roi: 0.8, target_roi: 2.5 },
      { impressions: 65_000, ctr: 0.035, live_viewers: 5_000, orders: 70, gpm: 850, spend: 6_500, pay_roi: 1.1, target_roi: 2.8 },
      { impressions: 90_000, ctr: 0.045, live_viewers: 7_500, orders: 120, gpm: 1_000, spend: 9_000, pay_roi: 1.4, target_roi: 3 },
      { impressions: 45_000, ctr: 0.04, live_viewers: 4_000, orders: 55, gpm: 920, spend: 5_000, pay_roi: 1.3, target_roi: 2.7 }
    ]
  },
  {
    group: "DATA_CONFLICT_SAFETY",
    expected: "DATA_READINESS",
    variants: [
      { impressions: null, ctr: null, live_viewers: 4_000, orders: 30, gpm: null, spend: 2_000, pay_roi: 2, target_roi: 2.5 },
      { impressions: 50_000, ctr: null, live_viewers: null, orders: 20, gpm: 300, spend: 1_500, pay_roi: null, target_roi: 2.5 },
      { impressions: null, ctr: 0.04, live_viewers: 5_000, orders: null, gpm: 500, spend: 2_200, pay_roi: 1.8, target_roi: null },
      { impressions: 70_000, ctr: 0.04, live_viewers: null, orders: 0, gpm: null, spend: 4_000, pay_roi: null, target_roi: 2.5 }
    ]
  }
];

export const syntheticDiagnosisCases: SyntheticDiagnosisCase[] = scenarios.flatMap((scenario) =>
  scenario.variants.map((metrics, index) => ({
    id: `${scenario.group.toLowerCase()}-${index + 1}`,
    group: scenario.group,
    expectedMainProblemTag: scenario.expected,
    input: buildInput(metrics, scenario.group)
  }))
);

function buildInput(values: Record<string, number | null>, group: SyntheticDiagnosisCase["group"]): DecisionEngineInput {
  const metrics: VisibleMetric[] = Object.entries(values).flatMap(([key, value]) => value == null ? [] : [{
    key: key as MetricKey,
    name: key,
    value,
    source: "table" as const,
    metricSource: "TABLE" as const,
    confidence: 1
  }]);
  if (group === "DATA_CONFLICT_SAFETY") {
    metrics.push({ key: "wrong_price_promise_risk", name: "价格承诺风险", value: 1, source: "manual", metricSource: "MANUAL_INPUT", confidence: 1 });
  }
  return {
    businessType: "DOUYIN_LOCAL_LIFE",
    subject: {
      subjectType: "SERVICE_PROVIDER",
      operatorType: "SERVICE_PROVIDER_LIVE",
      cooperationType: "SERVICE_PROVIDER_CONTRACT",
      controlLevel: "MEDIUM",
      confidence: 1,
      serviceProviderName: "合成服务商",
      serviceMode: "代直播",
      serviceFee: null
    },
    pageTitle: "合成五路线任务",
    sourceUrl: "",
    metrics,
    tables: [
      { routeKey: "LIVE_PRODUCT_TAB", pageType: "LIVE_DATA_SCREEN", rows: [["商品", "曝光", "点击", "订单"], ["A", 10_000, group === "PRODUCT" ? 30 : 500, group === "PRODUCT" ? 1 : 40]] },
      { routeKey: "TASK_TABLE", pageType: "TASK_TABLE", rows: [["单元", "消耗", "ROI"], ["单元A", values.spend || 0, values.pay_roi || 0]] }
    ],
    visibleText: "",
    networkJsonSummary: [],
    dataReviewStatus: "REVIEWED",
    metricLayer: "REVIEWED_METRIC",
    reviewCoverage: { confirmedCount: metrics.length + 8, modifiedCount: 0, ignoredCount: 0, pendingCount: 0, totalCount: metrics.length + 8 },
    collectionQuality: {
      requiredRoutes: fiveRoutes,
      routes: fiveRoutes.map((routeKey) => ({ routeKey, state: "FRESH", lastCollectedAt: new Date().toISOString(), ageMs: 0 })),
      completeness: 1,
      missingRoutes: [],
      staleRoutes: [],
      blocksStrongActions: false
    }
  };
}
