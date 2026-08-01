import { Router } from "express";
import {
  confirmSnapshotRouteSchema,
  metricValueSemantic,
  metricValueText,
  normalizeCollectionRouteKey,
  sanitizeSensitiveData,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { writeAuditLog } from "../audit.js";
import { refreshCollectionRunStatus } from "../collection-runs.js";
import { prisma } from "../prisma.js";
import { sendError, sendSuccess } from "../response.js";
import { ensureReviewMetricsForTask } from "../review-metrics.js";
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
        if (!snapshot.normalizedMetrics.length && metrics.length) {
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
        const initialized = await ensureReviewMetricsForTask({ id: snapshot.taskId, snapshots: [confirmed] }, tx);
        await markRouteCaptured(tx, confirmed);
        await writeAuditLog(req, "SNAPSHOT_ROUTE_MANUALLY_CONFIRMED", {
          workspaceId: snapshot.task.project.workspaceId,
          projectId: snapshot.task.projectId,
          taskId: snapshot.taskId,
          detailJson: { snapshotId: snapshot.id, routeKey: parsed.data.routeKey, metricCount: initialized.createdCount }
        }, tx);
        return { data: confirmed } as const;
      });
      if (result.error) return sendError(res, result.error.status, result.error.code, result.error.message);
      return sendSuccess(res, result.data);
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "SNAPSHOT_CONFIRM_CONFLICT", "路线确认期间数据发生变化，请刷新后重试");
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
    metricValue: metricValueText(metric, metricValueSemantic(String(metric.key))) || "",
    metricUnit: metric.unit || null,
    metricSource: metric.metricSource || metric.source,
    confidence: metric.confidence ?? 0.5,
    rawEvidence: metric.rawEvidence ? toJson(sanitizeSensitiveData(metric.rawEvidence)) : undefined
  }));
}
