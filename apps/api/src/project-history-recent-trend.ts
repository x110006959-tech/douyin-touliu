import {
  type CollectionRouteKey,
  type DiagnosisRecentTrend,
  type ProjectHistoryMetric
} from "@douyin-local-life/shared";
import {
  isCumulativeMetric,
  minuteMs,
  readHistoryMetrics,
  recentTrendWindowMinutes,
  recentTrendWindowMs,
  type ProjectHistoryComparisonPoint
} from "./project-history-metrics.js";

type CumulativeMetricSeries = {
  metric: ProjectHistoryMetric;
  routeKey: CollectionRouteKey;
  sessionId: string;
  samples: Map<number, number>;
  duplicateBucket: boolean;
};

export function buildRecentFifteenMinuteTrend(
  points: ProjectHistoryComparisonPoint[],
  now = new Date()
): DiagnosisRecentTrend {
  const end = new Date(Math.floor(now.getTime() / recentTrendWindowMs) * recentTrendWindowMs);
  const currentStart = new Date(end.getTime() - recentTrendWindowMs);
  const baselineStart = new Date(currentStart.getTime() - recentTrendWindowMs);
  const expectedBuckets = Array.from(
    { length: recentTrendWindowMinutes * 2 + 1 },
    (_, index) => baselineStart.getTime() + index * minuteMs
  );
  const seriesByScope = new Map<string, Map<string, CumulativeMetricSeries>>();
  let hasCandidatePoint = false;
  let hasUntrustedMetric = false;

  for (const point of points) {
    const bucketAt = Math.floor(point.observedAt.getTime() / minuteMs) * minuteMs;
    if (point.observedAt > now || bucketAt < baselineStart.getTime() || bucketAt > end.getTime()) continue;
    for (const metric of readHistoryMetrics(point.metricsJson)) {
      if (!isCumulativeMetric(metric.metricKey)) continue;
      hasCandidatePoint = true;
      if (metric.quality !== "TRUSTED") {
        hasUntrustedMetric = true;
        continue;
      }
      const scopeKey = `${point.sessionId}:${metric.routeKey}:${metric.scopeFingerprint}`;
      const metricSeries = seriesByScope.get(scopeKey) || new Map<string, CumulativeMetricSeries>();
      const series = metricSeries.get(metric.metricKey) || {
        metric,
        routeKey: metric.routeKey,
        sessionId: point.sessionId,
        samples: new Map<number, number>(),
        duplicateBucket: false
      };
      if (series.samples.has(bucketAt)) series.duplicateBucket = true;
      series.samples.set(bucketAt, metric.value);
      metricSeries.set(metric.metricKey, series);
      seriesByScope.set(scopeKey, metricSeries);
    }
  }

  const preference: Array<{ gmvMetricKey: "full_domain_gmv" | "gmv"; scope: "FULL_DOMAIN" | "PAYMENT"; label: string }> = [
    { gmvMetricKey: "full_domain_gmv", scope: "FULL_DOMAIN", label: "区间全域支付 ROI（按全域成交额/全域消耗重算）" },
    { gmvMetricKey: "gmv", scope: "PAYMENT", label: "区间支付 ROI（按同口径成交额/消耗重算）" }
  ];

  for (const preferred of preference) {
    for (const metrics of seriesByScope.values()) {
      const spend = metrics.get("spend");
      const gmv = metrics.get(preferred.gmvMetricKey);
      if (!spend || !gmv) continue;
      const spendWindows = completeTrendWindows(spend, expectedBuckets, baselineStart, currentStart, end);
      const gmvWindows = completeTrendWindows(gmv, expectedBuckets, baselineStart, currentStart, end);
      if (!spendWindows || !gmvWindows) continue;
      const rows = [spendWindows.row, gmvWindows.row];
      for (const key of preferred.scope === "FULL_DOMAIN" ? ["full_domain_orders", "orders"] : ["orders"]) {
        const candidate = metrics.get(key);
        const windows = candidate && completeTrendWindows(candidate, expectedBuckets, baselineStart, currentStart, end);
        if (windows) rows.push(windows.row);
      }
      const efficiency = spendWindows.currentDelta > 0 && spendWindows.baselineDelta > 0
        ? {
            metricLabel: preferred.label,
            gmvMetricKey: preferred.gmvMetricKey,
            spendMetricKey: "spend" as const,
            baselineValue: roundTrend(gmvWindows.baselineDelta / spendWindows.baselineDelta),
            currentValue: roundTrend(gmvWindows.currentDelta / spendWindows.currentDelta),
            delta: roundTrend(gmvWindows.currentDelta / spendWindows.currentDelta - gmvWindows.baselineDelta / spendWindows.baselineDelta)
          }
        : null;
      return {
        status: "AVAILABLE",
        reason: efficiency
          ? "已使用同一项目、路线、口径和采集轮次的两个完整 15 分钟窗口计算区间变化；区间产出比不表示广告因果增量。"
          : "两个完整 15 分钟窗口的累计量可比较，但存在零消耗窗口，未生成区间产出比结论。",
        baselineStartAt: baselineStart.toISOString(),
        baselineEndAt: currentStart.toISOString(),
        currentStartAt: currentStart.toISOString(),
        currentEndAt: end.toISOString(),
        routeKey: spend.routeKey,
        scope: preferred.scope,
        metrics: rows,
        efficiency
      };
    }
  }

  const reason = !hasCandidatePoint
    ? "缺少最近两个已结束的 15 分钟窗口数据，暂不能判断近期趋势"
    : hasUntrustedMetric
      ? "最近窗口包含未通过可信校验的历史指标，暂不能判断近期趋势"
      : "最近两个 15 分钟窗口缺少完整分钟覆盖、边界数据、同一采集轮次或同口径累计指标，暂不能判断近期趋势";
  return {
    status: "INSUFFICIENT",
    reason,
    baselineStartAt: null,
    baselineEndAt: null,
    currentStartAt: null,
    currentEndAt: null,
    routeKey: null,
    scope: null,
    metrics: [],
    efficiency: null
  };
}

function completeTrendWindows(
  series: CumulativeMetricSeries,
  expectedBuckets: number[],
  baselineStart: Date,
  currentStart: Date,
  end: Date
) {
  if (series.duplicateBucket || expectedBuckets.some((bucket) => !series.samples.has(bucket))) return null;
  const values = expectedBuckets.map((bucket) => series.samples.get(bucket)!);
  if (values.some((value, index) => index > 0 && value < values[index - 1]!)) return null;
  const baselineStartValue = series.samples.get(baselineStart.getTime());
  const middleValue = series.samples.get(currentStart.getTime());
  const endValue = series.samples.get(end.getTime());
  if (baselineStartValue == null || middleValue == null || endValue == null) return null;
  const baselineDelta = middleValue - baselineStartValue;
  const currentDelta = endValue - middleValue;
  return {
    baselineDelta,
    currentDelta,
    row: {
      metricKey: series.metric.metricKey,
      metricName: series.metric.metricName,
      unit: series.metric.unit,
      baselineValue: baselineDelta,
      currentValue: currentDelta,
      delta: currentDelta - baselineDelta
    }
  };
}

function roundTrend(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
