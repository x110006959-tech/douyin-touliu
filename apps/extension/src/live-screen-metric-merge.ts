import {
  metricValueSemantic,
  metricValueText,
  type MetricRawEvidence,
  type VisibleMetric
} from "@douyin-local-life/shared";

export function mergeLiveScreenMetrics(domMetrics: VisibleMetric[], apiMetrics: VisibleMetric[]) {
  const apiMetricKeys = new Set(apiMetrics.map((metric) => String(metric.key)));
  const comparableDomMetrics = domMetrics.filter((metric) => (
    !apiMetricKeys.has(String(metric.key)) || isComparableDomMetric(metric)
  ));
  const domByKey = groupByMergeKey(comparableDomMetrics);
  const apiByKey = groupByMergeKey(apiMetrics);
  const keys = new Set([...domByKey.keys(), ...apiByKey.keys()]);
  return [...keys].flatMap((key) => {
    const dom = domByKey.get(key) || [];
    const api = apiByKey.get(key) || [];
    if (dom.length > 1 || api.length > 1) return invalidateDuplicateSourceMetrics(dom, api);
    return mergePair(dom[0], api[0]);
  });
}

export function liveScreenMetricsForMode(
  mode: "SNAPSHOT" | "PULSE",
  domMetrics: VisibleMetric[],
  apiMetrics: VisibleMetric[]
) {
  return mode === "PULSE" ? apiMetrics : mergeLiveScreenMetrics(domMetrics, apiMetrics);
}

function mergePair(domMetric?: VisibleMetric, apiMetric?: VisibleMetric): VisibleMetric[] {
  if (!domMetric && !apiMetric) return [];
  const dom = domMetric ? toCandidate(domMetric) : null;
  const api = apiMetric ? toCandidate(apiMetric) : null;
  if (!api) return domMetric ? [withSource(domMetric, "DOM_TEXT", dom, null, "仅 DOM 字段有效")] : [];
  if (!dom) return [withSource(apiMetric!, "INTERNAL_API", null, api, "仅 API 字段有效")];
  const scopeConflicts = api.scopeExplicit && dom.scopeExplicit && api.scope !== dom.scope;
  if (api.unit !== dom.unit || api.timeRange !== dom.timeRange || scopeConflicts) {
    return [conflict(apiMetric!, dom, api, "单位、周期或业务口径不一致")];
  }
  if (equivalent(domMetric!, apiMetric!)) return [withSource(apiMetric!, "API_AND_DOM", dom, api, "API 与 DOM 在展示精度内一致")];
  return [conflict(apiMetric!, dom, api, "API 与 DOM 数值冲突")];
}

function withSource(metric: VisibleMetric, sourceStatus: MetricRawEvidence["sourceStatus"], dom: Candidate | null, api: Candidate | null, selectionReason: string): VisibleMetric {
  const evidence = metric.rawEvidence || { sourceType: metric.metricSource || "UNKNOWN" };
  return {
    ...metric,
    rawEvidence: { ...evidence, sourceStatus, domCandidate: dom || undefined, apiCandidate: api || undefined, selectionReason }
  };
}

function conflict(base: VisibleMetric, dom: Candidate, api: Candidate, selectionReason: string): VisibleMetric {
  return {
    ...base,
    value: null,
    confidence: 0.1,
    rawEvidence: {
      ...(base.rawEvidence || { sourceType: "INTERNAL_API" }),
      sourceStatus: "SOURCE_CONFLICT",
      domCandidate: dom,
      apiCandidate: api,
      selectionReason,
      validationStatus: "INVALID",
      validationReasons: [...new Set([...(base.rawEvidence?.validationReasons || []), "SOURCE_CONFLICT"])]
    }
  };
}

type Candidate = NonNullable<MetricRawEvidence["apiCandidate"]> & { scope: string; scopeExplicit: boolean };

function toCandidate(metric: VisibleMetric): Candidate {
  const evidence = metric.rawEvidence as MetricRawEvidence | null | undefined;
  const value = metricValueText(metric, metricValueSemantic(String(metric.key))) || "";
  return {
    value,
    displayValue: evidence?.displayValue || value,
    unit: metric.unit || null,
    timeRange: evidence?.timeRange || "UNKNOWN",
    displayPrecision: evidence?.displayPrecision ?? 0,
    fieldPath: evidence?.componentPath || evidence?.path || evidence?.jsonPath || "unknown",
    fieldLabel: evidence?.fieldLabel || metric.name,
    scope: evidence?.semanticScope || String(metric.key),
    scopeExplicit: Boolean(evidence?.semanticScope)
  };
}

function mergeKey(metric: VisibleMetric) {
  const evidence = metric.rawEvidence;
  return `${metric.key}|${evidence?.timeRange || "UNKNOWN"}`;
}

function isComparableDomMetric(metric: VisibleMetric) {
  const evidence = metric.rawEvidence;
  return metric.value != null
    && String(metric.value).trim() !== ""
    && evidence?.validationStatus !== "INVALID"
    && Boolean(evidence?.timeRange && evidence.timeRange !== "UNKNOWN");
}

function groupByMergeKey(metrics: VisibleMetric[]) {
  const grouped = new Map<string, VisibleMetric[]>();
  for (const metric of metrics) {
    const key = mergeKey(metric);
    grouped.set(key, [...(grouped.get(key) || []), metric]);
  }
  return grouped;
}

function invalidateDuplicateSourceMetrics(domMetrics: VisibleMetric[], apiMetrics: VisibleMetric[]) {
  const reason = "同一来源存在重复业务字段，已停止自动合并";
  const withCandidates = [
    ...domMetrics.map((metric) => withSource(metric, "DOM_TEXT", toCandidate(metric), null, reason)),
    ...apiMetrics.map((metric) => withSource(metric, "INTERNAL_API", null, toCandidate(metric), reason))
  ];
  return withCandidates.map((metric) => ({
    ...metric,
    value: null,
    confidence: 0.1,
    rawEvidence: {
      ...(metric.rawEvidence || { sourceType: metric.metricSource || "UNKNOWN" }),
      validationStatus: "INVALID" as const,
      validationReasons: [...new Set([...(metric.rawEvidence?.validationReasons || []), "FIELD_BINDING_AMBIGUOUS"])]
    }
  }));
}

function equivalent(dom: VisibleMetric, api: VisibleMetric) {
  const domValue = metricValueText(dom, metricValueSemantic(String(dom.key)));
  const apiValue = metricValueText(api, metricValueSemantic(String(api.key)));
  if (domValue == null || apiValue == null) return false;
  const precision = Math.max(dom.rawEvidence?.displayPrecision ?? 0, api.rawEvidence?.displayPrecision ?? 0);
  return decimalDifferenceWithinDisplayPrecision(domValue, apiValue, precision);
}

function decimalDifferenceWithinDisplayPrecision(left: string, right: string, precision: number) {
  const leftDecimal = decimalParts(left);
  const rightDecimal = decimalParts(right);
  if (!leftDecimal || !rightDecimal) return false;
  const commonScale = Math.max(leftDecimal.fractionDigits, rightDecimal.fractionDigits, precision);
  const leftScaled = leftDecimal.integer * pow10(commonScale - leftDecimal.fractionDigits);
  const rightScaled = rightDecimal.integer * pow10(commonScale - rightDecimal.fractionDigits);
  const difference = leftScaled >= rightScaled ? leftScaled - rightScaled : rightScaled - leftScaled;
  return difference * 2n * pow10(precision) <= pow10(commonScale);
}

function decimalParts(value: string) {
  const matched = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!matched) return null;
  const fraction = matched[3] || "";
  const unsigned = BigInt(`${matched[2]}${fraction}`);
  return {
    integer: matched[1] === "-" ? -unsigned : unsigned,
    fractionDigits: fraction.length
  };
}

function pow10(exponent: number) {
  return 10n ** BigInt(exponent);
}
