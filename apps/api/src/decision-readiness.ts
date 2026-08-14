import { evaluateDecisionPolicy } from "@douyin-local-life/decision-engine";
import { collectionFreshnessPolicy, collectionRouteTemplates, normalizeCollectionRouteKey, type DecisionEngineInput } from "@douyin-local-life/shared";
import { evaluateFormalDecisionReadiness } from "@douyin-local-life/shared/formal-decision-readiness";
import { currentReviewedMetrics, reviewCoverage } from "./review-metrics.js";
import { requiredRoutesFromJson } from "./collection-runs.js";
import { selectLatestSnapshotsByRoute } from "./current-snapshots.js";
import { hasUntrustedCurrentEvidence } from "./decision.js";
import { hasUsableLiveOverviewRealtimeEvidence } from "./realtime-decision-evidence.js";
import type { getTaskForDecision } from "./ownership.js";

type DecisionTask = NonNullable<Awaited<ReturnType<typeof getTaskForDecision>>>;

export function evaluateDecisionReadiness(task: DecisionTask, input: DecisionEngineInput, options: { now?: number } = {}) {
  const now = options.now ?? Date.now();
  const policy = evaluateDecisionPolicy(input);
  const latestRunId = task.collectionRuns[0]?.id || null;
  const currentSnapshots = selectLatestSnapshotsByRoute(task.snapshots, latestRunId);
  const latestByRoute = new Map(currentSnapshots.flatMap((snapshot) => {
    const routeKey = normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType);
    return routeKey ? [[routeKey, snapshot] as const] : [];
  }));
  const activeRequiredRouteKeys = task.collectionRuns[0]
    ? requiredRoutesFromJson(task.collectionRuns[0].requiredRoutesJson)
    : task.routeSources.filter((route) => route.required).map((route) => route.routeKey);
  const requiredRoutes = activeRequiredRouteKeys.map((routeKey) => task.routeSources.find((route) => route.routeKey === routeKey) || {
    routeKey,
    label: collectionRouteTemplates.find((route) => route.routeKey === routeKey)?.label || routeKey
  });
  const realtimeCoveredRoutes = new Set(requiredRoutes
    .map((route) => normalizeCollectionRouteKey(route.routeKey))
    .filter((routeKey) => hasUsableLiveOverviewRealtimeEvidence(input, routeKey, now)));
  const missingRequiredRoutes = requiredRoutes.filter((route) => {
    const routeKey = normalizeCollectionRouteKey(route.routeKey);
    return !realtimeCoveredRoutes.has(routeKey) && !latestByRoute.has(routeKey);
  });
  const unverifiedRequiredRoutes = requiredRoutes.filter((route) => {
    const routeKey = normalizeCollectionRouteKey(route.routeKey);
    if (realtimeCoveredRoutes.has(routeKey)) return false;
    const snapshot = latestByRoute.get(routeKey);
    return snapshot && snapshot.routeVerificationStatus !== "VERIFIED";
  });
  const staleRequiredRoutes = requiredRoutes.filter((route) => {
    const routeKey = normalizeCollectionRouteKey(route.routeKey);
    if (realtimeCoveredRoutes.has(routeKey)) return false;
    const snapshot = latestByRoute.get(routeKey);
    return snapshot?.localCollectedAt
      ? now - snapshot.localCollectedAt.getTime() > collectionFreshnessPolicy.staleAfterMs
      : false;
  });
  const currentSnapshotRouteById = new Map(currentSnapshots.map((snapshot) => [
    snapshot.id,
    normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType)
  ]));
  const currentMetricReviewCoverage = reviewCoverage(currentReviewedMetrics(task).filter((metric) => {
    const routeKey = metric.snapshotId ? currentSnapshotRouteById.get(metric.snapshotId) : null;
    return !routeKey || !realtimeCoveredRoutes.has(routeKey);
  }));
  const readiness = evaluateFormalDecisionReadiness({
    missingRequiredRouteLabels: missingRequiredRoutes.map((route) => route.label),
    unverifiedRequiredRouteLabels: unverifiedRequiredRoutes.map((route) => route.label),
    staleRequiredRouteLabels: staleRequiredRoutes.map((route) => route.label),
    subjectReady: policy.dataQuality.subjectReady !== false,
    reviewTotalCount: Math.max(input.reviewCoverage?.totalCount || 0, currentMetricReviewCoverage.totalCount),
    reviewPendingCount: Math.max(input.reviewCoverage?.pendingCount || 0, currentMetricReviewCoverage.pendingCount)
  });
  const invalidEvidenceReason = hasUntrustedCurrentEvidence(task, { coveredRoutes: realtimeCoveredRoutes })
    ? "当前快照存在未放行的字段绑定或表格行列证据，不能生成正式诊断"
    : null;
  const unsupportedBusinessModeReason = isManagedLiveGrowth(input)
    ? null
    : "首期 AI 诊断只支持代直播增长项目";
  const additionalBlockingReasons = [invalidEvidenceReason, unsupportedBusinessModeReason].filter((reason): reason is string => Boolean(reason));
  const advisories = (policy.dataQuality.blockingReasons || []).filter((reason) => !["主体识别未完成", "数据未人工复核"].includes(reason));
  return {
    ...readiness,
    ready: readiness.ready && additionalBlockingReasons.length === 0,
    blockingReasons: [...readiness.blockingReasons, ...additionalBlockingReasons],
    advisories
  };
}

function isManagedLiveGrowth(input: DecisionEngineInput) {
  return input.subject.operatorType === "SERVICE_PROVIDER_LIVE" || input.subject.serviceMode?.trim() === "代播";
}
