import { z } from "zod";
import type {
  CaptureSummaryDTO,
  MetricReviewStatus,
  ReviewCoverage
} from "./index.js";

export type TableCellReviewDTO = {
  id: string;
  taskId: string;
  snapshotId: string;
  tableIndex: number;
  rowIndex: number;
  columnIndex: number;
  originalValue: string | null;
  reviewedValue: string | null;
  reviewStatus: MetricReviewStatus;
  reviewedAt: string | null;
};

export type BulkTableCellReviewInput = {
  snapshotId: string;
  expectedSnapshotUpdatedAt: string;
  items: Array<{
    tableIndex: number;
    rowIndex: number;
    columnIndex: number;
    reviewedValue?: string;
    reviewStatus: "CONFIRMED" | "MODIFIED" | "IGNORED";
  }>;
};

export type ConfirmTableBindingInput = {
  snapshotId: string;
  expectedSnapshotUpdatedAt: string;
  tableIndex: number;
};

export type CollectionDashboardDTO = {
  task: {
    id: string;
    title: string | null;
    accountName: string;
    projectName: string;
  };
  summary: CaptureSummaryDTO;
  reviewCoverage: ReviewCoverage;
  tableReviewCoverage: ReviewCoverage;
};

export const bulkTableCellReviewInputSchema = z.object({
  snapshotId: z.string().min(1),
  expectedSnapshotUpdatedAt: z.string().datetime(),
  items: z.array(z.object({
    tableIndex: z.number().int().min(0).max(3),
    rowIndex: z.number().int().min(0).max(999),
    columnIndex: z.number().int().min(0).max(99),
    reviewedValue: z.string().optional(),
    reviewStatus: z.enum(["CONFIRMED", "MODIFIED", "IGNORED"])
  }).superRefine((value, ctx) => {
    if (value.reviewStatus === "MODIFIED" && !value.reviewedValue?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewedValue"], message: "MODIFIED requires reviewedValue" });
    }
  })).min(1).max(240)
});

export const confirmTableBindingInputSchema = z.object({
  snapshotId: z.string().min(1),
  expectedSnapshotUpdatedAt: z.string().datetime(),
  tableIndex: z.number().int().min(0).max(3)
});
