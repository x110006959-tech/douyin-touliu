import { Router } from "express";
import {
  confirmSnapshotAccountSchema,
  confirmSnapshotAccountsSchema,
  confirmSnapshotRouteSchema,
  normalizeCollectionRouteKey,
  sanitizeSensitiveData,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { writeAuditLog } from "../audit.js";
import { refreshCollectionRunStatus } from "../collection-runs.js";
import { readSafeOptionalText } from "../persisted-input.js";
import { prisma } from "../prisma.js";
import { sendError, sendSuccess } from "../response.js";
import { ensureReviewMetricsForTask } from "../review-metrics.js";
import { confirmSnapshotAccounts } from "../snapshot-account-confirmation.js";
import { currentUser, toJson } from "../server-utils.js";
import { isSerializableConflict, runSerializableTransaction } from "../transactions.js";

export function createSnapshotAccountRouter() {
  const router = Router();

  router.post("/snapshots/:id/confirm-route", async (req, res) => {
    const user = currentUser(req);
    const parsed = confirmSnapshotRouteSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "请明确确认当前快照的采集路线");

    try {
      const result = await runSerializableTransaction(async (tx) => {
        const snapshot = await tx.dataSnapshot.findFirst({
          where: { id: req.params.id, task: { project: { workspace: { ownerId: user.id } } } },
          include: { normalizedMetrics: true, task: { include: { project: true } } }
        });
        if (!snapshot) return { error: { status: 404, code: "SNAPSHOT_NOT_FOUND", message: "采集快照不存在" } } as const;
        if (snapshot.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) {
          return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "快照已发生变化，请刷新后重新确认" } } as const;
        }
        if (snapshot.routeVerificationStatus === "VERIFIED") return { data: snapshot } as const;

        const routeExists = await tx.collectionRouteSource.findFirst({
          where: { taskId: snapshot.taskId, routeKey: parsed.data.routeKey },
          select: { id: true }
        });
        if (!routeExists) {
          return { error: { status: 409, code: "ROUTE_UNVERIFIED", message: "只能确认当前任务已配置的采集路线" } } as const;
        }
        const latestSnapshot = await tx.dataSnapshot.findFirst({
          where: {
            taskId: snapshot.taskId,
            collectionRunId: snapshot.collectionRunId,
            routeKey: snapshot.routeKey,
            pageType: snapshot.pageType
          },
          orderBy: [{ localCollectedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          select: { id: true }
        });
        if (latestSnapshot?.id !== snapshot.id) {
          return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "只能确认当前路线的最新快照，请刷新后重试" } } as const;
        }

        const metrics = Array.isArray(snapshot.visibleMetricsJson) ? snapshot.visibleMetricsJson as unknown as VisibleMetric[] : [];
        if (!snapshot.normalizedMetrics.length && metrics.length && snapshot.accountMatchStatus === "MATCHED") {
          await tx.normalizedMetric.createMany({ data: toNormalizedMetrics(snapshot.id, metrics) });
        }
        const confirmed = await tx.dataSnapshot.update({
          where: { id: snapshot.id },
          data: {
            routeKey: parsed.data.routeKey,
            routeVerificationStatus: "VERIFIED",
            routeConfirmedById: user.id,
            routeConfirmedAt: new Date()
          },
          include: { normalizedMetrics: true }
        });
        if (snapshot.accountMatchStatus === "MATCHED") {
          const initialized = await ensureReviewMetricsForTask({ id: snapshot.taskId, snapshots: [confirmed] }, tx);
          await markRouteCaptured(tx, confirmed);
          await writeAuditLog(req, "SNAPSHOT_ROUTE_MANUALLY_CONFIRMED", {
            workspaceId: snapshot.task.project.workspaceId,
            projectId: snapshot.task.projectId,
            taskId: snapshot.taskId,
            detailJson: { snapshotId: snapshot.id, routeKey: parsed.data.routeKey, metricCount: initialized.createdCount }
          }, tx);
        }
        return { data: confirmed } as const;
      });
      if (result.error) return sendError(res, result.error.status, result.error.code, result.error.message);
      return sendSuccess(res, result.data);
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "SNAPSHOT_CONFIRM_CONFLICT", "路线确认期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  router.post("/snapshots/:id/confirm-account", async (req, res) => {
    const user = currentUser(req);
    const parsed = confirmSnapshotAccountSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "请明确确认当前快照属于该账号");
    const noteInput = readSafeOptionalText(parsed.data.note, 500);
    if (noteInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", noteInput.error);

    try {
      const result = await confirmSnapshotAccounts({
        userId: user.id,
        snapshots: [{ snapshotId: req.params.id, expectedUpdatedAt: parsed.data.expectedUpdatedAt }],
        skipNoopUpdates: true,
        onConfirmed: async (summary, tx) => {
          const snapshot = summary.snapshots[0];
          if (!snapshot) return;
          await writeAuditLog(req, "SNAPSHOT_ACCOUNT_MANUALLY_CONFIRMED", {
            workspaceId: summary.task.project.workspaceId,
            projectId: summary.task.projectId,
            taskId: summary.task.id,
            detailJson: {
              snapshotId: snapshot.id,
              accountProfileId: summary.task.project.accountProfileId,
              note: noteInput.value,
              metricCount: summary.reviewMetricCount
            }
          }, tx);
        }
      });
      if ("error" in result) return sendError(res, result.error.status, result.error.code, result.error.message);
      return sendSuccess(res, result.data.snapshots[0]);
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "SNAPSHOT_CONFIRM_CONFLICT", "账号确认期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  router.post("/collection-tasks/:id/snapshots/confirm-accounts", async (req, res) => {
    const user = currentUser(req);
    const parsed = confirmSnapshotAccountsSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "请明确选择并确认当前任务的待确认快照");
    const noteInput = readSafeOptionalText(parsed.data.note, 500);
    if (noteInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", noteInput.error);

    try {
      const result = await confirmSnapshotAccounts({
        userId: user.id,
        taskId: req.params.id,
        snapshots: parsed.data.snapshots,
        onConfirmed: async (summary, tx) => {
          await writeAuditLog(req, "SNAPSHOT_ACCOUNTS_BULK_CONFIRMED", {
            workspaceId: summary.task.project.workspaceId,
            projectId: summary.task.projectId,
            taskId: summary.task.id,
            detailJson: {
              accountProfileId: summary.task.project.accountProfileId,
              confirmedSnapshotIds: summary.snapshots
                .filter((snapshot) => !summary.skippedSnapshots.some((skipped) => skipped.id === snapshot.id))
                .map((snapshot) => snapshot.id),
              skippedSnapshotIds: summary.skippedSnapshots.map((snapshot) => snapshot.id),
              note: noteInput.value,
              reviewMetricCount: summary.reviewMetricCount,
              routeResults: summary.routeResults
            }
          }, tx);
        }
      });
      if ("error" in result) return sendError(res, result.error.status, result.error.code, result.error.message);
      return sendSuccess(res, {
        confirmedCount: result.data.routeResults.filter((route) => route.result === "CONFIRMED").length,
        skippedCount: result.data.skippedSnapshots.length,
        reviewMetricCount: result.data.reviewMetricCount,
        routeResults: result.data.routeResults
      });
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "SNAPSHOT_CONFIRM_CONFLICT", "账号确认期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  return router;
}

async function markRouteCaptured(
  tx: Parameters<typeof refreshCollectionRunStatus>[0],
  snapshot: {
    taskId: string;
    routeKey: string | null;
    collectionRunId: string | null;
    localCollectedAt: Date;
  }
) {
  if (!snapshot.routeKey) return;
  await tx.collectionRouteSource.updateMany({
    where: { taskId: snapshot.taskId, routeKey: snapshot.routeKey },
    data: { status: "CAPTURED", lastCapturedAt: snapshot.localCollectedAt, lastError: null }
  });
  if (!snapshot.collectionRunId) return;
  await tx.collectionRouteHeartbeat.upsert({
    where: { collectionRunId_routeKey: { collectionRunId: snapshot.collectionRunId, routeKey: snapshot.routeKey } },
    create: {
      collectionRunId: snapshot.collectionRunId,
      routeKey: snapshot.routeKey,
      consecutiveFailures: 0,
      lastAttemptAt: new Date(),
      lastSuccessAt: snapshot.localCollectedAt
    },
    update: {
      consecutiveFailures: 0,
      lastAttemptAt: new Date(),
      lastSuccessAt: snapshot.localCollectedAt,
      lastErrorCode: null,
      lastError: null
    }
  });
  await refreshCollectionRunStatus(tx, snapshot.collectionRunId);
}

function toNormalizedMetrics(snapshotId: string, metrics: VisibleMetric[]) {
  return metrics.map((metric) => ({
    snapshotId,
    metricKey: String(metric.key),
    metricName: metric.name,
    metricValue: metric.value == null ? "" : String(metric.value),
    metricUnit: metric.unit || null,
    metricSource: metric.metricSource || metric.source,
    confidence: metric.confidence ?? 0.5,
    rawEvidence: metric.rawEvidence ? toJson(sanitizeSensitiveData(metric.rawEvidence)) : undefined
  }));
}
