import type { MetricReviewStatus } from "@prisma/client";
import { projectRawTableData, type DecisionTableInput, type TableCellReviewDTO } from "@douyin-local-life/shared";

type TableCellReviewLike = {
  id: string;
  taskId: string;
  snapshotId: string;
  tableIndex: number;
  rowIndex: number;
  columnIndex: number;
  originalValue: string | null;
  reviewedValue: string | null;
  reviewStatus: MetricReviewStatus;
  reviewedAt: Date | null;
};

export function projectSnapshotTables(
  rawTableData: unknown,
  context: { routeKey: DecisionTableInput["routeKey"]; pageType: string | null }
) {
  return projectRawTableData(rawTableData, context);
}

export function getTableCellValue(tables: DecisionTableInput[], tableIndex: number, rowIndex: number, columnIndex: number) {
  const value = tables[tableIndex]?.rows[rowIndex]?.[columnIndex];
  if (value === undefined) return null;
  return value == null ? "" : String(value);
}

export function toTableCellReviewDTO(review: TableCellReviewLike): TableCellReviewDTO {
  return {
    id: review.id,
    taskId: review.taskId,
    snapshotId: review.snapshotId,
    tableIndex: review.tableIndex,
    rowIndex: review.rowIndex,
    columnIndex: review.columnIndex,
    originalValue: review.originalValue,
    reviewedValue: review.reviewedValue,
    reviewStatus: review.reviewStatus,
    reviewedAt: review.reviewedAt?.toISOString() || null
  };
}

export function tableCellReviewCoverage(reviews: Array<Pick<TableCellReviewLike, "reviewStatus">>) {
  return {
    confirmedCount: reviews.filter((review) => review.reviewStatus === "CONFIRMED").length,
    modifiedCount: reviews.filter((review) => review.reviewStatus === "MODIFIED").length,
    ignoredCount: reviews.filter((review) => review.reviewStatus === "IGNORED").length,
    pendingCount: reviews.filter((review) => review.reviewStatus === "PENDING").length,
    totalCount: reviews.length
  };
}

export function applyTableCellReviews(
  tables: DecisionTableInput[],
  reviews: Array<Pick<TableCellReviewLike, "tableIndex" | "rowIndex" | "columnIndex" | "reviewStatus" | "reviewedValue" | "originalValue">>
) {
  const reviewByCoordinate = new Map(reviews.map((review) => [coordinateKey(review), review]));
  return tables.flatMap((table, tableIndex) => {
    const rows = table.rows.flatMap((row, rowIndex) => {
      const projected = row.map((cell, columnIndex) => {
        const review = reviewByCoordinate.get(coordinateKey({ tableIndex, rowIndex, columnIndex }));
        if (!review || review.reviewStatus === "PENDING" || review.reviewStatus === "IGNORED") return null;
        if (review.reviewStatus === "MODIFIED") return review.reviewedValue ?? "";
        return cell;
      });
      return [projected];
    });
    return rows.length ? [{ ...table, rows }] : [];
  });
}

export function coordinateKey(value: { tableIndex: number; rowIndex: number; columnIndex: number }) {
  return `${value.tableIndex}:${value.rowIndex}:${value.columnIndex}`;
}
