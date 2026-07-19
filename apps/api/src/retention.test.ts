import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { runRetention } from "./retention.js";

const now = new Date("2026-07-17T12:00:00.000Z");
const userIds: string[] = [];
const securityMetricIds: string[] = [];
const auditLogIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { id: { in: auditLogIds.splice(0) } } });
  await prisma.securityMetric.deleteMany({ where: { id: { in: securityMetricIds.splice(0) } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
});

describe("data retention", () => {
  it("preserves the audit actor snapshot when its user is deleted", async () => {
    const user = await prisma.user.create({
      data: {
        email: `audit-actor-${Date.now()}@example.com`,
        passwordHash: "fixture-password"
      }
    });
    const audit = await prisma.auditLog.create({
      data: {
        userId: user.id,
        actorSnapshotJson: { userId: user.id },
        action: "audit.actor.fixture"
      }
    });
    auditLogIds.push(audit.id);

    await prisma.user.delete({ where: { id: user.id } });

    await expect(prisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } })).resolves.toMatchObject({
      userId: null,
      actorSnapshotJson: { userId: user.id }
    });
  });

  it("keeps metadata, honors 30/365-day cutoffs, and limits each batch to 500 records", async () => {
    const fixture = await createFixture();

    const dryRun = await runRetention(prisma, { mode: "dry-run", now });
    expect(dryRun.rawEvidence.snapshots.candidateCount).toBeGreaterThanOrEqual(501);
    expect(dryRun.rawEvidence.snapshots.processedCount).toBe(0);
    expect(dryRun.structuredData.actionOutcomes.candidateCount).toBe(1);
    expect(dryRun.structuredData.securityMetrics.candidateCount).toBe(1);
    expect(await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: fixture.expiredSnapshotId } })).toMatchObject({ rawDomText: "expired DOM" });

    const report = await runRetention(prisma, { mode: "run", now });
    expect(report.rawEvidence.snapshots.processedCount).toBeGreaterThanOrEqual(501);
    expect(report.rawEvidence.snapshots.batchCount).toBeGreaterThanOrEqual(2);
    expect(report.rawEvidence.snapshots.largestBatchSize).toBe(500);

    const expiredSnapshot = await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: fixture.expiredSnapshotId } });
    expect(expiredSnapshot).toMatchObject({
      id: fixture.expiredSnapshotId,
      taskId: fixture.taskId,
      routeKey: "LIVE_DATA_SCREEN",
      rawDomText: null,
      rawNetworkJson: null,
      rawTableData: null,
      visibleMetricsJson: null,
      screenshotUrl: null,
      detectedAccountId: null,
      detectedAccountName: null,
      accountMatchEvidence: null
    });
    const rawBoundarySnapshot = await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: fixture.rawBoundarySnapshotId } });
    expect(rawBoundarySnapshot.rawDomText).toBe("30-day boundary DOM");
    const structuredBoundarySnapshot = await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: fixture.structuredBoundarySnapshotId } });
    expect(structuredBoundarySnapshot.visibleMetricsJson).toEqual([{ key: "spend", value: 10 }]);

    expect(await prisma.normalizedMetric.findUnique({ where: { id: fixture.rawOnlyMetricId } })).toMatchObject({ rawEvidence: null });
    expect(await prisma.normalizedMetric.findUnique({ where: { id: fixture.rawBoundaryMetricId } })).toMatchObject({ rawEvidence: { source: "boundary" } });
    expect(await prisma.normalizedMetric.findUnique({ where: { id: fixture.expiredMetricId } })).toBeNull();
    expect(await prisma.reviewedMetric.findUnique({ where: { id: fixture.expiredReviewMetricId } })).toBeNull();
    expect(await prisma.metricDriftEvent.findUnique({ where: { id: fixture.expiredDriftId } })).toBeNull();
    expect(await prisma.actionOutcome.findUnique({ where: { id: fixture.expiredOutcomeId } })).toBeNull();
    expect(await prisma.actionProposal.findUnique({ where: { id: fixture.expiredProposalId } })).toBeNull();
    expect(await prisma.decisionRun.findUnique({ where: { id: fixture.expiredDecisionRunId } })).toBeNull();
    expect(await prisma.aiAnalysisTask.findUnique({ where: { id: fixture.expiredAnalysisId } })).toBeNull();
    expect(await prisma.auditLog.findUnique({ where: { id: fixture.expiredAuditId } })).toBeNull();
    expect(await prisma.securityMetric.findUnique({ where: { id: fixture.expiredSecurityMetricId } })).toBeNull();
    expect(await prisma.securityMetric.findUnique({ where: { id: fixture.boundarySecurityMetricId } })).not.toBeNull();
    expect(await prisma.project.findUnique({ where: { id: fixture.projectId } })).not.toBeNull();
    expect(await prisma.accountProfile.findUnique({ where: { id: fixture.accountId } })).not.toBeNull();
  });
});

async function createFixture() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const created = await prisma.user.create({
    data: {
      email: `retention-${suffix}@example.com`,
      passwordHash: "not-used",
      workspaces: { create: { name: "Retention workspace" } }
    },
    include: { workspaces: true }
  });
  userIds.push(created.id);
  const workspaceId = created.workspaces[0]!.id;
  const account = await prisma.accountProfile.create({
    data: {
      workspaceId,
      identityKey: `id:retention-${suffix}`,
      accountName: "Retention account",
      normalizedName: "retentionaccount",
      platformAccountId: `retention-${suffix}`,
      identityStatus: "VERIFIED"
    }
  });
  const project = await prisma.project.create({
    data: {
      workspaceId,
      accountProfileId: account.id,
      name: "Retention project",
      subjectType: "SERVICE_PROVIDER",
      operatorType: "SERVICE_PROVIDER_LIVE",
      cooperationType: "SERVICE_PROVIDER_CONTRACT",
      controlLevel: "MEDIUM",
      subjectConfidence: 0.9
    }
  });
  const task = await prisma.collectionTask.create({ data: { projectId: project.id, userId: created.id, status: "UPLOADED" } });
  const expiredAt = subtractDays(now, 366);
  const rawOnlyAt = subtractDays(now, 31);
  const rawBoundaryAt = subtractDays(now, 30);
  const structuredBoundaryAt = subtractDays(now, 365);

  const expiredSnapshot = await prisma.dataSnapshot.create({
    data: {
      taskId: task.id,
      pageType: "LIVE_DATA_SCREEN",
      routeKey: "LIVE_DATA_SCREEN",
      localCollectedAt: expiredAt,
      uploadedAt: expiredAt,
      createdAt: expiredAt,
      rawDomText: "expired DOM",
      rawNetworkJson: [{ response: "expired" }],
      rawTableData: [["expired table"]],
      visibleMetricsJson: [{ key: "spend", value: 20 }],
      screenshotUrl: "https://example.invalid/expired.png",
      detectedAccountId: "expired-account",
      detectedAccountName: "Expired account",
      accountMatchEvidence: { source: "expired" }
    }
  });
  const rawBoundarySnapshot = await prisma.dataSnapshot.create({
    data: {
      taskId: task.id,
      pageType: "TASK_TABLE",
      routeKey: "TASK_TABLE",
      localCollectedAt: rawBoundaryAt,
      uploadedAt: rawBoundaryAt,
      createdAt: rawBoundaryAt,
      rawDomText: "30-day boundary DOM"
    }
  });
  const structuredBoundarySnapshot = await prisma.dataSnapshot.create({
    data: {
      taskId: task.id,
      pageType: "LIVE_PRODUCT_TAB",
      routeKey: "LIVE_PRODUCT_TAB",
      localCollectedAt: structuredBoundaryAt,
      uploadedAt: structuredBoundaryAt,
      createdAt: structuredBoundaryAt,
      visibleMetricsJson: [{ key: "spend", value: 10 }]
    }
  });
  await prisma.dataSnapshot.createMany({
    data: Array.from({ length: 500 }, (_, index) => ({
      taskId: task.id,
      pageType: "LIVE_DATA_SCREEN",
      routeKey: "LIVE_DATA_SCREEN",
      localCollectedAt: expiredAt,
      uploadedAt: expiredAt,
      createdAt: expiredAt,
      rawDomText: `batch evidence ${index}`
    }))
  });

  const expiredMetric = await prisma.normalizedMetric.create({
    data: { snapshotId: expiredSnapshot.id, metricKey: "spend", metricName: "Spend", metricValue: "10", metricSource: "TABLE", rawEvidence: { source: "expired" }, createdAt: expiredAt }
  });
  const rawOnlyMetric = await prisma.normalizedMetric.create({
    data: { snapshotId: rawBoundarySnapshot.id, metricKey: "orders", metricName: "Orders", metricValue: "1", metricSource: "TABLE", rawEvidence: { source: "raw-only" }, createdAt: rawOnlyAt }
  });
  const rawBoundaryMetric = await prisma.normalizedMetric.create({
    data: { snapshotId: rawBoundarySnapshot.id, metricKey: "ctr", metricName: "CTR", metricValue: "0.1", metricSource: "TABLE", rawEvidence: { source: "boundary" }, createdAt: rawBoundaryAt }
  });
  const expiredReviewMetric = await prisma.reviewedMetric.create({
    data: { taskId: task.id, snapshotId: expiredSnapshot.id, metricKey: "spend", metricName: "Spend", originalValue: "10", rawEvidence: { source: "expired" }, createdAt: expiredAt }
  });
  const expiredDrift = await prisma.metricDriftEvent.create({
    data: { dedupeKey: `retention-drift-${suffix}`, projectId: project.id, collectionTaskId: task.id, snapshotId: expiredSnapshot.id, rawField: "old", aliasNormalized: "old", pageType: "LIVE_DATA_SCREEN", reason: "retention", createdAt: expiredAt }
  });
  const expiredAnalysis = await prisma.aiAnalysisTask.create({
    data: { collectionTaskId: task.id, provider: "test", model: "test", promptVersion: "test", status: "SUCCEEDED", createdAt: expiredAt }
  });
  const expiredDecisionRun = await prisma.decisionRun.create({
    data: {
      projectId: project.id,
      collectionTaskId: task.id,
      engineVersion: "test",
      ruleVersion: "test",
      strategyVersion: "test",
      riskLevel: "LOW",
      confidence: 0.5,
      diagnosis: "retention",
      ruleResultJson: {},
      finalResultJson: {},
      createdAt: expiredAt
    }
  });
  const expiredProposal = await prisma.actionProposal.create({
    data: {
      decisionRunId: expiredDecisionRun.id,
      projectId: project.id,
      collectionTaskId: task.id,
      actionType: "CHECK_LIVE_ROOM",
      title: "Retention action",
      reason: "retention",
      riskLevel: "LOW",
      confidence: 0.5,
      createdAt: expiredAt
    }
  });
  const expiredOutcome = await prisma.actionOutcome.create({
    data: {
      actionProposalId: expiredProposal.id,
      projectId: project.id,
      collectionTaskId: task.id,
      userId: created.id,
      observationWindow: "ONE_DAY",
      result: "UNCLEAR",
      createdAt: expiredAt
    }
  });
  await prisma.approvalRecord.create({ data: { actionProposalId: expiredProposal.id, userId: created.id, decision: "APPROVE", createdAt: expiredAt } });
  await prisma.executionLog.create({ data: { actionProposalId: expiredProposal.id, projectId: project.id, collectionTaskId: task.id, userId: created.id, createdAt: expiredAt } });
  const expiredAudit = await prisma.auditLog.create({ data: { userId: created.id, workspaceId, projectId: project.id, taskId: task.id, action: "retention.fixture", createdAt: expiredAt } });
  const expiredSecurityMetric = await prisma.securityMetric.create({
    data: { metricKey: "retention_runs", windowStartedAt: expiredAt, occurrenceCount: 1, valueTotal: 1n, lastValue: 1n }
  });
  const boundarySecurityMetric = await prisma.securityMetric.create({
    data: { metricKey: "retention_processed_records", windowStartedAt: structuredBoundaryAt, occurrenceCount: 1, valueTotal: 1n, lastValue: 1n }
  });
  securityMetricIds.push(expiredSecurityMetric.id, boundarySecurityMetric.id);

  return {
    accountId: account.id,
    projectId: project.id,
    taskId: task.id,
    expiredSnapshotId: expiredSnapshot.id,
    rawBoundarySnapshotId: rawBoundarySnapshot.id,
    structuredBoundarySnapshotId: structuredBoundarySnapshot.id,
    expiredMetricId: expiredMetric.id,
    rawOnlyMetricId: rawOnlyMetric.id,
    rawBoundaryMetricId: rawBoundaryMetric.id,
    expiredReviewMetricId: expiredReviewMetric.id,
    expiredDriftId: expiredDrift.id,
    expiredOutcomeId: expiredOutcome.id,
    expiredProposalId: expiredProposal.id,
    expiredDecisionRunId: expiredDecisionRun.id,
    expiredAnalysisId: expiredAnalysis.id,
    expiredAuditId: expiredAudit.id,
    expiredSecurityMetricId: expiredSecurityMetric.id,
    boundarySecurityMetricId: boundarySecurityMetric.id
  };
}

function subtractDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}
