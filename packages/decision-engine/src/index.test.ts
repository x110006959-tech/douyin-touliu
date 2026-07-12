import { describe, expect, it } from "vitest";
import { runDecisionRules } from "./index";
import type { DecisionEngineInput, VisibleMetric } from "@douyin-local-life/shared";

function metric(key: string, name: string, value: number | string | null): VisibleMetric {
  return { key, name, value, source: "manual" };
}

function completeMetrics(overrides: VisibleMetric[] = []) {
  const base = [
    metric("gross_profit_roi", "毛利 ROI", 1.5),
    metric("spend", "消耗", 1000),
    metric("orders", "成交订单数", 20),
    metric("impressions", "曝光量", 20000),
    metric("ctr", "点击率", 0.035),
    metric("gpm", "GPM", 120),
    metric("clicks", "点击量", 700),
    metric("live_viewers", "直播间观看人数", 6000),
    metric("cpa", "转化成本", 50),
    metric("target_cpa", "目标 CPA", 80),
    metric("daily_budget", "日预算", 2000)
  ];
  const overrideKeys = new Set(overrides.map((item) => item.key));
  return [...base.filter((item) => !overrideKeys.has(item.key)), ...overrides];
}

function input(overrides: Partial<DecisionEngineInput> = {}): DecisionEngineInput {
  return {
    businessType: "DOUYIN_LOCAL_LIFE",
    subject: {
      subjectType: "SERVICE_PROVIDER",
      operatorType: "SERVICE_PROVIDER_LIVE",
      cooperationType: "SERVICE_PROVIDER_CONTRACT",
      controlLevel: "MEDIUM",
      confidence: 0.9,
      serviceProviderName: "测试服务商",
      serviceMode: "代播",
      serviceFee: 200
    },
    pageTitle: "直播数据大屏",
    sourceUrl: "https://life.douyin.com/dashboard",
    metrics: completeMetrics(),
    tables: [],
    visibleText: "",
    networkJsonSummary: [],
    targetRoi: 1.4,
    targetCpa: 80,
    dataReviewStatus: "REVIEWED",
    metricLayer: "REVIEWED_METRIC",
    ...overrides
  };
}

describe("decision-engine", () => {
  it("adds manual check when ROI is missing", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([metric("gross_profit_roi", "毛利 ROI", null)])
      })
    );

    expect(result.manualCheckItems.some((item) => item.title.includes("ROI"))).toBe(true);
    expect(result.actionProposals.some((proposal) => proposal.actionType === "REQUEST_MANUAL_REVIEW")).toBe(true);
    expect(result.actionProposals.some((proposal) => proposal.actionType === "INCREASE_BUDGET")).toBe(false);
  });

  it("marks ROI below 1 as HIGH risk", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([metric("gross_profit_roi", "毛利 ROI", 0.8)])
      })
    );

    expect(result.riskLevel).toBe("HIGH");
    expect(result.actionProposals.some((proposal) => proposal.actionType === "PAUSE_TASK")).toBe(true);
  });

  it("flags high spend with zero orders", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([
          metric("gross_profit_roi", "毛利 ROI", 0.9),
          metric("spend", "消耗", 1200),
          metric("orders", "成交订单数", 0)
        ])
      })
    );

    expect(result.riskLevel).toBe("HIGH");
    expect(result.actionProposals.some((proposal) => proposal.actionType === "PAUSE_TASK")).toBe(true);
    expect(result.actionProposals.some((proposal) => proposal.actionType === "CHECK_LIVE_ROOM")).toBe(true);
  });

  it("suggests creative check when impressions are high and CTR is low", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([
          metric("impressions", "曝光量", 50000),
          metric("ctr", "点击率", 0.005)
        ])
      })
    );

    expect(result.actionProposals.some((proposal) => proposal.actionType === "CHECK_CREATIVE")).toBe(true);
  });

  it("blocks strong actions when too much data is missing", () => {
    const result = runDecisionRules(
      input({
        metrics: [metric("verify_roi", "核销 ROI", 0.6)]
      })
    );
    const actions = result.actionProposals.map((proposal) => proposal.actionType);

    expect(result.dataQuality.blocksStrongActions).toBe(true);
    expect(actions).not.toContain("PAUSE_TASK");
    expect(actions).not.toContain("INCREASE_BUDGET");
    expect(actions).not.toContain("DECREASE_BUDGET");
    expect(actions.every((action) => action === "OBSERVE" || action === "REQUEST_MANUAL_REVIEW")).toBe(true);
  });

  it("requires approval for HIGH risk actions", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([metric("gross_profit_roi", "毛利 ROI", 0.7)])
      })
    );
    const highRiskActions = result.actionProposals.filter((proposal) => proposal.riskLevel === "HIGH");

    expect(highRiskActions.length).toBeGreaterThan(0);
    expect(highRiskActions.every((proposal) => proposal.requiresApproval)).toBe(true);
  });

  it("prevents strong actions when confidence is below 0.7", () => {
    const result = runDecisionRules(
      input({
        subject: {
          subjectType: "SERVICE_PROVIDER",
          operatorType: "SERVICE_PROVIDER_LIVE",
          cooperationType: "SERVICE_PROVIDER_CONTRACT",
          controlLevel: "MEDIUM",
          confidence: 0.5,
          serviceProviderName: "测试服务商",
          serviceMode: "代播",
          serviceFee: 200
        },
        metrics: completeMetrics([metric("gross_profit_roi", "毛利 ROI", 0.7)])
      })
    );
    const actions = result.actionProposals.map((proposal) => proposal.actionType);

    expect(result.confidence).toBeLessThan(0.7);
    expect(actions).not.toContain("PAUSE_TASK");
    expect(actions).not.toContain("INCREASE_BUDGET");
    expect(actions).not.toContain("DECREASE_BUDGET");
    expect(actions.every((action) => action === "OBSERVE" || action === "REQUEST_MANUAL_REVIEW")).toBe(true);
  });

  it("lowers confidence and asks for manual check when data is unreviewed", () => {
    const reviewed = runDecisionRules(input({ dataReviewStatus: "REVIEWED", metricLayer: "REVIEWED_METRIC" }));
    const unreviewed = runDecisionRules(input({ dataReviewStatus: "UNREVIEWED", metricLayer: "NORMALIZED_METRIC" }));

    expect(unreviewed.confidence).toBeLessThan(reviewed.confidence);
    expect(unreviewed.manualCheckItems.some((item) => item.title.includes("人工复核") || item.reason.includes("人工复核"))).toBe(true);
  });

  it("ignores unknown metric keys for strong ROI actions", () => {
    const result = runDecisionRules(
      input({
        metrics: [
          metric("unknown", "自定义低值字段", 0.2),
          metric("spend", "消耗", 1000),
          metric("orders", "成交订单数", 10),
          metric("impressions", "曝光量", 20000),
          metric("ctr", "点击率", 0.03),
          metric("gpm", "GPM", 120)
        ]
      })
    );
    const actions = result.actionProposals.map((proposal) => proposal.actionType);

    expect(result.manualCheckItems.some((item) => item.title.includes("ROI"))).toBe(true);
    expect(actions).not.toContain("PAUSE_TASK");
    expect(actions).not.toContain("DECREASE_BUDGET");
  });

  it("blocks strong actions when the subject is pending even with high subject confidence", () => {
    const result = runDecisionRules(
      input({
        subject: {
          subjectType: "SUBJECT_PENDING",
          operatorType: "OPERATOR_PENDING",
          cooperationType: "COOPERATION_PENDING",
          controlLevel: "PENDING",
          confidence: 0.9
        },
        dataReviewStatus: "REVIEWED",
        metrics: completeMetrics([metric("verify_roi", "核销 ROI", 0.5)])
      })
    );
    const actions = result.actionProposals.map((proposal) => proposal.actionType);

    expect(result.dataQuality.subjectReady).toBe(false);
    expect(result.dataQuality.blocksStrongActions).toBe(true);
    expect(actions.every((action) => action === "OBSERVE" || action === "REQUEST_MANUAL_REVIEW")).toBe(true);
  });

  it("blocks strong actions for unreviewed data", () => {
    const result = runDecisionRules(
      input({
        dataReviewStatus: "UNREVIEWED",
        metricLayer: "NORMALIZED_METRIC",
        metrics: completeMetrics([metric("gross_profit_roi", "毛利 ROI", 0.5)])
      })
    );

    expect(result.dataQuality.reviewReady).toBe(false);
    expect(result.actionProposals.every((proposal) => proposal.actionType === "OBSERVE" || proposal.actionType === "REQUEST_MANUAL_REVIEW")).toBe(true);
  });

  it("blocks strong actions when reviewed critical metrics still have low source confidence", () => {
    const domMetrics = completeMetrics([metric("gross_profit_roi", "毛利 ROI", 0.5)]).map((item) => ({
      ...item,
      source: "dom" as const,
      metricSource: "DOM_TEXT" as const,
      confidence: 0.6
    }));
    const result = runDecisionRules(input({ dataReviewStatus: "REVIEWED", metrics: domMetrics }));

    expect(result.dataQuality.lowConfidenceFields?.length).toBeGreaterThan(0);
    expect(result.actionProposals.some((proposal) => proposal.actionType === "PAUSE_TASK")).toBe(false);
  });

  it("keeps diagnosis risk aligned with guarded output", () => {
    const result = runDecisionRules(
      input({
        subject: { ...input().subject, confidence: 0.69 },
        dataReviewStatus: "REVIEWED"
      })
    );

    expect(result.diagnosis).toContain(`风险=${result.riskLevel}`);
    expect(result.diagnosis).toContain(result.actionProposals[0]?.title || "继续观察");
  });

  it("calculates service-provider after-cost gross-profit ROI", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([
          metric("gross_profit_roi", "毛利 ROI", null),
          metric("gross_profit", "核销毛利", 1800),
          metric("merchant_subsidy", "商家补贴", 100),
          metric("activity_verified", "活动已核验", 1),
          metric("platform_subsidy", "平台补贴", 100)
        ])
      })
    );

    expect(result.calculatedMetrics?.serviceProviderAfterCost).toBe(1200);
    expect(result.calculatedMetrics?.serviceProviderGrossProfitRoi).toBe(1.5);
    expect(result.diagnosis).toContain("服务商后成本=1200");
  });

  it("recommends renegotiating service fees when account ROI is good but after-cost margin is weak", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([
          metric("gross_profit_roi", "毛利 ROI", null),
          metric("verify_roi", "核销 ROI", 1.8),
          metric("gross_profit", "核销毛利", 900)
        ])
      })
    );

    expect(result.actionProposals.some((proposal) => proposal.actionType === "RENEGOTIATE_SERVICE_FEE")).toBe(true);
  });

  it("prioritizes reputation and fulfillment risk before ROI", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([metric("refund_rate", "退款率", 0.2)])
      })
    );

    expect(result.riskLevel).toBe("HIGH");
    expect(result.actionProposals[0]?.actionType).toBe("PAUSE_TASK");
    expect(result.actionProposals.some((proposal) => proposal.actionType === "REPAIR_REPUTATION")).toBe(true);
  });

  it("does not pause a zero-order stream before the minimum sample", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([
          metric("spend", "消耗", 0.01),
          metric("orders", "成交订单数", 0),
          metric("clicks", "点击量", 1),
          metric("live_viewers", "直播间观看人数", 5),
          metric("live_duration_minutes", "开播时长", 2)
        ])
      })
    );

    expect(result.actionProposals.some((proposal) => proposal.actionType === "PAUSE_TASK")).toBe(false);
    expect(result.actionProposals.some((proposal) => proposal.actionType === "OBSERVE")).toBe(true);
  });

  it("blocks strong actions when a required collection route is stale", () => {
    const result = runDecisionRules(input({
      collectionQuality: {
        requiredRoutes: ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN"],
        routes: [
          { routeKey: "LOCAL_PROMOTION_DASHBOARD", state: "FRESH", lastCollectedAt: "2026-07-12T04:00:00.000Z", ageMs: 0 },
          { routeKey: "LIVE_DATA_SCREEN", state: "STALE", lastCollectedAt: "2026-07-12T03:45:00.000Z", ageMs: 900000 }
        ],
        completeness: 0.5,
        missingRoutes: [],
        staleRoutes: ["LIVE_DATA_SCREEN"],
        blocksStrongActions: true
      }
    }));

    expect(result.dataQuality.blocksStrongActions).toBe(true);
    expect(result.dataQuality.blockingReasons).toContain("采集路线已过期：LIVE_DATA_SCREEN");
  });
});
