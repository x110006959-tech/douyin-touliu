import type { Prisma } from "@prisma/client";
import { metricValueSemantic, metricValueText, visibleMetricSchema, type CollectionSnapshotPayload, type MetricKey, type VisibleMetric } from "@douyin-local-life/shared";
import { z } from "zod";
import { refreshCollectionRunStatus } from "./collection-runs.js";
import { findCurrentSnapshotIdsByRoute } from "./current-snapshots.js";
import { normalizeMetrics } from "./normalize.js";
import { ensureReviewMetricsForTask } from "./review-metrics.js";
import { toJson } from "./server-utils.js";

export type CaptureDerivedDataRepairResult = {
  taskId: string;
  repairedSnapshotIds: string[];
  normalizedMetricCount: number;
  reviewedMetricCount: number;
  repairedRouteKeys: string[];
};

export async function inspectCurrentVerifiedCaptureDerivedData(
  client: Prisma.TransactionClient,
  taskId: string
): Promise<CaptureDerivedDataRepairResult | null> {
  return processCurrentVerifiedCaptureDerivedData(client, taskId, false);
}

/**
 * Repairs only missing derived records for the current, already verified evidence.
 * It never changes raw snapshots or upgrades MANUAL_PENDING routes.
 */
export async function repairCurrentVerifiedCaptureDerivedData(
  client: Prisma.TransactionClient,
  taskId: string
): Promise<CaptureDerivedDataRepairResult | null> {
  return processCurrentVerifiedCaptureDerivedData(client, taskId, true);
}

async function processCurrentVerifiedCaptureDerivedData(
  client: Prisma.TransactionClient,
  taskId: string,
  apply: boolean
): Promise<CaptureDerivedDataRepairResult | null> {
  const task = await client.collectionTask.findUnique({
    where: { id: taskId },
    include: {
      project: true,
      routeSources: true,
      collectionRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { routeHealth: true }
      }
    }
  });
  if (!task) return null;

  const latestRunId = task.collectionRuns[0]?.id || null;
  const currentSnapshotIds = await findCurrentSnapshotIdsByRoute(client, {
    taskId,
    collectionRunId: latestRunId,
    routeKeys: task.routeSources.map((route) => route.routeKey)
  });
  if (!currentSnapshotIds.length) {
    return emptyResult(taskId);
  }

  const snapshots = await client.dataSnapshot.findMany({
    where: { id: { in: currentSnapshotIds } },
    include: { normalizedMetrics: { include: { reviewedMetric: true } } },
    orderBy: [{ localCollectedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }]
  });
  const aliasOverrideRows = await client.metricAliasOverride.findMany({
    where: { workspaceId: task.project.workspaceId, active: true },
    select: { aliasNormalized: true, pageType: true, metricKey: true }
  });
  const aliasOverrides = aliasOverrideRows.map((alias) => ({ ...alias, metricKey: alias.metricKey as MetricKey }));

  const result = emptyResult(taskId);
  const routeByKey = new Map(task.routeSources.map((route) => [route.routeKey, route]));
  const latestRun = task.collectionRuns[0] || null;
  const heartbeatByKey = new Map((latestRun?.routeHealth || []).map((heartbeat) => [heartbeat.routeKey, heartbeat]));
  const latestVerifiedSnapshot = snapshots.find((snapshot) =>
    snapshot.routeVerificationStatus === "VERIFIED" && Boolean(snapshot.routeKey)
  ) || null;
  const taskNeedsRepair = Boolean(latestVerifiedSnapshot) && (
    task.status !== "UPLOADED"
    || !task.finishedAt
    || task.finishedAt.getTime() < latestVerifiedSnapshot!.localCollectedAt.getTime()
  );
  const refreshedRunIds = new Set<string>();
  for (const snapshot of snapshots) {
    if (snapshot.routeVerificationStatus !== "VERIFIED" || !snapshot.routeKey) continue;
    const metrics = readVisibleMetrics(snapshot.visibleMetricsJson);
    const normalizedToCreate = !snapshot.normalizedMetrics.length && metrics.length
      ? normalizeMetrics({
        pageType: snapshot.pageType as CollectionSnapshotPayload["pageType"],
        sourceUrl: "https://example.invalid",
        pageTitle: "",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: metrics,
        localCollectedAt: snapshot.localCollectedAt.toISOString(),
        routeKey: snapshot.routeKey as CollectionSnapshotPayload["routeKey"]
      }, aliasOverrides)
      : [];
    const missingReviewedCount = snapshot.normalizedMetrics.filter((metric) => !metric.reviewedMetric).length
      + normalizedToCreate.length;
    const routeSource = routeByKey.get(snapshot.routeKey);
    const routeNeedsRepair = Boolean(routeSource) && (
      routeSource!.status !== "CAPTURED"
      || routeSource!.lastCapturedAt?.getTime() !== snapshot.localCollectedAt.getTime()
      || routeSource!.lastError !== null
    );
    const heartbeat = snapshot.collectionRunId === latestRun?.id
      ? heartbeatByKey.get(snapshot.routeKey)
      : null;
    const heartbeatNeedsRepair = Boolean(snapshot.collectionRunId) && (
      !heartbeat
      || heartbeat.consecutiveFailures !== 0
      || heartbeat.lastErrorCode !== null
      || heartbeat.lastError !== null
      || !heartbeat.lastSuccessAt
      || heartbeat.lastSuccessAt.getTime() < snapshot.localCollectedAt.getTime()
    );
    const runNeedsRepair = snapshot.collectionRunId === latestRun?.id && (
      !latestRun?.lastSnapshotAt
      || latestRun.lastSnapshotAt.getTime() < snapshot.localCollectedAt.getTime()
    );
    const ownsTaskRepair = taskNeedsRepair && snapshot.id === latestVerifiedSnapshot?.id;
    const needsRepair = normalizedToCreate.length > 0
      || missingReviewedCount > 0
      || routeNeedsRepair
      || heartbeatNeedsRepair
      || runNeedsRepair
      || ownsTaskRepair;
    if (!needsRepair) continue;

    result.repairedSnapshotIds.push(snapshot.id);
    result.repairedRouteKeys.push(snapshot.routeKey);
    if (!apply) {
      result.normalizedMetricCount += normalizedToCreate.length;
      result.reviewedMetricCount += missingReviewedCount;
      continue;
    }

    if (normalizedToCreate.length) {
      const created = await client.normalizedMetric.createMany({
          data: normalizedToCreate.map((metric) => ({
            snapshotId: snapshot.id,
            metricKey: metric.key,
            metricName: metric.name,
            metricValue: persistedMetricValue(metric),
            metricUnit: metric.unit || null,
            metricSource: metric.metricSource || metric.source,
            confidence: metric.confidence ?? 0.5,
            rawEvidence: metric.rawEvidence ? toJson(metric.rawEvidence) : undefined
          })),
          skipDuplicates: true
        });
      result.normalizedMetricCount += created.count;
    }

    if (missingReviewedCount > 0) {
      const repairedSnapshot = await client.dataSnapshot.findUniqueOrThrow({
        where: { id: snapshot.id },
        include: { normalizedMetrics: true }
      });
      const initialized = await ensureReviewMetricsForTask({ id: taskId, snapshots: [repairedSnapshot] }, client);
      result.reviewedMetricCount += initialized.createdCount;
    }

    if (routeNeedsRepair) {
      await client.collectionRouteSource.updateMany({
        where: { taskId, routeKey: snapshot.routeKey },
        data: { status: "CAPTURED", lastCapturedAt: snapshot.localCollectedAt, lastError: null }
      });
    }
    if (snapshot.collectionRunId && heartbeatNeedsRepair) {
      refreshedRunIds.add(snapshot.collectionRunId);
      const lastAttemptAt = laterDate(heartbeat?.lastAttemptAt, snapshot.localCollectedAt);
      const lastSuccessAt = laterDate(heartbeat?.lastSuccessAt, snapshot.localCollectedAt);
      await client.collectionRouteHeartbeat.upsert({
        where: { collectionRunId_routeKey: { collectionRunId: snapshot.collectionRunId, routeKey: snapshot.routeKey } },
        create: {
          collectionRunId: snapshot.collectionRunId,
          routeKey: snapshot.routeKey,
          consecutiveFailures: 0,
          lastAttemptAt,
          lastSuccessAt
        },
        update: {
          consecutiveFailures: 0,
          lastAttemptAt,
          lastSuccessAt,
          lastErrorCode: null,
          lastError: null
        }
      });
    }
    if (snapshot.collectionRunId && runNeedsRepair) refreshedRunIds.add(snapshot.collectionRunId);
  }

  if (apply) {
    for (const collectionRunId of refreshedRunIds) {
      await refreshCollectionRunStatus(client, collectionRunId);
    }
    if (taskNeedsRepair && result.repairedSnapshotIds.length && latestVerifiedSnapshot) {
      await client.collectionTask.update({
        where: { id: taskId },
        data: {
          status: "UPLOADED",
          finishedAt: laterDate(task.finishedAt, latestVerifiedSnapshot.localCollectedAt)
        }
      });
    }
  }
  result.repairedRouteKeys = [...new Set(result.repairedRouteKeys)];
  result.repairedSnapshotIds = [...new Set(result.repairedSnapshotIds)];
  return result;
}

function emptyResult(taskId: string): CaptureDerivedDataRepairResult {
  return { taskId, repairedSnapshotIds: [], normalizedMetricCount: 0, reviewedMetricCount: 0, repairedRouteKeys: [] };
}

function readVisibleMetrics(value: unknown): VisibleMetric[] {
  const parsed = z.array(visibleMetricSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function laterDate(left: Date | null | undefined, right: Date) {
  return left && left.getTime() > right.getTime() ? left : right;
}

function persistedMetricValue(metric: VisibleMetric) {
  return metricValueText(metric, metricValueSemantic(String(metric.key))) || "";
}
