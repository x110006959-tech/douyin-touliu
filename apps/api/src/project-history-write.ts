import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CollectionRouteKey,
  ProjectHistoryDecisionContext,
  ProjectHistoryMetric,
  VisibleMetric
} from "@douyin-local-life/shared";
import {
  minuteMs,
  projectHistoryInactivityMs,
  sanitizeProjectHistoryMetrics,
  toJson,
  type HistoryClient
} from "./project-history-metrics.js";

export async function recordProjectHistoryObservation(
  db: HistoryClient,
  input: {
    projectId: string;
    collectionTaskId: string;
    routeKey: CollectionRouteKey;
    pageType: string;
    observedAt: Date;
    sourceKind: "PULSE" | "SNAPSHOT" | "MANUAL";
    metrics: VisibleMetric[];
    now?: Date;
  }
) {
  const now = input.now || new Date();
  const session = await activeProjectHistorySession(db, input.projectId, now);
  const bucketAt = new Date(Math.floor(input.observedAt.getTime() / minuteMs) * minuteMs);
  const metrics = sanitizeProjectHistoryMetrics(input.metrics, input.routeKey);
  await db.projectHistoryMetricPoint.upsert({
    where: { sessionId_routeKey_bucketAt: { sessionId: session.id, routeKey: input.routeKey, bucketAt } },
    create: {
      projectId: input.projectId,
      collectionTaskId: input.collectionTaskId,
      sessionId: session.id,
      routeKey: input.routeKey,
      pageType: input.pageType,
      observedAt: input.observedAt,
      bucketAt,
      sourceKind: input.sourceKind,
      metricsJson: toJson(metrics)
    },
    update: {
      collectionTaskId: input.collectionTaskId,
      pageType: input.pageType,
      observedAt: input.observedAt,
      sourceKind: input.sourceKind,
      metricsJson: toJson(metrics)
    }
  });
  return session;
}

export async function createProjectAnalysisArchive(
  db: HistoryClient,
  input: {
    archiveKey: string;
    projectId: string;
    collectionTaskId: string;
    decisionRunId: string;
    status: "QUEUED" | "REUSED";
    metrics: ProjectHistoryMetric[];
    historyContext: ProjectHistoryDecisionContext;
    now?: Date;
  }
) {
  const now = input.now || new Date();
  const session = await activeProjectHistorySession(db, input.projectId, now);
  return db.projectAnalysisArchive.create({
    data: {
      archiveKey: input.archiveKey,
      projectId: input.projectId,
      collectionTaskId: input.collectionTaskId,
      sessionId: session.id,
      decisionRunId: input.decisionRunId,
      status: input.status,
      archivedAt: now,
      metricsJson: toJson(input.metrics),
      historyContextJson: toJson(input.historyContext)
    }
  });
}

export async function markProjectAnalysisArchiveRunStatus(
  db: Pick<PrismaClient, "projectAnalysisArchive"> | Prisma.TransactionClient,
  decisionRunId: string,
  status: "SUCCEEDED" | "FAILED"
) {
  return db.projectAnalysisArchive.updateMany({ where: { decisionRunId, status: "QUEUED" }, data: { status } });
}

export async function archiveInactiveProjectHistorySessions(db: HistoryClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - projectHistoryInactivityMs);
  const candidates = await db.projectHistorySession.findMany({
    where: { status: "ACTIVE", lastActivityAt: { lt: cutoff } },
    select: { id: true, lastActivityAt: true }
  });
  let archived = 0;
  for (const candidate of candidates) {
    const result = await db.projectHistorySession.updateMany({
      where: { id: candidate.id, status: "ACTIVE", lastActivityAt: { lt: cutoff } },
      data: { status: "ARCHIVED", archivedAt: candidate.lastActivityAt, archiveReason: "INACTIVITY" }
    });
    archived += result.count;
  }
  return archived;
}

export function startProjectHistoryLifecycle(options: { intervalMs?: number; onError?: (error: unknown) => void } = {}) {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const { prisma } = await import("./prisma.js");
      await archiveInactiveProjectHistorySessions(prisma);
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), options.intervalMs || minuteMs);
  void tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 25));
  };
}

async function activeProjectHistorySession(db: HistoryClient, projectId: string, now: Date) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}), hashtext('project-history-session'))`;
  const active = await db.projectHistorySession.findFirst({ where: { projectId, status: "ACTIVE" }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] });
  if (active && now.getTime() - active.lastActivityAt.getTime() < projectHistoryInactivityMs) {
    return db.projectHistorySession.update({ where: { id: active.id }, data: { lastActivityAt: now } });
  }
  if (active) {
    await db.projectHistorySession.updateMany({
      where: { id: active.id, status: "ACTIVE" },
      data: { status: "ARCHIVED", archivedAt: active.lastActivityAt, archiveReason: "INACTIVITY" }
    });
  }
  return db.projectHistorySession.create({ data: { projectId, startedAt: now, lastActivityAt: now } });
}
