import { Prisma } from "@prisma/client";
import { normalizeCollectionRouteKey, sanitizeSensitiveData, type VisibleMetric } from "@douyin-local-life/shared";
import { refreshCollectionRunStatus, requiredRoutesFromJson } from "./collection-runs.js";
import { findCurrentSnapshotIdsByRoute } from "./current-snapshots.js";
import { ensureReviewMetricsForTask } from "./review-metrics.js";
import { runSerializableTransaction } from "./transactions.js";

type Transaction = Prisma.TransactionClient;
type ConfirmationSnapshot = Prisma.DataSnapshotGetPayload<{ include: { normalizedMetrics: true } }>;
type ConfirmationTask = Prisma.CollectionTaskGetPayload<{
  include: {
    project: true;
    routeSources: { select: { routeKey: true } };
    collectionRuns: { select: { id: true; requiredRoutesJson: true }; };
  };
}>;

export type SnapshotConfirmationRequest = {
  snapshotId: string;
  expectedUpdatedAt: string;
};

export type SnapshotConfirmationError = {
  status: number;
  code: string;
  message: string;
};

export type SnapshotAccountConfirmationSummary = {
  task: ConfirmationTask;
  snapshots: ConfirmationSnapshot[];
  confirmedSnapshots: ConfirmationSnapshot[];
  skippedSnapshots: ConfirmationSnapshot[];
  reviewMetricCount: number;
  routeResults: Array<{ snapshotId: string; routeKey: string; result: "CONFIRMED" | "SKIPPED" }>;
};

type SnapshotAccountConfirmationResult =
  | { data: SnapshotAccountConfirmationSummary }
  | { error: SnapshotConfirmationError };

export async function confirmSnapshotAccounts(input: {
  userId: string;
  taskId?: string;
  snapshots: readonly SnapshotConfirmationRequest[];
  skipNoopUpdates?: boolean;
  onConfirmed?: (summary: SnapshotAccountConfirmationSummary, tx: Transaction) => Promise<void>;
}): Promise<SnapshotAccountConfirmationResult> {
  return runSerializableTransaction((tx) => confirmInTransaction(input, tx));
}

async function confirmInTransaction(
  input: {
    userId: string;
    taskId?: string;
    snapshots: readonly SnapshotConfirmationRequest[];
    skipNoopUpdates?: boolean;
    onConfirmed?: (summary: SnapshotAccountConfirmationSummary, tx: Transaction) => Promise<void>;
  },
  tx: Transaction
): Promise<SnapshotAccountConfirmationResult> {
  const taskId = await resolveTaskId(input, tx);
  if (typeof taskId !== "string") return taskId;

  const task = await tx.collectionTask.findFirst({
    where: { id: taskId, project: { workspace: { ownerId: input.userId } } },
    include: {
      project: true,
      routeSources: { select: { routeKey: true } },
      collectionRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, requiredRoutesJson: true }
      }
    }
  });
  if (!task) {
    return {
      error: {
        status: 404,
        code: input.taskId ? "TASK_NOT_FOUND" : "SNAPSHOT_NOT_FOUND",
        message: input.taskId ? "采集任务不存在" : "采集快照不存在"
      }
    };
  }

  const requestedIds = input.snapshots.map((snapshot) => snapshot.snapshotId);
  const expectedUpdatedAtBySnapshotId = new Map(input.snapshots.map((snapshot) => [snapshot.snapshotId, snapshot.expectedUpdatedAt]));
  const snapshots = await tx.dataSnapshot.findMany({
    where: { taskId: task.id, id: { in: requestedIds } },
    include: { normalizedMetrics: true }
  });
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const requestedSnapshots = requestedIds.flatMap((id) => {
    const snapshot = snapshotsById.get(id);
    return snapshot ? [snapshot] : [];
  });
  if (requestedSnapshots.length !== requestedIds.length) {
    return { error: { status: 409, code: "SNAPSHOT_TASK_MISMATCH", message: "只能确认当前任务中的快照" } };
  }
  if (requestedSnapshots.some((snapshot) => snapshot.updatedAt.toISOString() !== expectedUpdatedAtBySnapshotId.get(snapshot.id))) {
    return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "快照已发生变化，请刷新后重新确认" } };
  }
  if (requestedSnapshots.some((snapshot) => snapshot.accountMatchStatus === "MISMATCHED")) {
    return { error: { status: 409, code: "ACCOUNT_MISMATCH", message: "账号不一致的快照不能人工并入当前账号" } };
  }

  const latestRun = task.collectionRuns[0];
  const currentSnapshotIds = new Set(await findCurrentSnapshotIdsByRoute(tx, {
    taskId: task.id,
    collectionRunId: latestRun?.id || null,
    routeKeys: [
      ...task.routeSources.map((route) => route.routeKey),
      ...(latestRun ? requiredRoutesFromJson(latestRun.requiredRoutesJson) : []),
      ...requestedSnapshots.map((snapshot) => snapshot.routeKey || normalizeCollectionRouteKey(snapshot.pageType))
    ]
  }));
  if (requestedSnapshots.some((snapshot) => !currentSnapshotIds.has(snapshot.id))) {
    return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "只能确认当前任务每条路线的最新快照，请刷新后重试" } };
  }

  const pendingSnapshots = requestedSnapshots.filter((snapshot) => snapshot.accountMatchStatus === "UNVERIFIED");
  const skippedSnapshots = requestedSnapshots.filter((snapshot) => snapshot.accountMatchStatus === "MATCHED");
  if (!pendingSnapshots.length && input.skipNoopUpdates) {
    return {
      data: {
        task,
        snapshots: requestedSnapshots,
        confirmedSnapshots: [],
        skippedSnapshots,
        reviewMetricCount: 0,
        routeResults: requestedSnapshots.map((snapshot) => ({
          snapshotId: snapshot.id,
          routeKey: snapshot.routeKey || normalizeCollectionRouteKey(snapshot.pageType),
          result: "SKIPPED" as const
        }))
      }
    };
  }
  const pendingIds = pendingSnapshots.map((snapshot) => snapshot.id);
  if (pendingIds.length) {
    const updated = await tx.dataSnapshot.updateMany({
      where: {
        taskId: task.id,
        id: { in: pendingIds },
        accountMatchStatus: "UNVERIFIED",
        OR: pendingSnapshots.map((snapshot) => ({ id: snapshot.id, updatedAt: snapshot.updatedAt }))
      },
      data: { accountMatchStatus: "MATCHED", accountConfirmedById: input.userId, accountConfirmedAt: new Date() }
    });
    if (updated.count !== pendingIds.length) {
      return { error: { status: 409, code: "SNAPSHOT_NOT_CURRENT", message: "快照确认状态已变化，请刷新后重试" } };
    }
  }

  const responseSnapshots = await tx.dataSnapshot.findMany({
    where: { taskId: task.id, id: { in: requestedIds } },
    include: { normalizedMetrics: true }
  });
  const responseSnapshotsById = new Map(responseSnapshots.map((snapshot) => [snapshot.id, snapshot]));
  const confirmedSnapshots = pendingSnapshots
    .map((snapshot) => responseSnapshotsById.get(snapshot.id)!)
    .filter((snapshot) => snapshot.routeVerificationStatus === "VERIFIED");

  for (const snapshot of confirmedSnapshots) {
    await ensureNormalizedMetrics(snapshot, tx);
  }
  const snapshotsWithMetrics = confirmedSnapshots.length
    ? await tx.dataSnapshot.findMany({
        where: { taskId: task.id, id: { in: confirmedSnapshots.map((snapshot) => snapshot.id) } },
        include: { normalizedMetrics: true }
      })
    : [];
  const finalizedSnapshots = await tx.dataSnapshot.findMany({
    where: { taskId: task.id, id: { in: requestedIds } },
    include: { normalizedMetrics: true }
  });
  const finalizedSnapshotsById = new Map(finalizedSnapshots.map((snapshot) => [snapshot.id, snapshot]));
  const initialized = await ensureReviewMetricsForTask({ id: task.id, snapshots: snapshotsWithMetrics }, tx);
  await tx.collectionTask.update({ where: { id: task.id }, data: { status: confirmedSnapshots.length ? "UPLOADED" : "REVIEWING" } });

  const runIds = new Set<string>();
  for (const snapshot of confirmedSnapshots) {
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
          lastErrorCode: null,
          lastError: null
        }
      });
    }
  }
  for (const runId of runIds) await refreshCollectionRunStatus(tx, runId);

  const summary: SnapshotAccountConfirmationSummary = {
    task,
    snapshots: requestedIds.map((id) => finalizedSnapshotsById.get(id)!),
    confirmedSnapshots: snapshotsWithMetrics,
    skippedSnapshots,
    reviewMetricCount: initialized.createdCount,
    routeResults: requestedSnapshots.map((snapshot) => ({
      snapshotId: snapshot.id,
      routeKey: snapshot.routeKey || normalizeCollectionRouteKey(snapshot.pageType),
      result: skippedSnapshots.some((item) => item.id === snapshot.id) ? "SKIPPED" : "CONFIRMED"
    }))
  };
  await input.onConfirmed?.(summary, tx);
  return { data: summary };
}

async function resolveTaskId(
  input: { userId: string; taskId?: string; snapshots: readonly SnapshotConfirmationRequest[] },
  tx: Transaction
): Promise<string | SnapshotAccountConfirmationResult> {
  if (input.taskId) return input.taskId;
  const snapshotId = input.snapshots[0]?.snapshotId;
  if (!snapshotId) return { error: { status: 400, code: "VALIDATION_ERROR", message: "请明确选择待确认快照" } };
  const snapshot = await tx.dataSnapshot.findFirst({
    where: { id: snapshotId, task: { project: { workspace: { ownerId: input.userId } } } },
    select: { taskId: true }
  });
  return snapshot?.taskId || { error: { status: 404, code: "SNAPSHOT_NOT_FOUND", message: "采集快照不存在" } };
}

async function ensureNormalizedMetrics(snapshot: ConfirmationSnapshot, tx: Transaction) {
  const metrics = Array.isArray(snapshot.visibleMetricsJson) ? snapshot.visibleMetricsJson as unknown as VisibleMetric[] : [];
  if (snapshot.normalizedMetrics.length || !metrics.length) return;
  await tx.normalizedMetric.createMany({
    data: metrics.map((metric) => ({
      snapshotId: snapshot.id,
      metricKey: String(metric.key),
      metricName: metric.name,
      metricValue: metric.value == null ? "" : String(metric.value),
      metricUnit: metric.unit || null,
      metricSource: metric.metricSource || metric.source,
      confidence: metric.confidence ?? 0.5,
      rawEvidence: metric.rawEvidence ? toJson(sanitizeSensitiveData(metric.rawEvidence)) : undefined
    }))
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
