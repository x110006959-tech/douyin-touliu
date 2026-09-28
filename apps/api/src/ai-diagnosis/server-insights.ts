import { buildDiagnosisEvidenceCatalog } from "@douyin-local-life/diagnosis-skills";
import type { DecisionEngineInput } from "@douyin-local-life/shared";
import type { DiagnosisEvidence } from "@douyin-local-life/shared/diagnosis";

export type ServerDiagnosisInsight = {
  title: string;
  conclusion: string;
  supportingFacts: string[];
  conflictingFacts: string[];
  missingEvidence: string[];
};

/**
 * Builds a small set of deterministic, evidence-backed statements for the
 * diagnosis page. These statements never claim causality; they state what the
 * reviewed metrics can directly support and what must still be checked.
 */
export function buildServerDiagnosisInsights(
  input: DecisionEngineInput,
  evidence: DiagnosisEvidence[] = buildDiagnosisEvidenceCatalog(input)
): ServerDiagnosisInsight[] {
  const fullDomainGmv = metricEvidence(evidence, "full_domain_gmv", "LOCAL_PROMOTION_DASHBOARD");
  const fullDomainSpend = metricEvidence(evidence, "spend", "LOCAL_PROMOTION_DASHBOARD", isFullDomainMetric);
  const fullDomainRoi = metricEvidence(evidence, "full_domain_pay_roi", "LOCAL_PROMOTION_DASHBOARD");
  const fullDomainOrders = metricEvidence(evidence, "full_domain_orders", "LOCAL_PROMOTION_DASHBOARD");
  const liveGmv = metricEvidence(evidence, "gmv", "LIVE_DATA_SCREEN");
  const liveOrders = metricEvidence(evidence, "orders", "LIVE_DATA_SCREEN");
  const liveViewers = metricEvidence(evidence, "live_viewers", "LIVE_DATA_SCREEN");
  const liveWatchSeconds = metricEvidence(evidence, "average_watch_duration_seconds", "LIVE_DATA_SCREEN");
  const impressions = metricEvidence(evidence, "impressions", "LIVE_TRAFFIC_TAB");
  const clicks = metricEvidence(evidence, "clicks", "LIVE_TRAFFIC_TAB");
  const ctr = metricEvidence(evidence, "ctr", "LIVE_TRAFFIC_TAB");

  const insights: ServerDiagnosisInsight[] = [];
  const fullGmvValue = metricNumber(fullDomainGmv);
  const fullSpendValue = metricNumber(fullDomainSpend);
  const fullRoiValue = metricNumber(fullDomainRoi);
  const fullOrdersValue = metricNumber(fullDomainOrders);
  const liveGmvValue = metricNumber(liveGmv);
  const liveOrdersValue = metricNumber(liveOrders);
  const liveViewersValue = metricNumber(liveViewers);
  const impressionsValue = metricNumber(impressions);
  const clicksValue = metricNumber(clicks);
  const ctrValue = metricNumber(ctr);

  if (fullGmvValue !== null && fullSpendValue !== null && fullSpendValue > 0) {
    const efficiency = fullRoiValue ?? fullGmvValue / fullSpendValue;
    insights.push({
      title: "全域投放投入产出已确认",
      conclusion: `本次已复核的全域成交金额为 ${formatNumber(fullGmvValue)} 元，全域消耗为 ${formatNumber(fullSpendValue)} 元，${fullRoiValue !== null ? `全域支付 ROI 为 ${formatNumber(fullRoiValue)}` : `按同口径成交额与消耗计算的产出比为 ${formatNumber(efficiency)}`}。这只描述已采集范围的产出效率，不能证明成交增长来自投放、直播承接或商品结构。`,
      supportingFacts: compact([
        describeEvidence(fullDomainGmv),
        describeEvidence(fullDomainSpend),
        describeEvidence(fullDomainRoi)
      ]),
      conflictingFacts: [],
      missingEvidence: ["需要同口径的自然或商业流量、直播间观看与点击、商品曝光与成交明细，才能把产出效率拆到具体经营环节。"]
    });
  }

  if (fullGmvValue !== null && fullOrdersValue !== null && fullOrdersValue > 0) {
    insights.push({
      title: "全域订单结构已确认",
      conclusion: `本次已复核的全域成交金额 ${formatNumber(fullGmvValue)} 元对应 ${formatNumber(fullOrdersValue)} 单，平均每单约 ${formatNumber(fullGmvValue / fullOrdersValue)} 元。这是当前已采集范围的结构结果，不能据此单独判断商品结构是否合理。`,
      supportingFacts: compact([
        describeEvidence(fullDomainGmv),
        describeEvidence(fullDomainOrders)
      ]),
      conflictingFacts: [],
      missingEvidence: ["需要分商品的曝光、点击、成交与利润贡献，才能判断引流款、承接款和高价值商品是否合理。"]
    });
  }

  if (liveGmvValue !== null && liveOrdersValue !== null && liveOrdersValue > 0) {
    const perOrder = liveGmvValue / liveOrdersValue;
    insights.push({
      title: "直播间订单结构已确认",
      conclusion: `本次已复核的直播间成交金额 ${formatNumber(liveGmvValue)} 元对应 ${formatNumber(liveOrdersValue)} 单，平均每单约 ${formatNumber(perOrder)} 元。这是当前直播口径的结构结果，仍需结合观看与商品点击判断承接效率。`,
      supportingFacts: compact([
        describeEvidence(liveGmv),
        describeEvidence(liveOrders)
      ]),
      conflictingFacts: [],
      missingEvidence: ["需要累计观看人数、人均观看时长、商品点击与成交的对应关系，才能判断从进房到下单的承接效率。"]
    });
  } else if (liveViewersValue !== null && liveViewersValue > 0 && liveOrdersValue !== null) {
    const ordersPerThousand = liveOrdersValue / liveViewersValue * 1_000;
    insights.push({
      title: "直播间承接观察值",
      conclusion: `本次已复核的累计观看人数为 ${formatNumber(liveViewersValue)}，成交订单数为 ${formatNumber(liveOrdersValue)}，每 1000 次观看约成交 ${formatNumber(ordersPerThousand)} 单。这个比值只能作为观察线索，需结合同口径历史或分来源数据才能判断是否异常。`,
      supportingFacts: compact([
        describeEvidence(liveViewers),
        describeEvidence(liveOrders),
        describeEvidence(liveWatchSeconds)
      ]),
      conflictingFacts: [],
      missingEvidence: ["需要同口径历史趋势、观看时长和商品点击明细，才能判断当前承接是改善、回落还是处于正常波动范围。"]
    });
  }

  if (impressionsValue !== null || clicksValue !== null || ctrValue !== null) {
    insights.push({
      title: "流量入口结果已确认",
      conclusion: buildTrafficConclusion(impressionsValue, clicksValue, ctrValue),
      supportingFacts: compact([
        describeEvidence(impressions),
        describeEvidence(clicks),
        describeEvidence(ctr)
      ]),
      conflictingFacts: [],
      missingEvidence: ["需要分自然流量和商业流量的来源数据，以及进入直播间的转化数据，才能判断流量质量或渠道差异。"]
    });
  }

  return insights.slice(0, 3);
}

function buildTrafficConclusion(impressions: number | null, clicks: number | null, ctr: number | null) {
  const pieces = [
    impressions !== null ? `曝光量 ${formatNumber(impressions)}` : null,
    clicks !== null ? `点击量 ${formatNumber(clicks)}` : null,
    ctr !== null
      ? `点击率 ${formatPercent(ctr)}`
      : impressions !== null && impressions > 0 && clicks !== null
        ? `按同口径点击量/曝光量计算的点击率 ${formatPercent(clicks / impressions)}`
        : null
  ].filter((item): item is string => Boolean(item));
  if (!pieces.length) return "本次流量入口指标不足，暂不能确认曝光、点击或点击率关系。";
  return `${pieces.join("，")}。这些是已复核的流量入口事实，不能仅凭它们判断直播承接或投放效果。`;
}

function metricEvidence(
  evidence: DiagnosisEvidence[],
  metricKey: string,
  routeKey?: string,
  predicate?: (item: DiagnosisEvidence) => boolean
) {
  return evidence.find((item) => (
    item.kind === "METRIC"
    && item.metricKey === metricKey
    && (!routeKey || item.routeKey === routeKey)
    && (!predicate || predicate(item))
  ));
}

function isFullDomainMetric(item: DiagnosisEvidence) {
  return /全域|FULL_DOMAIN/.test(`${item.semanticScope || ""} ${item.label}`);
}

function metricNumber(item: DiagnosisEvidence | undefined) {
  if (!item) return null;
  if (typeof item.value === "number" && Number.isFinite(item.value)) return item.value;
  if (typeof item.value === "string" && item.value.trim()) {
    const parsed = Number(item.value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function describeEvidence(item: DiagnosisEvidence | undefined) {
  return item ? `${item.label}：${item.value ?? "未知"}` : null;
}

function compact(items: Array<string | null>) {
  return items.filter((item): item is string => Boolean(item));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
