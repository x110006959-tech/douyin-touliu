import {
  collectionFreshnessPolicy,
  metricValueSemantic,
  metricValueToRuleNumber,
  type CollectionQuality,
  type CollectionRouteKey,
  type RealtimeEvidenceSummary,
  type RealtimeMetricFrame,
  type VisibleMetric
} from "@douyin-local-life/shared";
import {
  localPromotionApiMetricKeys,
  localPromotionPulseMetricLabels,
  localPromotionInternalApiFields
} from "@douyin-local-life/shared";

export const liveOverviewRealtimeDecisionFreshnessMs = 60_000;
export const localPromotionRealtimeDecisionFreshnessMs = 60_000;
type RealtimeDecisionEvidence = { summary: RealtimeEvidenceSummary; metrics: VisibleMetric[] };

export function liveOverviewRealtimeDecisionEvidence(
  frame: RealtimeMetricFrame | null | undefined,
  now = Date.now()
): RealtimeDecisionEvidence | null {
  if (!frame || frame.routeKey !== "LIVE_DATA_SCREEN" || frame.pageType !== "LIVE_DATA_SCREEN") return null;
  const observedAt = Date.parse(frame.observedAt);
  const receivedAt = Date.parse(frame.receivedAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(receivedAt)) return null;
  const freshestAt = Math.max(observedAt, receivedAt);
  if (now - freshestAt > liveOverviewRealtimeDecisionFreshnessMs) return null;
  const metrics = frame.metrics
    .filter(isInternalApiMetric)
    .flatMap((metric) => {
      const value = metricValueToRuleNumber(metric, metricValueSemantic(String(metric.key)));
      return value == null ? [] : [{
        ...metric,
        value,
        source: "network" as const,
        metricSource: "XHR_JSON" as const,
        confidence: 1,
        rawEvidence: metric.rawEvidence ? {
          ...metric.rawEvidence,
          validationStatus: "TRUSTED" as const,
          validationReasons: [],
          sourceStatus: "INTERNAL_API" as const,
          routeKey: "LIVE_DATA_SCREEN" as const
        } : {
          sourceType: "INTERNAL_API",
          bindingKind: "CARD" as const,
          validationStatus: "TRUSTED" as const,
          validationReasons: [],
          sourceStatus: "INTERNAL_API" as const,
          evidencePurpose: "PULSE_ONLY" as const,
          routeKey: "LIVE_DATA_SCREEN" as const
        }
      }];
    });
  if (!metrics.length) return null;
  const summary: RealtimeEvidenceSummary = {
    routeKey: "LIVE_DATA_SCREEN",
    pageType: "LIVE_DATA_SCREEN",
    observedAt: frame.observedAt,
    receivedAt: frame.receivedAt,
    metricCount: metrics.length,
    successfulEndpoints: frame.successfulEndpoints.slice(0, 20),
    source: "LIVE_SCREEN_INTERNAL_API"
  };
  return { summary, metrics };
}

export function localPromotionRealtimeDecisionEvidence(
  frame: RealtimeMetricFrame | null | undefined,
  now = Date.now()
): RealtimeDecisionEvidence | null {
  if (!frame || frame.routeKey !== "LOCAL_PROMOTION_DASHBOARD" || frame.pageType !== "LOCAL_PROMOTION_DASHBOARD") return null;
  const observedAt = Date.parse(frame.observedAt);
  const receivedAt = Date.parse(frame.receivedAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(receivedAt)) return null;
  if (now - Math.max(observedAt, receivedAt) > localPromotionRealtimeDecisionFreshnessMs) return null;
  const allowed = new Set<string>(localPromotionApiMetricKeys);
  const fieldByMetric = new Map(localPromotionInternalApiFields.map((field) => [field.metricKey, field]));
  const metrics = frame.metrics
    .filter((metric) => allowed.has(String(metric.key)) && isInternalApiMetric(metric))
    .flatMap((metric) => {
      const key = String(metric.key);
      const value = metricValueToRuleNumber(metric, metricValueSemantic(key));
      const field = fieldByMetric.get(key as typeof localPromotionApiMetricKeys[number]);
      return value == null || !field ? [] : [{
        ...metric,
        name: metric.name || localPromotionPulseMetricLabels[field.metricKey],
        value,
        source: "network" as const,
        metricSource: "XHR_JSON" as const,
        confidence: 1,
        rawEvidence: metric.rawEvidence ? {
          ...metric.rawEvidence,
          validationStatus: "TRUSTED" as const,
          validationReasons: [],
          sourceStatus: "INTERNAL_API" as const,
          routeKey: "LOCAL_PROMOTION_DASHBOARD" as const
        } : {
          sourceType: "INTERNAL_API",
          bindingKind: "CARD" as const,
          validationStatus: "TRUSTED" as const,
          validationReasons: [],
          sourceStatus: "INTERNAL_API" as const,
          evidencePurpose: "PULSE_ONLY" as const,
          componentPath: field.fieldPath,
          routeKey: "LOCAL_PROMOTION_DASHBOARD" as const
        }
      }];
    });
  if (!metrics.length) return null;
  const summary: RealtimeEvidenceSummary = {
    routeKey: "LOCAL_PROMOTION_DASHBOARD",
    pageType: "LOCAL_PROMOTION_DASHBOARD",
    observedAt: frame.observedAt,
    receivedAt: frame.receivedAt,
    metricCount: metrics.length,
    successfulEndpoints: frame.successfulEndpoints.slice(0, 20),
    source: "LOCAL_PROMOTION_INTERNAL_API"
  };
  return { summary, metrics };
}

export function realtimeDecisionEvidenceForFrame(frame: RealtimeMetricFrame | null | undefined, now = Date.now()): RealtimeDecisionEvidence | null {
  return liveOverviewRealtimeDecisionEvidence(frame, now) || localPromotionRealtimeDecisionEvidence(frame, now);
}

export function hasUsableLiveOverviewRealtimeEvidence(input: {
  realtimeEvidence?: RealtimeEvidenceSummary;
}, routeKey: CollectionRouteKey, now = Date.now()) {
  const evidence = input.realtimeEvidence;
  const sourceMatchesRoute = routeKey === "LIVE_DATA_SCREEN"
    ? evidence?.source === "LIVE_SCREEN_INTERNAL_API"
    : routeKey === "LOCAL_PROMOTION_DASHBOARD"
      ? evidence?.source === "LOCAL_PROMOTION_INTERNAL_API"
      : false;
  if (!evidence || !sourceMatchesRoute || evidence.routeKey !== routeKey || evidence.pageType !== routeKey) return false;
  const observedAt = Date.parse(evidence.observedAt);
  const receivedAt = Date.parse(evidence.receivedAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(receivedAt) || evidence.metricCount <= 0) return false;
  const freshness = routeKey === "LOCAL_PROMOTION_DASHBOARD"
    ? localPromotionRealtimeDecisionFreshnessMs
    : liveOverviewRealtimeDecisionFreshnessMs;
  return now - Math.max(observedAt, receivedAt) <= freshness;
}

export function applyLiveOverviewRealtimeRouteCoverage(
  quality: CollectionQuality | undefined,
  realtimeEvidence: RealtimeEvidenceSummary | undefined,
  now = Date.now()
) {
  const routeKey = realtimeEvidence?.routeKey;
  if (!quality || !routeKey || !hasUsableLiveOverviewRealtimeEvidence({ realtimeEvidence }, routeKey, now)) return quality;
  if (!quality.requiredRoutes.includes(routeKey)) return quality;
  const receivedAt = Date.parse(realtimeEvidence!.receivedAt);
  const ageMs = Math.max(0, now - receivedAt);
  const liveRoute = {
    routeKey,
    state: ageMs > collectionFreshnessPolicy.agingAfterMs ? "AGING" as const : "FRESH" as const,
    lastCollectedAt: realtimeEvidence!.receivedAt,
    ageMs
  };
  const routes = quality.routes.some((route) => route.routeKey === routeKey)
    ? quality.routes.map((route) => route.routeKey === routeKey ? liveRoute : route)
    : [...quality.routes, liveRoute];
  const missingRoutes = quality.missingRoutes.filter((route) => route !== routeKey);
  const staleRoutes = quality.staleRoutes.filter((route) => route !== routeKey);
  const available = routes.filter((route) => route.state === "FRESH" || route.state === "AGING").length;
  const completeness = quality.requiredRoutes.length
    ? Math.round((available / quality.requiredRoutes.length) * 100) / 100
    : quality.completeness;
  return {
    ...quality,
    routes,
    completeness,
    missingRoutes,
    staleRoutes,
    blocksStrongActions: missingRoutes.length > 0 || staleRoutes.length > 0
  };
}

export const applyRealtimeRouteCoverage = applyLiveOverviewRealtimeRouteCoverage;

function isInternalApiMetric(metric: VisibleMetric) {
  const evidence = metric.rawEvidence;
  return metric.source === "network"
    && metric.metricSource === "XHR_JSON"
    && evidence?.sourceType === "INTERNAL_API"
    && evidence.evidencePurpose === "PULSE_ONLY"
    && evidence.sourceStatus === "INTERNAL_API";
}
