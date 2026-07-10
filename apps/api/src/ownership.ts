import { prisma } from "./prisma.js";

export function getOwnedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, workspace: { ownerId: userId } },
    include: { workspace: true, tasks: { orderBy: { createdAt: "desc" }, take: 100 } }
  });
}

export function getOwnedTask(userId: string, taskId: string) {
  return prisma.collectionTask.findFirst({
    where: { id: taskId, project: { workspace: { ownerId: userId } } },
    include: {
      project: true,
      snapshots: { orderBy: { createdAt: "desc" }, take: 5, include: { normalizedMetrics: true } },
      reviewedMetrics: { orderBy: [{ createdAt: "asc" }, { metricKey: "asc" }] },
      analyses: { orderBy: { createdAt: "desc" }, take: 20 },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 100 }
    }
  });
}

export function getOwnedActionProposal(userId: string, actionProposalId: string) {
  return prisma.actionProposal.findFirst({
    where: { id: actionProposalId, project: { workspace: { ownerId: userId } } },
    include: {
      project: true,
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
