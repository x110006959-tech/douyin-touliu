import { Router } from "express";
import {
  bulkReviewMetricInputSchema,
  confirmAllReviewMetricsInputSchema,
  reviewMetricInputSchema
} from "@douyin-local-life/shared";
import { writeAuditLog } from "../audit.js";
import { getOwnedTask } from "../ownership.js";
import { readSafeOptionalText } from "../persisted-input.js";
import { sendError, sendSuccess } from "../response.js";
import {
  currentReviewedMetrics,
  canConfirmMetric,
  canModifyMetric,
  ensureReviewMetricsForTask,
  isSourceConflictMetric,
  normalizeReviewPatch,
  resolveSourceConflictReview,
  toReviewedMetricDTO,
  validateCurrentReviewedMetricSnapshot
} from "../review-metrics.js";
import { currentUser, toJson } from "../server-utils.js";
import { isSerializableConflict, runSerializableTransaction } from "../transactions.js";
import { canAutoConfirmMetric, recordMetricBindingCalibration } from "../metric-validation.js";

export function createReviewMetricRouter() {
  const router = Router();

  router.get("/collection-tasks/:id/review-metrics", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    return sendSuccess(res, currentReviewedMetrics(task).map(toReviewedMetricDTO));
  });

  router.post("/collection-tasks/:id/review-metrics/initialize", async (req, res) => {
    try {
      const result = await runSerializableTransaction(async (tx) => {
        const task = await getOwnedTask(currentUser(req).id, req.params.id, tx);
        if (!task) return { error: "TASK_NOT_FOUND" as const };
        const initialized = await ensureReviewMetricsForTask(task, tx);
        if (initialized.createdCount > 0) {
          await writeAuditLog(req, "REVIEW_METRICS_INITIALIZED", {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            detailJson: {
              taskId: task.id,
              snapshotIds: initialized.snapshotIds,
              metricCount: initialized.createdCount,
              source: "NormalizedMetric"
            }
          }, tx);
        }
        return { initialized };
      });
      if ("error" in result && result.error === "TASK_NOT_FOUND") return sendError(res, 404, result.error, "采集任务不存在");
      return sendSuccess(res, result.initialized.metrics.map(toReviewedMetricDTO));
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "REVIEW_METRIC_CONFLICT", "指标初始化期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  router.patch("/review-metrics/:id", async (req, res) => {
    const user = currentUser(req);
    const parsed = reviewMetricInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "复核参数错误");
    const reviewedValueInput = readSafeOptionalText(parsed.data.reviewedValue, 1_000);
    if (reviewedValueInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", reviewedValueInput.error);
    const timeRangeInput = readSafeOptionalText(parsed.data.timeRange, 100);
    if (timeRangeInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", timeRangeInput.error);

    try {
      const result = await runSerializableTransaction(async (tx) => {
        const metric = await tx.reviewedMetric.findFirst({
          where: { id: req.params.id, task: { project: { workspace: { ownerId: user.id } } } }
        });
        if (!metric) return { error: "REVIEW_METRIC_NOT_FOUND" as const };
        const task = await getOwnedTask(user.id, metric.taskId, tx);
        if (!task) return { error: "REVIEW_METRIC_NOT_FOUND" as const };
        const snapshotCheck = validateCurrentReviewedMetricSnapshot(
          task.snapshots,
          metric.snapshotId,
          parsed.data.expectedSnapshotUpdatedAt
        );
        if (!snapshotCheck.ok) return snapshotCheck;

        const conflictResolution = resolveSourceConflictReview(metric, {
          ...parsed.data,
          reviewedValue: reviewedValueInput.value || undefined,
          timeRange: timeRangeInput.value || undefined
        });
        if (!conflictResolution.ok) return conflictResolution;
        const patch = conflictResolution.patch || normalizeReviewPatch(metric, {
          ...parsed.data,
          reviewedValue: reviewedValueInput.value || undefined,
          timeRange: timeRangeInput.value || undefined
        });
        if (patch.reviewStatus === "CONFIRMED" && !isSourceConflictMetric(metric) && !canConfirmMetric(metric)) return { error: "METRIC_EVIDENCE_INVALID" as const };
        if (!canModifyMetric(patch)) return { error: "METRIC_TIME_RANGE_REQUIRED" as const };
        const now = new Date();
        const current = await tx.reviewedMetric.update({
          where: { id: metric.id },
          data: reviewMetricUpdateData(metric, patch, user.id, now)
        });
        if (patch.reviewStatus === "CONFIRMED" && !isSourceConflictMetric(metric)) {
          await recordMetricBindingCalibration(tx, {
            workspaceId: task.project.workspaceId,
            routeKey: snapshotCheck.snapshot.routeKey,
            captureMetaJson: snapshotCheck.snapshot.captureMetaJson,
            metricKey: metric.metricKey,
            rawEvidence: metric.rawEvidence,
            reviewerId: user.id
          });
        }
        // A metric review changes the evidence set, so invalidate stale editors of this snapshot.
        await tx.dataSnapshot.update({ where: { id: snapshotCheck.snapshot.id }, data: { updatedAt: now } });
        await writeAuditLog(req, "REVIEW_METRIC_UPDATE", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: reviewMetricAuditDetail(metric, current)
        }, tx);
        return { current };
      });
      if ("error" in result && result.error) return sendReviewMetricError(res, result.error);
      return sendSuccess(res, toReviewedMetricDTO(result.current));
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "REVIEW_METRIC_CONFLICT", "指标校准期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  router.post("/collection-tasks/:id/review-metrics/bulk", async (req, res) => {
    const user = currentUser(req);
    const parsed = bulkReviewMetricInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "复核参数错误");
    const reviewInputs = parsed.data.items.map((item) => ({
      ...item,
      reviewedValueInput: readSafeOptionalText(item.reviewedValue, 1_000),
      timeRangeInput: readSafeOptionalText(item.timeRange, 100)
    }));
    const invalidReviewInput = reviewInputs.find((item) => item.reviewedValueInput.error || item.timeRangeInput.error);
    if (invalidReviewInput) {
      return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", invalidReviewInput.reviewedValueInput.error || invalidReviewInput.timeRangeInput.error || "复核输入包含禁止内容");
    }

    try {
      const result = await runSerializableTransaction(async (tx) => {
        const task = await getOwnedTask(user.id, req.params.id, tx);
        if (!task) return { error: "TASK_NOT_FOUND" as const };
        const metricIds = reviewInputs.map((item) => item.metricId);
        if (new Set(metricIds).size !== metricIds.length) return { error: "REVIEW_METRIC_NOT_FOUND" as const };
        const metrics = await tx.reviewedMetric.findMany({ where: { id: { in: metricIds }, taskId: task.id } });
        if (metrics.length !== metricIds.length) return { error: "REVIEW_METRIC_NOT_FOUND" as const };
        const byId = new Map(metrics.map((metric) => [metric.id, metric]));
        for (const item of reviewInputs) {
          const metric = byId.get(item.metricId);
          if (!metric) return { error: "REVIEW_METRIC_NOT_FOUND" as const };
          const snapshotCheck = validateCurrentReviewedMetricSnapshot(
            task.snapshots,
            metric.snapshotId,
            item.expectedSnapshotUpdatedAt
          );
          if (!snapshotCheck.ok) return snapshotCheck;
          const conflictResolution = resolveSourceConflictReview(metric, {
            ...item,
            reviewedValue: item.reviewedValueInput.value || undefined,
            timeRange: item.timeRangeInput.value || undefined
          });
          if (!conflictResolution.ok) return conflictResolution;
          const patch = conflictResolution.patch || normalizeReviewPatch(metric, {
            ...item,
            reviewedValue: item.reviewedValueInput.value || undefined,
            timeRange: item.timeRangeInput.value || undefined
          });
          if (patch.reviewStatus === "CONFIRMED" && !isSourceConflictMetric(metric) && !canConfirmMetric(metric)) return { error: "METRIC_EVIDENCE_INVALID" as const };
          if (!canModifyMetric(patch)) return { error: "METRIC_TIME_RANGE_REQUIRED" as const };
        }

        const now = new Date();
        const updated = await Promise.all(reviewInputs.map((item) => {
          const metric = byId.get(item.metricId);
          if (!metric) throw new Error("REVIEW_METRIC_NOT_FOUND");
          const conflictResolution = resolveSourceConflictReview(metric, {
            ...item,
            reviewedValue: item.reviewedValueInput.value || undefined,
            timeRange: item.timeRangeInput.value || undefined
          });
          if (!conflictResolution.ok) throw new Error(conflictResolution.error);
          const patch = conflictResolution.patch || normalizeReviewPatch(metric, {
            ...item,
            reviewedValue: item.reviewedValueInput.value || undefined,
            timeRange: item.timeRangeInput.value || undefined
          });
          return tx.reviewedMetric.update({
            where: { id: metric.id },
            data: reviewMetricUpdateData(metric, patch, user.id, now)
          });
        }));
        const snapshotsById = new Map(task.snapshots.map((snapshot) => [snapshot.id, snapshot]));
        await Promise.all(updated.map(async (metric) => {
          const previous = byId.get(metric.id);
          const snapshot = previous?.snapshotId ? snapshotsById.get(previous.snapshotId) : null;
          if (!previous || !snapshot || metric.reviewStatus !== "CONFIRMED" || isSourceConflictMetric(previous)) return;
          await recordMetricBindingCalibration(tx, {
            workspaceId: task.project.workspaceId,
            routeKey: snapshot.routeKey,
            captureMetaJson: snapshot.captureMetaJson,
            metricKey: previous.metricKey,
            rawEvidence: previous.rawEvidence,
            reviewerId: user.id
          });
        }));
        await Promise.all([...new Set(metrics.flatMap((metric) => metric.snapshotId ? [metric.snapshotId] : []))].map((snapshotId) =>
          tx.dataSnapshot.update({ where: { id: snapshotId }, data: { updatedAt: now } })
        ));
        await writeAuditLog(req, "REVIEW_METRICS_BULK_UPDATE", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: {
            taskId: task.id,
            items: updated.map((metric) => reviewMetricAuditDetail(byId.get(metric.id)!, metric))
          }
        }, tx);
        return { updated };
      });
      if ("error" in result && result.error) return sendReviewMetricError(res, result.error);
      return sendSuccess(res, result.updated.map(toReviewedMetricDTO));
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "REVIEW_METRIC_CONFLICT", "指标校准期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  router.post("/collection-tasks/:id/review-metrics/confirm-all", async (req, res) => {
    const user = currentUser(req);
    const parsed = confirmAllReviewMetricsInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "复核参数错误");

    try {
      const result = await runSerializableTransaction(async (tx) => {
        const task = await getOwnedTask(user.id, req.params.id, tx);
        if (!task) return { error: "TASK_NOT_FOUND" as const };
        const initialized = await ensureReviewMetricsForTask(task, tx);
        const expectedVersions = new Map(parsed.data.snapshotVersions.map((version) => [version.snapshotId, version.expectedSnapshotUpdatedAt]));
        if (expectedVersions.size !== initialized.snapshotIds.length || initialized.snapshotIds.some((snapshotId) => !expectedVersions.has(snapshotId))) {
          return { error: "SNAPSHOT_NOT_CURRENT" as const };
        }
        for (const snapshotId of initialized.snapshotIds) {
          const snapshotCheck = validateCurrentReviewedMetricSnapshot(task.snapshots, snapshotId, expectedVersions.get(snapshotId) || "");
          if (!snapshotCheck.ok) return snapshotCheck;
        }

        const pending = initialized.metrics.filter((metric) => metric.reviewStatus === "PENDING" && canAutoConfirmMetric(metric));
        const now = new Date();
        const updates = await Promise.all(pending.map((metric) => tx.reviewedMetric.updateMany({
          where: { id: metric.id, reviewStatus: "PENDING" },
          data: { reviewStatus: "CONFIRMED", reviewedValue: metric.originalValue || "", reviewerId: user.id, reviewedAt: now, confidence: 1 }
        })));
        if (pending.length) {
          await Promise.all(initialized.snapshotIds.map((snapshotId) => tx.dataSnapshot.update({
            where: { id: snapshotId },
            data: { updatedAt: now }
          })));
        }
        const metrics = await tx.reviewedMetric.findMany({
          where: { taskId: task.id, snapshotId: { in: initialized.snapshotIds } },
          orderBy: [{ createdAt: "asc" }, { metricKey: "asc" }]
        });
        await writeAuditLog(req, "REVIEW_METRICS_CONFIRM_ALL", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: {
            taskId: task.id,
            snapshotIds: initialized.snapshotIds,
            updatedCount: updates.reduce((count, update) => count + update.count, 0),
            blockedInvalidMetricCount: initialized.metrics.filter((metric) => metric.reviewStatus === "PENDING" && !canConfirmMetric(metric)).length,
            source: "ReviewedMetric"
          }
        }, tx);
        return { metrics };
      });
      if ("error" in result && result.error) return sendReviewMetricError(res, result.error);
      return sendSuccess(res, result.metrics.map(toReviewedMetricDTO));
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "REVIEW_METRIC_CONFLICT", "指标校准期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  return router;
}

function reviewMetricUpdateData(
  metric: Parameters<typeof normalizeReviewPatch>[0],
  patch: ReturnType<typeof normalizeReviewPatch>,
  reviewerId: string,
  reviewedAt: Date
) {
  const originalEvidence = metric.rawEvidence && typeof metric.rawEvidence === "object" && !Array.isArray(metric.rawEvidence)
    ? metric.rawEvidence as Record<string, unknown>
    : null;
  return {
    reviewedValue: patch.reviewedValue,
    reviewStatus: patch.reviewStatus,
    timeRange: patch.timeRange || metric.timeRange,
    ...(patch.sourceSelection
      ? {
          rawEvidence: toJson({
            ...originalEvidence,
            manualSourceSelection: patch.sourceSelection,
            selectionReason: patch.sourceSelection === "IGNORE"
              ? "人工忽略 API/DOM 冲突字段"
              : `人工选择 ${patch.sourceSelection} 候选值`,
            validationStatus: patch.reviewStatus === "IGNORED" ? "INVALID" : "TRUSTED",
            validationReasons: patch.reviewStatus === "IGNORED" ? ["SOURCE_CONFLICT_IGNORED"] : []
          })
        }
      : patch.reviewStatus === "MODIFIED"
      ? {
          metricSource: "MANUAL_INPUT" as const,
          rawEvidence: toJson({
            sourceType: "MANUAL_INPUT",
            bindingKind: "MANUAL",
            path: "reviewedValue",
            displayValue: patch.reviewedValue,
            normalizedValue: patch.reviewedValue,
            timeRange: patch.timeRange,
            timeRangeSource: "MANUAL",
            timeRangeLocation: "review-metric",
            validationStatus: "TRUSTED",
            validationReasons: [],
            originalSource: metric.metricSource,
            originalEvidence: metric.rawEvidence || null
          })
        }
      : patch.reviewStatus === "CONFIRMED" && originalEvidence
        ? {
            rawEvidence: toJson({
              ...originalEvidence,
              validationStatus: "TRUSTED",
              validationReasons: []
            })
          }
      : {}),
    reviewerId,
    reviewedAt,
    confidence: 1
  };
}

function reviewMetricAuditDetail(
  previous: { id: string; taskId: string; metricKey: string; reviewedValue: string | null; originalValue: string | null },
  current: { reviewedValue: string | null; reviewStatus: string; metricSource: string }
) {
  return {
    taskId: previous.taskId,
    metricId: previous.id,
    metricKey: previous.metricKey,
    oldValue: previous.reviewedValue || previous.originalValue,
    newValue: current.reviewedValue,
    reviewStatus: current.reviewStatus,
    source: current.metricSource
  };
}

function sendReviewMetricError(res: Parameters<typeof sendError>[0], error: "TASK_NOT_FOUND" | "REVIEW_METRIC_NOT_FOUND" | "SNAPSHOT_NOT_CURRENT" | "SNAPSHOT_UNVERIFIED" | "METRIC_EVIDENCE_INVALID" | "METRIC_TIME_RANGE_REQUIRED" | "SOURCE_CONFLICT_SELECTION_REQUIRED" | "SOURCE_CONFLICT_SELECTION_INVALID" | "SOURCE_CONFLICT_VALUE_MISMATCH") {
  if (error === "TASK_NOT_FOUND") return sendError(res, 404, error, "采集任务不存在");
  if (error === "REVIEW_METRIC_NOT_FOUND") return sendError(res, 404, error, "复核指标不存在或不属于该任务");
  if (error === "SNAPSHOT_UNVERIFIED") return sendError(res, 409, error, "账号和路线确认后才能校准指标");
  if (error === "METRIC_EVIDENCE_INVALID") return sendError(res, 409, error, "字段、单位、周期或页面位置校验异常，请逐项修改后再确认");
  if (error === "METRIC_TIME_RANGE_REQUIRED") return sendError(res, 409, error, "修改指标时必须明确填写统计周期");
  if (error === "SOURCE_CONFLICT_SELECTION_REQUIRED") return sendError(res, 409, error, "API 与 DOM 值冲突，请明确选择 API、DOM 或忽略");
  if (error === "SOURCE_CONFLICT_SELECTION_INVALID") return sendError(res, 409, error, "冲突字段只能选择 API、DOM 或忽略，不能自由修改数值");
  if (error === "SOURCE_CONFLICT_VALUE_MISMATCH") return sendError(res, 409, error, "所选冲突候选值与原始 API/DOM 证据不一致");
  return sendError(res, 409, "SNAPSHOT_NOT_CURRENT", "只能校准当前路线的最新快照，请刷新后重试");
}
