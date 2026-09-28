import { describe, expect, it } from "vitest";
import { syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import type { DecisionEngineInput, VisibleMetric } from "@douyin-local-life/shared";
import { buildServerDiagnosisInsights } from "./server-insights.js";

describe("server diagnosis insights", () => {
  it("builds deterministic full-domain efficiency and order structure from reviewed metrics", () => {
    const input = inputWithMetrics([
      fullDomainMetric("full_domain_gmv", "全域成交金额", 119_785.4),
      fullDomainMetric("spend", "全域消耗", 1_912.77),
      fullDomainMetric("full_domain_pay_roi", "全域支付 ROI", 62.62),
      fullDomainMetric("full_domain_orders", "全域成交订单数", 4_671)
    ]);

    const insights = buildServerDiagnosisInsights(input);

    expect(insights.map((item) => item.title)).toEqual(["全域投放投入产出已确认", "全域订单结构已确认"]);
    expect(insights[0]?.conclusion).toContain("119785.40 元");
    expect(insights[0]?.conclusion).toContain("1912.77 元");
    expect(insights[0]?.conclusion).toContain("62.62");
    expect(insights[1]?.conclusion).toContain("4671 单");
    expect(insights[1]?.conclusion).toContain("25.64 元");
    expect(insights[0]?.missingEvidence[0]).toContain("自然或商业流量");
  });

  it("keeps live-room metrics in their own live route insight", () => {
    const input = inputWithMetrics([
      liveMetric("live_viewers", "累计观看人数", 5_000),
      liveMetric("orders", "成交订单数", 180)
    ]);

    const insights = buildServerDiagnosisInsights(input);

    expect(insights[0]?.title).toBe("直播间承接观察值");
    expect(insights[0]?.conclusion).toContain("5000");
    expect(insights[0]?.conclusion).toContain("180");
    expect(insights[0]?.conclusion).toContain("36 单");
  });

  it("does not derive a full-domain ratio from an unscoped ordinary spend metric", () => {
    const input = inputWithMetrics([
      fullDomainMetric("full_domain_gmv", "全域成交金额", 10_000),
      {
        key: "spend",
        name: "消耗",
        value: 1_000,
        source: "network",
        confidence: 1,
        rawEvidence: { sourceType: "test", routeKey: "LOCAL_PROMOTION_DASHBOARD" }
      }
    ]);

    const insights = buildServerDiagnosisInsights(input);

    expect(insights.find((item) => item.title === "全域投放投入产出已确认")).toBeUndefined();
  });
});

function inputWithMetrics(metrics: VisibleMetric[]): DecisionEngineInput {
  return {
    ...syntheticDiagnosisCases[0]!.input,
    metrics
  };
}

function fullDomainMetric(key: VisibleMetric["key"], name: string, value: number): VisibleMetric {
  return {
    key,
    name,
    value,
    source: "network",
    confidence: 1,
    rawEvidence: {
      sourceType: "test",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      semanticScope: "FULL_DOMAIN"
    }
  };
}

function liveMetric(key: VisibleMetric["key"], name: string, value: number): VisibleMetric {
  return {
    key,
    name,
    value,
    source: "network",
    confidence: 1,
    rawEvidence: {
      sourceType: "test",
      routeKey: "LIVE_DATA_SCREEN",
      semanticScope: "PAYMENT"
    }
  };
}
