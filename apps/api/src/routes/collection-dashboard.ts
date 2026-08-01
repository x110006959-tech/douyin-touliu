import { Router } from "express";
import {
  bulkTableCellReviewInputSchema,
  confirmTableBindingInputSchema,
  confirmAllReviewMetricsInputSchema,
  type CollectionDashboardDTO
} from "@douyin-local-life/shared";
import { writeAuditLog } from "../audit.js";
import { getCaptureSummary, tableReviewCoverageForSummary } from "../capture-summary.js";
import { findCurrentSnapshotIdsByRoute } from "../current-snapshots.js";
import { getOwnedTask } from "../ownership.js";
import { readSafeOptionalText } from "../persisted-input.js";
import { sendError, sendSuccess } from "../response.js";
import { currentReviewedMetrics, reviewCoverage } from "../review-metrics.js";
import { currentUser } from "../server-utils.js";
import { getTableCellValue, projectSnapshotTables, toTableCellReviewDTO } from "../table-cell-reviews.js";
import { isSerializableConflict, runSerializableTransaction } from "../transactions.js";
import { calibrateFullyReviewedTables, confirmTableBindingCalibration, hasTrustedTableBinding, hasTrustedTableBindings } from "../metric-validation.js";

export function createCollectionDashboardRouter() {
  const router = Router();

  router.get("/collection-tasks/:id/collection-dashboard", async (req, res) => {
    const user = currentUser(req);
    const [task, summary] = await Promise.all([
      getOwnedTask(user.id, req.params.id),
      getCaptureSummary(user.id, req.params.id)
    ]);
    if (!task || !summary) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const response: CollectionDashboardDTO = {
      task: {
        id: task.id,
        title: task.pageTitle,
        accountName: task.project.accountProfile.accountName,
        projectName: task.project.name
      },
      summary: {
        ...summary,
        tables: summary.tables
      },
      reviewCoverage: reviewCoverage(currentReviewedMetrics(task)),
      tableReviewCoverage: tableReviewCoverageForSummary(summary)
    };
    return sendSuccess(res, response);
  });

  router.post("/collection-tasks/:id/table-cell-reviews/bulk", async (req, res) => {
    const user = currentUser(req);
    const parsed = bulkTableCellReviewInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "表格复核参数错误");
    const safeItems = parsed.data.items.map((item) => ({ ...item, value: readSafeOptionalText(item.reviewedValue, 1_000) }));
    const invalid = safeItems.find((item) => item.value.error);
    if (invalid?.value.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", invalid.value.error);

    try {
      const result = await runSerializableTransaction(async (tx) => {
        const task = await getOwnedTask(user.id, req.params.id, tx);
        if (!task) return { error: "TASK_NOT_FOUND" as const };
        const latestRunId = task.collectionRuns[0]?.id || null;
        const currentSnapshotIds = await findCurrentSnapshotIdsByRoute(tx, {
          taskId: task.id,
          collectionRunId: latestRunId,
          routeKeys: task.routeSources.map((route) => route.routeKey)
        });
        if (!currentSnapshotIds.includes(parsed.data.snapshotId)) return { error: "SNAPSHOT_NOT_CURRENT" as const };
        const snapshot = await tx.dataSnapshot.findFirst({
          where: { id: parsed.data.snapshotId, taskId: task.id },
          include: { task: { include: { project: true } } }
        });
        if (!snapshot || snapshot.updatedAt.toISOString() !== parsed.data.expectedSnapshotUpdatedAt) {
          return { error: "SNAPSHOT_NOT_CURRENT" as const };
        }
        if (snapshot.routeVerificationStatus !== "VERIFIED") {
          return { error: "SNAPSHOT_UNVERIFIED" as const };
        }
        const untrustedConfirmation = await Promise.all(safeItems
          .filter((item) => item.reviewStatus === "CONFIRMED")
          .map((item) => hasTrustedTableBinding(tx, {
            workspaceId: task.project.workspaceId,
            routeKey: snapshot.routeKey,
            captureMetaJson: snapshot.captureMetaJson,
            tableIndex: item.tableIndex
          })));
        if (untrustedConfirmation.some((trusted) => !trusted)) {
          return { error: "TABLE_BINDING_REQUIRES_REVIEW" as const };
        }
        const tables = projectSnapshotTables(snapshot.rawTableData, { routeKey: snapshot.routeKey as never, pageType: snapshot.pageType });
        const coordinateSet = new Set<string>();
        for (const item of safeItems) {
          const coordinate = `${item.tableIndex}:${item.rowIndex}:${item.columnIndex}`;
          if (coordinateSet.has(coordinate) || getTableCellValue(tables, item.tableIndex, item.rowIndex, item.columnIndex) === null) {
            return { error: "TABLE_CELL_NOT_FOUND" as const };
          }
          coordinateSet.add(coordinate);
        }
        const now = new Date();
        const updated = await Promise.all(safeItems.map((item) => {
          const originalValue = getTableCellValue(tables, item.tableIndex, item.rowIndex, item.columnIndex);
          const reviewedValue = item.reviewStatus === "CONFIRMED"
            ? originalValue
            : item.reviewStatus === "MODIFIED"
              ? item.value.value || ""
              : null;
          return tx.tableCellReview.upsert({
            where: { snapshotId_tableIndex_rowIndex_columnIndex: {
              snapshotId: snapshot.id,
              tableIndex: item.tableIndex,
              rowIndex: item.rowIndex,
              columnIndex: item.columnIndex
            } },
            create: {
              taskId: task.id,
              snapshotId: snapshot.id,
              tableIndex: item.tableIndex,
              rowIndex: item.rowIndex,
              columnIndex: item.columnIndex,
              originalValue,
              reviewedValue,
              reviewStatus: item.reviewStatus,
              reviewerId: user.id,
              reviewedAt: now
            },
            update: { reviewedValue, reviewStatus: item.reviewStatus, reviewerId: user.id, reviewedAt: now }
          });
        }));
        const totalCellCountsByTable = new Map(tables.map((table, tableIndex) => [
          tableIndex,
          table.rows.reduce((count, row) => count + row.length, 0)
        ]));
        const calibratedCaptureMeta = await calibrateFullyReviewedTables(tx, {
          workspaceId: task.project.workspaceId,
          routeKey: snapshot.routeKey,
          captureMetaJson: snapshot.captureMetaJson,
          snapshotId: snapshot.id,
          totalCellCountsByTable,
          reviewerId: user.id
        });
        // The snapshot version is the optimistic-concurrency token for the whole table.
        await tx.dataSnapshot.update({
          where: { id: snapshot.id },
          data: { updatedAt: now, ...(calibratedCaptureMeta ? { captureMetaJson: calibratedCaptureMeta } : {}) }
        });
        await writeAuditLog(req, "TABLE_CELL_REVIEWS_BULK_UPDATE", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: {
            snapshotId: snapshot.id,
            items: updated.map((review) => ({
              tableIndex: review.tableIndex,
              rowIndex: review.rowIndex,
              columnIndex: review.columnIndex,
              reviewStatus: review.reviewStatus
            }))
          }
        }, tx);
        return { updated };
      });
      if ("error" in result) {
        if (result.error === "TASK_NOT_FOUND") return sendError(res, 404, result.error, "采集任务不存在");
        if (result.error === "SNAPSHOT_UNVERIFIED") return sendError(res, 409, result.error, "账号和路线确认后才能校准表格");
        if (result.error === "TABLE_BINDING_REQUIRES_REVIEW") return sendError(res, 409, result.error, "新表头或行列结构需要逐项核对，不能直接确认原值");
        if (result.error === "TABLE_CELL_NOT_FOUND") return sendError(res, 409, result.error, "表格单元格已变化，请刷新后重试");
        return sendError(res, 409, "SNAPSHOT_NOT_CURRENT", "只能校准当前路线的最新快照，请刷新后重试");
      }
      return sendSuccess(res, result.updated.map(toTableCellReviewDTO));
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "TABLE_CELL_REVIEW_CONFLICT", "表格复核期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  router.post("/collection-tasks/:id/table-bindings/confirm", async (req, res) => {
    const user = currentUser(req);
    const parsed = confirmTableBindingInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "表格结构确认参数错误");

    try {
      const result = await runSerializableTransaction(async (tx) => {
        const task = await getOwnedTask(user.id, req.params.id, tx);
        if (!task) return { error: "TASK_NOT_FOUND" as const };
        const latestRunId = task.collectionRuns[0]?.id || null;
        const currentSnapshotIds = await findCurrentSnapshotIdsByRoute(tx, {
          taskId: task.id,
          collectionRunId: latestRunId,
          routeKeys: task.routeSources.map((route) => route.routeKey)
        });
        if (!currentSnapshotIds.includes(parsed.data.snapshotId)) return { error: "SNAPSHOT_NOT_CURRENT" as const };
        const snapshot = await tx.dataSnapshot.findFirst({
          where: { id: parsed.data.snapshotId, taskId: task.id },
          include: { task: { include: { project: true } } }
        });
        if (!snapshot || snapshot.updatedAt.toISOString() !== parsed.data.expectedSnapshotUpdatedAt) return { error: "SNAPSHOT_NOT_CURRENT" as const };
        if (snapshot.routeVerificationStatus !== "VERIFIED") return { error: "SNAPSHOT_UNVERIFIED" as const };
        const tables = projectSnapshotTables(snapshot.rawTableData, {
          routeKey: snapshot.routeKey as never,
          pageType: snapshot.pageType
        });
        const table = tables[parsed.data.tableIndex];
        if (!table?.rows.length) return { error: "TABLE_BINDING_INVALID" as const };
        const totalCellCount = table.rows.reduce((count, row) => count + row.length, 0);
        const reviewedCellCount = await tx.tableCellReview.count({
          where: {
            snapshotId: snapshot.id,
            tableIndex: parsed.data.tableIndex,
            reviewStatus: { not: "PENDING" }
          }
        });
        if (!totalCellCount || reviewedCellCount < totalCellCount) return { error: "TABLE_BINDING_REQUIRES_CELL_REVIEW" as const };
        const calibratedCaptureMeta = await confirmTableBindingCalibration(tx, {
          workspaceId: task.project.workspaceId,
          routeKey: snapshot.routeKey,
          captureMetaJson: snapshot.captureMetaJson,
          tableIndex: parsed.data.tableIndex,
          reviewerId: user.id
        });
        if (!calibratedCaptureMeta) return { error: "TABLE_BINDING_INVALID" as const };
        const now = new Date();
        const updated = await tx.dataSnapshot.update({
          where: { id: snapshot.id },
          data: { captureMetaJson: calibratedCaptureMeta, updatedAt: now }
        });
        await writeAuditLog(req, "TABLE_BINDING_CONFIRMED", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: { snapshotId: snapshot.id, tableIndex: parsed.data.tableIndex }
        }, tx);
        return { updated };
      });
      if ("error" in result) {
        if (result.error === "TASK_NOT_FOUND") return sendError(res, 404, result.error, "采集任务不存在");
        if (result.error === "SNAPSHOT_UNVERIFIED") return sendError(res, 409, result.error, "账号和路线确认后才能确认表格结构");
        if (result.error === "TABLE_BINDING_REQUIRES_CELL_REVIEW") return sendError(res, 409, result.error, "必须先逐格核对完整张表，不能直接确认未知表头或行列关系");
        if (result.error === "TABLE_BINDING_INVALID") return sendError(res, 409, result.error, "表头、行标识或列关系存在异常，只能逐项修改后重新采集");
        return sendError(res, 409, "SNAPSHOT_NOT_CURRENT", "表格数据已变化，请刷新后重新确认");
      }
      return sendSuccess(res, { snapshotId: result.updated.id, updatedAt: result.updated.updatedAt.toISOString() });
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "TABLE_CELL_REVIEW_CONFLICT", "表格结构确认期间数据发生变化，请刷新后重试");
      throw error;
    }
  });

  router.post("/collection-tasks/:id/table-cell-reviews/confirm-all", async (req, res) => {
    const user = currentUser(req);
    const parsed = confirmAllReviewMetricsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "表格复核参数错误");
    }

    try {
      const result = await runSerializableTransaction(async (tx) => {
        const task = await getOwnedTask(user.id, req.params.id, tx);
        if (!task) return { error: "TASK_NOT_FOUND" as const };

        const latestRunId = task.collectionRuns[0]?.id || null;
        const currentSnapshotIds = await findCurrentSnapshotIdsByRoute(tx, {
          taskId: task.id,
          collectionRunId: latestRunId,
          routeKeys: task.routeSources.map((route) => route.routeKey)
        });
        const snapshots = currentSnapshotIds.length
          ? await tx.dataSnapshot.findMany({
              where: { id: { in: currentSnapshotIds }, taskId: task.id },
              include: { tableCellReviews: true }
            })
          : [];
        const tableSnapshots = snapshots.flatMap((snapshot) => {
          const tables = projectSnapshotTables(snapshot.rawTableData, {
            routeKey: snapshot.routeKey as never,
            pageType: snapshot.pageType
          });
          return tables.length ? [{ snapshot, tables }] : [];
        });
        const requestedVersions = new Map(
          parsed.data.snapshotVersions.map((version) => [version.snapshotId, version.expectedSnapshotUpdatedAt])
        );
        const versionsMatch = requestedVersions.size === tableSnapshots.length
          && tableSnapshots.every(({ snapshot }) => requestedVersions.get(snapshot.id) === snapshot.updatedAt.toISOString());
        if (!versionsMatch) return { error: "SNAPSHOT_NOT_CURRENT" as const };
        if (tableSnapshots.some(({ snapshot }) => snapshot.routeVerificationStatus !== "VERIFIED")) {
          return { error: "SNAPSHOT_UNVERIFIED" as const };
        }
        const allTrusted = await Promise.all(tableSnapshots.map(({ snapshot }) => hasTrustedTableBindings(tx, {
          workspaceId: task.project.workspaceId,
          routeKey: snapshot.routeKey,
          captureMetaJson: snapshot.captureMetaJson
        })));
        if (allTrusted.some((trusted) => !trusted)) return { error: "TABLE_BINDING_REQUIRES_REVIEW" as const };

        const now = new Date();
        let confirmedCount = 0;
        let totalCount = 0;
        let tableCount = 0;
        const changedSnapshotIds: string[] = [];

        for (const { snapshot, tables } of tableSnapshots) {
          tableCount += tables.length;
          const existingByCoordinate = new Map(
            snapshot.tableCellReviews.map((review) => [
              `${review.tableIndex}:${review.rowIndex}:${review.columnIndex}`,
              review
            ])
          );
          const missingReviews = tables.flatMap((table, tableIndex) => (
            table.rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) => {
              totalCount += 1;
              const coordinate = `${tableIndex}:${rowIndex}:${columnIndex}`;
              if (existingByCoordinate.has(coordinate)) return [];
              return [{
                taskId: task.id,
                snapshotId: snapshot.id,
                tableIndex,
                rowIndex,
                columnIndex,
                originalValue: cell == null ? "" : String(cell),
                reviewedValue: cell == null ? "" : String(cell),
                reviewStatus: "CONFIRMED" as const,
                reviewerId: user.id,
                reviewedAt: now
              }];
            }))
          ));
          const pendingCount = snapshot.tableCellReviews.filter((review) => review.reviewStatus === "PENDING").length;
          if (missingReviews.length) {
            await tx.tableCellReview.createMany({ data: missingReviews, skipDuplicates: true });
          }
          if (pendingCount) {
            await tx.tableCellReview.updateMany({
              where: { snapshotId: snapshot.id, reviewStatus: "PENDING" },
              data: {
                reviewStatus: "CONFIRMED",
                reviewerId: user.id,
                reviewedAt: now
              }
            });
          }
          const changedCount = missingReviews.length + pendingCount;
          confirmedCount += changedCount;
          if (changedCount) {
            changedSnapshotIds.push(snapshot.id);
            await tx.dataSnapshot.update({ where: { id: snapshot.id }, data: { updatedAt: now } });
          }
        }

        if (confirmedCount) {
          await writeAuditLog(req, "TABLE_CELL_REVIEWS_CONFIRM_ALL", {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            detailJson: {
              confirmedCount,
              totalCount,
              tableCount,
              snapshotIds: changedSnapshotIds
            }
          }, tx);
        }
        return { confirmedCount, totalCount, tableCount };
      });

      if ("error" in result) {
        if (result.error === "TASK_NOT_FOUND") {
          return sendError(res, 404, result.error, "采集任务不存在");
        }
        if (result.error === "SNAPSHOT_UNVERIFIED") {
          return sendError(res, 409, result.error, "账号和路线确认后才能批量确认表格");
        }
        if (result.error === "TABLE_BINDING_REQUIRES_REVIEW") {
          return sendError(res, 409, result.error, "新表头或行列结构需要逐项核对，不能批量确认");
        }
        return sendError(res, 409, "SNAPSHOT_NOT_CURRENT", "表格数据已变化，请刷新后重新确认");
      }
      return sendSuccess(res, result);
    } catch (error) {
      if (isSerializableConflict(error)) {
        return sendError(res, 409, "TABLE_CELL_REVIEW_CONFLICT", "批量确认期间数据发生变化，请刷新后重试");
      }
      throw error;
    }
  });

  return router;
}
