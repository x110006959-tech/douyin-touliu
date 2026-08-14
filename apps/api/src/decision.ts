import type { Prisma } from "@prisma/client";
import {
  applyApprovalGuard,
  decisionEngineVersion,
  decisionRuleVersion,
  runDecisionRules
} from "@douyin-local-life/decision-engine";
import {
  collectionFreshnessPolicy,
  decisionEngineInputSchema,
  generatedDecisionEngineOutputSchema,
  metricValueSemantic,
  metricValueToRuleNumber,
  normalizeCollectionRouteKey,
  type ActionProposalDTO,
  type DecisionEngineInput,
  type DecisionEngineOutput,
  type RealtimeMetricFrame
} from "@douyin-local-life/shared";
import { structureTaskCollectionTables } from "@douyin-local-life/decision-engine";
import { assessCollectionRunQuality } from "./collection-runs.js";
import { proposalExpiresAfterMs } from "./proposal-lifecycle.js";
import { selectLatestSnapshotsByRoute } from "./current-snapshots.js";
import {
  reviewedMetricsToVisibleMetrics,
  reviewCoverage,
  selectedReviewedMetrics
} from "./review-metrics.js";
import { isConfirmableMetricEvidence } from "./metric-validation.js";
import { applyTableCellReviews, projectSnapshotTables } from "./table-cell-reviews.js";
import {
  applyLiveOverviewRealtimeRouteCoverage,
  liveOverviewRealtimeDecisionEvidence
} from "./realtime-decision-evidence.js";

export const strategyVersion = decisionRuleVersion;

export function buildDecisionInput(task: {
  id: string;
  sourceUrl: string | null;
  pageTitle: string | null;
  project: {
    id: string;
    businessType: string;
    subjectType: string;
    operatorType: string;
    cooperationType: string;
    controlLevel: string;
    subjectConfidence: number;
    serviceProviderName: string | null;
    serviceMode: string | null;
    serviceFee: number | null;
  };
  snapshots: Array<{
    id: string;
    collectionRunId?: string | null;
    routeVerificationStatus?: "VERIFIED" | "MANUAL_PENDING";
    routeKey?: string | null;
    pageType?: string | null;
    localCollectedAt?: Date;
    createdAt?: Date;
    rawDomText: string | null;
    rawNetworkJson: Prisma.JsonValue | null;
    rawTableData: Prisma.JsonValue | null;
    captureMetaJson?: Prisma.JsonValue | null;
    structuredDataJson?: Prisma.JsonValue | null;
    normalizedMetrics: Array<{
      id: string;
      metricKey: string;
      metricName: string;
      metricValue: string;
      metricUnit: string | null;
      metricSource: string;
      confidence?: number | null;
      rawEvidence?: Prisma.JsonValue | null;
    }>;
    tableCellReviews?: Array<{
      tableIndex: number;
      rowIndex: number;
      columnIndex: number;
      originalValue: string | null;
      reviewedValue: string | null;
      reviewStatus: "PENDING" | "CONFIRMED" | "MODIFIED" | "IGNORED";
    }>;
  }>;
  reviewedMetrics?: Array<{
    id: string;
    taskId: string;
    snapshotId: string | null;
    normalizedMetricId: string | null;
    metricKey: string;
    metricName: string;
    originalValue: string | null;
    reviewedValue: string | null;
    metricUnit: string | null;
    metricSource: "XHR_JSON" | "TABLE" | "DOM_TEXT" | "SCREENSHOT" | "MANUAL_INPUT" | "UNKNOWN";
    confidence: number;
    rawEvidence: Prisma.JsonValue | null;
    pageType: string | null;
    scope: string | null;
    timeRange: string | null;
    reviewStatus: "PENDING" | "CONFIRMED" | "MODIFIED" | "IGNORED";
    reviewerId: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  collectionRuns?: Array<{
    id: string;
    requiredRoutesJson: Prisma.JsonValue;
    snapshots: Array<{
      routeKey: string | null;
      pageType: string | null;
      localCollectedAt: Date;
    }>;
    routeHealth?: Array<{ routeKey: string; consecutiveFailures: number }>;
  }>;
}, options: {
  realtimeFrame?: RealtimeMetricFrame | null;
  now?: number;
} = {}): DecisionEngineInput {
  const realtimeDecisionEvidence = liveOverviewRealtimeDecisionEvidence(options.realtimeFrame, options.now);
  if (!task.snapshots.length && !realtimeDecisionEvidence) {
    throw new Error("SNAPSHOT_REQUIRED");
  }
  const latestCollectionRun = task.collectionRuns?.[0];
  const collectionRun = latestCollectionRun;
  const selectedSnapshots = selectFreshVerifiedSnapshots(task.snapshots, collectionRun?.id);
  const realtimeCoveredRoutes = new Set(realtimeDecisionEvidence ? ["LIVE_DATA_SCREEN"] : []);
  const reviewSnapshots = selectedSnapshots.filter((snapshot) => !realtimeCoveredRoutes.has(normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType)));
  const selectedSnapshotIds = new Set(reviewSnapshots.map((snapshot) => snapshot.id));
  const latestReviewedMetrics = (task.reviewedMetrics || []).filter((metric) => metric.snapshotId && selectedSnapshotIds.has(metric.snapshotId));
  const usableReviewedMetrics = selectedReviewedMetrics(latestReviewedMetrics);
  const hasPendingMetrics = latestReviewedMetrics.some((metric) => metric.reviewStatus === "PENDING");
  const tableReview = assessTableReviewState(reviewSnapshots);
  const hasUsableTableCells = tableReview.confirmedCount + tableReview.modifiedCount > 0;
  const hasUntrustedEvidence = reviewSnapshots.some((snapshot) => hasUntrustedSnapshotEvidence(snapshot))
    || latestReviewedMetrics.some((metric) => !isConfirmableMetricEvidence(metric.rawEvidence));
  const useReviewedEvidence = (usableReviewedMetrics.length > 0 || hasUsableTableCells)
    && !hasPendingMetrics
    && tableReview.pendingCount === 0
    && !hasUntrustedEvidence;
  const collectionQuality = collectionRun
    ? assessCollectionRunQuality(collectionRun.requiredRoutesJson, collectionRun.snapshots, collectionRun.routeHealth)
    : undefined;
  const reviewedEvidenceMetrics = useReviewedEvidence ? reviewedMetricsToVisibleMetrics(latestReviewedMetrics).map((metric) => ({
    ...metric,
    value: metricValueToRuleNumber(metric, metricValueSemantic(String(metric.key))) ?? metric.value
  })) : [];
  const decisionMetrics = mergeRealtimeDecisionMetrics(reviewedEvidenceMetrics, realtimeDecisionEvidence?.metrics || []);
  const reviewCoverageValue = mergeRealtimeReviewCoverage(
    latestReviewedMetrics.length || tableReview.totalCount
      ? mergeReviewCoverage(reviewCoverage(latestReviewedMetrics), tableReview)
      : undefined,
    realtimeDecisionEvidence?.metrics.length || 0
  );
  const realtimeOnly = Boolean(realtimeDecisionEvidence && !useReviewedEvidence);

  return {
    projectId: task.project.id,
    collectionTaskId: task.id,
    businessType: task.project.businessType as DecisionEngineInput["businessType"],
    subject: {
      subjectType: task.project.subjectType as DecisionEngineInput["subject"]["subjectType"],
      operatorType: task.project.operatorType as DecisionEngineInput["subject"]["operatorType"],
      cooperationType: task.project.cooperationType as DecisionEngineInput["subject"]["cooperationType"],
      controlLevel: task.project.controlLevel as DecisionEngineInput["subject"]["controlLevel"],
      confidence: task.project.subjectConfidence,
      serviceProviderName: task.project.serviceProviderName,
      serviceMode: task.project.serviceMode,
      serviceFee: task.project.serviceFee
    },
    pageTitle: task.pageTitle || "",
    sourceUrl: task.sourceUrl || "",
    metrics: decisionMetrics,
    tables: useReviewedEvidence ? reviewSnapshots.flatMap((snapshot) => projectDecisionTables(snapshot)) : [],
    structuredCollectionData: useReviewedEvidence ? reviewSnapshots.flatMap((snapshot) => {
      const routeKey = normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType);
      const structured = structureTaskCollectionTables(projectDecisionTables(snapshot), {
        routeKey,
        capturedAt: snapshot.localCollectedAt?.toISOString() || new Date(0).toISOString()
      });
      return structured ? [structured] : [];
    }) : [],
    visibleText: "",
    networkJsonSummary: [],
    dataReviewStatus: useReviewedEvidence || realtimeDecisionEvidence ? "REVIEWED" : "UNREVIEWED",
    reviewCoverage: reviewCoverageValue,
    metricLayer: realtimeOnly ? "REALTIME_API" : "REVIEWED_METRIC",
    collectionQuality: applyLiveOverviewRealtimeRouteCoverage(collectionQuality, realtimeDecisionEvidence?.summary, options.now),
    ...(realtimeDecisionEvidence ? { realtimeEvidence: realtimeDecisionEvidence.summary } : {})
  };
}

export function hasUntrustedCurrentEvidence(task: {
  snapshots: Array<{
    id: string;
    collectionRunId?: string | null;
    routeKey?: string | null;
    pageType?: string | null;
    routeVerificationStatus?: "VERIFIED" | "MANUAL_PENDING";
    localCollectedAt?: Date;
    createdAt?: Date;
    rawTableData: Prisma.JsonValue | null;
    normalizedMetrics: Array<{ rawEvidence?: Prisma.JsonValue | null }>;
    captureMetaJson?: Prisma.JsonValue | null;
  }>;
  reviewedMetrics?: Array<{ snapshotId: string | null; rawEvidence: Prisma.JsonValue | null }>;
  collectionRuns?: Array<{ id: string }>;
}, options: { coveredRoutes?: Set<string> } = {}) {
  const selectedSnapshots = selectFreshVerifiedSnapshots(task.snapshots, task.collectionRuns?.[0]?.id)
    .filter((snapshot) => !options.coveredRoutes?.has(normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType)));
  const selectedSnapshotIds = new Set(selectedSnapshots.map((snapshot) => snapshot.id));
  return selectedSnapshots.some((snapshot) => hasUntrustedSnapshotEvidence(snapshot))
    || (task.reviewedMetrics || []).some((metric) => (
      metric.snapshotId !== null
      && selectedSnapshotIds.has(metric.snapshotId)
      && !isConfirmableMetricEvidence(metric.rawEvidence)
    ));
}

function selectFreshVerifiedSnapshots<T extends {
  id: string;
  collectionRunId?: string | null;
  routeKey?: string | null;
  pageType?: string | null;
  routeVerificationStatus?: "VERIFIED" | "MANUAL_PENDING";
  localCollectedAt?: Date;
  createdAt?: Date;
}>(snapshots: T[], collectionRunId?: string | null) {
  return selectLatestSnapshotsByRoute(snapshots, collectionRunId)
    .filter((snapshot) => snapshot.routeVerificationStatus === "VERIFIED"
      // Formal decisions must not use evidence that is stale at input construction time.
      && snapshotIsFresh(snapshot));
}

function hasUntrustedSnapshotEvidence(snapshot: {
  rawTableData: Prisma.JsonValue | null;
  normalizedMetrics: Array<{ rawEvidence?: Prisma.JsonValue | null }>;
  captureMetaJson?: Prisma.JsonValue | null;
}) {
  return snapshot.normalizedMetrics.some((metric) => !isConfirmableMetricEvidence(metric.rawEvidence))
    || hasUntrustedTableBinding(snapshot.rawTableData, snapshot.captureMetaJson);
}

function hasUntrustedTableBinding(rawTableData: Prisma.JsonValue | null, value: Prisma.JsonValue | null | undefined) {
  const tableCount = projectSnapshotTables(rawTableData, { routeKey: "UNKNOWN", pageType: "UNKNOWN" }).length;
  if (!tableCount) return false;
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const tableBindings = (value as Record<string, unknown>).tableBindings;
  if (!Array.isArray(tableBindings)) return true;
  return Array.from({ length: tableCount }, (_, tableIndex) => tableIndex).some((tableIndex) => {
    const binding = tableBindings.find((candidate) => (
      Boolean(candidate)
      && typeof candidate === "object"
      && !Array.isArray(candidate)
      && (candidate as Record<string, unknown>).tableIndex === tableIndex
    ));
    return !binding || (binding as Record<string, unknown>).validationStatus !== "TRUSTED";
  });
}

function snapshotIsFresh(snapshot: { localCollectedAt?: Date }, now = Date.now()) {
  const collectedAt = snapshot.localCollectedAt?.getTime();
  return typeof collectedAt === "number"
    && Number.isFinite(collectedAt)
    && now - collectedAt < collectionFreshnessPolicy.staleAfterMs;
}

function assessTableReviewState(snapshots: Array<{
  rawTableData: Prisma.JsonValue | null;
  routeKey?: string | null;
  pageType?: string | null;
  tableCellReviews?: Array<{ tableIndex: number; rowIndex: number; columnIndex: number; reviewStatus: "PENDING" | "CONFIRMED" | "MODIFIED" | "IGNORED" }>;
}>) {
  let totalCount = 0;
  let pendingCount = 0;
  let confirmedCount = 0;
  let modifiedCount = 0;
  let ignoredCount = 0;
  for (const snapshot of snapshots) {
    const tables = projectSnapshotTables(snapshot.rawTableData, {
      routeKey: normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType),
      pageType: snapshot.pageType || "UNKNOWN"
    });
    const reviews = new Map((snapshot.tableCellReviews || []).map((review) => [
      `${review.tableIndex}:${review.rowIndex}:${review.columnIndex}`,
      review.reviewStatus
    ]));
    for (const [tableIndex, table] of tables.entries()) {
      for (const [rowIndex, row] of table.rows.entries()) {
        for (const [columnIndex] of row.entries()) {
          totalCount += 1;
          const status = reviews.get(`${tableIndex}:${rowIndex}:${columnIndex}`) || "PENDING";
          if (status === "PENDING") pendingCount += 1;
          else if (status === "CONFIRMED") confirmedCount += 1;
          else if (status === "MODIFIED") modifiedCount += 1;
          else ignoredCount += 1;
        }
      }
    }
  }
  return { totalCount, pendingCount, confirmedCount, modifiedCount, ignoredCount };
}

function mergeReviewCoverage(
  metrics: ReturnType<typeof reviewCoverage>,
  cells: ReturnType<typeof assessTableReviewState>
) {
  return {
    confirmedCount: metrics.confirmedCount + cells.confirmedCount,
    modifiedCount: metrics.modifiedCount + cells.modifiedCount,
    ignoredCount: metrics.ignoredCount + cells.ignoredCount,
    pendingCount: metrics.pendingCount + cells.pendingCount,
    totalCount: metrics.totalCount + cells.totalCount
  };
}

function mergeRealtimeReviewCoverage(
  reviewedCoverage: ReturnType<typeof mergeReviewCoverage> | undefined,
  realtimeMetricCount: number
) {
  if (!realtimeMetricCount) return reviewedCoverage;
  const base = reviewedCoverage || { confirmedCount: 0, modifiedCount: 0, ignoredCount: 0, pendingCount: 0, totalCount: 0 };
  return {
    ...base,
    confirmedCount: base.confirmedCount + realtimeMetricCount,
    totalCount: base.totalCount + realtimeMetricCount
  };
}

function mergeRealtimeDecisionMetrics(reviewedMetrics: DecisionEngineInput["metrics"], realtimeMetrics: DecisionEngineInput["metrics"]) {
  if (!realtimeMetrics.length) return reviewedMetrics;
  const realtimeKeys = new Set(realtimeMetrics.map((metric) => String(metric.key)));
  return [
    ...realtimeMetrics,
    ...reviewedMetrics.filter((metric) => !realtimeKeys.has(String(metric.key)))
  ];
}

function projectDecisionTables(snapshot: {
  rawTableData: Prisma.JsonValue | null;
  routeKey?: string | null;
  pageType?: string | null;
  tableCellReviews?: Array<{
    tableIndex: number;
    rowIndex: number;
    columnIndex: number;
    originalValue: string | null;
    reviewedValue: string | null;
    reviewStatus: "PENDING" | "CONFIRMED" | "MODIFIED" | "IGNORED";
  }>;
}) {
  return applyTableCellReviews(
    projectSnapshotTables(snapshot.rawTableData, {
      routeKey: normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType),
      pageType: snapshot.pageType || "UNKNOWN"
    }),
    snapshot.tableCellReviews || []
  );
}

export function runDecisionEngine(input: DecisionEngineInput) {
  decisionEngineInputSchema.parse(input);
  const ruleOutput = withVersions(runDecisionRules(input));
  const finalOutput = withVersions(applyApprovalGuard(ruleOutput));
  generatedDecisionEngineOutputSchema.parse(ruleOutput);
  generatedDecisionEngineOutputSchema.parse(finalOutput);
  return { ruleOutput, finalOutput };
}

export function toActionProposalCreate(
  proposal: ActionProposalDTO,
  decisionRunId: string,
  projectId: string,
  collectionTaskId: string,
  now = new Date(),
  expiresAt = new Date(now.getTime() + 15 * 60 * 1000)
): Prisma.ActionProposalCreateManyInput {
  const dedupeKey = `${projectId}:${collectionTaskId}:${proposal.actionType}`;
  return {
    decisionRunId,
    projectId,
    collectionTaskId,
    actionType: proposal.actionType,
    title: proposal.title,
    summary: proposal.summary || null,
    reason: proposal.reason,
    expectedImpact: proposal.expectedImpact || null,
    riskLevel: proposal.riskLevel,
    confidence: proposal.confidence,
    requiresApproval: true,
    blockedReason: proposal.blockedReason || null,
    status: "PENDING_APPROVAL",
    expiresAt: new Date(Math.min(expiresAt.getTime(), now.getTime() + proposalExpiresAfterMs(proposal.actionType))),
    dedupeKey
  };
}

function withVersions(output: DecisionEngineOutput): DecisionEngineOutput {
  return {
    ...output,
    engineVersion: decisionEngineVersion,
    ruleVersion: decisionRuleVersion,
    strategyVersion
  };
}
