import { createHash } from "node:crypto";
import { selectLatestSnapshotsByRoute } from "./current-snapshots.js";

type DecisionEvidenceTask = {
  project: { id: string; updatedAt: Date };
  snapshots: Array<{
    id: string;
    routeKey?: string | null;
    pageType?: string | null;
    collectionRunId?: string | null;
    localCollectedAt?: Date;
    createdAt?: Date;
    routeVerificationStatus: string;
    routeConfirmedAt?: Date | null;
    updatedAt: Date;
    tableCellReviews?: Array<{
      tableIndex: number;
      rowIndex: number;
      columnIndex: number;
      reviewStatus: string;
      reviewedValue: string | null;
      updatedAt: Date;
    }>;
  }>;
  reviewedMetrics: Array<{
    id: string;
    snapshotId: string | null;
    reviewStatus: string;
    reviewedValue: string | null;
    updatedAt: Date;
  }>;
  collectionRuns: Array<{ id: string; updatedAt: Date }>;
  routeSources: Array<{ routeKey: string; required: boolean; sourceUrl: string | null; status: string; updatedAt: Date }>;
};

export function decisionEvidenceFingerprint(task: DecisionEvidenceTask) {
  const currentRun = task.collectionRuns[0] || null;
  const snapshots = selectLatestSnapshotsByRoute(task.snapshots, currentRun?.id)
    .map((snapshot) => ({
      id: snapshot.id,
      routeKey: snapshot.routeKey || snapshot.pageType || "UNKNOWN",
      routeVerificationStatus: snapshot.routeVerificationStatus,
      routeConfirmedAt: snapshot.routeConfirmedAt?.toISOString() || null,
      updatedAt: snapshot.updatedAt.toISOString(),
      tableCellReviews: (snapshot.tableCellReviews || []).map((review) => ({
        tableIndex: review.tableIndex,
        rowIndex: review.rowIndex,
        columnIndex: review.columnIndex,
        reviewStatus: review.reviewStatus,
        reviewedValue: review.reviewedValue,
        updatedAt: review.updatedAt.toISOString()
      })).sort((left, right) => left.tableIndex - right.tableIndex || left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex)
    }))
    .sort((left, right) => left.routeKey.localeCompare(right.routeKey) || left.id.localeCompare(right.id));
  const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.id));
  const reviews = task.reviewedMetrics
    .filter((metric) => metric.snapshotId && snapshotIds.has(metric.snapshotId))
    .map((metric) => ({
      id: metric.id,
      snapshotId: metric.snapshotId,
      reviewStatus: metric.reviewStatus,
      reviewedValue: metric.reviewedValue,
      updatedAt: metric.updatedAt.toISOString()
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const routes = task.routeSources
    .map((route) => ({
      routeKey: route.routeKey,
      required: route.required,
      sourceUrl: route.sourceUrl,
      status: route.status,
      updatedAt: route.updatedAt.toISOString()
    }))
    .sort((left, right) => left.routeKey.localeCompare(right.routeKey));

  return createHash("sha256")
    .update(JSON.stringify({
      project: { id: task.project.id, updatedAt: task.project.updatedAt.toISOString() },
      collectionRun: currentRun ? { id: currentRun.id, updatedAt: currentRun.updatedAt.toISOString() } : null,
      snapshots,
      reviews,
      routes
    }), "utf8")
    .digest("hex");
}

export class DecisionEvidenceChangedError extends Error {
  constructor() {
    super("DECISION_EVIDENCE_CHANGED");
  }
}
