import { describe, expect, it } from "vitest";
import { runDecisionRules } from "./index";
import type { DecisionEngineInput, VisibleMetric } from "@douyin-local-life/shared";

function metric(key: string, name: string, value: number | string | null): VisibleMetric {
  return { key, name, value, source: "manual" };
}

describe("shared metric parsing", () => {
  it("uses the shared Chinese unit and percentage contract", () => {
    const result = runDecisionRules(input({
      metrics: completeMetrics([
        metric("spend", "消耗", "4万"),
        metric("ctr", "点击率", "4%"),
        metric("pay_roi", "整体支付 ROI", "4")
      ])
    }));
    expect(result.businessAnalysis?.performanceSnapshot).toEqual(expect.arrayContaining([
      expect.stringContaining("消耗=40000"),
      expect.stringContaining("ROI=4")
    ]));
  });
});

function completeMetrics(overrides: VisibleMetric[] = []) {
  const base = [
    metric("gross_profit_roi", "毛利 ROI", 1.5),
    metric("pay_roi", "整体支付 ROI", 1.5),
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
  it("keeps managed live focused on live growth instead of service-provider profit", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([
          metric("gross_profit_roi", "毛利 ROI", null),
          metric("pay_roi", "整体支付 ROI", 1.59),
          metric("platform_subsidy", "平台补贴", 300),
          metric("activity_verified", "活动已核验", "是")
        ])
      })
    );

    expect(result.businessAnalysis?.mode).toBe("MANAGED_LIVE_GROWTH");
    expect(result.dataQuality.missingFields).not.toContain("服务商后毛利 ROI");
    expect(result.businessAnalysis?.findings.some((finding) => finding.dimension === "PROFITABILITY")).toBe(false);
    expect(result.businessAnalysis?.recommendations.some((recommendation) => recommendation.title.includes("平台权益"))).toBe(true);
    expect(result.businessAnalysis?.metricExplanations.find((item) => item.title === "已核验平台活动权益")?.use).toContain("成交转化");
    expect(result.businessAnalysis?.metricExplanations.some((item) => item.title === "服务商后毛利 ROI")).toBe(false);
    expect(result.calculatedMetrics).toBeUndefined();
    expect(result.manualCheckItems.some((item) => item.title.includes("服务商后毛利"))).toBe(false);
  });

  it("keeps full service-provider finance checks for the later operation mode", () => {
    const result = runDecisionRules(
      input({
        subject: { ...input().subject, operatorType: "SERVICE_PROVIDER_OPERATION", serviceMode: "代运营" },
        metrics: completeMetrics([metric("gross_profit_roi", "毛利 ROI", null)])
      })
    );

    expect(result.businessAnalysis?.mode).toBe("FULL_BUSINESS");
    expect(result.manualCheckItems.some((item) => item.title === "服务商后毛利 ROI 缺失")).toBe(true);
    expect(result.businessAnalysis?.findings.some((finding) => finding.dimension === "PROFITABILITY")).toBe(true);
    expect(result.businessAnalysis?.metricExplanations.some((item) => item.title === "服务商后毛利 ROI")).toBe(true);
  });

  it("treats unverified vouchers as a conversion resource that must be checked first", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([
          metric("platform_subsidy", "平台补贴", 200),
          metric("ad_coupon", "投放券", 100),
          metric("activity_verified", "活动已核验", "否")
        ])
      })
    );

    expect(result.manualCheckItems.some((item) => item.title === "活动权益未核验")).toBe(true);
    expect(result.actionProposals.some((proposal) => proposal.actionType === "VERIFY_ACTIVITY")).toBe(true);
    expect(result.businessAnalysis?.recommendations.some((recommendation) => recommendation.title.includes("先核验代金券"))).toBe(true);
    expect(result.businessAnalysis?.performanceSnapshot.some((fact) => fact.includes("待核验=300元"))).toBe(true);
  });

  it("marks ROI below 1 as HIGH risk", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 0.8)])
      })
    );

    expect(result.riskLevel).toBe("HIGH");
    expect(result.actionProposals.some((proposal) => proposal.actionType === "PAUSE_TASK")).toBe(true);
  });

  it("flags high spend with zero orders", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([
          metric("pay_roi", "整体支付 ROI", 0.9),
          metric("spend", "消耗", 1200),
          metric("orders", "成交订单数", 0)
        ])
      })
    );

    expect(result.riskLevel).toBe("HIGH");
    expect(result.actionProposals.some((proposal) => proposal.actionType === "PAUSE_TASK")).toBe(true);
    expect(result.actionProposals.some((proposal) => proposal.actionType === "CHECK_LIVE_ROOM")).toBe(true);
    expect(result.businessAnalysis?.recommendations.some((recommendation) => recommendation.dimension === "LIVE_ROOM")).toBe(true);
    expect(result.businessAnalysis?.recommendations.some((recommendation) => recommendation.dimension === "PRODUCT")).toBe(false);
    expect(result.businessAnalysis?.findings.some((finding) => finding.dimension === "PRODUCT" && finding.title.includes("缺少"))).toBe(true);
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

    expect(result.dataQuality.globalSafetyBlock).toBe(false);
    expect(result.dataQuality.actionEligibility?.PAUSE_TASK?.eligible).toBe(false);
    expect(actions).not.toContain("PAUSE_TASK");
    expect(actions).not.toContain("INCREASE_BUDGET");
    expect(actions).not.toContain("DECREASE_BUDGET");
    expect(actions.every((action) => action === "OBSERVE" || action === "REQUEST_MANUAL_REVIEW")).toBe(true);
  });

  it("requires approval for HIGH risk actions", () => {
    const result = runDecisionRules(
      input({
        metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 0.7)])
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
        metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 0.7)])
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
    const unreviewed = runDecisionRules(input({ dataReviewStatus: "UNREVIEWED", metricLayer: "REVIEWED_METRIC" }));

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
        metricLayer: "REVIEWED_METRIC",
        metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 0.5)])
      })
    );

    expect(result.dataQuality.reviewReady).toBe(false);
    expect(result.actionProposals.every((proposal) => proposal.actionType === "OBSERVE" || proposal.actionType === "REQUEST_MANUAL_REVIEW")).toBe(true);
  });

  it("blocks strong actions when reviewed critical metrics still have low source confidence", () => {
    const domMetrics = completeMetrics([metric("pay_roi", "整体支付 ROI", 0.5)]).map((item) => ({
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
        subject: { ...input().subject, operatorType: "SERVICE_PROVIDER_OPERATION", serviceMode: "代运营" },
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
        subject: { ...input().subject, operatorType: "SERVICE_PROVIDER_OPERATION", serviceMode: "代运营" },
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

  it("does not let an unknown optional field globally block unrelated actions", () => {
    const result = runDecisionRules(input({ metrics: completeMetrics([metric("new_ab_metric", "灰度新指标", 12)]) }));
    expect(result.dataQuality.globalSafetyBlock).toBe(false);
    expect(result.dataQuality.actionEligibility?.INCREASE_BUDGET?.eligible).toBe(true);
  });

  it("limits missing ROI to ROI-dependent actions", () => {
    const result = runDecisionRules(input({ metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", null)]) }));
    expect(result.dataQuality.globalSafetyBlock).toBe(false);
    expect(result.dataQuality.actionEligibility?.INCREASE_BUDGET?.eligible).toBe(false);
    expect(result.dataQuality.actionEligibility?.REPAIR_REPUTATION?.eligible).toBe(true);
  });

  it("only returns evidence-backed guidance and official rule references", () => {
    const result = runDecisionRules(input());

    expect(result.businessAnalysis?.headline).toBeTruthy();
    expect(result.businessAnalysis?.recommendations.every((item) =>
      (item.evidence?.length || 0) > 0 && item.steps.length > 0 && item.verifyMetrics.length > 0
    )).toBe(true);
    expect(result.businessAnalysis?.recommendations.some((item) => item.title.includes("自然流量与商业流量对照"))).toBe(false);
    expect(result.businessAnalysis?.ruleReferences.some((reference) => reference.url.includes("lifexue.com/rule"))).toBe(true);
  });

  it("names concrete products and produces a conservative traffic-primary-acceptance order", () => {
    const result = runDecisionRules(input({
      tables: [{
        routeKey: "LIVE_PRODUCT_TAB",
        rows: [
          ["商品ID", "商品名称", "售价", "秒杀价", "支付金额", "支付订单数", "曝光", "点击", "详情访问", "提单访问", "提单率", "转化率"],
          ["p-a", "9.9元引流券", "19.9", "9.9", "500", "10", "10000", "1000", "500", "100", "20%", "10%"],
          ["p-b", "双人主套餐", "69.9", "59.9", "20000", "200", "10000", "500", "350", "250", "71.4%", "80%"],
          ["p-c", "到店承接套餐", "49.9", "39.9", "9000", "190", "10000", "600", "400", "380", "95%", "50%"]
        ]
      }]
    }));

    const recommendation = result.businessAnalysis?.recommendations.find((item) => item.dimension === "PRODUCT");
    expect(recommendation?.title).toContain("9.9元引流券 → 双人主套餐 → 到店承接套餐");
    expect(recommendation?.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("引流款：9.9元引流券（ID p-a）"),
      expect.stringContaining("主推款：双人主套餐（ID p-b）"),
      expect.stringContaining("承接款：到店承接套餐（ID p-c）")
    ]));
    expect(recommendation?.steps.join(" ")).toContain("每轮只改变商品顺序、权益或讲解中的一个变量");
  });

  it("does not rank tiny samples or abnormal product ratios", () => {
    const result = runDecisionRules(input({
      tables: [{
        routeKey: "LIVE_PRODUCT_TAB",
        rows: [
          ["商品ID", "商品名称", "售价", "支付金额", "支付订单", "曝光", "点击", "详情访问", "提单访问", "转化率"],
          ["p-1", "极小样本一", "9.9", "99", "1", "1", "1", "1", "1", "100%"],
          ["p-2", "异常比例二", "19.9", "199", "2", "10", "14", "13", "12", "138%"],
          ["p-3", "极小样本三", "29.9", "0", "0", "0", "0", "0", "0", "0%"]
        ]
      }]
    }));

    expect(result.businessAnalysis?.findings.some((item) => item.title.includes("样本不足"))).toBe(true);
    expect(result.businessAnalysis?.recommendations.some((item) => item.dimension === "PRODUCT")).toBe(false);
  });

  it("does not use an explicitly abnormal percentage for primary or acceptance ranking", () => {
    const result = runDecisionRules(input({
      tables: [{
        routeKey: "LIVE_PRODUCT_TAB",
        rows: [
          ["商品ID", "商品名称", "售价", "支付金额", "支付订单", "曝光", "点击", "详情访问", "提单访问", "提单率", "转化率"],
          ["bad", "异常转化商品", "9.9", "50000", "500", "20000", "2000", "1200", "800", "66.7%", "138%"],
          ["a", "正常引流商品", "12.9", "1000", "20", "20000", "2500", "1300", "300", "23.1%", "6.7%"],
          ["b", "正常主推商品", "69.9", "30000", "300", "20000", "1200", "900", "500", "55.6%", "60%"],
          ["c", "正常承接商品", "39.9", "12000", "240", "20000", "1500", "1100", "900", "81.8%", "26.7%"]
        ]
      }]
    }));

    const evidence = result.businessAnalysis?.recommendations.find((item) => item.dimension === "PRODUCT")?.evidence || [];
    expect(evidence).not.toEqual(expect.arrayContaining([expect.stringContaining("主推款：异常转化商品")]));
    expect(evidence).not.toEqual(expect.arrayContaining([expect.stringContaining("承接款：异常转化商品")]));
  });

  it("does not reuse one eligible product to fill multiple product roles", () => {
    const result = runDecisionRules(input({
      tables: [{
        routeKey: "LIVE_PRODUCT_TAB",
        rows: [
          ["商品ID", "商品名称", "售价", "支付金额", "支付订单", "曝光", "点击", "详情访问", "提单访问"],
          ["only", "唯一成熟商品", "19.9", "10000", "100", "20000", "2000", "1200", "600"],
          ["tiny-a", "小样本商品 A", "29.9", "10", "1", "2", "1", "1", "1"],
          ["tiny-b", "小样本商品 B", "39.9", "0", "0", "3", "1", "1", "0"]
        ]
      }]
    }));

    expect(result.businessAnalysis?.findings.some((item) => item.dimension === "PRODUCT" && item.title.includes("样本不足"))).toBe(true);
    expect(result.businessAnalysis?.recommendations.some((item) => item.title.startsWith("商品验证顺序："))).toBe(false);
  });

  it("reports missing product columns without emitting a generic product template", () => {
    const result = runDecisionRules(input({
      tables: [{ routeKey: "LIVE_PRODUCT_TAB", rows: [["商品名称", "支付金额", "支付订单"], ["套餐 A", "1000", "10"]] }]
    }));

    const productFinding = result.businessAnalysis?.findings.find((item) => item.dimension === "PRODUCT");
    expect(productFinding?.evidence).toEqual(expect.arrayContaining(["缺少列：售价或秒杀价", "缺少列：曝光", "缺少列：点击", "缺少列：详情访问", "缺少列：提单访问"]));
    expect(result.businessAnalysis?.recommendations.some((item) => item.dimension === "PRODUCT")).toBe(false);
  });

  it("uses target ROI 60 as a no-budget-increase guardrail and reallocates only toward mature winners", () => {
    const result = runDecisionRules(input({
      targetRoi: 60,
      metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 57.11), metric("target_roi", "目标 ROI", 60)]),
      tables: [{
        routeKey: "TASK_TABLE",
        rows: [
          ["投流单元", "消耗", "ROI", "订单", "曝光", "点击率"],
          ["达标单元 A", "3000", "63.5", "35", "20000", "3.2%"],
          ["低效单元 B", "1800", "48", "12", "15000", "1.1%"],
          ["新单元 C", "20", "88", "0", "50", "8%"]
        ]
      }]
    }));

    const recommendation = result.businessAnalysis?.recommendations.find((item) => item.title.includes("总预算不增加"));
    expect(recommendation?.reason).toContain("账号 ROI=57.11 低于目标 60");
    expect(recommendation?.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("达标候选：达标单元 A"),
      expect.stringContaining("低于目标：低效单元 B"),
      expect.stringContaining("样本不足：新单元 C")
    ]));
    expect(recommendation?.steps.join(" ")).toContain("停止扩流验证");
  });

  it("parses table units by exact header semantics without mixing ROI and percentages", () => {
    const valid = runDecisionRules(input({
      targetRoi: 3,
      metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 2), metric("target_roi", "目标 ROI", 3)]),
      tables: [{
        routeKey: "TASK_TABLE",
        rows: [
          ["投流单元", "消耗(元)", "ROI(倍)", "订单", "曝光", "点击率(%)"],
          ["语义正确单元", "4万", "4", "20", "4千", "4"]
        ]
      }]
    }));
    const validEvidence = valid.businessAnalysis?.recommendations.find((item) => item.title.includes("总预算不增加"))?.evidence || [];
    expect(validEvidence).toEqual(expect.arrayContaining([
      expect.stringContaining("语义正确单元，消耗=40000元，ROI=4")
    ]));

    const invalidRoi = runDecisionRules(input({
      targetRoi: 3,
      metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 2), metric("target_roi", "目标 ROI", 3)]),
      tables: [{
        routeKey: "TASK_TABLE",
        rows: [["投流单元", "消耗", "ROI", "订单", "曝光"], ["百分号误用单元", "4万", "4%", "20", "4千"]]
      }]
    }));
    expect(invalidRoi.businessAnalysis?.recommendations.some((item) => item.title.includes("总预算不增加"))).toBe(false);
    expect(invalidRoi.businessAnalysis?.recommendations.find((item) => item.title === "当前数据中没有可扩流候选")?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining("ROI=缺失")])
    );
  });

  it("never searches later rows for a more convenient table header", () => {
    const result = runDecisionRules(input({
      targetRoi: 3,
      metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 2), metric("target_roi", "目标 ROI", 3)]),
      tables: [{
        routeKey: "TASK_TABLE",
        rows: [["任务数据说明"], ["投流单元", "消耗", "ROI"], ["错位单元", "4000", "4"]]
      }]
    }));

    expect(result.businessAnalysis?.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "投流单元表缺少目标 ROI 分析所需列" })
    ]));
    expect(result.businessAnalysis?.recommendations.some((item) => item.title.includes("总预算不增加"))).toBe(false);
  });

  it("states that no scalable unit exists when every mature unit misses the target", () => {
    const result = runDecisionRules(input({
      targetRoi: 60,
      metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 57.11), metric("target_roi", "目标 ROI", 60)]),
      tables: [{
        routeKey: "TASK_TABLE",
        rows: [
          ["单元名称", "消耗", "ROI", "订单", "曝光"],
          ["低效单元 A", "2000", "55", "20", "20000"],
          ["低效单元 B", "1500", "42", "15", "15000"]
        ]
      }]
    }));

    expect(result.businessAnalysis?.recommendations.some((item) => item.title === "当前数据中没有可扩流候选")).toBe(true);
    expect(result.businessAnalysis?.recommendations.some((item) => item.title.includes("增加预算"))).toBe(false);
  });

  it("uses the more complete local-promotion table when the task table lacks unit evidence", () => {
    const result = runDecisionRules(input({
      targetRoi: 60,
      metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 57.11), metric("target_roi", "目标 ROI", 60)]),
      tables: [
        { routeKey: "TASK_TABLE", rows: [["任务名称", "消耗"], ["字段不完整任务", "1000"]] },
        {
          routeKey: "LOCAL_PROMOTION_DASHBOARD",
          rows: [
            ["单元名称", "消耗", "ROI", "订单", "曝光", "点击率"],
            ["本地推达标单元", "2600", "62", "30", "18000", "3.1%"],
            ["本地推低效单元", "1400", "45", "12", "12000", "1.2%"]
          ]
        }
      ]
    }));

    const recommendation = result.businessAnalysis?.recommendations.find((item) => item.title.includes("总预算不增加"));
    expect(recommendation?.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("达标候选：本地推达标单元"),
      expect.stringContaining("低于目标：本地推低效单元")
    ]));
  });

  it("does not generate an ROI allocation plan from an unreviewed target ROI", () => {
    const result = runDecisionRules(input({
      dataReviewStatus: "UNREVIEWED",
      metricLayer: "REVIEWED_METRIC",
      targetRoi: 60,
      metrics: completeMetrics([metric("pay_roi", "整体支付 ROI", 57.11), metric("target_roi", "目标 ROI", 60)]),
      tables: [{
        routeKey: "TASK_TABLE",
        rows: [
          ["投流单元", "消耗", "ROI", "订单", "曝光"],
          ["达标但未复核单元", "3000", "65", "30", "20000"],
          ["低效但未复核单元", "1600", "45", "12", "15000"]
        ]
      }]
    }));

    expect(result.businessAnalysis?.recommendations.some((item) => item.title.includes("总预算不增加"))).toBe(false);
    expect(result.businessAnalysis?.recommendations.some((item) => item.title === "当前数据中没有可扩流候选")).toBe(false);
  });
});
