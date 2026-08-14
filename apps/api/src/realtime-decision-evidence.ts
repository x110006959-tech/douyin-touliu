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

export const liveOverviewRealtimeDecisionFreshnessMs = 60_000;

export function liveOverviewRealtimeDecisionEvidence(
  frame: RealtimeMetricFrame | null | undefined,
  now = Date.now()
) {
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
          sourceStatus: "INTERNAL_API" as const
        } : {
          sourceType: "INTERNAL_API",
          bindingKind: "CARD" as const,
          validationStatus: "TRUSTED" as const,
          validationReasons: [],
          sourceStatus: "INTERNAL_API" as const,
          evidencePurpose: "PULSE_ONLY" as const
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

export function hasUsableLiveOverviewRealtimeEvidence(input: {
  realtimeEvidence?: RealtimeEvidenceSummary;
}, routeKey: CollectionRouteKey, now = Date.now()) {
  const evidence = input.realtimeEvidence;
  if (!evidence || routeKey !== "LIVE_DATA_SCREEN" || evidence.routeKey !== "LIVE_DATA_SCREEN" || evidence.pageType !== "LIVE_DATA_SCREEN") return false;
  const observedAt = Date.parse(evidence.observedAt);
  const receivedAt = Date.parse(evidence.receivedAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(receivedAt) || evidence.metricCount <= 0) return false;
  return now - Math.max(observedAt, receivedAt) <= liveOverviewRealtimeDecisionFreshnessMs;
}

export function applyLiveOverviewRealtimeRouteCoverage(
  quality: CollectionQuality | undefined,
  realtimeEvidence: RealtimeEvidenceSummary | undefined,
  now = Date.now()
) {
  if (!quality || !hasUsableLiveOverviewRealtimeEvidence({ realtimeEvidence }, "LIVE_DATA_SCREEN", now)) return quality;
  if (!quality.requiredRoutes.includes("LIVE_DATA_SCREEN")) return quality;
  const receivedAt = Date.parse(realtimeEvidence!.receivedAt);
  const ageMs = Math.max(0, now - receivedAt);
  const liveRoute = {
    routeKey: "LIVE_DATA_SCREEN" as const,
    state: ageMs > collectionFreshnessPolicy.agingAfterMs ? "AGING" as const : "FRESH" as const,
    lastCollectedAt: realtimeEvidence!.receivedAt,
    ageMs
  };
  const routes = quality.routes.some((route) => route.routeKey === "LIVE_DATA_SCREEN")
    ? quality.routes.map((route) => route.routeKey === "LIVE_DATA_SCREEN" ? liveRoute : route)
    : [...quality.routes, liveRoute];
  const missingRoutes = quality.missingRoutes.filter((route) => route !== "LIVE_DATA_SCREEN");
  const staleRoutes = quality.staleRoutes.filter((route) => route !== "LIVE_DATA_SCREEN");
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

function isInternalApiMetric(metric: VisibleMetric) {
  const evidence = metric.rawEvidence;
  return metric.source === "network"
    && metric.metricSource === "XHR_JSON"
    && evidence?.sourceType === "INTERNAL_API"
    && evidence.evidencePurpose === "PULSE_ONLY"
    && evidence.sourceStatus === "INTERNAL_API";
}
