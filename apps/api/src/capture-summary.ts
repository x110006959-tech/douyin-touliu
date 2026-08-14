import {
  collectionDataProvenance,
  evaluateCollectionRouteDiagnostic,
  identifyMetricKey,
  metricKeyCategories,
  normalizeCollectionRouteKey,
  structuredCollectionDataSchema,
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
import { projectSnapshotTables, toTableCellReviewDTO } from "./table-cell-reviews.js";

export async function getCaptureSummary(userId: string, collectionTaskId: string): Promise<CaptureSummaryDTO | null> {
  const task = await prisma.collectionTask.findFirst({
    where: { id: collectionTaskId, project: { workspace: { ownerId: userId } } },
    include: {
      routeSources: { orderBy: [{ required: "desc" }, { createdAt: "asc" }] },
      collectionRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          requiredRoutesJson: true,
          startedAt: true,
          status: true,
          lastSnapshotAt: true,
          completedAt: true,
          routeHealth: true
        }
      }
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
        include: { normalizedMetrics: { include: { reviewedMetric: true } }, tableCellReviews: true }
      })
    : [];
  const latestByRoute = new Map(selectedSnapshots.map((snapshot) => [
    normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType),
    snapshot
  ]));
  const latestRun = task.collectionRuns[0] || null;
  const heartbeatByRoute = new Map((latestRun?.routeHealth || []).map((heartbeat) => [
    normalizeCollectionRouteKey(heartbeat.routeKey),
    heartbeat
  ]));

  const routes = task.routeSources.map((route) => {
    const routeKey = normalizeCollectionRouteKey(route.routeKey);
    const snapshot = latestByRoute.get(routeKey);
    const captureMeta = readCaptureMeta(snapshot?.captureMetaJson);
    const required = activeRequiredRoutes ? activeRequiredRoutes.has(routeKey) : route.required;
    const diagnostic = evaluateCollectionRouteDiagnostic({
      routeKey,
      required,
      runActive: latestRun?.status === "ACTIVE" || latestRun?.status === "DEGRADED",
      runStartedAt: latestRun?.startedAt || null,
      snapshot: snapshot ? {
        id: snapshot.id,
        localCollectedAt: snapshot.localCollectedAt,
        routeVerificationStatus: snapshot.routeVerificationStatus,
        captureMeta
      } : null,
      heartbeat: heartbeatByRoute.get(routeKey) || null
    });
    const state = routeState(diagnostic.summaryStatus, route.sourceUrl);
    return {
      routeKey,
      label: route.label,
      required,
      sourceUrl: route.sourceUrl,
      snapshotId: snapshot?.id || null,
      snapshotUpdatedAt: snapshot?.updatedAt.toISOString() || null,
      state,
      routeVerificationStatus: snapshot?.routeVerificationStatus || null,
      completeness: captureMeta?.completeness || null,
      lastCapturedAt: diagnostic.lastCapturedAt || route.lastCapturedAt?.toISOString() || null,
      metricCount: snapshot?.normalizedMetrics.filter((metric) => metric.metricValue.trim() !== "").length || 0,
      coverageRatio: captureMeta?.coverageRatio ?? null,
      lastError: diagnostic.issues.find((issue) => issue.code === "UPLOAD_FAILED")?.message || null,
      diagnostic
    };
  });
  const diagnosticByRoute = new Map(routes.map((route) => [route.routeKey, route.diagnostic]));

  const metricByKey = new Map<string, CaptureSummaryMetricDTO>();
  for (const snapshot of selectedSnapshots) {
    const routeKey = normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType);
    for (const metric of snapshot.normalizedMetrics) {
      const reviewed = metric.reviewedMetric;
      const standardizedKey = identifyMetricKey(metric.metricKey);
      // A matching metric on separate routes is distinct evidence and must stay independently reviewable.
      const dedupeKey = standardizedKey === "unknown"
        ? `${routeKey}:${metric.metricName}`
        : `${routeKey}:${standardizedKey}`;
      if (metricByKey.has(dedupeKey)) continue;
      const reviewStatus = (reviewed?.reviewStatus || "PENDING") as MetricReviewStatus;
      metricByKey.set(dedupeKey, {
        metricKey: metric.metricKey,
        metricName: metric.metricName,
        metricValue: reviewed?.reviewStatus === "MODIFIED" ? reviewed.reviewedValue || metric.metricValue : metric.metricValue,
        displayValue: summaryDisplayValue(metric, reviewed),
        originalValue: reviewed?.originalValue || null,
        metricUnit: metric.metricUnit,
        category: standardizedKey === "unknown" ? "UNKNOWN" : metricKeyCategories[standardizedKey],
        confidence: reviewed?.confidence ?? metric.confidence,
        metricSource: normalizeMetricSource(reviewed?.metricSource || metric.metricSource),
        routeKey,
        pageType: snapshot.pageType,
        capturedAt: snapshot.localCollectedAt.toISOString(),
        reviewStatus,
        provenance: collectionDataProvenance(
          diagnosticByRoute.get(routeKey) || evaluateCollectionRouteDiagnostic({
            routeKey,
            required: false,
            snapshot: {
              id: snapshot.id,
              localCollectedAt: snapshot.localCollectedAt,
              routeVerificationStatus: snapshot.routeVerificationStatus,
              captureMeta: readCaptureMeta(snapshot.captureMetaJson)
            }
          }),
          snapshot.id
        )
      });
    }
  }

  const coverageValues = selectedSnapshots
    .map((snapshot) => readCaptureMeta(snapshot.captureMetaJson)?.coverageRatio)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const requiredRoutes = routes.filter((route) => route.required);
  const requiredRoutesCaptured = requiredRoutes.every((route) => Boolean(route.snapshotId));
  const requiredRoutesComplete = requiredRoutesCaptured
    && requiredRoutes.every((route) => route.state === "UPLOADED" || route.state === "PARTIAL");

  const metrics = [...metricByKey.values()];
  const overview = selectOverviewMetrics(metrics);
  return {
    snapshotCount: selectedSnapshots.length,
    latestCapturedAt: selectedSnapshots[0]?.localCollectedAt.toISOString() || null,
    collectionRun: latestRun ? {
      id: latestRun.id,
      status: latestRun.status,
      startedAt: latestRun.startedAt.toISOString(),
      lastSnapshotAt: latestRun.lastSnapshotAt?.toISOString() || null,
      completedAt: latestRun.completedAt?.toISOString() || null
    } : null,
    coverageRatio: coverageValues.length ? coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length : null,
    requiredRoutesCaptured,
    requiredRoutesComplete,
    pendingRouteConfirmationCount: routes.filter((route) => route.snapshotId && route.routeVerificationStatus === "MANUAL_PENDING").length,
    overviewRouteKey: overview.routeKey,
    overviewMetrics: overview.metrics,
    routes,
    metrics,
    structuredData: selectedSnapshots.flatMap((snapshot) => {
      const parsed = structuredCollectionDataSchema.safeParse(snapshot.structuredDataJson);
      return parsed.success ? [parsed.data] : [];
    }),
    tables: selectedSnapshots.flatMap((snapshot) => projectTables(snapshot.rawTableData, {
      snapshotId: snapshot.id,
      snapshotUpdatedAt: snapshot.updatedAt.toISOString(),
      routeKey: normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType),
      routeDetectionConfidence: readCaptureMeta(snapshot.captureMetaJson)?.routeDetection?.confidence ?? null,
      tableBindings: readCaptureMeta(snapshot.captureMetaJson)?.tableBindings || [],
      pageType: snapshot.pageType,
      capturedAt: snapshot.localCollectedAt.toISOString(),
      reviews: snapshot.tableCellReviews
    }))
  };
}

function routeState(
  status: import("@douyin-local-life/shared").CollectionRouteDiagnosticStatus,
  sourceUrl: string | null
): CaptureSummaryRouteState {
  if (status === "MISSING") return sourceUrl ? "READY" : "PENDING";
  return status;
}

export function selectOverviewMetrics(metrics: CaptureSummaryMetricDTO[]) {
  // Overview values come from one route only; same-name metrics are not safely additive.
  const preferredRouteKeys = ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN"] as const;
  const routeKey = preferredRouteKeys.find((candidate) => metrics.some((metric) => metric.routeKey === candidate)) || null;
  return {
    routeKey,
    metrics: routeKey ? metrics.filter((metric) => metric.routeKey === routeKey) : []
  };
}

export function summaryDisplayValue(
  metric: { metricValue: string; rawEvidence: unknown },
  reviewed?: { reviewStatus: string; reviewedValue: string | null; originalValue?: string | null } | null
) {
  if (reviewed?.reviewStatus === "MODIFIED" && reviewed.reviewedValue) return reviewed.reviewedValue;
  if (!metric.rawEvidence || typeof metric.rawEvidence !== "object" || Array.isArray(metric.rawEvidence)) return null;
  const displayValue = (metric.rawEvidence as Record<string, unknown>).displayValue;
  return typeof displayValue === "string" && displayValue ? displayValue : null;
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
  context: {
    snapshotId: string;
    snapshotUpdatedAt: string;
    routeKey: CaptureSummaryDTO["tables"][number]["routeKey"];
    routeDetectionConfidence: number | null;
    tableBindings: NonNullable<CaptureMeta["tableBindings"]>;
    pageType: string | null;
    capturedAt: string;
    reviews: Array<{
      id: string;
      taskId: string;
      snapshotId: string;
      tableIndex: number;
      rowIndex: number;
      columnIndex: number;
      originalValue: string | null;
      reviewedValue: string | null;
      reviewStatus: "PENDING" | "CONFIRMED" | "MODIFIED" | "IGNORED";
      reviewedAt: Date | null;
    }>;
  }
): CaptureSummaryDTO["tables"] {
  return projectSnapshotTables(raw, {
    routeKey: context.routeKey,
    pageType: context.pageType
  }).map((table, tableIndex) => {
    const binding = context.tableBindings.find((item) => item.tableIndex === tableIndex);
    return {
      ...context,
      tableIndex,
      bindingStatus: binding?.validationStatus || "REQUIRES_REVIEW",
      bindingReasons: binding?.validationReasons || ["TABLE_BINDING_EVIDENCE_MISSING"],
      headers: binding?.headers || table.rows[0]?.map((cell) => String(cell ?? "")) || [],
      identityColumn: binding?.identityColumn || null,
      identityColumnIndex: binding?.identityColumnIndex ?? null,
      timeRange: binding?.timeRange || null,
      bindingLocation: binding?.componentPath || null,
      rows: table.rows.map((row) => row.map((cell) => String(cell ?? "").slice(0, 1_000))),
      cellReviews: context.reviews.filter((review) => review.tableIndex === tableIndex).map(toTableCellReviewDTO)
    };
  });
}

export function tableReviewCoverageForSummary(summary: CaptureSummaryDTO) {
  const totalCount = summary.tables.reduce((total, table) => total + table.rows.reduce((rowTotal, row) => rowTotal + row.length, 0), 0);
  const reviews = summary.tables.flatMap((table) => table.cellReviews);
  const statusCounts = new Map(reviews.map((review) => [
    `${review.snapshotId}:${review.tableIndex}:${review.rowIndex}:${review.columnIndex}`,
    review.reviewStatus
  ]));
  let confirmedCount = 0;
  let modifiedCount = 0;
  let ignoredCount = 0;
  let pendingCount = 0;
  for (const table of summary.tables) {
    for (const [rowIndex, row] of table.rows.entries()) {
      for (const [columnIndex] of row.entries()) {
        const status = statusCounts.get(`${table.snapshotId}:${table.tableIndex}:${rowIndex}:${columnIndex}`) || "PENDING";
        if (status === "CONFIRMED") confirmedCount += 1;
        else if (status === "MODIFIED") modifiedCount += 1;
        else if (status === "IGNORED") ignoredCount += 1;
        else pendingCount += 1;
      }
    }
  }
  return { confirmedCount, modifiedCount, ignoredCount, pendingCount, totalCount };
}
