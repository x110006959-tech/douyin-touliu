import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";
import { requiredRoutesFromJson } from "./collection-runs.js";
import { findCurrentSnapshotIdsByRoute } from "./current-snapshots.js";

export function getOwnedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, workspace: { ownerId: userId } },
    include: {
      workspace: true,
      accountProfile: true,
      tasks: { orderBy: { createdAt: "desc" }, take: 100, include: { routeSources: true } }
    }
  });
}

export function getOwnedTaskAccess(userId: string, taskId: string) {
  return prisma.collectionTask.findFirst({
    where: { id: taskId, project: { workspace: { ownerId: userId } } },
    include: { project: { include: { accountProfile: true } } }
  });
}

type TaskQueryClient = Prisma.TransactionClient | PrismaClient;

export async function getOwnedTask(userId: string, taskId: string, client: TaskQueryClient = prisma) {
  const task = await client.collectionTask.findFirst({
    where: { id: taskId, project: { workspace: { ownerId: userId } } },
    include: {
      project: { include: { accountProfile: true } },
      routeSources: { orderBy: [{ required: "desc" }, { createdAt: "asc" }] },
      collectionRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          routeHealth: true
        }
      },
      reviewedMetrics: { orderBy: [{ createdAt: "asc" }, { metricKey: "asc" }] },
      analyses: { orderBy: { createdAt: "desc" }, take: 20 },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 100 }
    }
  });
  if (!task) return null;
  const latestRun = task.collectionRuns[0];
  const snapshotIds = await findCurrentSnapshotIdsByRoute(client, {
    taskId: task.id,
    collectionRunId: latestRun?.id,
    routeKeys: [
      ...task.routeSources.map((route) => route.routeKey),
      ...(latestRun ? requiredRoutesFromJson(latestRun.requiredRoutesJson) : [])
    ]
  });
  const snapshots = snapshotIds.length
    ? await client.dataSnapshot.findMany({
        where: { id: { in: snapshotIds } },
        orderBy: [{ localCollectedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        include: { normalizedMetrics: true }
      })
    : [];
  return {
    ...task,
    snapshots,
    collectionRuns: task.collectionRuns.map((run) => ({
      ...run,
      snapshots: snapshots.filter((snapshot) => snapshot.collectionRunId === run.id).map((snapshot) => ({
        routeKey: snapshot.routeKey,
        pageType: snapshot.pageType,
        localCollectedAt: snapshot.localCollectedAt
      }))
    }))
  };
}

export function getOwnedActionProposal(userId: string, actionProposalId: string) {
  return prisma.actionProposal.findFirst({
    where: { id: actionProposalId, project: { workspace: { ownerId: userId } } },
    include: {
      project: { include: { accountProfile: true } },
      collectionTask: true,
      decisionRun: true,
      approvalRecords: { orderBy: { createdAt: "desc" } },
      executionLogs: { orderBy: { createdAt: "desc" } },
      outcomes: { orderBy: { createdAt: "desc" } }
    }
  });
}

export function getOwnedReviewedMetric(userId: string, metricId: string) {
  return prisma.reviewedMetric.findFirst({
    where: { id: metricId, task: { project: { workspace: { ownerId: userId } } } },
    include: { task: { include: { project: true } } }
  });
}
