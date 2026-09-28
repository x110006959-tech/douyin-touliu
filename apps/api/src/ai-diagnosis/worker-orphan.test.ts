import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../prisma.js";
import {
  finalizeExpiredMaxAttemptDecisionRuns,
  finalizeSucceededDecisionRun
} from "./worker.js";

const userIds: string[] = [];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  await prisma.$disconnect();
});

describe("AI diagnosis orphaned lease recovery", () => {
  it("fails expired max-attempt runs, refunds once, and keeps active leases untouched", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const created = await prisma.user.create({
      data: {
        email: `orphan-${suffix}@example.com`,
        passwordHash: "fixture-password",
        creditBalance: 1,
        workspaces: { create: { name: "Orphan recovery workspace" } }
      },
      include: { workspaces: true }
    });
    userIds.push(created.id);

    const workspaceId = created.workspaces[0]!.id;
    const account = await prisma.accountProfile.create({
      data: {
        workspaceId,
        identityKey: `id:orphan-${suffix}`,
        accountName: "Orphan recovery account",
        normalizedName: "orphanrecoveryaccount",
        platformAccountId: `orphan-${suffix}`,
        identityStatus: "VERIFIED"
      }
    });
    const project = await prisma.project.create({
      data: {
        workspaceId,
        accountProfileId: account.id,
        name: "Orphan recovery project",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        controlLevel: "MEDIUM",
        subjectConfidence: 0.9
      }
    });
    const task = await prisma.collectionTask.create({
      data: { projectId: project.id, userId: created.id, status: "UPLOADED" }
    });
    const session = await prisma.projectHistorySession.create({
      data: { projectId: project.id, status: "ACTIVE", lastActivityAt: new Date() }
    });

    const expiredAt = new Date(Date.now() - 60_000);
    const orphanedRun = await prisma.decisionRun.create({
      data: {
        projectId: project.id,
        collectionTaskId: task.id,
        mode: "AI_SKILL_ORCHESTRATED",
        status: "RUNNING",
        attemptCount: 3,
        leaseOwner: "orphaned-worker",
        leaseExpiresAt: expiredAt,
        creditCharged: true,
        currentStage: "SKILL:DELIVERY:RUNNING"
      }
    });
    await prisma.projectAnalysisArchive.create({
      data: {
        archiveKey: `orphan-history-${suffix}`,
        projectId: project.id,
        collectionTaskId: task.id,
        sessionId: session.id,
        decisionRunId: orphanedRun.id,
        status: "QUEUED",
        metricsJson: [],
        historyContextJson: {}
      }
    });

    const activeRun = await prisma.decisionRun.create({
      data: {
        projectId: project.id,
        collectionTaskId: task.id,
        mode: "AI_SKILL_ORCHESTRATED",
        status: "RUNNING",
        attemptCount: 3,
        leaseOwner: "active-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        creditCharged: false,
        currentStage: "SKILL:DELIVERY:RUNNING"
      }
    });

    const now = new Date();
    await expect(prisma.$transaction((tx) => finalizeExpiredMaxAttemptDecisionRuns(tx, now))).resolves.toBe(1);

    await expect(prisma.decisionRun.findUniqueOrThrow({ where: { id: orphanedRun.id } })).resolves.toMatchObject({
      status: "FAILED",
      currentStage: "FAILED:ORPHANED_LEASE",
      errorCode: "AI_DIAGNOSIS_MAX_ATTEMPTS",
      creditCharged: true,
      creditRefunded: true,
      leaseOwner: null,
      leaseExpiresAt: null
    });
    await expect(prisma.user.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({ creditBalance: 2 });
    await expect(prisma.projectAnalysisArchive.findFirstOrThrow({ where: { decisionRunId: orphanedRun.id } })).resolves.toMatchObject({
      status: "FAILED"
    });
    await expect(prisma.auditLog.count({
      where: {
        action: "AI_DIAGNOSIS_ORPHAN_RECOVERED",
        detailJson: { path: ["decisionRunId"], equals: orphanedRun.id }
      }
    })).resolves.toBe(1);
    await expect(prisma.decisionRun.findUniqueOrThrow({ where: { id: activeRun.id } })).resolves.toMatchObject({
      status: "RUNNING",
      leaseOwner: "active-worker"
    });

    await expect(prisma.$transaction((tx) => finalizeExpiredMaxAttemptDecisionRuns(tx, new Date()))).resolves.toBe(0);
    await expect(prisma.user.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({ creditBalance: 2 });
    await expect(prisma.auditLog.count({
      where: {
        action: "AI_DIAGNOSIS_ORPHAN_RECOVERED",
        detailJson: { path: ["decisionRunId"], equals: orphanedRun.id }
      }
    })).resolves.toBe(1);

    const guardedRun = await prisma.decisionRun.create({
      data: {
        projectId: project.id,
        collectionTaskId: task.id,
        mode: "AI_SKILL_ORCHESTRATED",
        status: "RUNNING",
        attemptCount: 1,
        leaseOwner: "success-worker",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        currentStage: "APPLYING_POLICY"
      }
    });
    await expect(prisma.$transaction((tx) => finalizeSucceededDecisionRun(tx, {
      runId: guardedRun.id,
      workerId: "replacement-worker",
      data: {
        status: "SUCCEEDED",
        currentStage: "COMPLETED",
        leaseOwner: null,
        leaseExpiresAt: null
      }
    }))).rejects.toThrow("诊断任务租约已失效");
    await expect(prisma.decisionRun.findUniqueOrThrow({ where: { id: guardedRun.id } })).resolves.toMatchObject({
      status: "RUNNING",
      leaseOwner: "success-worker"
    });

    await expect(prisma.$transaction((tx) => finalizeSucceededDecisionRun(tx, {
      runId: guardedRun.id,
      workerId: "success-worker",
      data: {
        status: "SUCCEEDED",
        currentStage: "COMPLETED",
        leaseOwner: null,
        leaseExpiresAt: null
      }
    }))).resolves.toBe(1);
    await expect(prisma.decisionRun.findUniqueOrThrow({ where: { id: guardedRun.id } })).resolves.toMatchObject({
      status: "SUCCEEDED",
      currentStage: "COMPLETED",
      leaseOwner: null,
      leaseExpiresAt: null
    });
  });
});
