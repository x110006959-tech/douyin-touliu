import {
  projectHistoryComparisonSchema,
  type ProjectHistoryComparison,
  type ProjectHistoryMetric
} from "@douyin-local-life/shared";
import {
  analysisWindowToleranceMs,
  beijingDayKey,
  isCumulativeMetric,
  isRatioMetric,
  metricComparisonKey,
  minuteMs,
  minutesPerDay,
  readHistoryMetrics,
  startOfBeijingDay,
  startOfBeijingDayDaysAgo,
  type ProjectHistoryComparisonPoint
} from "./project-history-metrics.js";

export function compareHistoryMetrics(input: {
  kind: ProjectHistoryComparison["kind"];
  label: string;
  baselineLabel: string;
  currentLabel: string;
  baselineAt: Date | null | undefined;
  currentAt: Date | null | undefined;
  baseline: ProjectHistoryMetric[];
  current: ProjectHistoryMetric[];
}): ProjectHistoryComparison {
  if (!input.baseline.length || !input.current.length) {
    return emptyComparison(input.kind, input.label, input.baselineLabel, input.currentLabel, "缺少同项目、同路线的可比指标");
  }
  const baseline = new Map(input.baseline.map((metric) => [metricComparisonKey(metric), metric]));
  const current = new Map(input.current.map((metric) => [metricComparisonKey(metric), metric]));
  const rows = [...current.entries()].flatMap(([key, currentMetric]) => {
    const baselineMetric = baseline.get(key);
    if (!baselineMetric) return [];
    const delta = currentMetric.value - baselineMetric.value;
    const ratio = isRatioMetric(currentMetric.metricKey);
    return [{
      routeKey: currentMetric.routeKey,
      metricKey: currentMetric.metricKey,
      metricName: currentMetric.metricName,
      unit: currentMetric.unit,
      baselineValue: baselineMetric.value,
      currentValue: currentMetric.value,
      delta,
      conclusion: Math.abs(delta) < 1e-9 ? "NO_CHANGE" as const : ratio ? "RAW_CHANGE" as const : "RAW_CHANGE" as const,
      note: ratio
        ? "比例指标仅展示同口径原始变化；没有同口径分子和分母时不判定好坏。"
        : "按同一路线和口径展示原始变化，不与其他路线合并。"
    }];
  });
  const roiRows = recomputedRoiRows(input.baseline, input.current);
  const combinedRows = [...roiRows, ...rows].sort((left, right) => left.routeKey.localeCompare(right.routeKey) || left.metricKey.localeCompare(right.metricKey));
  const derivedDirections = roiRows.map((row) => row.conclusion).filter((value) => value === "IMPROVED" || value === "WORSENED" || value === "NO_CHANGE");
  const status = derivedDirections.length
    ? summaryStatus(derivedDirections)
    : "INSUFFICIENT" as const;
  return projectHistoryComparisonSchema.parse({
    kind: input.kind,
    status,
    label: input.label,
    baselineLabel: input.baselineLabel,
    currentLabel: input.currentLabel,
    baselineAt: input.baselineAt?.toISOString() || null,
    currentAt: input.currentAt?.toISOString() || null,
    rows: combinedRows.slice(0, 80),
    notices: [
      "只比较同一项目内、同一路线且同口径的指标，不会把直播与本地推相加或平均。",
      ...(status === "INSUFFICIENT" ? ["当前缺少能够重新计算效率的同口径指标，因此暂不判断整体变好或变差。"] : [])
    ]
  });
}

export function comparePeriodPoints(points: ProjectHistoryComparisonPoint[], days: number, now: Date): ProjectHistoryComparison {
  const currentStart = startOfBeijingDayDaysAgo(now, days);
  const baselineStart = startOfBeijingDayDaysAgo(now, days * 2);
  const baseline = aggregatePeriodMetrics(
    points.filter((point) => point.observedAt >= baselineStart && point.observedAt < currentStart),
    days
  );
  const current = aggregatePeriodMetrics(
    points.filter((point) => point.observedAt >= currentStart && point.observedAt < startOfBeijingDay(now)),
    days
  );
  const comparison = compareHistoryMetrics({
    kind: "PERIOD",
    label: `最近 ${days} 个完整自然日与前 ${days} 个完整自然日`,
    baselineLabel: `前 ${days} 个完整自然日`,
    currentLabel: `最近 ${days} 个完整自然日`,
    baselineAt: baselineStart,
    currentAt: new Date(startOfBeijingDay(now).getTime() - 1),
    baseline,
    current
  });
  return {
    ...comparison,
    notices: [
      ...comparison.notices,
      "周期排除北京时间当天；只有每天每分钟都有采集记录、同日属于同一轮采集且累计数值未重置，才按每日首末差额汇总，否则暂不能判断。",
      "比例仅在同口径分子分母齐全时重新计算；原始比例、平均值和瞬时值不作跨日加总。"
    ]
  };
}

export function compareAnalysisWindowPoints(points: ProjectHistoryComparisonPoint[], analyzedAt: Date, minutes: 30 | 60, now: Date): ProjectHistoryComparison {
  const afterTarget = new Date(analyzedAt.getTime() + minutes * minuteMs);
  if (now < afterTarget) {
    return emptyComparison("ANALYSIS_WINDOW", `分析前后 ${minutes} 分钟`, "分析前", "分析后", "分析后观察窗口尚未结束，请在窗口结束并采集到可比数据后查看");
  }
  const before = nearestMetricsByRoute(
    points.filter((point) => point.observedAt < analyzedAt),
    new Date(analyzedAt.getTime() - minutes * minuteMs)
  );
  const after = nearestMetricsByRoute(
    points.filter((point) => point.observedAt > analyzedAt && point.observedAt <= now),
    afterTarget
  );
  return compareHistoryMetrics({
    kind: "ANALYSIS_WINDOW",
    label: `分析前后 ${minutes} 分钟`,
    baselineLabel: `分析前约 ${minutes} 分钟`,
    currentLabel: `分析后约 ${minutes} 分钟`,
    baselineAt: before.at,
    currentAt: after.at,
    baseline: before.metrics,
    current: after.metrics
  });
}

export function emptyComparison(
  kind: ProjectHistoryComparison["kind"],
  label: string,
  baselineLabel: string,
  currentLabel: string,
  notice: string
): ProjectHistoryComparison {
  return {
    kind,
    status: "INSUFFICIENT",
    label,
    baselineLabel,
    currentLabel,
    baselineAt: null,
    currentAt: null,
    rows: [],
    notices: [notice]
  };
}

export function latestMetricsForSession(points: ProjectHistoryComparisonPoint[], sessionId: string) {
  const latest = new Map<string, ProjectHistoryComparisonPoint>();
  for (const point of points.filter((candidate) => candidate.sessionId === sessionId)) {
    const current = latest.get(point.routeKey);
    if (!current || current.observedAt < point.observedAt) latest.set(point.routeKey, point);
  }
  return [...latest.values()].flatMap((point) => readHistoryMetrics(point.metricsJson));
}

function aggregatePeriodMetrics(points: ProjectHistoryComparisonPoint[], expectedDays: number) {
  const grouped = new Map<string, Array<{ at: Date; sessionId: string; metric: ProjectHistoryMetric }>>();
  for (const point of points) {
    for (const metric of readHistoryMetrics(point.metricsJson)) {
      if (!isCumulativeMetric(metric.metricKey)) continue;
      const key = `${beijingDayKey(point.observedAt)}:${metricComparisonKey(metric)}`;
      const entries = grouped.get(key) || [];
      entries.push({ at: point.observedAt, sessionId: point.sessionId, metric });
      grouped.set(key, entries);
    }
  }
  const total = new Map<string, { metric: ProjectHistoryMetric; value: number; days: number }>();
  for (const entries of grouped.values()) {
    const ordered = [...entries].sort((left, right) => left.at.getTime() - right.at.getTime());
    const first = ordered[0]!;
    const last = ordered.at(-1)!;
    const coveredMinutes = new Set(ordered.map((entry) => Math.floor(entry.at.getTime() / minuteMs)));
    const continuousCounter = ordered.every((entry, index) => entry.sessionId === first.sessionId
      && entry.metric.value >= 0
      && (index === 0 || entry.metric.value >= ordered[index - 1]!.metric.value));
    if (coveredMinutes.size !== minutesPerDay || !continuousCounter) continue;
    const value = last.metric.value - first.metric.value;
    if (!Number.isFinite(value)) continue;
    const key = metricComparisonKey(first.metric);
    const metric = {
      ...first.metric,
      quality: ordered.every((entry) => entry.metric.quality === "TRUSTED") ? "TRUSTED" as const : "REVIEW_REQUIRED" as const
    };
    const existing = total.get(key) || { metric, value: 0, days: 0 };
    total.set(key, {
      metric: existing.metric.quality === "TRUSTED" && metric.quality === "TRUSTED"
        ? existing.metric
        : { ...existing.metric, quality: "REVIEW_REQUIRED" as const },
      value: existing.value + value,
      days: existing.days + 1
    });
  }
  return [...total.values()]
    .filter(({ days }) => days === expectedDays)
    .map(({ metric, value }) => ({ ...metric, value }));
}

function recomputedRoiRows(baseline: ProjectHistoryMetric[], current: ProjectHistoryMetric[]) {
  const baselineByRoute = metricsByRouteScope(baseline);
  const currentByRoute = metricsByRouteScope(current);
  const rows: Array<ReturnType<typeof projectHistoryComparisonSchema.parse>["rows"][number]> = [];
  for (const [key, currentMetrics] of currentByRoute) {
    const baselineMetrics = baselineByRoute.get(key);
    if (!baselineMetrics) continue;
    for (const pair of [
      { gmvKey: "full_domain_gmv", roiKey: "full_domain_pay_roi", label: "全域支付 ROI（按同口径全域成交额/消耗重算）" },
      { gmvKey: "gmv", roiKey: "pay_roi", label: "支付 ROI（按同口径成交额/消耗重算）" }
    ] as const) {
      const currentSpend = currentMetrics.get("spend");
      const currentGmv = currentMetrics.get(pair.gmvKey);
      const baselineSpend = baselineMetrics.get("spend");
      const baselineGmv = baselineMetrics.get(pair.gmvKey);
      if (!currentSpend || !currentGmv || !baselineSpend || !baselineGmv || currentSpend.value <= 0 || baselineSpend.value <= 0) continue;
      if (currentSpend.quality !== "TRUSTED" || currentGmv.quality !== "TRUSTED" || baselineSpend.quality !== "TRUSTED" || baselineGmv.quality !== "TRUSTED") continue;
      const baselineValue = baselineGmv.value / baselineSpend.value;
      const currentValue = currentGmv.value / currentSpend.value;
      const delta = currentValue - baselineValue;
      rows.push({
        routeKey: currentSpend.routeKey,
        metricKey: pair.roiKey,
        metricName: pair.label,
        unit: null,
        baselineValue,
        currentValue,
        delta,
        conclusion: Math.abs(delta) < 1e-9 ? "NO_CHANGE" as const : delta > 0 ? "IMPROVED" as const : "WORSENED" as const,
        note: "由同一路线、同口径的累计成交额与消耗重新计算，不直接平均历史 ROI。"
      });
    }
  }
  return rows;
}

function metricsByRouteScope(metrics: ProjectHistoryMetric[]) {
  const grouped = new Map<string, Map<string, ProjectHistoryMetric>>();
  for (const metric of metrics) {
    const key = `${metric.routeKey}:${metric.scopeFingerprint}`;
    const current = grouped.get(key) || new Map<string, ProjectHistoryMetric>();
    current.set(metric.metricKey, metric);
    grouped.set(key, current);
  }
  return grouped;
}

function nearestMetricsByRoute(points: ProjectHistoryComparisonPoint[], target: Date) {
  const nearest = new Map<string, ProjectHistoryComparisonPoint>();
  for (const point of points) {
    if (Math.abs(point.observedAt.getTime() - target.getTime()) > analysisWindowToleranceMs) continue;
    const current = nearest.get(point.routeKey);
    if (!current || Math.abs(point.observedAt.getTime() - target.getTime()) < Math.abs(current.observedAt.getTime() - target.getTime())) {
      nearest.set(point.routeKey, point);
    }
  }
  const selected = [...nearest.values()];
  return {
    at: selected.length ? new Date(Math.round(selected.reduce((sum, point) => sum + point.observedAt.getTime(), 0) / selected.length)) : null,
    metrics: selected.flatMap((point) => readHistoryMetrics(point.metricsJson))
  };
}

function summaryStatus(directions: Array<"IMPROVED" | "WORSENED" | "NO_CHANGE">) {
  const unique = new Set(directions);
  if (unique.size === 1) return directions[0]!;
  if (unique.size === 2 && unique.has("NO_CHANGE")) return unique.has("IMPROVED") ? "IMPROVED" as const : "WORSENED" as const;
  return "MIXED" as const;
}
