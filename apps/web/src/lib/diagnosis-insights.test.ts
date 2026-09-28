import { describe, expect, it } from "vitest";
import { buildTrustedBusinessInterpretation } from "./diagnosis-insights";
import type { DiagnosisTrustedFactsView } from "@douyin-local-life/shared/diagnosis";

const baseFacts: DiagnosisTrustedFactsView = {
  version: 1,
  scenario: "POST_LIVE_REVIEW",
  dataFreshness: { latestCollectedAt: "2026-09-18T12:00:00.000Z", summary: "本次采集时间已确认" },
  target: { status: "MET", actual: 62.62, target: 60, message: "全域支付 ROI 62.62 已达到目标 60。" },
  trend: { status: "INSUFFICIENT", summary: "缺少最近两个完整 15 分钟窗口数据，暂不能判断近期趋势", recentTrend: null },
  cause: { status: "UNCONFIRMED", message: "原因尚未确认" },
  metricGroups: [{
    id: "FULL_DOMAIN",
    label: "全域投放口径",
    sourceLabel: "本地推总览（全域口径）",
    metrics: [
      { metricKey: "full_domain_pay_roi", metricLabel: "全域支付 ROI", value: 62.62, unit: null, sourceLabel: "本地推总览", capturedAt: "2026-09-18T12:00:00.000Z", observationPeriod: "本场", semanticScope: "全域" },
      { metricKey: "full_domain_gmv", metricLabel: "全域成交金额", value: 119785.4, unit: "元", sourceLabel: "本地推总览", capturedAt: "2026-09-18T12:00:00.000Z", observationPeriod: "本场", semanticScope: "全域" },
      { metricKey: "spend", metricLabel: "全域消耗", value: 1912.77, unit: "元", sourceLabel: "本地推总览", capturedAt: "2026-09-18T12:00:00.000Z", observationPeriod: "本场", semanticScope: "全域" }
    ]
  }],
  facts: [],
  boundaries: ["缺少近期历史趋势"],
  nextCheck: { title: "检查下一完整窗口", detail: "补齐同口径趋势" }
};

describe("trusted diagnosis insights", () => {
  it("explains the server target without deriving ratios from metric groups", () => {
    const interpretation = buildTrustedBusinessInterpretation(baseFacts);

    expect(interpretation.insights.map((item) => item.key)).toEqual(["target", "trend"]);
    expect(interpretation.insights[0]?.value).toContain("62.62，高于目标 60");
    expect(interpretation.insights[0]?.detail).toContain("相差 2.62，目标达成率 104.4%");
    expect(interpretation).not.toHaveProperty("headline");
    expect(interpretation).not.toHaveProperty("conclusion");
    expect(buildTrustedBusinessInterpretation({ ...baseFacts, metricGroups: [] })).toEqual(interpretation);
  });

  it("does not invent a trend when complete windows are unavailable", () => {
    const interpretation = buildTrustedBusinessInterpretation({
      ...baseFacts,
      target: { ...baseFacts.target, status: "BELOW_TARGET", actual: 44.59, message: "低于目标" },
      trend: { status: "INSUFFICIENT", summary: "最近窗口不完整", recentTrend: null }
    });

    expect(interpretation.insights[0]?.value).toContain("44.59，低于目标");
    expect(interpretation.insights[0]?.value).not.toContain("62.62");
    expect(interpretation.insights.at(-1)?.value).toBe("暂不能判断改善还是回落");
    expect(interpretation.insights.at(-1)?.detail).toContain("最近窗口不完整");
  });

  it("labels exact equality without implying a surplus", () => {
    const interpretation = buildTrustedBusinessInterpretation({
      ...baseFacts, target: { ...baseFacts.target, actual: 60 }
    });
    expect(interpretation.insights[0]?.value).toContain("等于目标");
    expect(interpretation.insights[0]?.detail).toContain("相差 0，目标达成率 100.0%");
  });

  it.each([0, -1, NaN, Infinity, null])("does not calculate with invalid target %s", (target) => {
    const interpretation = buildTrustedBusinessInterpretation({
      ...baseFacts, target: { ...baseFacts.target, target }
    });
    expect(interpretation.insights.some((item) => item.key === "target")).toBe(false);
  });

  it.each([-1, NaN, Infinity, null])("does not calculate with invalid actual %s", (actual) => {
    expect(buildTrustedBusinessInterpretation({
      ...baseFacts, target: { ...baseFacts.target, actual }
    }).insights.some((item) => item.key === "target")).toBe(false);
  });

  it.each(["UNAVAILABLE", "BELOW_TARGET"] as const)("does not contradict server status %s", (status) => {
    expect(buildTrustedBusinessInterpretation({
      ...baseFacts, target: { ...baseFacts.target, status }
    }).insights.some((item) => item.key === "target")).toBe(false);
  });

  it("uses server window efficiency and handles zero-consumption windows", () => {
    const recentTrend: NonNullable<DiagnosisTrustedFactsView["trend"]["recentTrend"]> = {
      status: "AVAILABLE", reason: "两个完整窗口",
      baselineStartAt: "2026-09-18T11:30:00.000Z", baselineEndAt: "2026-09-18T11:45:00.000Z",
      currentStartAt: "2026-09-18T11:45:00.000Z", currentEndAt: "2026-09-18T12:00:00.000Z",
      routeKey: "LOCAL_PROMOTION_DASHBOARD", scope: "FULL_DOMAIN", metrics: [],
      efficiency: { metricLabel: "区间产出比", gmvMetricKey: "full_domain_gmv", spendMetricKey: "spend", baselineValue: 70, currentValue: 50, delta: -20 }
    };
    const trend: DiagnosisTrustedFactsView["trend"] = { status: "AVAILABLE", summary: "窗口完整", recentTrend };
    const insight = buildTrustedBusinessInterpretation({ ...baseFacts, trend }).insights.at(-1);
    expect(insight?.value).toBe("70 → 50");
    expect(insight?.detail).toContain("下降 20");
    expect(insight?.tone).toBe("warning");
    expect(buildTrustedBusinessInterpretation({
      ...baseFacts, trend: { ...trend, recentTrend: { ...recentTrend, efficiency: null } }
    }).insights.at(-1)?.value).toContain("暂不可比较");
    expect(buildTrustedBusinessInterpretation({
      ...baseFacts, trend: { ...trend, status: "INSUFFICIENT" }
    }).insights.at(-1)?.value).toContain("暂不能判断");
  });
});
