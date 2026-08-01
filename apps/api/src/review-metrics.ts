import {
  Prisma,
  type MetricReviewStatus as PrismaMetricReviewStatus,
  type MetricSource as PrismaMetricSource,
  type ReviewedMetric
} from "@prisma/client";
import {
  identifyMetricKey,
  metricKeyLabels,
  metricValueSemantic,
  metricValueText,
  standardizeMetricKey,
  type MetricKey,
  type ReviewCoverage,
  type ReviewedMetricDTO,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { prisma } from "./prisma.js";
import { selectLatestSnapshotsByRoute } from "./current-snapshots.js";
import { isConfirmableMetricEvidence } from "./metric-validation.js";

export const unreviewedDataManualCheck = "当前数据未经过人工复核，请确认关键指标后再进行投流决策。";

type NormalizedMetricLike = {
  id: string;
  metricKey: string;
  metricName: string;
  metricValue: string;
  metricUnit: string | null;
  metricSource: string;
  confidence?: number | null;
  rawEvidence?: Prisma.JsonValue | null;
};

type SnapshotLike = {
  id: string;
  pageType: string | null;
  routeKey?: string | null;
  collectionRunId?: string | null;
  localCollectedAt?: Date;
  rawDomText?: string | null;
  normalizedMetrics: NormalizedMetricLike[];
};

export type TaskReviewInput = {
  id: string;
  snapshots: SnapshotLike[];
  reviewedMetrics?: ReviewedMetric[];
  collectionRuns?: Array<{ id: string }>;
};

export function latestSnapshot(task: TaskReviewInput) {
  return task.snapshots[0] || null;
}

export function currentReviewSnapshots(task: TaskReviewInput) {
  const newest = latestSnapshot(task);
  if (!newest) return [];
  const latestCollectionRunId = task.collectionRuns?.[0]?.id || newest.collectionRunId || null;
  return selectLatestSnapshotsByRoute(task.snapshots, latestCollectionRunId);
}

export async function ensureReviewMetricsForTask(
  task: TaskReviewInput,
  db: Pick<Prisma.TransactionClient, "reviewedMetric"> = prisma
) {
  const snapshots = currentReviewSnapshots(task);
  if (!snapshots.length) return { metrics: [] as ReviewedMetric[], createdCount: 0, snapshotIds: [] as string[] };
  const snapshotIds = snapshots.map((snapshot) => snapshot.id);

  const existing = await db.reviewedMetric.findMany({
    where: { taskId: task.id, snapshotId: { in: snapshotIds } },
    orderBy: [{ createdAt: "asc" }, { metricKey: "asc" }]
  });
  const existingNormalizedMetricIds = new Set(existing.flatMap((metric) => metric.normalizedMetricId ? [metric.normalizedMetricId] : []));
  const missing = snapshots.flatMap((snapshot) => snapshot.normalizedMetrics
    .filter((metric) => !existingNormalizedMetricIds.has(metric.id))
    .map((metric) => toReviewedMetricCreate(task.id, snapshot, metric)));
  if (!missing.length) return { metrics: existing, createdCount: 0, snapshotIds };

  await db.reviewedMetric.createMany({
    data: missing,
    skipDuplicates: true
  });

  const metrics = await db.reviewedMetric.findMany({
    where: { taskId: task.id, snapshotId: { in: snapshotIds } },
    orderBy: [{ createdAt: "asc" }, { metricKey: "asc" }]
  });
  return { metrics, createdCount: Math.max(0, metrics.length - existing.length), snapshotIds };
}

export function currentReviewedMetrics(task: TaskReviewInput) {
  const currentSnapshotIds = new Set(currentReviewSnapshots(task).map((snapshot) => snapshot.id));
  return (task.reviewedMetrics || []).filter((metric) => metric.snapshotId !== null && currentSnapshotIds.has(metric.snapshotId));
}

export function validateCurrentReviewedMetricSnapshot(
  snapshots: Array<{
    id: string;
    updatedAt: Date;
    routeVerificationStatus: string;
    routeKey?: string | null;
    captureMetaJson?: Prisma.JsonValue | null;
  }>,
  snapshotId: string | null,
  expectedSnapshotUpdatedAt: string
) {
  const snapshot = snapshotId ? snapshots.find((item) => item.id === snapshotId) : null;
  if (!snapshot || snapshot.updatedAt.toISOString() !== expectedSnapshotUpdatedAt) {
    return { ok: false as const, error: "SNAPSHOT_NOT_CURRENT" as const };
  }
  if (snapshot.routeVerificationStatus !== "VERIFIED") {
    return { ok: false as const, error: "SNAPSHOT_UNVERIFIED" as const };
  }
  return { ok: true as const, snapshot };
}

export function toReviewedMetricDTO(metric: ReviewedMetric): ReviewedMetricDTO {
  const evidence = toMetricRawEvidence(metric.rawEvidence);
  return {
    id: metric.id,
    taskId: metric.taskId,
    snapshotId: metric.snapshotId,
    normalizedMetricId: metric.normalizedMetricId,
    metricKey: metric.metricKey,
    metricName: metric.metricName,
    originalValue: metric.originalValue,
    reviewedValue: metric.reviewedValue,
    metricUnit: metric.metricUnit,
    metricSource: metric.metricSource,
    confidence: metric.confidence,
    rawEvidence: metric.rawEvidence,
    displayValue: evidence?.displayValue || null,
    normalizedValue: metric.originalValue,
    fieldLabel: evidence?.fieldLabel || null,
    displayPrecision: evidence?.displayPrecision ?? null,
    unitSource: evidence?.unitSource || null,
    bindingLocation: evidence?.componentPath || evidence?.columnName || null,
    bindingStatus: evidence?.validationStatus || null,
    bindingReasons: evidence?.validationReasons || [],
    pageType: metric.pageType,
    scope: metric.scope,
    timeRange: evidence?.timeRange || metric.timeRange,
    reviewStatus: metric.reviewStatus,
    reviewedAt: metric.reviewedAt?.toISOString() || null
  };
}

export function reviewCoverage(metrics: Array<Pick<ReviewedMetric, "reviewStatus">>): ReviewCoverage {
  return {
    confirmedCount: metrics.filter((metric) => metric.reviewStatus === "CONFIRMED").length,
    modifiedCount: metrics.filter((metric) => metric.reviewStatus === "MODIFIED").length,
    ignoredCount: metrics.filter((metric) => metric.reviewStatus === "IGNORED").length,
    pendingCount: metrics.filter((metric) => metric.reviewStatus === "PENDING").length,
    totalCount: metrics.length
  };
}

export function selectedReviewedMetrics(metrics: ReviewedMetric[]) {
  return metrics.filter((metric) => (
    (metric.reviewStatus === "CONFIRMED" || metric.reviewStatus === "MODIFIED")
    && isConfirmableMetricEvidence(metric.rawEvidence)
  ));
}

export function reviewedMetricsToVisibleMetrics(metrics: ReviewedMetric[]): VisibleMetric[] {
  return selectedReviewedMetrics(metrics).flatMap((metric) => {
    if (metric.reviewStatus === "IGNORED") return [];
    const key = identifyMetricKey(metric.metricKey);
    const value = metric.reviewedValue?.trim() || metric.originalValue || "";
    return [
      {
        key,
        name: key === "unknown" ? metric.metricName : metricKeyLabels[key],
        value: normalizedMetricValue(value, metric.rawEvidence, key),
        unit: metric.metricUnit,
        source: legacySourceFromMetricSource(metric.metricSource),
        metricSource: metric.metricSource,
        confidence: 1,
        rawEvidence: toMetricRawEvidence(metric.rawEvidence)
      }
    ];
  });
}

export function normalizedMetricsToVisibleMetrics(metrics: NormalizedMetricLike[]): VisibleMetric[] {
  return metrics.map((metric) => {
    const metricSource = toMetricSource(metric.metricSource);
    const key = identifyMetricKey(metric.metricKey);
    return {
      key,
      name: key === "unknown" ? metric.metricName : metricKeyLabels[key],
      value: normalizedMetricValue(metric.metricValue, metric.rawEvidence, key),
      unit: metric.metricUnit,
      source: legacySourceFromMetricSource(metricSource),
      metricSource,
      confidence: metric.confidence ?? defaultConfidence(metricSource, key),
      rawEvidence: toMetricRawEvidence(metric.rawEvidence)
    };
  });
}

export function toMetricSource(value: unknown): PrismaMetricSource {
  if (value === "XHR_JSON" || value === "TABLE" || value === "DOM_TEXT" || value === "SCREENSHOT" || value === "MANUAL_INPUT" || value === "UNKNOWN") {
    return value;
  }
  if (value === "network") return "XHR_JSON";
  if (value === "table") return "TABLE";
  if (value === "dom") return "DOM_TEXT";
  if (value === "manual") return "MANUAL_INPUT";
  return "UNKNOWN";
}

export function defaultConfidence(source: PrismaMetricSource, key: MetricKey = "unknown") {
  if (key === "unknown") return 0.4;
  if (source === "MANUAL_INPUT") return 1;
  if (source === "XHR_JSON") return 0.85;
  if (source === "TABLE") return 0.75;
  if (source === "DOM_TEXT") return 0.6;
  return 0.5;
}

export function normalizeReviewPatch(metric: ReviewedMetric, input: { reviewedValue?: string; timeRange?: string; reviewStatus: PrismaMetricReviewStatus }) {
  const reviewedValue = input.reviewedValue?.trim();
  const evidence = toMetricRawEvidence(metric.rawEvidence);
  const timeRange = input.timeRange?.trim() || evidence?.timeRange?.trim() || (metric.timeRange && metric.timeRange !== "UNKNOWN" ? metric.timeRange.trim() : "");
  if (input.reviewStatus === "CONFIRMED") {
    return { reviewedValue: reviewedValue || metric.originalValue || "", timeRange, reviewStatus: input.reviewStatus };
  }
  if (input.reviewStatus === "MODIFIED") {
    return { reviewedValue: reviewedValue || "", timeRange, reviewStatus: input.reviewStatus };
  }
  return { reviewedValue: reviewedValue || metric.reviewedValue, timeRange, reviewStatus: input.reviewStatus };
}

export function canConfirmMetric(metric: Pick<ReviewedMetric, "rawEvidence">) {
  return isConfirmableMetricEvidence(metric.rawEvidence);
}

export function canModifyMetric(patch: ReturnType<typeof normalizeReviewPatch>) {
  return patch.reviewStatus !== "MODIFIED" || Boolean(patch.timeRange);
}

function toReviewedMetricCreate(taskId: string, snapshot: SnapshotLike, metric: NormalizedMetricLike): Prisma.ReviewedMetricCreateManyInput {
  const metricSource = toMetricSource(metric.metricSource);
  const metricKey = standardizeMetricKey({ key: metric.metricKey, name: metric.metricName });
  return {
    taskId,
    snapshotId: snapshot.id,
    normalizedMetricId: metric.id,
    metricKey,
    metricName: metricKey === "unknown" ? metric.metricName : metricKeyLabels[metricKey],
    originalValue: metric.metricValue,
    metricUnit: metric.metricUnit,
    metricSource,
    confidence: metric.confidence ?? defaultConfidence(metricSource, metricKey),
    rawEvidence: (metric.rawEvidence ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    pageType: snapshot.pageType || "UNKNOWN",
    scope: "UNKNOWN",
    timeRange: toMetricRawEvidence(metric.rawEvidence)?.timeRange || "UNKNOWN",
    reviewStatus: "PENDING"
  };
}

function legacySourceFromMetricSource(source: PrismaMetricSource): VisibleMetric["source"] {
  if (source === "XHR_JSON") return "network";
  if (source === "TABLE") return "table";
  if (source === "MANUAL_INPUT") return "manual";
  return "dom";
}

function normalizedMetricValue(value: string, rawEvidence: unknown, key: MetricKey) {
  const evidence = toMetricRawEvidence(rawEvidence);
  return metricValueText({ value, rawEvidence: evidence }, metricValueSemantic(key)) || value;
}

function toMetricRawEvidence(value: unknown): VisibleMetric["rawEvidence"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sourceType = (value as Record<string, unknown>).sourceType;
  return typeof sourceType === "string" && sourceType ? (value as VisibleMetric["rawEvidence"]) : null;
}
