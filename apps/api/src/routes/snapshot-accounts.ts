import { Router } from "express";
import { confirmSnapshotAccountSchema, confirmSnapshotAccountsSchema, confirmSnapshotRouteSchema, normalizeCollectionRouteKey, type VisibleMetric } from "@douyin-local-life/shared";
import { writeAuditLog } from "../audit.js";
import { refreshCollectionRunStatus, requiredRoutesFromJson } from "../collection-runs.js";
import { findCurrentSnapshotIdsByRoute } from "../current-snapshots.js";
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
        if (!snapshot.normalizedMetrics.length && metrics.length && snapshot.accountMatchStatus === "MATCHED") {
          await tx.normalizedMetric.createMany({
            data: metrics.map((metric) => ({
              snapshotId: snapshot.id,
              metricKey: String(metric.key),
              metricName: metric.name,
              metricValue: metric.value == null ? "" : String(metric.value),
              metricUnit: metric.unit || null,
              metricSource: metric.metricSource || metric.source,
              confidence: metric.confidence ?? 0.5,
              rawEvidence: metric.rawEvidence ? toJson(metric.rawEvidence) : undefined
            }))
          });
        }
        const confirmed = await tx.dataSnapshot.update({
          where: { id: snapshot.id },
          data: { routeKey: parsed.data.routeKey, routeVerificationStatus: "VERIFIED", routeConfirmedById: user.id, routeConfirmedAt: new Date() },
          include: { normalizedMetrics: true }
        });
        if (snapshot.accountMatchStatus === "MATCHED") {
          const initialized = await ensureReviewMetricsForTask({ id: snapshot.taskId, snapshots: [confirmed] }, tx);
          await tx.collectionRouteSource.updateMany({
            where: { taskId: snapshot.taskId, routeKey: parsed.data.routeKey },
            data: { status: "CAPTURED", lastCapturedAt: snapshot.localCollectedAt, lastError: null }
          });
          if (snapshot.collectionRunId) {
            await tx.collectionRouteHeartbeat.upsert({
              where: { collectionRunId_routeKey: { collectionRunId: snapshot.collectionRunId, routeKey: parsed.data.routeKey } },
              create: {
                collectionRunId: snapshot.collectionRunId,
                routeKey: parsed.data.routeKey,
                consecutiveFailures: 0,
                lastAttemptAt: new Date(),
                lastSuccessAt: snapshot.localCollectedAt
              },
              update: {
                consecutiveFailures: 0,
                lastAttemptAt: new Date(),
                lastSuccessAt: snapshot.localCollectedAt,
                lastError: null
              }
            });
            await refreshCollectionRunStatus(tx, snapshot.collectionRunId);
          }
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
    try {
      const result = await runSerializableTransaction(async (tx) => {
      const snapshot = await tx.dataSnapshot.findFirst({
        where: { id: req.params.id, task: { project: { workspace: { ownerId: user.id } } } },
        include: { normalizedMetrics: true, task: { include: { project: { include: { accountProfile: true } } } } }
      });
      if (!snapshot) return { error: { status: 404, code: "SNAPSHOT_NOT_FOUND", message: "采集快照不存在" } } as const;
      if (snapshot.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) {
        return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "快照已发生变化，请刷新后重新确认" } } as const;
      }
      if (snapshot.accountMatchStatus === "MISMATCHED") {
        return { error: { status: 409, code: "ACCOUNT_MISMATCH", message: "账号不一致的快照不能人工并入当前账号" } } as const;
      }
      const latestRun = await tx.collectionRun.findFirst({
        where: { taskId: snapshot.taskId },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      });
      const currentSnapshotIds = new Set(await findCurrentSnapshotIdsByRoute(tx, {
        taskId: snapshot.taskId,
        collectionRunId: latestRun?.id || null,
        routeKeys: [snapshot.routeKey || normalizeCollectionRouteKey(snapshot.pageType)]
      }));
      if (!currentSnapshotIds.has(snapshot.id)) {
        return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "只能确认当前路线的最新快照，请刷新后重试" } } as const;
      }
      if (snapshot.accountMatchStatus === "MATCHED") return { data: snapshot } as const;
      const accountConfirmedAt = new Date();
      const updated = await tx.dataSnapshot.updateMany({
        where: { id: snapshot.id, updatedAt: snapshot.updatedAt, accountMatchStatus: "UNVERIFIED" },
        data: { accountMatchStatus: "MATCHED", accountConfirmedById: user.id, accountConfirmedAt }
      });
      if (updated.count !== 1) {
        return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "快照确认状态已变化，请刷新后重试" } } as const;
      }
      const metrics = Array.isArray(snapshot.visibleMetricsJson) ? snapshot.visibleMetricsJson as unknown as VisibleMetric[] : [];
      const confirmed = await tx.dataSnapshot.findUniqueOrThrow({
        where: { id: snapshot.id },
        include: { normalizedMetrics: true }
      });
      const routeVerified = snapshot.routeVerificationStatus === "VERIFIED";
      if (routeVerified && !confirmed.normalizedMetrics.length && metrics.length) {
        await tx.normalizedMetric.createMany({
          data: metrics.map((metric) => ({
            snapshotId: snapshot.id,
            metricKey: String(metric.key),
            metricName: metric.name,
            metricValue: metric.value == null ? "" : String(metric.value),
            metricUnit: metric.unit || null,
            metricSource: metric.metricSource || metric.source,
            confidence: metric.confidence ?? 0.5,
            rawEvidence: metric.rawEvidence ? toJson(metric.rawEvidence) : undefined
          }))
        });
      }
      const confirmedWithMetrics = await tx.dataSnapshot.findUniqueOrThrow({
        where: { id: snapshot.id },
        include: { normalizedMetrics: true }
      });
      const initialized = routeVerified
        ? await ensureReviewMetricsForTask({ id: snapshot.taskId, snapshots: [confirmedWithMetrics] }, tx)
        : { createdCount: 0 };
      await tx.collectionTask.update({ where: { id: snapshot.taskId }, data: { status: routeVerified ? "UPLOADED" : "REVIEWING" } });
      if (routeVerified && snapshot.routeKey) {
        await tx.collectionRouteSource.updateMany({
          where: { taskId: snapshot.taskId, routeKey: snapshot.routeKey },
          data: { status: "CAPTURED", lastCapturedAt: snapshot.localCollectedAt, lastError: null }
        });
        if (snapshot.collectionRunId) {
          await tx.collectionRouteHeartbeat.upsert({
            where: {
              collectionRunId_routeKey: {
                collectionRunId: snapshot.collectionRunId,
                routeKey: snapshot.routeKey
              }
            },
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
              lastError: null
            }
          });
          await refreshCollectionRunStatus(tx, snapshot.collectionRunId);
        }
      }
      await writeAuditLog(req, "SNAPSHOT_ACCOUNT_MANUALLY_CONFIRMED", {
        workspaceId: snapshot.task.project.workspaceId,
        projectId: snapshot.task.projectId,
        taskId: snapshot.taskId,
        detailJson: { snapshotId: snapshot.id, accountProfileId: snapshot.task.project.accountProfileId, note: parsed.data.note || null, metricCount: initialized.createdCount }
      }, tx);
      return { data: confirmedWithMetrics } as const;
      });
      if (result.error) return sendError(res, result.error.status, result.error.code, result.error.message);
      return sendSuccess(res, result.data);
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "SNAPSHOT_CONFIRM_CONFLICT", "账号确认期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  router.post("/collection-tasks/:id/snapshots/confirm-accounts", async (req, res) => {
    const user = currentUser(req);
    const parsed = confirmSnapshotAccountsSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "请明确选择并确认当前任务的待确认快照");
    const requestedSnapshotsWithVersion = parsed.data.snapshots;
    const requestedIds = requestedSnapshotsWithVersion.map((snapshot) => snapshot.snapshotId);
    const expectedUpdatedAtBySnapshotId = new Map(requestedSnapshotsWithVersion.map((snapshot) => [snapshot.snapshotId, snapshot.expectedUpdatedAt]));
    try {
      const result = await runSerializableTransaction(async (tx) => {
      const task = await tx.collectionTask.findFirst({
        where: { id: req.params.id || "", project: { workspace: { ownerId: user.id } } },
        include: {
          project: true,
          routeSources: { select: { routeKey: true } },
          collectionRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, requiredRoutesJson: true } }
        }
      });
      if (!task) return { error: { status: 404, code: "TASK_NOT_FOUND", message: "采集任务不存在" } } as const;

      const snapshots = await tx.dataSnapshot.findMany({
        where: { taskId: task.id, id: { in: requestedIds } },
        include: { normalizedMetrics: true }
      });
      const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
      const requestedSnapshots = requestedIds.flatMap((snapshotId) => {
        const snapshot = snapshotById.get(snapshotId);
        return snapshot ? [snapshot] : [];
      });
      if (requestedSnapshots.length !== requestedIds.length) {
        return { error: { status: 409, code: "SNAPSHOT_TASK_MISMATCH", message: "只能确认当前任务中的快照" } } as const;
      }
      if (requestedSnapshots.some((snapshot) => snapshot.updatedAt.toISOString() !== expectedUpdatedAtBySnapshotId.get(snapshot.id))) {
        return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "快照已发生变化，请刷新后重新确认" } } as const;
      }
      if (requestedSnapshots.some((snapshot) => snapshot.accountMatchStatus === "MISMATCHED")) {
        return { error: { status: 409, code: "ACCOUNT_MISMATCH", message: "账号不一致的快照不能人工并入当前账号" } } as const;
      }
      const latestRunId = task.collectionRuns[0]?.id || null;
      const currentSnapshotIds = new Set(await findCurrentSnapshotIdsByRoute(tx, {
        taskId: task.id,
        collectionRunId: latestRunId,
        routeKeys: [
          ...task.routeSources.map((route) => route.routeKey),
          ...(task.collectionRuns[0] ? requiredRoutesFromJson(task.collectionRuns[0].requiredRoutesJson) : [])
        ]
      }));
      if (requestedSnapshots.some((snapshot) => !currentSnapshotIds.has(snapshot.id))) {
        return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "只能确认当前任务每条路线的最新快照，请刷新后重试" } } as const;
      }

      const pendingSnapshots = requestedSnapshots.filter((snapshot) => snapshot.accountMatchStatus !== "MATCHED");
      const skippedSnapshots = requestedSnapshots.filter((snapshot) => snapshot.accountMatchStatus === "MATCHED");
      const verifiedPendingSnapshots = pendingSnapshots.filter((snapshot) => snapshot.routeVerificationStatus === "VERIFIED");
      for (const snapshot of verifiedPendingSnapshots) {
        const metrics = Array.isArray(snapshot.visibleMetricsJson) ? snapshot.visibleMetricsJson as unknown as VisibleMetric[] : [];
        if (!snapshot.normalizedMetrics.length && metrics.length) {
          await tx.normalizedMetric.createMany({
            data: metrics.map((metric) => ({
              snapshotId: snapshot.id,
              metricKey: String(metric.key),
              metricName: metric.name,
              metricValue: metric.value == null ? "" : String(metric.value),
              metricUnit: metric.unit || null,
              metricSource: metric.metricSource || metric.source,
              confidence: metric.confidence ?? 0.5,
              rawEvidence: metric.rawEvidence ? toJson(metric.rawEvidence) : undefined
            }))
          });
        }
      }

      const pendingIds = pendingSnapshots.map((snapshot) => snapshot.id);
      if (pendingIds.length) {
        await tx.dataSnapshot.updateMany({
          where: { taskId: task.id, id: { in: pendingIds }, accountMatchStatus: "UNVERIFIED" },
          data: { accountMatchStatus: "MATCHED", accountConfirmedById: user.id, accountConfirmedAt: new Date() }
        });
      }
      const verifiedPendingIds = verifiedPendingSnapshots.map((snapshot) => snapshot.id);
      const confirmedSnapshots = verifiedPendingIds.length
        ? await tx.dataSnapshot.findMany({
            where: { taskId: task.id, id: { in: verifiedPendingIds } },
            orderBy: { localCollectedAt: "desc" },
            include: { normalizedMetrics: true }
          })
        : [];
      const initialized = await ensureReviewMetricsForTask({ id: task.id, snapshots: confirmedSnapshots }, tx);
      await tx.collectionTask.update({ where: { id: task.id }, data: { status: verifiedPendingIds.length ? "UPLOADED" : "REVIEWING" } });

      const runIds = new Set<string>();
      for (const snapshot of verifiedPendingSnapshots) {
        if (snapshot.routeKey) {
          await tx.collectionRouteSource.updateMany({
            where: { taskId: task.id, routeKey: snapshot.routeKey },
            data: { status: "CAPTURED", lastCapturedAt: snapshot.localCollectedAt, lastError: null }
          });
        }
        if (snapshot.collectionRunId && snapshot.routeKey) {
          runIds.add(snapshot.collectionRunId);
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
              lastError: null
            }
          });
        }
      }
      for (const runId of runIds) await refreshCollectionRunStatus(tx, runId);

      const routeResults = requestedSnapshots.map((snapshot) => ({
        snapshotId: snapshot.id,
        routeKey: snapshot.routeKey || normalizeCollectionRouteKey(snapshot.pageType),
        result: skippedSnapshots.some((item) => item.id === snapshot.id) ? "SKIPPED" as const : "CONFIRMED" as const
      }));
      await writeAuditLog(req, "SNAPSHOT_ACCOUNTS_BULK_CONFIRMED", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: {
          accountProfileId: task.project.accountProfileId,
          confirmedSnapshotIds: pendingIds,
          skippedSnapshotIds: skippedSnapshots.map((snapshot) => snapshot.id),
          note: parsed.data.note || null,
          reviewMetricCount: initialized.createdCount,
          routeResults
        }
      }, tx);
      return {
        data: {
          confirmedCount: pendingIds.length,
          skippedCount: skippedSnapshots.length,
          reviewMetricCount: initialized.createdCount,
          routeResults
        }
      } as const;
      });
      const transactionError = result.error;
      if (transactionError) return sendError(res, transactionError.status, transactionError.code, transactionError.message);
      return sendSuccess(res, result.data);
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "SNAPSHOT_CONFIRM_CONFLICT", "账号确认期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  return router;
}
