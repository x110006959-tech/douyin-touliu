import { Prisma, type ReviewedMetric } from "@prisma/client";
import { metricValueToRuleNumber } from "@douyin-local-life/shared";
import { reviewedMetricsToVisibleMetrics } from "./review-metrics.js";

export const targetRoiMetricKey = "target_roi";

type TargetMetric = Pick<
  ReviewedMetric,
  "id" | "taskId" | "snapshotId" | "normalizedMetricId" | "metricKey" | "metricName" | "originalValue"
    | "reviewedValue" | "metricUnit" | "metricSource" | "confidence" | "rawEvidence" | "pageType" | "scope"
    | "timeRange" | "reviewStatus" | "reviewerId" | "reviewedAt" | "createdAt" | "updatedAt"
>;

export function currentTargetRoiMetric(metrics: TargetMetric[]) {
  return metrics
    .filter((metric) => (
      metric.snapshotId === null
      && metric.metricKey === targetRoiMetricKey
      && (metric.reviewStatus === "CONFIRMED" || metric.reviewStatus === "MODIFIED")
    ))
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] || null;
}

export function targetRoiFromMetrics(metrics: TargetMetric[]) {
  const metric = currentTargetRoiMetric(metrics);
  if (!metric) return null;
  const visible = reviewedMetricsToVisibleMetrics([metric as ReviewedMetric])[0];
  return visible ? metricValueToRuleNumber(visible, "ROI") : null;
}

export function targetRoiVisibleMetric(metrics: TargetMetric[]) {
  const metric = currentTargetRoiMetric(metrics);
  return metric ? reviewedMetricsToVisibleMetrics([metric as ReviewedMetric])[0] || null : null;
}

export async function replaceTaskTargetRoi(
  tx: Prisma.TransactionClient,
  input: { taskId: string; reviewerId: string; targetRoi: number | null }
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.taskId}), hashtext('decision-target-roi'))`;
  const existing = await tx.reviewedMetric.findMany({
    where: { taskId: input.taskId, snapshotId: null, metricKey: targetRoiMetricKey },
    orderBy: { updatedAt: "desc" }
  });
  if (input.targetRoi === null) {
    if (existing.length) {
      await tx.reviewedMetric.deleteMany({ where: { id: { in: existing.map((metric) => metric.id) } } });
    }
    return null;
  }

  const value = String(input.targetRoi);
  const now = new Date();
  const data = {
    metricKey: targetRoiMetricKey,
    metricName: "目标 ROI",
    originalValue: value,
    reviewedValue: value,
    metricUnit: "ROI",
    metricSource: "MANUAL_INPUT" as const,
    confidence: 1,
    rawEvidence: {
      sourceType: "MANUAL_INPUT",
      bindingKind: "MANUAL",
      path: "decisionTargets.targetRoi",
      displayValue: value,
      normalizedValue: value,
      timeRange: "当前任务",
      timeRangeSource: "MANUAL",
      timeRangeLocation: "collection-dashboard",
      validationStatus: "TRUSTED",
      validationReasons: [],
      routeKey: "LOCAL_PROMOTION_DASHBOARD"
    } satisfies Prisma.InputJsonObject,
    pageType: "LOCAL_PROMOTION_DASHBOARD",
    scope: "TASK_TARGET",
    timeRange: "当前任务",
    reviewStatus: "CONFIRMED" as const,
    reviewerId: input.reviewerId,
    reviewedAt: now
  };
  const saved = existing[0]
    ? await tx.reviewedMetric.update({ where: { id: existing[0].id }, data })
    : await tx.reviewedMetric.create({ data: { taskId: input.taskId, ...data } });
  const duplicateIds = existing.slice(1).map((metric) => metric.id);
  if (duplicateIds.length) await tx.reviewedMetric.deleteMany({ where: { id: { in: duplicateIds } } });
  return saved;
}
