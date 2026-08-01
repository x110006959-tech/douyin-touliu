import {
  identifyMetricKey,
  metricKeyLabels,
  metricValueSemantic,
  normalizeMetricLookupValue,
  parseDisplayedMetricValue,
  standardizeMetricKey,
  type CollectionSnapshotPayload,
  type MetricKey,
  type VisibleMetric
} from "@douyin-local-life/shared";

export type MetricAliasOverrideInput = { aliasNormalized: string; pageType: string; metricKey: MetricKey };

export function normalizeMetrics(snapshot: CollectionSnapshotPayload, aliases: MetricAliasOverrideInput[] = []): VisibleMetric[] {
  const known = new Map<MetricKey, VisibleMetric[]>();
  const unknown: VisibleMetric[] = [];

  for (const metric of snapshot.visibleMetricsJson) {
    const normalized = normalizeVisibleMetric(metric, snapshot.pageType, aliases);
    if (normalized.key === "unknown") {
      unknown.push(normalized);
      continue;
    }
    const key = normalized.key as MetricKey;
    known.set(key, [...(known.get(key) || []), normalized]);
  }

  // Page text is intentionally not persisted. Only adapters that provide field binding evidence may create metrics.
  return [
    ...[...known.values()].map((candidates) => candidates.length === 1 ? candidates[0]! : invalidateAmbiguousMetric(candidates)),
    ...unknown
  ];
}

function invalidateAmbiguousMetric(candidates: VisibleMetric[]) {
  const selected = [...candidates].sort((left, right) => metricPriority(right) - metricPriority(left))[0]!;
  return {
    ...selected,
    value: null,
    confidence: 0.1,
    rawEvidence: {
      ...(selected.rawEvidence || { sourceType: selected.metricSource || metricSourceFromLegacy(selected.source) }),
      validationStatus: "INVALID" as const,
      validationReasons: [...new Set([...(selected.rawEvidence?.validationReasons || []), "FIELD_BINDING_AMBIGUOUS"])]
    }
  };
}

function normalizeVisibleMetric(metric: VisibleMetric, pageType: string, aliases: MetricAliasOverrideInput[]): VisibleMetric {
  const aliasCandidates = [metric.key, metric.name].map((value) => normalizeMetricLookupValue(String(value || "")));
  const override = aliases.find((alias) => aliasCandidates.includes(alias.aliasNormalized) && (alias.pageType === "ANY" || alias.pageType === pageType));
  const standardKey = override?.metricKey || standardizeMetricKey(metric);
  const metricSource = metric.metricSource || metricSourceFromLegacy(metric.source);
  const hasPageDisplayValue = typeof metric.rawEvidence?.displayValue === "string";
  const displayValue = hasPageDisplayValue ? metric.rawEvidence!.displayValue! : (metric.value == null ? "" : String(metric.value));
  const parsed = hasPageDisplayValue || typeof metric.value === "string"
    ? parseDisplayedMetricValue(
        displayValue,
        standardKey === "unknown" ? "UNKNOWN" : metricValueSemantic(standardKey),
        metric.unit
      )
    : null;
  const manualInput = metricSource === "MANUAL_INPUT";
  const evidence = {
    ...(metric.rawEvidence || { sourceType: metricSource }),
    displayValue,
    normalizedValue: parsed?.normalizedText ?? metric.rawEvidence?.normalizedValue ?? null,
    displayPrecision: parsed?.displayPrecision ?? null,
    multiplier: parsed?.multiplier ?? 1,
    validationStatus: metric.rawEvidence?.validationStatus === "INVALID" || parsed?.status === "INVALID"
      ? "INVALID" as const
      : manualInput
        ? "TRUSTED" as const
      : metric.rawEvidence?.bindingKind && metric.rawEvidence.calibrationSignature
        ? "REQUIRES_REVIEW" as const
        : "REQUIRES_REVIEW" as const,
    validationReasons: [...new Set([
      ...(metric.rawEvidence?.validationReasons || []),
      ...(parsed?.reasons || []),
      ...(!manualInput && !metric.rawEvidence?.bindingKind ? ["BINDING_EVIDENCE_MISSING"] : []),
      ...(!manualInput && !metric.rawEvidence?.calibrationSignature ? ["BINDING_SIGNATURE_MISSING"] : [])
    ])]
  };
  const isKnown = standardKey !== "unknown";
  return {
    ...metric,
    key: standardKey,
    name: isKnown ? metricKeyLabels[standardKey] : metric.name || metric.key || metricKeyLabels.unknown,
    value: parsed?.normalizedText ?? metric.value,
    unit: metric.unit || parsed?.unit,
    metricSource,
    confidence: parsed?.status === "INVALID" ? 0.1 : metric.confidence ?? defaultConfidence(metricSource, standardKey),
    rawEvidence: evidence
  };
}

function metricSourceFromLegacy(source: VisibleMetric["source"]): NonNullable<VisibleMetric["metricSource"]> {
  if (source === "network") return "XHR_JSON";
  if (source === "table") return "TABLE";
  if (source === "manual") return "MANUAL_INPUT";
  return "DOM_TEXT";
}

function defaultConfidence(source: NonNullable<VisibleMetric["metricSource"]>, key: string) {
  if (identifyMetricKey(key) === "unknown") return 0.4;
  if (source === "MANUAL_INPUT") return 1;
  if (source === "XHR_JSON") return 0.85;
  if (source === "TABLE") return 0.75;
  if (source === "DOM_TEXT") return 0.6;
  return 0.5;
}

function metricPriority(metric: VisibleMetric) {
  const source = metric.metricSource || metricSourceFromLegacy(metric.source);
  const sourceRank: Record<NonNullable<VisibleMetric["metricSource"]>, number> = {
    MANUAL_INPUT: 5,
    XHR_JSON: 4,
    TABLE: 3,
    SCREENSHOT: 2,
    DOM_TEXT: 1,
    UNKNOWN: 0
  };
  return sourceRank[source] * 10 + (metric.confidence ?? defaultConfidence(source, String(metric.key)));
}
