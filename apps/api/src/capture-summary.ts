import {
  collectionFreshnessPolicy,
  identifyMetricKey,
  metricKeyCategories,
  normalizeCollectionRouteKey,
  type CaptureMeta,
  type CaptureSummaryDTO,
  type CaptureSummaryMetricDTO,
  type CaptureSummaryRouteState,
  type MetricReviewStatus,
  type MetricSource
} from "@douyin-local-life/shared";
import { prisma } from "./prisma.js";
import { requiredRoutesFromJson } from "./collection-runs.js";
import { findCurrentSnapshotIdsByRoute } from "./current-snapshots.js";

export async function getCaptureSummary(userId: string, collectionTaskId: string): Promise<CaptureSummaryDTO | null> {
  const task = await prisma.collectionTask.findFirst({
    where: { id: collectionTaskId, project: { workspace: { ownerId: userId } } },
    include: {
      routeSources: { orderBy: [{ required: "desc" }, { createdAt: "asc" }] },
      collectionRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, requiredRoutesJson: true } }
    }
  });
  if (!task) return null;

  const latestRunId = task.collectionRuns[0]?.id || null;
  const activeRequiredRoutes = task.collectionRuns[0]
    ? new Set(requiredRoutesFromJson(task.collectionRuns[0].requiredRoutesJson))
    : null;
  const snapshotIds = await findCurrentSnapshotIdsByRoute(prisma, {
    taskId: task.id,
    collectionRunId: latestRunId,
    routeKeys: task.routeSources.map((route) => route.routeKey)
  });
  const selectedSnapshots = snapshotIds.length
    ? await prisma.dataSnapshot.findMany({
        where: { id: { in: snapshotIds } },
        orderBy: [{ localCollectedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        include: { normalizedMetrics: { include: { reviewedMetric: true } } }
      })
    : [];
  const latestByRoute = new Map(selectedSnapshots.map((snapshot) => [
    normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType),
    snapshot
  ]));

  const routes = task.routeSources.map((route) => {
    const routeKey = normalizeCollectionRouteKey(route.routeKey);
    const snapshot = latestByRoute.get(routeKey);
    const captureMeta = readCaptureMeta(snapshot?.captureMetaJson);
    const state = routeState(route.lastError, route.sourceUrl, snapshot?.localCollectedAt, snapshot?.accountMatchStatus, snapshot?.routeVerificationStatus, captureMeta);
    return {
      routeKey,
      label: route.label,
      required: activeRequiredRoutes ? activeRequiredRoutes.has(routeKey) : route.required,
      sourceUrl: route.sourceUrl,
      snapshotId: snapshot?.id || null,
      snapshotUpdatedAt: snapshot?.updatedAt.toISOString() || null,
      state,
      routeVerificationStatus: snapshot?.routeVerificationStatus || null,
      accountMatchStatus: snapshot?.accountMatchStatus || null,
      detectedAccountId: snapshot?.detectedAccountId || null,
      detectedAccountName: snapshot?.detectedAccountName || null,
      completeness: captureMeta?.completeness || null,
      lastCapturedAt: snapshot?.localCollectedAt.toISOString() || route.lastCapturedAt?.toISOString() || null,
      metricCount: snapshot?.normalizedMetrics.length || 0,
      coverageRatio: captureMeta?.coverageRatio ?? null,
      lastError: route.lastError
    };
  });

  const metricByKey = new Map<string, CaptureSummaryMetricDTO>();
  for (const snapshot of selectedSnapshots) {
    const routeKey = normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType);
    for (const metric of snapshot.normalizedMetrics) {
      const reviewed = metric.reviewedMetric;
      const standardizedKey = identifyMetricKey(metric.metricKey);
      const dedupeKey = standardizedKey === "unknown" ? `${routeKey}:${metric.metricName}` : standardizedKey;
      if (metricByKey.has(dedupeKey)) continue;
      const reviewStatus = (reviewed?.reviewStatus || "PENDING") as MetricReviewStatus;
      metricByKey.set(dedupeKey, {
        metricKey: metric.metricKey,
        metricName: metric.metricName,
        metricValue: reviewed?.reviewStatus === "MODIFIED" ? reviewed.reviewedValue || metric.metricValue : metric.metricValue,
        metricUnit: metric.metricUnit,
        category: standardizedKey === "unknown" ? "UNKNOWN" : metricKeyCategories[standardizedKey],
        confidence: reviewed?.confidence ?? metric.confidence,
        metricSource: normalizeMetricSource(reviewed?.metricSource || metric.metricSource),
        routeKey,
        pageType: snapshot.pageType,
        capturedAt: snapshot.localCollectedAt.toISOString(),
        reviewStatus
      });
    }
  }

  const coverageValues = selectedSnapshots
    .map((snapshot) => readCaptureMeta(snapshot.captureMetaJson)?.coverageRatio)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const accountMatchStatus = selectedSnapshots.length
    ? selectedSnapshots.every((snapshot) => snapshot.accountMatchStatus === "MATCHED") ? "MATCHED" : "UNVERIFIED"
    : null;
  const requiredRoutes = routes.filter((route) => route.required);
  const requiredRoutesCaptured = requiredRoutes.every((route) => Boolean(route.snapshotId));
  const requiredRoutesAccountMatched = requiredRoutesCaptured
    && requiredRoutes.every((route) => route.accountMatchStatus === "MATCHED");
  const requiredRoutesComplete = requiredRoutesAccountMatched
    && requiredRoutes.every((route) => route.state === "UPLOADED" || route.state === "PARTIAL");

  return {
    snapshotCount: selectedSnapshots.length,
    latestCapturedAt: selectedSnapshots[0]?.localCollectedAt.toISOString() || null,
    accountMatchStatus,
    coverageRatio: coverageValues.length ? coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length : null,
    requiredRoutesCaptured,
    requiredRoutesAccountMatched,
    requiredRoutesComplete,
    pendingAccountConfirmationCount: routes.filter((route) => route.snapshotId && route.accountMatchStatus === "UNVERIFIED").length,
    pendingRouteConfirmationCount: routes.filter((route) => route.snapshotId && route.routeVerificationStatus === "MANUAL_PENDING").length,
    routes,
    metrics: [...metricByKey.values()],
    tables: selectedSnapshots.flatMap((snapshot) => projectTables(snapshot.rawTableData, {
      routeKey: normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType),
      pageType: snapshot.pageType,
      capturedAt: snapshot.localCollectedAt.toISOString()
    }))
  };
}

function routeState(
  lastError: string | null,
  sourceUrl: string | null,
  collectedAt: Date | undefined,
  accountMatchStatus: string | undefined,
  routeVerificationStatus: string | undefined,
  captureMeta: CaptureMeta | null
): CaptureSummaryRouteState {
  if (!collectedAt) return lastError ? "FAILED" : sourceUrl ? "READY" : "PENDING";
  if (Date.now() - collectedAt.getTime() > collectionFreshnessPolicy.staleAfterMs) return "STALE";
  if (accountMatchStatus !== "MATCHED") return "UNVERIFIED";
  if (routeVerificationStatus === "MANUAL_PENDING") return "MANUAL_PENDING";
  if (captureMeta?.completeness === "PARTIAL" || captureMeta?.completeness === "UNKNOWN") return "PARTIAL";
  return "UPLOADED";
}

function readCaptureMeta(value: unknown): CaptureMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const meta = value as Partial<CaptureMeta>;
  return typeof meta.coverageRatio === "number" && typeof meta.completeness === "string" ? meta as CaptureMeta : null;
}

function normalizeMetricSource(value: string): MetricSource {
  if (value === "XHR_JSON" || value === "TABLE" || value === "DOM_TEXT" || value === "SCREENSHOT" || value === "MANUAL_INPUT" || value === "UNKNOWN") return value;
  return "UNKNOWN";
}

function projectTables(
  raw: unknown,
  context: { routeKey: CaptureSummaryDTO["tables"][number]["routeKey"]; pageType: string | null; capturedAt: string }
): CaptureSummaryDTO["tables"] {
  if (!Array.isArray(raw)) return [];
  const result: CaptureSummaryDTO["tables"] = [];
  for (const candidate of raw.slice(0, 4)) {
    if (!Array.isArray(candidate)) continue;
    const rows = candidate.slice(0, 20).flatMap((row) => {
      if (!Array.isArray(row)) return [];
      return [row.slice(0, 12).map((cell) => String(cell ?? "").slice(0, 200))];
    });
    if (rows.length) result.push({ ...context, rows });
  }
  return result;
}
