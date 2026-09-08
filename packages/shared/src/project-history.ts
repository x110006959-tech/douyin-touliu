import { z } from "zod";
import { collectionRouteKeys } from "./collection-routes.js";
import { metricKeys } from "./metric-keys.js";

export const projectHistoryMetricQualities = ["TRUSTED", "REVIEW_REQUIRED"] as const;
export const projectHistoryComparisonStatuses = ["IMPROVED", "WORSENED", "NO_CHANGE", "MIXED", "INSUFFICIENT"] as const;
export const projectHistoryComparisonKinds = ["ANALYSIS_ARCHIVE", "ANALYSIS_WINDOW", "SESSION", "PERIOD"] as const;

export type ProjectHistoryMetricQuality = (typeof projectHistoryMetricQualities)[number];
export type ProjectHistoryComparisonStatus = (typeof projectHistoryComparisonStatuses)[number];
export type ProjectHistoryComparisonKind = (typeof projectHistoryComparisonKinds)[number];

export const projectHistoryMetricSchema = z.object({
  routeKey: z.enum(collectionRouteKeys),
  metricKey: z.enum(metricKeys),
  metricName: z.string().min(1).max(100),
  value: z.number().finite(),
  unit: z.string().max(30).nullable(),
  scopeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  quality: z.enum(projectHistoryMetricQualities)
});

export type ProjectHistoryMetric = z.infer<typeof projectHistoryMetricSchema>;

export const projectHistoryComparisonMetricSchema = z.object({
  routeKey: z.enum(collectionRouteKeys),
  metricKey: z.enum(metricKeys),
  metricName: z.string().min(1).max(100),
  unit: z.string().max(30).nullable(),
  baselineValue: z.number().finite().nullable(),
  currentValue: z.number().finite().nullable(),
  delta: z.number().finite().nullable(),
  conclusion: z.enum(["IMPROVED", "WORSENED", "NO_CHANGE", "RAW_CHANGE", "INSUFFICIENT"]),
  note: z.string().min(1).max(300)
});

export const projectHistoryComparisonSchema = z.object({
  kind: z.enum(projectHistoryComparisonKinds),
  status: z.enum(projectHistoryComparisonStatuses),
  label: z.string().min(1).max(160),
  baselineLabel: z.string().min(1).max(160),
  currentLabel: z.string().min(1).max(160),
  baselineAt: z.string().datetime().nullable(),
  currentAt: z.string().datetime().nullable(),
  rows: z.array(projectHistoryComparisonMetricSchema).max(80),
  notices: z.array(z.string().min(1).max(300)).max(8)
});

export type ProjectHistoryComparison = z.infer<typeof projectHistoryComparisonSchema>;

export const projectHistoryDecisionContextSchema = z.object({
  version: z.literal(1),
  capturedAt: z.string().datetime(),
  archiveComparison: projectHistoryComparisonSchema,
  periodComparison: projectHistoryComparisonSchema
});

export type ProjectHistoryDecisionContext = z.infer<typeof projectHistoryDecisionContextSchema>;

export type ProjectHistoryArchiveDTO = {
  id: string;
  collectionTaskId: string;
  decisionRunId: string | null;
  status: "QUEUED" | "SUCCEEDED" | "FAILED" | "REUSED";
  createdAt: string;
  sessionId: string;
  comparison: ProjectHistoryComparison;
};

export type ProjectHistorySessionDTO = {
  id: string;
  status: "ACTIVE" | "ARCHIVED";
  startedAt: string;
  lastActivityAt: string;
  archivedAt: string | null;
  archiveReason: "INACTIVITY" | null;
  pointCount: number;
  archiveCount: number;
};

export type ProjectHistoryOverviewDTO = {
  projectId: string;
  accountId: string;
  sessions: ProjectHistorySessionDTO[];
  archives: ProjectHistoryArchiveDTO[];
  defaultArchiveComparison: ProjectHistoryComparison;
  defaultPeriodComparison: ProjectHistoryComparison;
};
