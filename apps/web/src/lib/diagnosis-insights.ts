import type { DiagnosisTrustedFactsView } from "@douyin-local-life/shared/diagnosis";

export type TrustedInsightTone = "positive" | "neutral" | "warning";

export type TrustedBusinessInsight = {
  key: string;
  title: string;
  value: string;
  detail: string;
  tone: TrustedInsightTone;
};

// Metric groups do not guarantee a shared observation window. Only explain
// server comparisons, without deriving ratios from independently collected values.
export function buildTrustedBusinessInterpretation(
  facts: DiagnosisTrustedFactsView
): { insights: TrustedBusinessInsight[] } {
  const { actual, target, status } = facts.target;
  const insights: TrustedBusinessInsight[] = [];
  if (status !== "UNAVAILABLE" && finiteNonnegative(actual) && finiteNonnegative(target) && target > 0
    && (status === "MET" ? actual >= target : actual < target)) {
    const gap = actual - target;
    const achievement = actual / target * 100;
    if (Number.isFinite(gap) && Number.isFinite(achievement)) {
      insights.push({
        key: "target",
        title: "目标差距",
        value: `全域支付 ROI ${formatNumber(actual)}，${gap === 0 ? "等于" : gap > 0 ? "高于" : "低于"}目标 ${formatNumber(target)}`,
        detail: `相差 ${formatNumber(Math.abs(gap))}，目标达成率 ${achievement.toFixed(1)}%。这是已采集范围的目标比较，不代表利润率或可增加预算的额度。`,
        tone: status === "MET" ? "positive" : "warning"
      });
    }
  }
  insights.push(buildTrendInsight(facts));
  return { insights };
}

function buildTrendInsight(facts: DiagnosisTrustedFactsView): TrustedBusinessInsight {
  const trend = facts.trend.recentTrend;
  if (facts.trend.status !== "AVAILABLE" || !trend || trend.status !== "AVAILABLE") {
    return {
      key: "trend",
      title: "近期趋势",
      value: "暂不能判断改善还是回落",
      detail: facts.trend.summary || "需要补齐两个完整、同口径的时间窗口后再比较。",
      tone: "neutral"
    };
  }

  const efficiency = trend.efficiency;
  if (!efficiency || !finiteNonnegative(efficiency.baselineValue)
    || !finiteNonnegative(efficiency.currentValue) || !Number.isFinite(efficiency.delta)) {
    return {
      key: "trend",
      title: "近期趋势",
      value: "窗口已完整，区间产出比暂不可比较",
      detail: "窗口指标可核对，但区间产出比缺少有效值；零消耗不能按零产出比处理。",
      tone: "neutral"
    };
  }

  return {
    key: "trend",
    title: efficiency.metricLabel,
    value: `${formatNumber(efficiency.baselineValue)} → ${formatNumber(efficiency.currentValue)}`,
    detail: `最近两个完整 15 分钟窗口，${efficiency.delta === 0 ? "数值持平" : `${efficiency.delta > 0 ? "上升" : "下降"} ${formatNumber(Math.abs(efficiency.delta))}`}。这是窗口变化，不是投放因果增量。`,
    tone: efficiency.delta > 0 ? "positive" : efficiency.delta < 0 ? "warning" : "neutral"
  };
}

function finiteNonnegative(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
