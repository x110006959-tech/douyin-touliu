import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import {
  collectionRouteTemplates,
  defaultCollectionRouteTemplates,
  extensionBridgeProtocolVersion,
  extensionCollectionProtocolVersion,
  liveScreenInternalApiContracts,
  liveScreenInternalApiAdapterVersion,
  liveScreenInternalApiContractVersion,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { createServer } from "./server.js";
import { takeLatestVerificationForTest } from "./email-verification.js";
import { prisma } from "./prisma.js";
import { resetRateLimitBuckets } from "./rate-limit.js";
import { processNextDecisionRun } from "./ai-diagnosis/worker.js";
import { createSyntheticDiagnosisTransport } from "./ai-diagnosis/synthetic-evaluation.js";
import { syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import { liveScreenInternalApiEnabled } from "./live-screen-internal-api-config.js";

type ApiEnvelope<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: { code: string; message: string } };

const app = createServer();
let server: Server;
let baseUrl = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

beforeEach(async () => {
  await resetRateLimitBuckets();
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});

describe("V0.1 API smoke flow", () => {
  it("reports database readiness", async () => {
    await expect(api<{ ok: boolean; database: string }>("/ready", null)).resolves.toEqual({ ok: true, database: "ready" });
    await expect(api<{ productVersion: string; gitSha: string }>("/version", null)).resolves.toMatchObject({
      productVersion: "0.2.4",
      gitSha: expect.any(String)
    });
    expect((await api<{ gitSha: string }>("/version", null)).gitSha).not.toBe("unknown");
  });

  it("keeps the full decision, approval, manual execution, and audit trail loop", async () => {
    const email = `v01-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const password = "password123";

    const registered = await api<{ token: string; user: { workspaceId: string } }>("/auth/register", null, {
      method: "POST",
      body: { email, password, name: "V0.1 Smoke" }
    });
    expect(registered.user.workspaceId).toBeTruthy();

    const loggedIn = await api<{ token: string; user: { workspaceId: string } }>("/auth/login", null, {
      method: "POST",
      body: { email, password }
    });
    const token = loggedIn.token || registered.token;
    expect(token).toBeTruthy();

    const workspace = await api<{ id: string; name: string }>("/workspaces", token, {
      method: "POST",
      body: { name: "V0.1 Acceptance Workspace" }
    });
    expect(workspace.id).toBeTruthy();

    const platformAccountId = `v01-account-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { workspaceId: workspace.id, accountName: "V0.1 service provider account", platformAccountId }
    });
    const project = await api<{ id: string; subjectType: string; operatorType: string; cooperationType: string; controlLevel: string }>("/projects", token, {
      method: "POST",
      body: {
        workspaceId: workspace.id,
        accountProfileId: account.id,
        name: "V0.1 service provider project",
        businessType: "DOUYIN_LOCAL_LIFE",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        controlLevel: "MEDIUM",
        subjectConfidence: 0.92,
        serviceProviderName: "V0.1 test service provider",
        serviceMode: "managed live operation",
        serviceFee: 200
      }
    });
    expect(project).toMatchObject({
      subjectType: "SERVICE_PROVIDER",
      operatorType: "SERVICE_PROVIDER_LIVE",
      cooperationType: "SERVICE_PROVIDER_CONTRACT",
      controlLevel: "MEDIUM"
    });

    const task = await api<{ id: string; projectId: string }>("/collection-tasks", token, {
      method: "POST",
      body: {
        projectId: project.id,
        sourceUrl: "https://life.douyin.com/live-dashboard",
        pageTitle: "V0.1 live dashboard smoke"
      }
    });
    expect(task.projectId).toBe(project.id);

    await apiError(`/collection-tasks/${task.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["MATERIAL_LIBRARY"] }
    }, "ROUTE_NOT_CONFIGURED");
    const [collectionRun, concurrentRun] = await Promise.all([
      api<{ id: string; status: string; quality: { completeness: number } }>(`/collection-tasks/${task.id}/collection-runs`, token, {
        method: "POST",
        body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
      }),
      api<{ id: string; status: string; quality: { completeness: number } }>(`/collection-tasks/${task.id}/collection-runs`, token, {
        method: "POST",
        body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
      })
    ]);
    expect(concurrentRun.id).toBe(collectionRun.id);
    expect(await prisma.collectionRun.count({
      where: { taskId: task.id, status: { in: ["ACTIVE", "COMPLETED", "DEGRADED"] } }
    })).toBe(1);
    expect(await prisma.auditLog.count({
      where: { taskId: task.id, action: "collection_run.started" }
    })).toBe(1);
    expect(collectionRun.status).toBe("ACTIVE");

    const snapshotBody = {
      pageType: "LIVE_DATA_SCREEN",
      sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${platformAccountId}&access_token=must-not-persist`,
      pageTitle: "V0.1 live dashboard smoke 13800138000",
      rawDomText: "service provider password=must-not-persist phone 13800138000 spend 1200 orders 0 impressions 50000 ctr 0.5% GPM 80",
      rawNetworkJson: [
        {
          url: "https://life.douyin.com/api/live?authorization=Bearer-secret",
          method: "GET",
          status: 200,
          responseJson: { access_token: "must-not-persist", phone: "13800138000", spend: 1200 },
          capturedAt: new Date().toISOString()
        }
      ],
      rawTableData: [{ mobile: "13800138000", orders: 0 }],
      visibleMetricsJson: [
        metric("verify_roi", "verify ROI", 0.8),
        metric("gross_profit_roi", "毛利 ROI", 0.72),
        metric("spend", "spend", 1200),
        metric("orders", "orders", 0),
        metric("impressions", "impressions", 50000),
        metric("ctr", "CTR", 0.005, "%"),
        metric("gpm", "GPM", 80),
        metric("clicks", "clicks", 900),
        metric("live_viewers", "live viewers", 8000),
        metric("daily_budget", "daily budget", 1500),
        metric("cpa", "CPA", 200),
        metric("target_cpa", "target CPA", 80),
        metric("target_roi", "target ROI", 1.4),
        metric("new_ab_ctr", "新点击率", 0.02, "%")
      ],
      screenshotUrl: null,
      localCollectedAt: new Date().toISOString(),
      collectionRunId: collectionRun.id,
      routeKey: "LIVE_DATA_SCREEN",
      detectedAccountId: platformAccountId,
      accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
      captureMeta: captureMeta("LIVE_DATA_SCREEN", ["verify_roi", "gross_profit_roi", "spend", "orders", "impressions", "ctr"])
    };
    const snapshotKey = `snapshot-${Date.now()}`;
    const snapshot = await api<{ id: string; normalizedMetrics: Array<{ metricKey: string }> }>(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      headers: { "idempotency-key": snapshotKey },
      body: snapshotBody
    });
    expect(snapshot.id).toBeTruthy();
    expect(snapshot.normalizedMetrics.length).toBeGreaterThan(0);
    const replayedSnapshot = await api<{ id: string }>(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      headers: { "idempotency-key": snapshotKey },
      body: snapshotBody
    });
    expect(replayedSnapshot.id).toBe(snapshot.id);
    const persistedSnapshot = await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } });
    const persistedSnapshotText = JSON.stringify(persistedSnapshot);
    expect(persistedSnapshotText).not.toContain("must-not-persist");
    expect(persistedSnapshotText).not.toContain("13800138000");
    expect(persistedSnapshot.rawDomText).toBeNull();
    expect(persistedSnapshot.rawNetworkJson).toEqual([]);
    const driftEvents = await api<Array<{ aliasNormalized: string; candidateKeysJson: string[] }>>(`/projects/${project.id}/metric-drift-events?status=OPEN`, token);
    const ctrDrift = driftEvents.find((event) => event.candidateKeysJson.includes("ctr"));
    expect(ctrDrift).toBeTruthy();
    await api(`/projects/${project.id}/metric-aliases/${encodeURIComponent(ctrDrift!.aliasNormalized)}`, token, {
      method: "PUT",
      body: { metricKey: "ctr", pageType: "LIVE_DATA_SCREEN" }
    });
    expect((await api<Array<{ aliasNormalized: string }>>(`/projects/${project.id}/metric-drift-events?status=OPEN`, token)).some((event) => event.aliasNormalized === ctrDrift!.aliasNormalized)).toBe(false);

    const pulse = await api<{ pulseCount: number; signals: unknown[] }>(`/collection-tasks/${task.id}/metric-pulses`, token, {
      method: "POST",
      body: {
        collectionRunId: collectionRun.id,
        routeKey: "LIVE_DATA_SCREEN",
        pageType: "LIVE_DATA_SCREEN",
        localCapturedAt: new Date().toISOString(),
        tabState: "VISIBLE",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${platformAccountId}`,
        detectedAccountId: platformAccountId,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
        metrics: [metric("verify_roi", "verify ROI", 0.8), metric("spend", "spend", 1200), metric("orders", "orders", 0)],
        captureMeta: captureMeta("LIVE_DATA_SCREEN", ["verify_roi", "spend", "orders"])
      }
    });
    expect(pulse.pulseCount).toBe(1);

    const completedRun = await api<{ id: string; status: string; quality: { completeness: number; blocksStrongActions: boolean } }>(
      `/collection-tasks/${task.id}/collection-runs/latest`,
      token
    );
    expect(completedRun).toMatchObject({ id: collectionRun.id, status: "COMPLETED", quality: { completeness: 1, blocksStrongActions: false } });
    const systemHealth = await api<{ status: string; database: string; collection: { activeRuns: number }; ai: { status: string } }>("/system-health", token);
    expect(systemHealth.database).toBe("READY");
    expect(systemHealth.collection.activeRuns).toBeGreaterThanOrEqual(1);

    const metrics = await api<Array<{ metricKey: string }>>(`/collection-tasks/${task.id}/metrics`, token);
    expect(metrics.length).toBeGreaterThan(0);
    await api(`/collection-tasks/${task.id}/review-metrics/initialize`, token, { method: "POST", body: {} });
    await api(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, {
      method: "POST",
      body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
    });

    const decisionCountBeforePreview = await prisma.decisionRun.count({ where: { collectionTaskId: task.id } });
    const preview = await api<{ preview: boolean; createsRecords: boolean; finalOutput: { dataQuality: { collectionQuality: unknown } } }>(
      `/collection-tasks/${task.id}/decision-preview`,
      token,
      { method: "POST", body: {} }
    );
    expect(preview).toMatchObject({ preview: true, createsRecords: false });
    expect(preview.finalOutput.dataQuality.collectionQuality).toBeTruthy();
    expect(await prisma.decisionRun.count({ where: { collectionTaskId: task.id } })).toBe(decisionCountBeforePreview);

    const decisionKey = `decision-${Date.now()}`;
    const decisionKeys = Array.from({ length: 6 }, () => decisionKey);
    const concurrentResults = await Promise.all(decisionKeys.map(async (decisionKey) => {
      const startedAt = performance.now();
      const timed = await apiWithDecisionTiming<{ id: string; actionProposals: Array<{ id: string; status: string; requiresApproval: boolean }> }>(
        `/collection-tasks/${task.id}/decision-runs`,
        token,
        { method: "POST", headers: { "idempotency-key": decisionKey }, body: {} }
      );
      return { run: timed.data, durationMs: performance.now() - startedAt, transactionMs: timed.transactionMs };
    }));
    const concurrentRuns = concurrentResults.map((result) => result.run);
    const sortedDurations = concurrentResults.map((result) => result.durationMs).sort((a, b) => a - b);
    const p95Duration = sortedDurations[Math.ceil(sortedDurations.length * 0.95) - 1] || 0;
    const transactionDurations = concurrentResults
      .map((result) => result.transactionMs)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const p95Transaction = transactionDurations[Math.ceil(transactionDurations.length * 0.95) - 1] || 0;
    expect(p95Duration).toBeLessThan(2_000);
    expect(p95Transaction).toBeLessThan(150);
    expect(new Set(concurrentRuns.map((run) => run.id)).size).toBe(1);
    const queuedRun = concurrentRuns[0];
    if (!queuedRun) throw new Error("Expected an idempotent decision run");
    expect(queuedRun.id).toBeTruthy();
    expect(queuedRun.actionProposals).toHaveLength(0);
    const decisionRun = await completeDecisionRun(queuedRun.id, token);
    expect(decisionRun.status).toBe("SUCCEEDED");
    expect(decisionRun.actionProposals.length).toBeGreaterThanOrEqual(2);
    expect(decisionRun.actionProposals.every((proposal) => proposal.requiresApproval)).toBe(true);
    const diagnosisCase = await api<{ diagnosisCase: { id: string; status: string } | null }>(`/decision-runs/${decisionRun.id}`, token);
    expect(diagnosisCase.diagnosisCase).toMatchObject({ status: "DRAFT" });
    const adoptedActionType = decisionRun.actionProposals[0]?.actionType;
    if (!diagnosisCase.diagnosisCase || !adoptedActionType) throw new Error("Expected a draft diagnosis case and accepted action");
    await api(`/decision-runs/${decisionRun.id}/feedback`, token, {
      method: "POST",
      body: { mainProblemCorrect: true, usefulnessScore: 4, adoptedActionTypes: [adoptedActionType], correctionNote: "合成评测反馈" }
    });
    const eligibleCase = await api<{ status: string }>(`/diagnosis-cases/${diagnosisCase.diagnosisCase.id}/status`, token, {
      method: "POST",
      body: { status: "ELIGIBLE" }
    });
    expect(eligibleCase.status).toBe("ELIGIBLE");
    const replayedDecision = await api<{ id: string }>(`/collection-tasks/${task.id}/decision-runs`, token, {
      method: "POST",
      headers: { "idempotency-key": decisionKey },
      body: {}
    });
    expect(replayedDecision.id).toBe(decisionRun.id);

    const latest = await api<{ id: string; actionProposals: Array<{ id: string }> }>(`/collection-tasks/${task.id}/decision-runs/latest`, token);
    expect(concurrentRuns.some((run) => run.id === latest.id)).toBe(true);

    const projectProposals = await api<Array<{ id: string; status: string }>>(`/projects/${project.id}/action-proposals`, token);
    expect(projectProposals.length).toBeGreaterThanOrEqual(2);
    const firstProposalPage = await api<Array<{ id: string }>>(`/projects/${project.id}/action-proposals?limit=1`, token);
    const secondProposalPage = await api<Array<{ id: string }>>(
      `/projects/${project.id}/action-proposals?limit=1&cursor=${firstProposalPage[0]?.id}`,
      token
    );
    expect(firstProposalPage).toHaveLength(1);
    expect(secondProposalPage).toHaveLength(1);
    expect(secondProposalPage[0]?.id).not.toBe(firstProposalPage[0]?.id);

    const explanationsBefore = await prisma.aiAnalysisTask.count({ where: { collectionTaskId: task.id } });
    const proposalsBeforeExplanation = await prisma.actionProposal.count({ where: { collectionTaskId: task.id } });
    const explanationOnly = await api<{ id: string; mode: string; status: string }>(`/collection-tasks/${task.id}/explain`, token, {
      method: "POST",
      headers: { "idempotency-key": decisionKey },
      body: {}
    });
    expect(explanationOnly).toMatchObject({ id: decisionRun.id, mode: "AI_SKILL_ORCHESTRATED", status: "SUCCEEDED" });
    expect(await prisma.actionProposal.count({ where: { collectionTaskId: task.id } })).toBe(proposalsBeforeExplanation);
    expect(await prisma.aiAnalysisTask.count({ where: { collectionTaskId: task.id } })).toBe(explanationsBefore);

    const failedRunFixture = await prisma.decisionRun.create({
      data: {
        projectId: project.id,
        collectionTaskId: task.id,
        mode: "AI_SKILL_ORCHESTRATED",
        status: "PENDING",
        evidenceFingerprint: decisionRun.evidenceFingerprint,
        strategyVersion: "managed-live-growth-skills-v1",
        currentStage: "QUEUED"
      }
    });
    await processNextDecisionRun({
      workerId: "test-worker-provider-failure",
      transport: {
        provider: "deepseek",
        model: "deepseek-v4-pro",
        async chat() {
          throw new Error("synthetic provider failure");
        }
      }
    });
    const failedRun = await api<{ status: string; errorCode: string | null; finalResult: unknown; actionProposals: unknown[] }>(
      `/decision-runs/${failedRunFixture.id}`,
      token
    );
    expect(failedRun).toMatchObject({ status: "FAILED", errorCode: "AI_DIAGNOSIS_FAILED", finalResult: null });
    expect(failedRun.actionProposals).toHaveLength(0);

    const [approveTarget, observeTarget] = projectProposals;
    if (!approveTarget || !observeTarget) throw new Error("Expected at least two deduplicated action proposals");
    const rejectTarget = projectProposals[2] || await prisma.actionProposal.create({
      data: {
        decisionRunId: decisionRun.id,
        projectId: project.id,
        collectionTaskId: task.id,
        actionType: "CHECK_AUDIENCE",
        title: "Integration rejection fixture",
        reason: "Exercises the independent rejection transition after proposal deduplication.",
        riskLevel: "LOW",
        confidence: 0.8,
        requiresApproval: true,
        status: "PENDING_APPROVAL",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        dedupeKey: `${project.id}:${task.id}:CHECK_AUDIENCE`
      }
    });

    const initialDetail = await api<{ id: string; decisionRun: unknown; approvalRecords: unknown[]; executionLogs: unknown[] }>(
      `/action-proposals/${approveTarget.id}`,
      token
    );
    expect(initialDetail.id).toBe(approveTarget.id);
    expect(initialDetail.decisionRun).toBeTruthy();

    const approved = await api<{ id: string; status: string; approvalRecords: unknown[] }>(`/action-proposals/${approveTarget.id}/approve`, token, {
      method: "POST",
      body: { comment: "Approved for manual handling only." }
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvalRecords.length).toBeGreaterThan(0);

    const observed = await api<{ status: string; approvalRecords: unknown[] }>(`/action-proposals/${observeTarget.id}/observe`, token, {
      method: "POST",
      body: { comment: "Keep observing before any manual change." }
    });
    expect(observed.status).toBe("OBSERVING");
    expect(observed.approvalRecords.length).toBeGreaterThan(0);
    await prisma.actionProposal.update({ where: { id: observeTarget.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await apiError(`/action-proposals/${observeTarget.id}/approve`, token, { method: "POST", body: {} }, "ACTION_EXPIRED");
    expect(await api<{ id: string; status: string }>(`/action-proposals/${observeTarget.id}`, token)).toMatchObject({
      id: observeTarget.id,
      status: "EXPIRED"
    });
    expect((await api<Array<{ id: string; status: string }>>(`/projects/${project.id}/action-proposals`, token)).find((proposal) => proposal.id === observeTarget.id)).toMatchObject({
      id: observeTarget.id,
      status: "EXPIRED"
    });
    expect((await api<Array<{ id: string; status: string }>>(`/action-proposals?projectId=${project.id}`, token)).find((proposal) => proposal.id === observeTarget.id)).toMatchObject({
      id: observeTarget.id,
      status: "EXPIRED"
    });
    expect((await prisma.actionProposal.findUniqueOrThrow({ where: { id: observeTarget.id } })).status).toBe("OBSERVING");

    const rejected = await api<{ status: string; approvalRecords: unknown[] }>(`/action-proposals/${rejectTarget.id}/reject`, token, {
      method: "POST",
      body: { comment: "Rejected during smoke verification." }
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.approvalRecords.length).toBeGreaterThan(0);

    await apiError(`/action-proposals/${rejectTarget.id}/outcomes`, token, {
      method: "POST",
      body: { observationWindow: "30m", result: "UNCLEAR", note: "Rejected actions cannot have execution outcomes." }
    }, "ACTION_NOT_MANUAL_EXECUTED");

    const executed = await api<{ status: string; executionLogs: unknown[] }>(
      `/action-proposals/${approveTarget.id}/mark-manual-executed`,
      token,
      {
        method: "POST",
        body: { note: "User confirmed the action was completed manually outside the system. The system did not operate any platform page." }
      }
    );
    expect(executed.status).toBe("MANUAL_EXECUTED");
    expect(executed.executionLogs.length).toBeGreaterThan(0);

    const outcomeKey = `outcome-${Date.now()}`;
    const outcomeBody = {
      observationWindow: "30m",
      beforeMetrics: [{ metricKey: "verify_roi", value: 0.8 }, { metricKey: "orders", value: 0 }],
      afterMetrics: [{ metricKey: "verify_roi", value: 1.1 }, { metricKey: "orders", value: 3 }],
      result: "IMPROVED",
      note: "Manual execution improved short-window indicators.",
      conclusion: "Keep observing before any further budget move."
    };
    const outcome = await api<ActionOutcomeResponse>(`/action-proposals/${approveTarget.id}/outcomes`, token, {
      method: "POST",
      headers: { "idempotency-key": outcomeKey },
      body: outcomeBody
    });
    expect(outcome.actionProposalId).toBe(approveTarget.id);
    expect(outcome.observationWindow).toBe("30m");
    expect(outcome.result).toBe("IMPROVED");
    const replayedOutcome = await api<ActionOutcomeResponse>(`/action-proposals/${approveTarget.id}/outcomes`, token, {
      method: "POST",
      headers: { "idempotency-key": outcomeKey },
      body: outcomeBody
    });
    expect(replayedOutcome.id).toBe(outcome.id);

    const outcomes = await api<ActionOutcomeResponse[]>(`/action-proposals/${approveTarget.id}/outcomes`, token);
    expect(outcomes.some((item) => item.id === outcome.id)).toBe(true);

    const outcomeSummary = await api<ProjectOutcomeSummaryResponse>(`/projects/${project.id}/outcome-summary`, token);
    expect(outcomeSummary.total).toBeGreaterThanOrEqual(1);
    expect(outcomeSummary.byResult.IMPROVED).toBeGreaterThanOrEqual(1);
    expect(outcomeSummary.byActionType.length).toBeGreaterThanOrEqual(1);

    const detail = await api<{ decisionRun: unknown; approvalRecords: unknown[]; executionLogs: unknown[]; outcomes: unknown[] }>(
      `/action-proposals/${approveTarget.id}`,
      token
    );
    expect(detail.decisionRun).toBeTruthy();
    expect(detail.approvalRecords.length).toBeGreaterThan(0);
    expect(detail.executionLogs.length).toBeGreaterThan(0);
    expect(detail.outcomes.length).toBeGreaterThan(0);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await api(`/collection-runs/${collectionRun.id}/failures`, token, {
        method: "POST",
        body: {
          routeKey: "LIVE_DATA_SCREEN",
          errorCode: "UPLOAD_NETWORK_ERROR",
          error: `collector timeout ${attempt + 1}`
        }
      });
    }
    const degradedRun = await api<{
      status: string;
      routeHealth: Array<{ consecutiveFailures: number; lastErrorCode: string | null }>;
    }>(
      `/collection-tasks/${task.id}/collection-runs/latest`,
      token
    );
    expect(degradedRun.status).toBe("DEGRADED");
    expect(degradedRun.routeHealth[0]?.consecutiveFailures).toBe(3);
    expect(degradedRun.routeHealth[0]?.lastErrorCode).toBe("UPLOAD_NETWORK_ERROR");

    await api(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      headers: { "idempotency-key": `recovery-${Date.now()}` },
      body: {
        ...snapshotBody,
        localCollectedAt: new Date().toISOString(),
        visibleMetricsJson: [...snapshotBody.visibleMetricsJson, metric("recovery_probe", "recovery probe", 1)]
      }
    });
    const recoveredRun = await api<{ status: string; routeHealth: Array<{ consecutiveFailures: number; lastErrorCode: string | null }> }>(
      `/collection-tasks/${task.id}/collection-runs/latest`,
      token
    );
    expect(recoveredRun.status).toBe("COMPLETED");
    expect(recoveredRun.routeHealth[0]).toMatchObject({ consecutiveFailures: 0, lastErrorCode: null });

    const auditLogs = await api<Array<{ action: string }>>(`/projects/${project.id}/audit-logs`, token);
    expect(auditLogs.some((log) => log.action === "AI_DIAGNOSIS_QUEUED")).toBe(true);
    expect(auditLogs.some((log) => log.action === "AI_DIAGNOSIS_SUCCEEDED")).toBe(true);
    expect(auditLogs.some((log) => log.action === "APPROVE_ACTION_PROPOSAL")).toBe(true);
    expect(auditLogs.some((log) => log.action === "OBSERVE_ACTION_PROPOSAL")).toBe(true);
    expect(auditLogs.some((log) => log.action === "REJECT_ACTION_PROPOSAL")).toBe(true);
    expect(auditLogs.some((log) => log.action === "MARK_ACTION_MANUAL_EXECUTED")).toBe(true);
    expect(auditLogs.some((log) => log.action === "CREATE_ACTION_OUTCOME")).toBe(true);
    expect(auditLogs.some((log) => log.action === "collection_route.failed")).toBe(true);
    expect(auditLogs.some((log) => log.action === "action_proposal.expired")).toBe(false);

    const taskTableSnapshot = await api<{ id: string; structuredDataVersion: string | null }>(
      `/collection-tasks/${task.id}/snapshots`,
      token,
      {
        method: "POST",
        body: {
          pageType: "TASK_TABLE",
          routeKey: "TASK_TABLE",
          sourceUrl: `https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2?advertiser_id=${platformAccountId}`,
          pageTitle: "任务列表",
          rawDomText: "任务名称 消耗 ROI 订单 曝光 点击率",
          rawNetworkJson: [],
          rawTableData: [[
            ["任务ID", "任务名称", "状态", "日预算", "消耗", "ROI", "目标ROI", "订单", "曝光", "点击", "点击率"],
            ["task-row-1", "标准任务行", "投放中", "1000", "300", "2.5", "2", "5", "2000", "100", "5%"]
          ]],
          visibleMetricsJson: [],
          localCollectedAt: new Date().toISOString(),
          collectionRunId: collectionRun.id,
          detectedAccountId: platformAccountId,
          accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
          captureMeta: captureMeta("TASK_TABLE", ["spend", "roi", "orders"])
        }
      }
    );
    expect(taskTableSnapshot.structuredDataVersion).toBe("collection-records-v1");
    const structuredSummary = await api<{
      structuredData: Array<{ kind: string; acceptedRowCount: number; rows: Array<{ taskId: string }> }>;
    }>(`/collection-tasks/${task.id}/capture-summary`, token);
    expect(structuredSummary.structuredData).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "TASK_ROWS" })
    ]));
  });

  it("keeps the V0.1.1 reviewed metric loop before decision runs", async () => {
    const email = `v011-review-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const password = "password123";
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email, password, name: "V0.1.1 Review Smoke" }
    });
    const token = registered.token;
    const workspace = await api<{ id: string }>("/workspaces", token, {
      method: "POST",
      body: { name: "V0.1.1 Review Workspace" }
    });
    const platformAccountId = `v011-account-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { workspaceId: workspace.id, accountName: "V0.1.1 reviewed metric account", platformAccountId }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        workspaceId: workspace.id,
        accountProfileId: account.id,
        name: "V0.1.1 reviewed metric project",
        businessType: "DOUYIN_LOCAL_LIFE",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        controlLevel: "MEDIUM",
        subjectConfidence: 0.9,
        serviceProviderName: "V0.1.1 service provider",
        serviceMode: "managed live operation",
        serviceFee: 200
      }
    });
    const task = await api<{ id: string } >("/collection-tasks", token, {
      method: "POST",
      body: {
        projectId: project.id,
        sourceUrl: "https://life.douyin.com/review-dashboard",
        pageTitle: "V0.1.1 reviewed metric dashboard"
      }
    });
    const reviewCollectionRun = await api<{ id: string }>(`/collection-tasks/${task.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
    });

    await api<{ id: string; normalizedMetrics: Array<{ metricKey: string; confidence: number; rawEvidence: unknown }> }>(
      `/collection-tasks/${task.id}/snapshots`,
      token,
      {
        method: "POST",
        body: {
          pageType: "LIVE_DATA_SCREEN",
          sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${platformAccountId}`,
          pageTitle: "V0.1.1 reviewed metric dashboard",
          rawDomText: "review dashboard spend 1000 orders 3 impressions 20000 ctr 3% GPM 120",
          rawNetworkJson: [],
          rawTableData: [],
          visibleMetricsJson: [
            metric("verify_roi", "verify ROI", 1.6),
            metric("gross_profit_roi", "毛利 ROI", 1.35),
            metric("spend", "spend", 1000),
            metric("orders", "orders", 3),
            metric("impressions", "impressions", 20000),
            metric("ctr", "CTR", 0.03, "%"),
            metric("gpm", "GPM", 120),
            metric("clicks", "clicks", 600)
          ],
          screenshotUrl: null,
          localCollectedAt: new Date().toISOString(),
          collectionRunId: reviewCollectionRun.id,
          routeKey: "LIVE_DATA_SCREEN",
          detectedAccountId: platformAccountId,
          accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null }
        }
      }
    );

    const automaticallyInitializedMetrics = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics`, token);
    expect(automaticallyInitializedMetrics.length).toBeGreaterThanOrEqual(6);
    expect(automaticallyInitializedMetrics.every((item) => item.reviewStatus === "PENDING")).toBe(true);
    expect(await prisma.auditLog.count({ where: { taskId: task.id, action: "REVIEW_METRICS_INITIALIZED" } })).toBe(1);

    await prisma.reviewedMetric.deleteMany({ where: { taskId: task.id } });
    const initializedAuditCountBeforeRead = await prisma.auditLog.count({ where: { taskId: task.id, action: "REVIEW_METRICS_INITIALIZED" } });
    expect(await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics`, token)).toHaveLength(0);
    expect(await prisma.reviewedMetric.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { taskId: task.id, action: "REVIEW_METRICS_INITIALIZED" } })).toBe(initializedAuditCountBeforeRead);
    const initialReviewMetrics = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics/initialize`, token, { method: "POST", body: {} });
    expect(initialReviewMetrics.length).toBeGreaterThanOrEqual(6);
    expect(initialReviewMetrics.every((item) => item.reviewStatus === "PENDING")).toBe(true);
    expect(initialReviewMetrics.every((item) => item.metricSource !== undefined && typeof item.confidence === "number")).toBe(true);
    expect(await prisma.auditLog.count({ where: { taskId: task.id, action: "REVIEW_METRICS_INITIALIZED" } })).toBe(initializedAuditCountBeforeRead + 1);

    const conservativePreview = await api<{
      mode: string;
      createsRecords: boolean;
      readiness: { ready: boolean; blockingReasons: string[] };
      input: DecisionRunResponse["inputJson"];
      finalOutput: { manualCheckItems: string[] };
    }>(`/collection-tasks/${task.id}/decision-preview`, token, { method: "POST", body: {} });
    expect(conservativePreview).toMatchObject({ mode: "CONSERVATIVE_ONLY", createsRecords: false, readiness: { ready: false } });
    expect(conservativePreview.input.metricLayer).toBe("REVIEWED_METRIC");
    expect(conservativePreview.input.dataReviewStatus).toBe("UNREVIEWED");
    expect(JSON.stringify(conservativePreview.finalOutput.manualCheckItems)).toContain("人工复核");
    await apiError(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} }, "DECISION_NOT_READY");

    const byKey = new Map(initialReviewMetrics.map((item) => [item.metricKey, item]));
    const roi = byKey.get("verify_roi");
    const spend = byKey.get("spend");
    const orders = byKey.get("orders");
    const clicks = byKey.get("clicks");
    if (!roi || !spend || !orders || !clicks) throw new Error("Expected review metric keys to exist");

    await apiError(`/review-metrics/${roi.id}`, token, {
      method: "PATCH",
      body: { reviewStatus: "CONFIRMED" }
    }, "VALIDATION_ERROR");

    const versionBeforeConfirm = (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt;
    const confirmed = await api<ReviewMetricResponse>(`/review-metrics/${roi.id}`, token, {
      method: "PATCH",
      body: { reviewStatus: "CONFIRMED", expectedSnapshotUpdatedAt: versionBeforeConfirm }
    });
    expect(confirmed.reviewStatus).toBe("CONFIRMED");
    expect(confirmed.reviewedValue).toBe(confirmed.originalValue);

    await apiError(`/review-metrics/${clicks.id}`, token, {
      method: "PATCH",
      body: { reviewStatus: "MODIFIED", reviewedValue: "900", timeRange: "今日", expectedSnapshotUpdatedAt: versionBeforeConfirm }
    }, "SNAPSHOT_NOT_CURRENT");

    const modified = await api<ReviewMetricResponse>(`/review-metrics/${clicks.id}`, token, {
      method: "PATCH",
      body: { reviewStatus: "MODIFIED", reviewedValue: "900", timeRange: "今日", expectedSnapshotUpdatedAt: (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt }
    });
    expect(modified.reviewStatus).toBe("MODIFIED");
    expect(modified.reviewedValue).toBe("900");
    expect(modified.metricSource).toBe("MANUAL_INPUT");

    const ignored = await api<ReviewMetricResponse>(`/review-metrics/${orders.id}`, token, {
      method: "PATCH",
      body: { reviewStatus: "IGNORED", expectedSnapshotUpdatedAt: (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt }
    });
    expect(ignored.reviewStatus).toBe("IGNORED");

    const bulkUpdated = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics/bulk`, token, {
      method: "POST",
      body: { items: [{ metricId: spend.id, reviewStatus: "MODIFIED", reviewedValue: "1200", timeRange: "今日", expectedSnapshotUpdatedAt: (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt }] }
    });
    expect(bulkUpdated.some((item) => item.metricKey === "spend" && item.reviewStatus === "MODIFIED" && item.reviewedValue === "1200")).toBe(true);
    expect(bulkUpdated.some((item) => item.metricKey === "spend" && item.metricSource === "MANUAL_INPUT")).toBe(true);

    const confirmedAll = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, {
      method: "POST",
      body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
    });
    expect(confirmedAll.some((item) => item.reviewStatus === "PENDING")).toBe(false);
    expect(confirmedAll.find((item) => item.metricKey === "orders")?.reviewStatus).toBe("IGNORED");

    const queuedReviewedRun = await api<DecisionRunResponse>(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} });
    const reviewedRun = await completeDecisionRun(queuedReviewedRun.id, token);
    expect(reviewedRun.inputJson.metricLayer).toBe("REVIEWED_METRIC");
    expect(reviewedRun.inputJson.dataReviewStatus).toBe("REVIEWED");
    expect(reviewedRun.inputJson.reviewCoverage.modifiedCount).toBeGreaterThanOrEqual(2);
    expect(reviewedRun.inputJson.reviewCoverage.ignoredCount).toBeGreaterThanOrEqual(1);
    expect(reviewedRun.inputJson.metrics.some((item) => item.key === "orders")).toBe(false);
    expect(reviewedRun.inputJson.metrics.some((item) => item.key === "spend" && item.value === 1200)).toBe(true);

    const auditLogs = await api<Array<{ action: string; detailJson?: unknown }>>(`/projects/${project.id}/audit-logs`, token);
    for (const action of [
      "REVIEW_METRICS_INITIALIZED",
      "REVIEW_METRIC_UPDATE",
      "REVIEW_METRICS_BULK_UPDATE",
      "REVIEW_METRICS_CONFIRM_ALL",
      "AI_DIAGNOSIS_SUCCEEDED"
    ]) {
      expect(auditLogs.some((log) => log.action === action), `${action} audit log should exist`).toBe(true);
    }
  });

  it("allows a reviewed partial route to run formal diagnosis while ROI-dependent actions stay blocked", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `partial-route-${suffix}@example.com`, password: "password123", name: "Partial Route" }
    });
    const token = registered.token;
    const accountIdValue = `partial-account-${suffix}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "部分可见账号", platformAccountId: accountIdValue }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        accountProfileId: account.id,
        name: "部分可见服务商项目",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        subjectConfidence: 1,
        serviceProviderName: "部分可见服务商",
        serviceFee: 200
      }
    });
    const task = await api<{ id: string }>("/collection-tasks", token, {
      method: "POST",
      body: { projectId: project.id, pageTitle: "部分可见正式诊断" }
    });
    const run = await api<{ id: string }>(`/collection-tasks/${task.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
    });
    await api(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${accountIdValue}&tab=trend&mode=main`,
        pageTitle: "直播数据大屏",
        rawDomText: "整体支付ROI 59.41 消耗 6959.73 成交订单数 8308 曝光量 100000 点击率 5%",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [
          metric("pay_roi", "整体支付 ROI", 59.41),
          metric("spend", "消耗", 6959.73),
          metric("orders", "成交订单数", 8308),
          metric("impressions", "曝光量", 100000),
          metric("ctr", "点击率", 0.05, "%")
        ],
        localCollectedAt: new Date().toISOString(),
        collectionRunId: run.id,
        routeKey: "LIVE_DATA_SCREEN",
        detectedAccountId: accountIdValue,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
        captureMeta: {
          ...captureMeta("LIVE_DATA_SCREEN", ["pay_roi", "spend", "orders", "impressions", "ctr"]),
          completeness: "PARTIAL",
          coverageRatio: 0.83,
          renderModes: ["DOM", "CANVAS"]
        }
      }
    });
    await api(`/collection-tasks/${task.id}/review-metrics/initialize`, token, { method: "POST", body: {} });
    await api(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, {
      method: "POST",
      body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
    });

    const summary = await api<{
      requiredRoutesCaptured: boolean;
      requiredRoutesComplete: boolean;
      routes: Array<{ routeKey: string; required: boolean; state: string }>;
    }>(`/collection-tasks/${task.id}/capture-summary`, token);
    expect(summary).toMatchObject({ requiredRoutesCaptured: true, requiredRoutesComplete: true });
    expect(summary.routes.find((route) => route.routeKey === "LIVE_DATA_SCREEN")).toMatchObject({ required: true, state: "PARTIAL" });

    const queuedDecision = await api<DecisionRunResponse>(`/collection-tasks/${task.id}/decision-runs`, token, {
      method: "POST",
      body: {}
    });
    const decision = await completeDecisionRun(queuedDecision.id, token);
    expect(decision.status).toBe("SUCCEEDED");
    expect(decision.finalResult.schemaVersion).toBe("ai-diagnosis-result-v1");
    expect(decision.finalResult.evidenceCatalog.length).toBeGreaterThan(0);
    expect(JSON.stringify(decision.finalResult)).not.toContain("服务商后毛利 ROI");
  });

  it("confirms multiple routes independently and ignores a late upload with older local evidence", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `multi-route-${suffix}@example.com`, password: "password123", name: "Multi Route" }
    });
    const token = registered.token;
    const platformAccountId = `multi-account-${suffix}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "多路线账号", platformAccountId }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        accountProfileId: account.id,
        name: "多路线服务商项目",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        subjectConfidence: 1,
        serviceProviderName: "多路线服务商"
      }
    });
    const task = await api<{ id: string }>("/collection-tasks", token, {
      method: "POST",
      body: { projectId: project.id, pageTitle: "多路线逐页确认" }
    });
    const run = await api<{ id: string }>(`/collection-tasks/${task.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["LIVE_DATA_SCREEN", "LOCAL_PROMOTION_DASHBOARD"] }
    });
    const now = Date.now();
    const upload = (body: Record<string, unknown>) => api<{ id: string; accountMatchStatus: string }>(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      body: {
        pageTitle: "多路线证据",
        rawNetworkJson: [],
        rawTableData: [],
        collectionRunId: run.id,
        ...body
      }
    });

    const firstLive = await upload({
      pageType: "LIVE_DATA_SCREEN",
      routeKey: "LIVE_DATA_SCREEN",
      sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=main",
      rawDomText: "消耗 100 成交订单数 2",
      visibleMetricsJson: [metric("spend", "消耗", 100), metric("orders", "成交订单数", 2)],
      localCollectedAt: new Date(now - 13 * 60_000).toISOString(),
      captureMeta: { ...captureMeta("LIVE_DATA_SCREEN", ["spend", "orders"]), completeness: "PARTIAL", coverageRatio: 0.8 }
    });
    const localPromotion = await upload({
      pageType: "LOCAL_PROMOTION_DASHBOARD",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      rawDomText: "曝光量 1000 点击率 2%",
      visibleMetricsJson: [metric("spend", "消耗", 200), metric("impressions", "曝光量", 1000), metric("ctr", "点击率", 0.02, "%")],
      localCollectedAt: new Date(now - 60_000).toISOString(),
      captureMeta: { ...captureMeta("LOCAL_PROMOTION_DASHBOARD", ["spend", "impressions", "ctr"]), completeness: "PARTIAL", coverageRatio: 0.75 }
    });

    const initialSummary = await api<{
      routes: Array<{ routeKey: string; snapshotId: string | null }>;
    }>(`/collection-tasks/${task.id}/capture-summary`, token);
    expect(initialSummary.routes.find((route) => route.routeKey === "LIVE_DATA_SCREEN")?.snapshotId).toBe(firstLive.id);
    expect(initialSummary.routes.find((route) => route.routeKey === "LOCAL_PROMOTION_DASHBOARD")?.snapshotId).toBe(localPromotion.id);

    const newestLive = await upload({
      pageType: "LIVE_DATA_SCREEN",
      routeKey: "LIVE_DATA_SCREEN",
      sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${platformAccountId}&mode=main`,
      rawDomText: "消耗 300 成交订单数 6",
      visibleMetricsJson: [metric("spend", "消耗", 300), metric("orders", "成交订单数", 6)],
      detectedAccountId: platformAccountId,
      accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
      localCollectedAt: new Date(now - 11 * 60_000).toISOString(),
      captureMeta: { ...captureMeta("LIVE_DATA_SCREEN", ["spend", "orders"]), completeness: "PARTIAL", coverageRatio: 0.85 }
    });
    await upload({
      pageType: "LIVE_DATA_SCREEN",
      routeKey: "LIVE_DATA_SCREEN",
      sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=main",
      rawDomText: "消耗 150 成交订单数 3",
      visibleMetricsJson: [metric("spend", "消耗", 150), metric("orders", "成交订单数", 3)],
      localCollectedAt: new Date(now - 12 * 60_000).toISOString(),
      captureMeta: { ...captureMeta("LIVE_DATA_SCREEN", ["spend", "orders"]), completeness: "PARTIAL", coverageRatio: 0.82 }
    });
    const finalSummary = await api<{
      requiredRoutesComplete: boolean;
      routes: Array<{
        routeKey: string;
        snapshotId: string | null;
        state: string;
        diagnostic: { summaryStatus: string; blocksStrongActions: boolean; issues: Array<{ code: string }> };
      }>;
      metrics: Array<{ metricKey: string; metricValue: string; routeKey: string | null }>;
    }>(`/collection-tasks/${task.id}/capture-summary`, token);
    expect(finalSummary.requiredRoutesComplete).toBe(false);
    expect(finalSummary.routes.find((route) => route.routeKey === "LIVE_DATA_SCREEN")?.diagnostic).toMatchObject({
      summaryStatus: "STALE",
      blocksStrongActions: true,
      issues: expect.arrayContaining([expect.objectContaining({ code: "SNAPSHOT_STALE" })])
    });
    expect(finalSummary.routes.find((route) => route.routeKey === "LOCAL_PROMOTION_DASHBOARD")?.diagnostic).toMatchObject({
      summaryStatus: "PARTIAL",
      blocksStrongActions: false
    });
    expect(finalSummary.routes.find((route) => route.routeKey === "LIVE_DATA_SCREEN")).toMatchObject({ snapshotId: newestLive.id, state: "STALE" });
    expect(finalSummary.routes.find((route) => route.routeKey === "LOCAL_PROMOTION_DASHBOARD")?.snapshotId).toBe(localPromotion.id);
    expect(finalSummary.metrics.filter((item) => item.metricKey === "spend")).toEqual(expect.arrayContaining([
      expect.objectContaining({ routeKey: "LIVE_DATA_SCREEN", metricValue: "300" }),
      expect.objectContaining({ routeKey: "LOCAL_PROMOTION_DASHBOARD", metricValue: "200" })
    ]));

    await api(`/collection-tasks/${task.id}/review-metrics/initialize`, token, { method: "POST", body: {} });
    await api(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, {
      method: "POST",
      body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
    });
    const preview = await api<{
      mode: string;
      readiness: { blockingReasons: string[] };
      finalOutput: DecisionRunResponse["finalResultJson"];
    }>(`/collection-tasks/${task.id}/decision-preview`, token, {
      method: "POST",
      body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
    });
    expect(preview.mode).toBe("CONSERVATIVE_ONLY");
    expect(preview.readiness.blockingReasons).not.toContain("关键指标尚未开始人工复核");
    expect(preview.finalOutput.actionProposals.some((proposal) => proposal.actionType === "REQUEST_MANUAL_REVIEW")).toBe(true);
    expect(preview.finalOutput.actionProposals.some((proposal) => ["PAUSE_TASK", "INCREASE_BUDGET", "DECREASE_BUDGET"].includes(proposal.actionType))).toBe(false);
    await apiError(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} }, "DECISION_NOT_READY");
  });

  it("keeps table calibration transactional, current, and out of decision input until every cell is reviewed", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `table-review-${suffix}@example.com`, password: "password123", name: "Table Review" }
    });
    const token = registered.token;
    const accountId = `table-review-account-${suffix}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "表格校准账号", platformAccountId: accountId }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        accountProfileId: account.id,
        name: "表格校准项目",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        subjectConfidence: 1,
        serviceProviderName: "表格校准服务商",
        serviceFee: 100
      }
    });
    const task = await api<{ id: string }>("/collection-tasks", token, {
      method: "POST",
      body: { projectId: project.id, sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${accountId}&mode=main` }
    });
    const run = await api<{ id: string }>(`/collection-tasks/${task.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
    });
    const snapshot = await api<{ id: string; updatedAt: string }>(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        routeKey: "LIVE_DATA_SCREEN",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${accountId}&mode=main`,
        pageTitle: "表格校准直播概览",
        rawDomText: "消耗 100 成交订单数 2",
        rawNetworkJson: [],
        rawTableData: [["投流单元", "消耗", "订单"], ["计划 A", "100", "2"]],
        visibleMetricsJson: [metric("spend", "消耗", 100), metric("orders", "成交订单数", 2)],
        localCollectedAt: new Date().toISOString(),
        collectionRunId: run.id,
        detectedAccountId: accountId,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
        captureMeta: {
          ...captureMeta("LIVE_DATA_SCREEN", ["spend", "orders"]),
          tableBindings: [{
            tableIndex: 0,
            headers: ["投流单元", "消耗", "订单"],
            identityColumn: "投流单元",
            identityColumnIndex: 0,
            timeRange: "今日",
            timeRangeLocation: "section:0>table:0",
            componentPath: "section:0>table:0",
            bindingSignature: "投流单元|消耗|订单",
            validationStatus: "REQUIRES_REVIEW",
            validationReasons: []
          }],
          routeDetection: {
            routeKey: "LIVE_DATA_SCREEN",
            source: "URL",
            confidence: 0.98,
            manuallyConfirmed: false,
            evidence: ["fixture URL"]
          }
        }
      }
    });

    const dashboard = await api<{
      summary: { tables: Array<{ snapshotId: string; rows: string[][]; routeDetectionConfidence: number | null; bindingStatus: string }> };
      tableReviewCoverage: { totalCount: number; pendingCount: number };
    }>(`/collection-tasks/${task.id}/collection-dashboard`, token);
    expect(dashboard.summary.tables).toMatchObject([{
      snapshotId: snapshot.id,
      routeDetectionConfidence: 0.98,
      bindingStatus: "REQUIRES_REVIEW",
      rows: [["投流单元", "消耗", "订单"], ["计划 A", "100", "2"]]
    }]);
    expect(dashboard.tableReviewCoverage).toMatchObject({ totalCount: 6, pendingCount: 6 });

    const otherUser = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `table-review-other-${suffix}@example.com`, password: "password123", name: "Other User" }
    });
    await apiError(`/collection-tasks/${task.id}/collection-dashboard`, otherUser.token, {}, "TASK_NOT_FOUND");
    await apiError(`/collection-tasks/${task.id}/table-cell-reviews/bulk`, otherUser.token, {
      method: "POST",
      body: {
        snapshotId: snapshot.id,
        expectedSnapshotUpdatedAt: snapshot.updatedAt,
        items: [{ tableIndex: 0, rowIndex: 1, columnIndex: 1, reviewStatus: "CONFIRMED" }]
      }
    }, "TASK_NOT_FOUND");
    await apiError(`/collection-tasks/${task.id}/table-bindings/confirm`, otherUser.token, {
      method: "POST",
      body: { snapshotId: snapshot.id, expectedSnapshotUpdatedAt: snapshot.updatedAt, tableIndex: 0 }
    }, "TASK_NOT_FOUND");

    const initialPreview = await api<{ input: { dataReviewStatus: string; tables: unknown[]; metrics: unknown[] } }>(`/collection-tasks/${task.id}/decision-preview`, token, { method: "POST", body: {} });
    expect(initialPreview.input.dataReviewStatus).toBe("UNREVIEWED");
    expect(initialPreview.input.tables).toEqual([]);
    expect(initialPreview.input.metrics).toEqual([]);

    const versionBeforeMetricConfirmation = snapshot.updatedAt;
    await api(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, {
      method: "POST",
      body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
    });
    await apiError(`/collection-tasks/${task.id}/table-cell-reviews/bulk`, token, {
      method: "POST",
      body: {
        snapshotId: snapshot.id,
        expectedSnapshotUpdatedAt: versionBeforeMetricConfirmation,
        items: [{ tableIndex: 0, rowIndex: 1, columnIndex: 1, reviewStatus: "CONFIRMED" }]
      }
    }, "SNAPSHOT_NOT_CURRENT");

    const currentSnapshotVersion = (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt;
    await apiError(`/collection-tasks/${task.id}/table-cell-reviews/bulk`, token, {
      method: "POST",
      body: {
        snapshotId: snapshot.id,
        expectedSnapshotUpdatedAt: currentSnapshotVersion,
        items: [{ tableIndex: 0, rowIndex: 1, columnIndex: 1, reviewStatus: "MODIFIED", reviewedValue: "access_token=forbidden" }]
      }
    }, "SENSITIVE_DATA_FORBIDDEN");

    const saved = await api<Array<{ reviewedValue: string | null; reviewStatus: string }>>(`/collection-tasks/${task.id}/table-cell-reviews/bulk`, token, {
      method: "POST",
      body: {
        snapshotId: snapshot.id,
        expectedSnapshotUpdatedAt: currentSnapshotVersion,
        items: [{ tableIndex: 0, rowIndex: 1, columnIndex: 1, reviewStatus: "MODIFIED", reviewedValue: "120" }]
      }
    });
    expect(saved).toMatchObject([{ reviewedValue: "120", reviewStatus: "MODIFIED" }]);
    const persistedSnapshot = await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: snapshot.id }, include: { tableCellReviews: true } });
    expect(persistedSnapshot.rawTableData).toEqual([["投流单元", "消耗", "订单"], ["计划 A", "100", "2"]]);
    expect(persistedSnapshot.tableCellReviews).toHaveLength(1);
    expect(persistedSnapshot.tableCellReviews[0]).toMatchObject({ originalValue: "100", reviewedValue: "120", reviewStatus: "MODIFIED" });
    expect(persistedSnapshot.updatedAt.toISOString()).not.toBe(snapshot.updatedAt);

    await apiError(`/collection-tasks/${task.id}/table-cell-reviews/bulk`, token, {
      method: "POST",
      body: {
        snapshotId: snapshot.id,
        expectedSnapshotUpdatedAt: snapshot.updatedAt,
        items: [{ tableIndex: 0, rowIndex: 1, columnIndex: 2, reviewStatus: "CONFIRMED" }]
      }
    }, "SNAPSHOT_NOT_CURRENT");

    const partialPreview = await api<{ input: { dataReviewStatus: string; tables: unknown[]; metrics: unknown[] } }>(`/collection-tasks/${task.id}/decision-preview`, token, { method: "POST", body: {} });
    expect(partialPreview.input.dataReviewStatus).toBe("UNREVIEWED");
    expect(partialPreview.input.tables).toEqual([]);
    expect(partialPreview.input.metrics).toEqual([]);

    const currentVersion = persistedSnapshot.updatedAt.toISOString();
    await apiError(`/collection-tasks/${task.id}/table-cell-reviews/bulk`, token, {
      method: "POST",
      body: {
        snapshotId: snapshot.id,
        expectedSnapshotUpdatedAt: currentVersion,
        items: [{ tableIndex: 0, rowIndex: 0, columnIndex: 0, reviewStatus: "CONFIRMED" }]
      }
    }, "TABLE_BINDING_REQUIRES_REVIEW");
    await apiError(`/collection-tasks/${task.id}/table-bindings/confirm`, token, {
      method: "POST",
      body: { snapshotId: snapshot.id, expectedSnapshotUpdatedAt: currentVersion, tableIndex: 0 }
    }, "TABLE_BINDING_REQUIRES_CELL_REVIEW");
    await api(`/collection-tasks/${task.id}/table-cell-reviews/bulk`, token, {
      method: "POST",
      body: {
        snapshotId: snapshot.id,
        expectedSnapshotUpdatedAt: currentVersion,
        items: [
          { tableIndex: 0, rowIndex: 0, columnIndex: 0, reviewStatus: "MODIFIED", reviewedValue: "投流单元" },
          { tableIndex: 0, rowIndex: 0, columnIndex: 1, reviewStatus: "MODIFIED", reviewedValue: "消耗" },
          { tableIndex: 0, rowIndex: 0, columnIndex: 2, reviewStatus: "MODIFIED", reviewedValue: "订单" },
          { tableIndex: 0, rowIndex: 1, columnIndex: 0, reviewStatus: "MODIFIED", reviewedValue: "计划 A" },
          { tableIndex: 0, rowIndex: 1, columnIndex: 2, reviewStatus: "IGNORED" }
        ]
      }
    });
    const calibratedDashboard = await api<{
      summary: { tables: Array<{ bindingStatus: string }> };
    }>(`/collection-tasks/${task.id}/collection-dashboard`, token);
    expect(calibratedDashboard.summary.tables[0]?.bindingStatus).toBe("TRUSTED");
    const reviewedPreview = await api<{ input: { dataReviewStatus: string; tables: Array<{ rows: Array<Array<string | null>> }>; metrics: unknown[] } }>(`/collection-tasks/${task.id}/decision-preview`, token, { method: "POST", body: {} });
    expect(reviewedPreview.input.dataReviewStatus).toBe("REVIEWED");
    expect(reviewedPreview.input.metrics.length).toBeGreaterThan(0);
    expect(reviewedPreview.input.tables[0]?.rows[1]?.[1]).toBe("120");
    expect(reviewedPreview.input.tables[0]?.rows[1]?.[2]).toBeNull();
    expect(await prisma.auditLog.count({ where: { taskId: task.id, action: "TABLE_CELL_REVIEWS_BULK_UPDATE" } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { taskId: task.id, action: "TABLE_BINDING_CONFIRMED" } })).toBe(0);
    expect(await prisma.collectionBindingCalibration.findFirst({
      where: {
        pageFingerprint: "fixture-LIVE_DATA_SCREEN",
        bindingKind: "TABLE",
        bindingKey: "0",
        bindingSignature: "投流单元|消耗|订单"
      }
    })).not.toBeNull();
  });

  it("rejects a formal decision when a reviewed valid metric coexists with an invalid ROI binding", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `invalid-binding-decision-${suffix}@example.com`, password: "password123", name: "Invalid Binding Decision" }
    });
    const token = registered.token;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "异常字段门禁账号" }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        accountProfileId: account.id,
        name: "异常字段门禁项目",
        subjectType: "MERCHANT_OFFICIAL",
        operatorType: "MERCHANT_SELF",
        cooperationType: "NONE",
        subjectConfidence: 1
      }
    });
    const task = await api<{ id: string }>("/collection-tasks", token, {
      method: "POST",
      body: { projectId: project.id, sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2" }
    });
    const run = await api<{ id: string }>(`/collection-tasks/${task.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["LOCAL_PROMOTION_DASHBOARD"] }
    });
    await api(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      body: {
        pageType: "LOCAL_PROMOTION_DASHBOARD",
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
        pageTitle: "巨量本地推数据总览",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [{
          key: "spend",
          name: "消耗",
          value: 100,
          unit: "元",
          source: "dom",
          rawEvidence: {
            sourceType: "DOM_TEXT",
            bindingKind: "CARD",
            fieldLabel: "消耗",
            displayValue: "100元",
            timeRange: "今日",
            timeRangeSource: "COMPONENT",
            timeRangeLocation: "section:0>span:2",
            componentPath: "section:0>span:0",
            calibrationSignature: "CARD:消耗:root.0",
            validationStatus: "REQUIRES_REVIEW",
            validationReasons: []
          }
        }, {
          key: "pay_roi",
          name: "整体支付 ROI",
          value: 4,
          source: "dom",
          rawEvidence: {
            sourceType: "DOM_TEXT",
            fieldLabel: "整体支付ROI",
            displayValue: "4",
            validationStatus: "INVALID",
            validationReasons: ["FIELD_BINDING_AMBIGUOUS"]
          }
        }],
        localCollectedAt: new Date().toISOString(),
        collectionRunId: run.id,
        captureMeta: captureMeta("LOCAL_PROMOTION_DASHBOARD", ["spend", "pay_roi"])
      }
    });
    const reviews = await api<Array<{
      id: string;
      metricKey: string;
      fieldLabel: string | null;
      displayValue: string | null;
      normalizedValue: string | null;
      timeRange: string | null;
      bindingLocation: string | null;
      bindingReasons: string[];
    }>>(`/collection-tasks/${task.id}/review-metrics`, token);
    const spend = reviews.find((review) => review.metricKey === "spend");
    const roi = reviews.find((review) => review.metricKey === "pay_roi");
    if (!spend || !roi) throw new Error("Expected spend and ROI review records");
    expect(spend).toMatchObject({
      fieldLabel: "消耗",
      displayValue: "100元",
      normalizedValue: "100",
      timeRange: "今日",
      bindingLocation: "section:0>span:0",
      bindingReasons: []
    });
    expect(roi).toMatchObject({
      fieldLabel: "整体支付ROI",
      displayValue: "4"
    });
    expect(roi.bindingReasons).toContain("FIELD_BINDING_AMBIGUOUS");
    await api(`/review-metrics/${spend.id}`, token, {
      method: "PATCH",
      body: {
        expectedSnapshotUpdatedAt: (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt,
        reviewStatus: "CONFIRMED"
      }
    });
    await api(`/review-metrics/${roi.id}`, token, {
      method: "PATCH",
      body: {
        expectedSnapshotUpdatedAt: (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt,
        reviewStatus: "MODIFIED",
        reviewedValue: "4",
        timeRange: "今日"
      }
    });

    const preview = await api<{ mode: string; input: { dataReviewStatus: string; metrics: unknown[] }; readiness: { blockingReasons: string[] } }>(
      `/collection-tasks/${task.id}/decision-preview`,
      token,
      { method: "POST", body: {} }
    );
    expect(preview.mode).toBe("CONSERVATIVE_ONLY");
    expect(preview.input.dataReviewStatus).toBe("UNREVIEWED");
    expect(preview.input.metrics).toEqual([]);
    expect(preview.readiness.blockingReasons).toContain("当前快照存在未放行的字段绑定或表格行列证据，不能生成正式诊断");
    await apiError(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} }, "DECISION_NOT_READY");
  });

  it("auto-confirms a calibrated table at capture and keeps task-level confirmation idempotent", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `table-confirm-all-${suffix}@example.com`, password: "password123", name: "Table Confirm All" }
    });
    const token = registered.token;
    const accountId = `table-confirm-all-account-${suffix}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "表格整批确认账号", platformAccountId: accountId }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        accountProfileId: account.id,
        name: "表格整批确认项目",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        subjectConfidence: 1,
        serviceProviderName: "表格整批确认服务商"
      }
    });
    const calibrationOwner = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { workspaceId: true, workspace: { select: { ownerId: true } } }
    });
    await prisma.collectionBindingCalibration.create({
      data: {
        workspaceId: calibrationOwner.workspaceId,
        routeKey: "LIVE_DATA_SCREEN",
        pageFingerprint: "fixture-LIVE_DATA_SCREEN",
        bindingKind: "TABLE",
        bindingKey: "0",
        bindingSignature: "投流单元|消耗|订单",
        confirmedById: calibrationOwner.workspace.ownerId
      }
    });
    const task = await api<{ id: string }>("/collection-tasks", token, {
      method: "POST",
      body: { projectId: project.id, sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${accountId}&mode=main` }
    });
    const run = await api<{ id: string }>(`/collection-tasks/${task.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
    });
    const snapshot = await api<{ id: string }>(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        routeKey: "LIVE_DATA_SCREEN",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${accountId}&mode=main`,
        pageTitle: "整批确认直播概览",
        rawDomText: "消耗 100 成交订单数 2",
        rawNetworkJson: [],
        rawTableData: [["投流单元", "消耗", "订单"], ["计划 A", "100", "2"]],
        visibleMetricsJson: [metric("spend", "消耗", 100), metric("orders", "成交订单数", 2)],
        localCollectedAt: new Date().toISOString(),
        collectionRunId: run.id,
        detectedAccountId: accountId,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
        captureMeta: {
          ...captureMeta("LIVE_DATA_SCREEN", ["spend", "orders"]),
          tableBindings: [{
            tableIndex: 0,
            headers: ["投流单元", "消耗", "订单"],
            identityColumn: "投流单元",
            identityColumnIndex: 0,
            timeRange: "今日",
            timeRangeLocation: "section:0>table:0",
            componentPath: "section:0>table:0",
            bindingSignature: "投流单元|消耗|订单",
            validationStatus: "REQUIRES_REVIEW",
            validationReasons: []
          }],
          routeDetection: {
            routeKey: "LIVE_DATA_SCREEN",
            source: "URL",
            confidence: 0.98,
            manuallyConfirmed: false,
            evidence: ["fixture URL"]
          }
        }
      }
    });

    await api(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, {
      method: "POST",
      body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
    });
    const beforeModification = await api<{
      summary: { tables: Array<{ snapshotId: string; snapshotUpdatedAt: string }> };
    }>(`/collection-tasks/${task.id}/collection-dashboard`, token);
    await api(`/collection-tasks/${task.id}/table-cell-reviews/bulk`, token, {
      method: "POST",
      body: {
        snapshotId: snapshot.id,
        expectedSnapshotUpdatedAt: beforeModification.summary.tables[0]?.snapshotUpdatedAt,
        items: [{ tableIndex: 0, rowIndex: 1, columnIndex: 1, reviewStatus: "MODIFIED", reviewedValue: "120" }]
      }
    });

    const beforeConfirmAll = await api<{
      summary: { tables: Array<{ snapshotId: string; snapshotUpdatedAt: string }> };
    }>(`/collection-tasks/${task.id}/collection-dashboard`, token);
    const confirmed = await api<{ confirmedCount: number; totalCount: number; tableCount: number }>(
      `/collection-tasks/${task.id}/table-cell-reviews/confirm-all`,
      token,
      {
        method: "POST",
        body: {
          snapshotVersions: beforeConfirmAll.summary.tables.map((table) => ({
            snapshotId: table.snapshotId,
            expectedSnapshotUpdatedAt: table.snapshotUpdatedAt
          }))
        }
      }
    );
    expect(confirmed).toEqual({ confirmedCount: 0, totalCount: 6, tableCount: 1 });

    const persisted = await prisma.tableCellReview.findMany({
      where: { snapshotId: snapshot.id },
      orderBy: [{ rowIndex: "asc" }, { columnIndex: "asc" }]
    });
    expect(persisted).toHaveLength(6);
    expect(persisted.filter((review) => review.reviewStatus === "CONFIRMED")).toHaveLength(5);
    expect(persisted.find((review) => review.rowIndex === 1 && review.columnIndex === 1)).toMatchObject({
      reviewStatus: "MODIFIED",
      reviewedValue: "120"
    });

    const afterConfirmAll = await api<{
      summary: { tables: Array<{ snapshotId: string; snapshotUpdatedAt: string }> };
    }>(`/collection-tasks/${task.id}/collection-dashboard`, token);
    const replayed = await api<{ confirmedCount: number }>(
      `/collection-tasks/${task.id}/table-cell-reviews/confirm-all`,
      token,
      {
        method: "POST",
        body: {
          snapshotVersions: afterConfirmAll.summary.tables.map((table) => ({
            snapshotId: table.snapshotId,
            expectedSnapshotUpdatedAt: table.snapshotUpdatedAt
          }))
        }
      }
    );
    expect(replayed.confirmedCount).toBe(0);
    expect(await prisma.auditLog.count({
      where: { taskId: task.id, action: "TABLE_CELL_REVIEWS_CONFIRM_ALL" }
    })).toBe(0);
  });

  it("reuses account profiles while task ownership remains server-scoped", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `account-${suffix}@example.com`, password: "password123", name: "Account Boundary" }
    });
    const token = registered.token;
    const accountA = await api<{ id: string; accountName: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "账号 A", platformAccountId: `advertiser-a-${suffix}` }
    });
    const accountB = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "账号 B", platformAccountId: `advertiser-b-${suffix}` }
    });
    const renamedAccount = await api<{ id: string; platformAccountId?: string | null }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "账号 A 重命名", platformAccountId: `advertiser-a-${suffix}` }
    });
    expect(renamedAccount.id).not.toBe(accountA.id);
    expect(renamedAccount.platformAccountId).toBeNull();

    const project = await api<{ id: string; accountProfileId: string }>("/projects", token, {
      method: "POST",
      body: { accountProfileId: accountA.id, name: "账号 A 首场", subjectType: "SERVICE_PROVIDER", operatorType: "SERVICE_PROVIDER_LIVE", cooperationType: "SERVICE_PROVIDER_CONTRACT", subjectConfidence: 1, serviceProviderName: "测试服务商", serviceFee: 200 }
    });
    await apiError(`/projects/${project.id}/clone`, token, {
      method: "POST",
      body: { name: "缺少服务商名称", accountProfileId: accountA.id, serviceProviderName: null }
    }, "VALIDATION_ERROR");
    const cloned = await api<{ id: string; accountProfileId: string; operatorType: string; serviceProviderName: string | null; serviceFee: number | null }>(`/projects/${project.id}/clone`, token, {
      method: "POST",
      body: { name: "账号 A 第二场", accountProfileId: accountA.id, operatorType: "SERVICE_PROVIDER_OPERATION", serviceProviderName: "新周期服务商", serviceFee: null }
    });
    expect(cloned.accountProfileId).toBe(accountA.id);
    expect(cloned.operatorType).toBe("SERVICE_PROVIDER_OPERATION");
    expect(cloned.serviceProviderName).toBe("新周期服务商");
    expect(cloned.serviceFee).toBeNull();
    const unchangedSource = await api<{ operatorType: string; serviceProviderName: string | null; serviceFee: number | null }>(`/projects/${project.id}`, token);
    expect(unchangedSource.operatorType).toBe("SERVICE_PROVIDER_LIVE");
    expect(unchangedSource.serviceProviderName).toBe("测试服务商");
    expect(unchangedSource.serviceFee).toBe(200);
    await apiError(`/projects/${project.id}/clone`, token, { method: "POST", body: { name: "错误跨账号复制", accountProfileId: accountB.id } }, "CROSS_ACCOUNT_CLONE_FORBIDDEN");

    const taskKey = `task:${suffix}`;
    const firstTask = await api<{ id: string; routeSources: Array<{ routeKey: string }> }>("/collection-tasks", token, {
      method: "POST",
      headers: { "idempotency-key": taskKey },
      body: { projectId: project.id, pageTitle: "账号隔离任务" }
    });
    const replayedTask = await api<{ id: string }>("/collection-tasks", token, {
      method: "POST",
      headers: { "idempotency-key": taskKey },
      body: { projectId: project.id, pageTitle: "账号隔离任务" }
    });
    expect(replayedTask.id).toBe(firstTask.id);
    expect(firstTask.routeSources.map((route) => route.routeKey).sort()).toEqual(defaultCollectionRouteTemplates.map((route) => route.routeKey).sort());
    const routeUrl = "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=1837899261171721&room_id=7662599526045485834";
    const updatedRoute = await api<{ routeKey: string; sourceUrl: string | null }>(`/collection-tasks/${firstTask.id}/routes/LOCAL_PROMOTION_DASHBOARD`, token, {
      method: "PUT",
      body: { sourceUrl: routeUrl }
    });
    expect(updatedRoute.sourceUrl).toBe(routeUrl);
    const routeSummary = await api<{ routes: Array<{ routeKey: string; sourceUrl: string | null }> }>(`/collection-tasks/${firstTask.id}/capture-summary`, token);
    expect(routeSummary.routes.find((route) => route.routeKey === "LOCAL_PROMOTION_DASHBOARD")?.sourceUrl).toBe(routeUrl);
    await apiError(`/collection-tasks/${firstTask.id}/routes/TASK_TABLE`, token, {
      method: "PUT",
      body: { sourceUrl: "https://attacker.example.com/page" }
    }, "UNSUPPORTED_SOURCE_URL");

    const disposableTask = await api<{ id: string; routeSources: Array<{ id: string }> }>("/collection-tasks", token, {
      method: "POST",
      headers: { "idempotency-key": `delete-task:${suffix}` },
      body: { projectId: project.id, pageTitle: "待删除重复任务" }
    });
    const otherUser = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `task-delete-other-${suffix}@example.com`, password: "password123", name: "Other User" }
    });
    await apiError(`/collection-tasks/${disposableTask.id}`, otherUser.token, {
      method: "DELETE",
      body: { confirmTaskId: disposableTask.id }
    }, "TASK_NOT_FOUND");
    await apiError(`/collection-tasks/${disposableTask.id}`, token, {
      method: "DELETE",
      body: { confirmTaskId: firstTask.id }
    }, "TASK_DELETE_CONFIRMATION_MISMATCH");
    const deletedTask = await api<{ id: string; routeCount: number; snapshotCount: number }>(`/collection-tasks/${disposableTask.id}`, token, {
      method: "DELETE",
      body: { confirmTaskId: disposableTask.id }
    });
    expect(deletedTask).toMatchObject({ id: disposableTask.id, routeCount: disposableTask.routeSources.length, snapshotCount: 0 });
    expect(await prisma.collectionTask.findUnique({ where: { id: disposableTask.id } })).toBeNull();
    expect(await prisma.collectionRouteSource.count({ where: { taskId: disposableTask.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "COLLECTION_TASK_DELETED", detailJson: { path: ["deletedTaskId"], equals: disposableTask.id } } })).toBe(1);
    await apiError(`/collection-tasks/${disposableTask.id}`, token, {
      method: "DELETE",
      body: { confirmTaskId: disposableTask.id }
    }, "TASK_NOT_FOUND");

    const accountRun = await api<{ id: string }>(`/collection-tasks/${firstTask.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
    });
    const baseSnapshot = {
      pageType: "LIVE_DATA_SCREEN",
      sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=main",
      pageTitle: "账号边界快照",
      rawDomText: "消耗 100 订单 2",
      rawNetworkJson: [],
      rawTableData: [],
      visibleMetricsJson: [metric("spend", "spend", 100), metric("orders", "orders", 2)],
      localCollectedAt: new Date().toISOString(),
      collectionRunId: accountRun.id,
      routeKey: "LIVE_DATA_SCREEN",
      captureMeta: {
        ...captureMeta("LIVE_DATA_SCREEN", ["spend", "orders"]),
        completeness: "PARTIAL",
        coverageRatio: 0.8,
        renderModes: ["DOM", "CANVAS"]
      }
    };
    const pageIdentityIgnored = await api<{
      id: string;
      accountMatchStatus: string;
      detectedAccountId?: string | null;
      detectedAccountName?: string | null;
      accountMatchEvidence?: unknown;
      normalizedMetrics: unknown[];
    }>(`/collection-tasks/${firstTask.id}/snapshots`, token, {
      method: "POST",
      body: {
        ...baseSnapshot,
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=advertiser-b-${suffix}`,
        detectedAccountId: `advertiser-b-${suffix}`,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null }
      }
    });
    expect(pageIdentityIgnored).toMatchObject({ accountMatchStatus: "MATCHED" });
    expect(pageIdentityIgnored.detectedAccountId).toBeNull();
    expect(pageIdentityIgnored.detectedAccountName).toBeNull();
    expect(pageIdentityIgnored.accountMatchEvidence).toBeNull();
    expect(pageIdentityIgnored.normalizedMetrics).toHaveLength(2);
    await api(`/collection-tasks/${firstTask.id}/routes/LIVE_PRODUCT_TAB`, token, { method: "PUT", body: {} });
    const untrustedManualRouteSnapshot = await api<{
      id: string;
      updatedAt: string;
      routeVerificationStatus: string;
      normalizedMetrics: unknown[];
    }>(`/collection-tasks/${firstTask.id}/snapshots`, token, {
      method: "POST",
      body: {
        ...baseSnapshot,
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=advertiser-a-${suffix}`,
        routeKey: "LIVE_PRODUCT_TAB",
        detectedAccountId: `advertiser-a-${suffix}`,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
        captureMeta: {
          ...captureMeta("LIVE_PRODUCT_TAB", ["spend", "orders"]),
          routeDetection: {
            routeKey: "LIVE_PRODUCT_TAB",
            source: "MANUAL",
            confidence: 1,
            manuallyConfirmed: true,
            evidence: ["人工选择：直播大屏商品页"]
          }
        }
      }
    });
    expect(untrustedManualRouteSnapshot.routeVerificationStatus).toBe("MANUAL_PENDING");
    expect(untrustedManualRouteSnapshot.normalizedMetrics).toHaveLength(0);
    const pendingRouteSummary = await api<{
      pendingRouteConfirmationCount: number;
      routes: Array<{ routeKey: string; state: string; routeVerificationStatus: string | null }>;
    }>(`/collection-tasks/${firstTask.id}/capture-summary`, token);
    expect(pendingRouteSummary.pendingRouteConfirmationCount).toBe(1);
    await apiError(`/snapshots/${untrustedManualRouteSnapshot.id}/confirm-route`, token, {
      method: "POST",
      body: { confirmed: true, routeKey: "LIVE_PRODUCT_TAB", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }
    }, "SNAPSHOT_NOT_CURRENT");
    const routeConfirmed = await api<{ routeVerificationStatus: string; normalizedMetrics: unknown[] }>(`/snapshots/${untrustedManualRouteSnapshot.id}/confirm-route`, token, {
      method: "POST",
      body: { confirmed: true, routeKey: "LIVE_PRODUCT_TAB", expectedUpdatedAt: untrustedManualRouteSnapshot.updatedAt }
    });
    expect(routeConfirmed.routeVerificationStatus).toBe("VERIFIED");
    expect(routeConfirmed.normalizedMetrics).toHaveLength(2);
    const verifiedByTaskScope = await api<{ id: string; accountMatchStatus: string; detectedAccountId?: string | null; normalizedMetrics: unknown[] }>(`/collection-tasks/${firstTask.id}/snapshots`, token, {
      method: "POST",
      body: {
        ...baseSnapshot,
        detectedAccountId: `advertiser-a-${suffix}`,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null }
      }
    });
    expect(verifiedByTaskScope.accountMatchStatus).toBe("MATCHED");
    expect(verifiedByTaskScope.detectedAccountId).toBeNull();
    expect(verifiedByTaskScope.normalizedMetrics).toHaveLength(2);

    await apiError(`/account-profiles/${accountA.id}`, token, { method: "DELETE", body: { accountName: "错误名称" } }, "ACCOUNT_DELETE_CONFIRMATION_MISMATCH");
    const deleted = await api<{ id: string; projectCount: number; taskCount: number }>(`/account-profiles/${accountA.id}`, token, {
      method: "DELETE",
      body: { accountName: accountA.accountName }
    });
    expect(deleted).toMatchObject({ id: accountA.id, projectCount: 2, taskCount: 1 });
    expect(await prisma.accountProfile.findUnique({ where: { id: accountA.id } })).toBeNull();
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.collectionTask.findUnique({ where: { id: firstTask.id } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "ACCOUNT_PROFILE_DELETED", detailJson: { path: ["accountProfileId"], equals: accountA.id } } })).toBe(1);
    await apiError(`/account-profiles/${accountA.id}`, token, { method: "DELETE", body: { accountName: accountA.accountName } }, "ACCOUNT_PROFILE_NOT_FOUND");
    expect(await prisma.auditLog.count({ where: { action: "ACCOUNT_PROFILE_DELETED", detailJson: { path: ["accountProfileId"], equals: accountA.id } } })).toBe(1);
  });

  it("pairs the extension once and enforces account-scoped read-only credentials", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `pairing-${suffix}@example.com`, password: "password123", name: "Extension Pairing" }
    });
    const token = registered.token;
    const accountA = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "插件账号 A", platformAccountId: `pair-a-${suffix}` }
    });
    const accountB = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "插件账号 B", platformAccountId: `pair-b-${suffix}` }
    });
    const projectA = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: { accountProfileId: accountA.id, name: "插件项目 A", subjectType: "SERVICE_PROVIDER", operatorType: "SERVICE_PROVIDER_LIVE", cooperationType: "SERVICE_PROVIDER_CONTRACT", subjectConfidence: 1, serviceProviderName: "服务商 A" }
    });
    const projectB = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: { accountProfileId: accountB.id, name: "插件项目 B", subjectType: "SERVICE_PROVIDER", operatorType: "SERVICE_PROVIDER_LIVE", cooperationType: "SERVICE_PROVIDER_CONTRACT", subjectConfidence: 1, serviceProviderName: "服务商 B" }
    });
    const taskA = await api<{ id: string; routeSources: Array<{ routeKey: string; sourceUrl: string | null }> }>("/collection-tasks", token, { method: "POST", body: { projectId: projectA.id, pageTitle: "插件任务 A" } });
    const taskB = await api<{ id: string }>("/collection-tasks", token, { method: "POST", body: { projectId: projectB.id, pageTitle: "插件任务 B" } });
    expect(taskA.routeSources.map((route) => route.routeKey).sort()).toEqual(defaultCollectionRouteTemplates.map((route) => route.routeKey).sort());
    expect(taskA.routeSources.every((route) => route.sourceUrl === null)).toBe(true);

    await apiError("/extension/pairing-codes/exchange", null, { method: "POST", body: { code: "000000" } }, "PAIRING_CODE_INVALID");
    const pairing = await api<{ code: string; expiresAt: string; task: { id: string } | null }>("/extension/pairing-codes", token, {
      method: "POST",
      body: { accountProfileId: accountA.id, collectionTaskId: taskA.id }
    });
    expect(pairing.code).toMatch(/^\d{6}$/);
    expect(pairing.task?.id).toBe(taskA.id);
    const exchanged = await api<{ token: string; account: { id: string }; scopes: string[]; suggestedTask: { id: string } | null }>("/extension/pairing-codes/exchange", null, {
      method: "POST",
      body: { code: pairing.code, label: "验收浏览器" }
    });
    expect(exchanged).toMatchObject({ account: { id: accountA.id }, scopes: ["COLLECT", "READ_DIAGNOSIS"] });
    expect(exchanged.suggestedTask?.id).toBe(taskA.id);
    expect(exchanged.token).toMatch(/^pxx_ext_/);
    const persistedCredential = await prisma.extensionCredential.findFirstOrThrow({ where: { accountProfileId: accountA.id } });
    expect(persistedCredential.tokenHash).not.toBe(exchanged.token);
    expect(JSON.stringify(persistedCredential)).not.toContain(exchanged.token);

    const context = await api<{
      account: { id: string };
      credential: { scopes: string[] };
      collectionProtocolVersion: number;
      liveScreenInternalApi: { enabled: boolean; contractVersion: string; adapterVersion: string };
    }>("/extension/context", exchanged.token, {
      headers: { "x-pxxis-collection-protocol": String(extensionCollectionProtocolVersion) }
    });
    await apiError("/extension/context", exchanged.token, {}, "EXTENSION_COLLECTION_PROTOCOL_MISMATCH");
    expect(context.account.id).toBe(accountA.id);
    expect(context.collectionProtocolVersion).toBe(extensionCollectionProtocolVersion);
    expect(context.liveScreenInternalApi).toEqual({
      enabled: liveScreenInternalApiEnabled(),
      contractVersion: liveScreenInternalApiContractVersion,
      adapterVersion: liveScreenInternalApiAdapterVersion
    });
    await api(`/collection-tasks/${taskA.id}`, exchanged.token);
    await apiError(`/collection-tasks/${taskB.id}`, exchanged.token, {}, "EXTENSION_ACCOUNT_MISMATCH");
    const emptySummary = await api<{ snapshotCount: number; routes: Array<{ routeKey: string }> }>(`/collection-tasks/${taskA.id}/capture-summary`, token);
    expect(emptySummary.snapshotCount).toBe(0);
    expect(emptySummary.routes.length).toBeGreaterThan(0);
    const snapshotCountBeforePulse = await prisma.dataSnapshot.count({ where: { taskId: taskA.id } });
    await expect(api<{ pulseCount: number }>(`/collection-tasks/${taskA.id}/metric-pulses`, exchanged.token, {
      method: "POST",
      body: {
        routeKey: "LIVE_DATA_SCREEN",
        pageType: "LIVE_DATA_SCREEN",
        localCapturedAt: new Date().toISOString(),
        tabState: "HIDDEN",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?room_id=${suffix}`,
        captureProtocolVersion: extensionCollectionProtocolVersion,
        metrics: [metric("spend", "DOM 消耗", 100)],
        captureMeta: captureMeta("LIVE_DATA_SCREEN", ["spend"])
      }
    })).resolves.toMatchObject({ pulseCount: 1 });
    expect(await prisma.dataSnapshot.count({ where: { taskId: taskA.id } })).toBe(snapshotCountBeforePulse);
    await apiError(`/collection-tasks/${taskA.id}/snapshots`, exchanged.token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?room_id=${suffix}`,
        pageTitle: "关闭开关的 API 证据",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [{
          key: "current_online_viewers",
          name: "当前在线人数",
          value: "12",
          unit: null,
          source: "network",
          metricSource: "XHR_JSON",
          rawEvidence: {
            sourceType: "INTERNAL_API",
            endpointKey: "key_index",
            evidencePurpose: "PULSE_ONLY",
            sourceStatus: "INTERNAL_API"
          }
        }],
        localCollectedAt: new Date().toISOString(),
        routeKey: "LIVE_DATA_SCREEN",
        captureProtocolVersion: extensionCollectionProtocolVersion,
        captureMeta: {
          ...captureMeta("LIVE_DATA_SCREEN", ["current_online_viewers"]),
          liveScreenInternalApi: {
            enabled: true,
            contractVersion: liveScreenInternalApiContractVersion,
            adapterVersion: liveScreenInternalApiAdapterVersion,
            roomIdSource: "URL",
            endpointStatuses: [{ endpoint: "key_index", status: "SUCCESS", acceptedBytes: 100 }]
          }
        }
      }
    }, "LIVE_SCREEN_INTERNAL_API_DISABLED");
    await api(`/collection-tasks/${taskA.id}/routes/LIVE_PRODUCT_TAB`, token, { method: "PUT", body: {} });
    const collectionRun = await api<{ id: string }>(`/collection-tasks/${taskA.id}/collection-runs`, exchanged.token, {
      method: "POST",
      body: { requiredRoutes: ["LIVE_PRODUCT_TAB"] }
    });
    const popupConfirmedRoute = await api<{ routeVerificationStatus: string; normalizedMetrics: unknown[] }>(`/collection-tasks/${taskA.id}/snapshots`, exchanged.token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=pair-a-${suffix}`,
        pageTitle: "插件手选商品路线",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [metric("spend", "消耗", 100), metric("orders", "成交订单数", 2)],
        localCollectedAt: new Date().toISOString(),
        collectionRunId: collectionRun.id,
        routeKey: "LIVE_PRODUCT_TAB",
        captureProtocolVersion: extensionCollectionProtocolVersion,
        detectedAccountId: `pair-a-${suffix}`,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
        captureMeta: {
          ...captureMeta("LIVE_PRODUCT_TAB", ["spend", "orders"]),
          routeDetection: {
            routeKey: "LIVE_PRODUCT_TAB",
            source: "MANUAL",
            confidence: 1,
            manuallyConfirmed: true,
            evidence: ["人工选择：直播大屏商品页"]
          }
        }
      }
    });
    expect(popupConfirmedRoute.routeVerificationStatus).toBe("VERIFIED");
    expect(popupConfirmedRoute.normalizedMetrics).toHaveLength(2);
    const persistedCapture = await prisma.dataSnapshot.findFirstOrThrow({
      where: { taskId: taskA.id, collectionRunId: collectionRun.id, routeKey: "LIVE_PRODUCT_TAB" },
      include: { normalizedMetrics: { include: { reviewedMetric: true } } }
    });
    expect(persistedCapture.normalizedMetrics).toHaveLength(2);
    expect(persistedCapture.normalizedMetrics.every((metricRow) => metricRow.reviewedMetric?.reviewStatus === "PENDING")).toBe(true);
    await expect(prisma.collectionRouteSource.findUniqueOrThrow({
      where: { taskId_routeKey: { taskId: taskA.id, routeKey: "LIVE_PRODUCT_TAB" } }
    })).resolves.toMatchObject({ status: "CAPTURED" });
    await expect(prisma.collectionRouteHeartbeat.findUniqueOrThrow({
      where: { collectionRunId_routeKey: { collectionRunId: collectionRun.id, routeKey: "LIVE_PRODUCT_TAB" } }
    })).resolves.toMatchObject({ consecutiveFailures: 0, lastErrorCode: null });
    await expect(prisma.collectionRun.findUniqueOrThrow({ where: { id: collectionRun.id } }))
      .resolves.toMatchObject({ status: "COMPLETED" });
    await apiError(`/collection-tasks/${taskA.id}/snapshots`, exchanged.token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?mode=main&room_id=${suffix}`,
        pageTitle: "旧插件协议",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [metric("spend", "消耗", 99)],
        localCollectedAt: new Date().toISOString(),
        routeKey: "LIVE_DATA_SCREEN",
        captureProtocolVersion: extensionCollectionProtocolVersion - 1,
        captureMeta: {
          ...captureMeta("LIVE_DATA_SCREEN", ["spend"]),
          routeDetection: {
            routeKey: "LIVE_DATA_SCREEN",
            source: "URL",
            confidence: 0.98,
            manuallyConfirmed: false,
            evidence: ["fixture URL"]
          }
        }
      }
    }, "EXTENSION_COLLECTION_PROTOCOL_MISMATCH");
    const missingRouteEvidence = await api<{ routeVerificationStatus: string; normalizedMetrics: unknown[] }>(`/collection-tasks/${taskA.id}/snapshots`, exchanged.token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=pair-a-${suffix}&mode=main`,
        pageTitle: "缺失路线证据",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [metric("spend", "消耗", 101)],
        localCollectedAt: new Date().toISOString(),
        routeKey: "UNKNOWN",
        captureProtocolVersion: extensionCollectionProtocolVersion,
        detectedAccountId: `pair-a-${suffix}`,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
        captureMeta: {
          ...captureMeta("LIVE_DATA_SCREEN", ["spend"]),
          routeDetection: {
            routeKey: "UNKNOWN",
            source: "UNKNOWN",
            confidence: 0,
            manuallyConfirmed: false,
            evidence: ["当前可见区域不足以确定分栏"]
          }
        }
      }
    });
    expect(missingRouteEvidence.routeVerificationStatus).toBe("MANUAL_PENDING");
    expect(missingRouteEvidence.normalizedMetrics).toHaveLength(0);
    await apiError(`/collection-tasks/${taskA.id}/snapshots`, exchanged.token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        sourceUrl: "https://attacker.example.com/dp/liveScreen",
        pageTitle: "伪造插件来源",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [],
        localCollectedAt: new Date().toISOString(),
        routeKey: "LIVE_PRODUCT_TAB",
        captureProtocolVersion: extensionCollectionProtocolVersion,
        captureMeta: {
          ...captureMeta("LIVE_PRODUCT_TAB", []),
          routeDetection: {
            routeKey: "LIVE_PRODUCT_TAB",
            source: "MANUAL",
            confidence: 1,
            manuallyConfirmed: true,
            evidence: ["伪造人工选择"]
          }
        }
      }
    }, "EXTENSION_SOURCE_URL_FORBIDDEN");

    for (const route of collectionRouteTemplates.filter((item) => !defaultCollectionRouteTemplates.some((defaultRoute) => defaultRoute.routeKey === item.routeKey) && item.routeKey !== "LIVE_PRODUCT_TAB")) {
      await api(`/collection-tasks/${taskA.id}/routes/${route.routeKey}`, token, { method: "PUT", body: {} });
    }
    const fiveRouteRun = await api<{ id: string }>(`/collection-tasks/${taskA.id}/collection-runs`, exchanged.token, {
      method: "POST",
      body: { requiredRoutes: collectionRouteTemplates.map((route) => route.routeKey) }
    });
    const fiveRouteCaptures = [
      { routeKey: "LIVE_DATA_SCREEN", pageType: "LIVE_DATA_SCREEN", sourceUrl: `https://eos.douyin.com/dp/liveScreen?mode=main&room_id=${suffix}` },
      { routeKey: "LIVE_PRODUCT_TAB", pageType: "LIVE_DATA_SCREEN", sourceUrl: `https://eos.douyin.com/dp/liveScreen?mode=product&room_id=${suffix}` },
      { routeKey: "LIVE_TRAFFIC_TAB", pageType: "LIVE_DATA_SCREEN", sourceUrl: `https://eos.douyin.com/dp/liveScreen?mode=flow&room_id=${suffix}` },
      { routeKey: "LOCAL_PROMOTION_DASHBOARD", pageType: "LOCAL_PROMOTION_DASHBOARD", sourceUrl: `https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?room_id=${suffix}` },
      { routeKey: "TASK_TABLE", pageType: "TASK_TABLE", sourceUrl: `https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2?room_id=${suffix}` }
    ] as const;
    for (const [index, route] of fiveRouteCaptures.entries()) {
      const captured = await api<{
        routeVerificationStatus: string;
        detectedAccountId?: string | null;
        accountMatchEvidence?: unknown;
        normalizedMetrics: unknown[];
      }>(`/collection-tasks/${taskA.id}/snapshots`, exchanged.token, {
        method: "POST",
        headers: { "idempotency-key": `five-route-${suffix}-${route.routeKey}` },
        body: {
          pageType: route.pageType,
          sourceUrl: route.sourceUrl,
          pageTitle: `五路线采集 ${route.routeKey}`,
          rawDomText: "",
          rawNetworkJson: [],
          rawTableData: [],
          visibleMetricsJson: [metric("spend", `路线消耗 ${index + 1}`, index + 1)],
          localCollectedAt: new Date(Date.now() + index).toISOString(),
          collectionRunId: fiveRouteRun.id,
          routeKey: route.routeKey,
          captureProtocolVersion: extensionCollectionProtocolVersion,
          captureMeta: {
            ...captureMeta(route.routeKey, ["spend"]),
            routeDetection: {
              routeKey: route.routeKey,
              source: "MANUAL",
              confidence: 1,
              manuallyConfirmed: true,
              evidence: [`人工选择：${route.routeKey}`]
            }
          }
        }
      });
      expect(captured.routeVerificationStatus).toBe("VERIFIED");
      expect(captured.detectedAccountId).toBeNull();
      expect(captured.accountMatchEvidence).toBeNull();
      expect(captured.normalizedMetrics).toHaveLength(1);
    }
    await expect(prisma.collectionRun.findUniqueOrThrow({ where: { id: fiveRouteRun.id } }))
      .resolves.toMatchObject({ status: "COMPLETED" });
    expect(await prisma.collectionRouteHeartbeat.count({ where: { collectionRunId: fiveRouteRun.id, lastSuccessAt: { not: null } } })).toBe(5);
    expect(await prisma.collectionRouteSource.count({ where: { taskId: taskA.id, status: "CAPTURED" } })).toBe(5);
    expect(await prisma.reviewedMetric.count({
      where: {
        normalizedMetric: { snapshot: { collectionRunId: fiveRouteRun.id } },
        reviewStatus: "PENDING"
      }
    })).toBe(5);
    const fiveRouteSummary = await api<{
      collectionRun: { id: string; status: string } | null;
      overviewRouteKey: string | null;
      pendingRouteConfirmationCount: number;
      routes: Array<{ routeKey: string; snapshotId: string | null }>;
      overviewMetrics: Array<{
        metricKey: string;
        metricValue: string;
        displayValue: string | null;
        originalValue: string | null;
        reviewStatus: string;
      }>;
    }>(`/collection-tasks/${taskA.id}/capture-summary`, token);
    expect(fiveRouteSummary.collectionRun).toMatchObject({ id: fiveRouteRun.id, status: "COMPLETED" });
    expect(fiveRouteSummary.overviewRouteKey).toBe("LOCAL_PROMOTION_DASHBOARD");
    expect(fiveRouteSummary.pendingRouteConfirmationCount).toBe(0);
    expect(fiveRouteSummary.routes).toHaveLength(5);
    expect(fiveRouteSummary.routes.every((route) => route.snapshotId)).toBe(true);
    expect(fiveRouteSummary.overviewMetrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metricKey: "spend",
        metricValue: "4",
        displayValue: "4",
        originalValue: "4",
        reviewStatus: "PENDING"
      })
    ]));

    await api("/extension/heartbeat", exchanged.token, {
      method: "POST",
      body: {
        collectionTaskId: taskA.id,
        extensionVersion: "0.2.4",
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: "integration-build",
        currentUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
        pageType: "LIVE_DATA_SCREEN",
        routeKey: "LIVE_DATA_SCREEN",
        collectable: true,
        tabState: "VISIBLE",
        observedAt: new Date().toISOString()
      }
    });
    const liveStatus = await api<{ state: string; boundTaskId: string; currentUrl: string }>(`/collection-tasks/${taskA.id}/extension-status`, token);
    expect(liveStatus).toMatchObject({ state: "READY", boundTaskId: taskA.id, currentUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2" });
    await apiError("/extension/heartbeat", exchanged.token, {
      method: "POST",
      body: {
        collectionTaskId: taskB.id,
        extensionVersion: "0.2.4",
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: "integration-build",
        currentUrl: "https://localads.chengzijianzhan.cn/",
        pageType: "LOCAL_PROMOTION_DASHBOARD",
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        collectable: true,
        tabState: "VISIBLE",
        observedAt: new Date().toISOString()
      }
    }, "EXTENSION_ACCOUNT_MISMATCH");
    await apiError("/projects", exchanged.token, { method: "POST", body: { name: "插件越权项目" } }, "EXTENSION_SCOPE_FORBIDDEN");
    await apiError("/extension/pairing-codes/exchange", null, { method: "POST", body: { code: pairing.code } }, "PAIRING_CODE_INVALID");

    const credentials = await api<Array<{ id: string; tokenHash?: string }>>("/extension/credentials", token);
    expect(credentials.some((item) => item.id === persistedCredential.id)).toBe(true);
    expect(credentials.every((item) => item.tokenHash === undefined)).toBe(true);
    await api(`/extension/credentials/${persistedCredential.id}`, token, { method: "DELETE", body: {} });
    await apiError("/extension/context", exchanged.token, {}, "EXTENSION_CREDENTIAL_INVALID");

    const expiringPair = await api<{ code: string }>("/extension/pairing-codes", token, { method: "POST", body: { accountProfileId: accountB.id } });
    await prisma.extensionPairingCode.update({ where: { codeHash: hashForTest(expiringPair.code) }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await apiError("/extension/pairing-codes/exchange", null, { method: "POST", body: { code: expiringPair.code } }, "PAIRING_CODE_INVALID");
  });

  it("reuses stored live overview realtime evidence for ai diagnosis without snapshot confirmation", async () => {
    const previous = process.env.LIVE_SCREEN_INTERNAL_API_ENABLED;
    process.env.LIVE_SCREEN_INTERNAL_API_ENABLED = "true";
    try {
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const registered = await api<{ token: string }>("/auth/register", null, {
        method: "POST",
        body: { email: `realtime-worker-${suffix}@example.com`, password: "password123", name: "Realtime Worker" }
      });
      const token = registered.token;
      const account = await api<{ id: string }>("/account-profiles", token, {
        method: "POST",
        body: { accountName: "实时 AI 账号", platformAccountId: `realtime-account-${suffix}` }
      });
      const project = await api<{ id: string }>("/projects", token, {
        method: "POST",
        body: {
          accountProfileId: account.id,
          name: "实时 AI 项目",
          businessType: "DOUYIN_LOCAL_LIFE",
          subjectType: "SERVICE_PROVIDER",
          operatorType: "SERVICE_PROVIDER_LIVE",
          cooperationType: "SERVICE_PROVIDER_CONTRACT",
          controlLevel: "MEDIUM",
          subjectConfidence: 1,
          serviceProviderName: "实时服务商",
          serviceMode: "代播",
          serviceFee: 200
        }
      });
      const task = await api<{ id: string }>("/collection-tasks", token, {
        method: "POST",
        body: { projectId: project.id, pageTitle: "实时直播概览" }
      });
      await api<{ id: string }>(`/collection-tasks/${task.id}/collection-runs`, token, {
        method: "POST",
        body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
      });
      const pairing = await api<{ code: string }>("/extension/pairing-codes", token, {
        method: "POST",
        body: { accountProfileId: account.id, collectionTaskId: task.id }
      });
      const exchanged = await api<{ token: string }>("/extension/pairing-codes/exchange", null, {
        method: "POST",
        body: { code: pairing.code, label: "实时验证插件" }
      });
      const context = await api<{ account: { id: string } }>("/extension/context", exchanged.token, {
        headers: { "x-pxxis-collection-protocol": String(extensionCollectionProtocolVersion) }
      });
      expect(context.account.id).toBe(account.id);

      const field = liveScreenInternalApiContracts.key_index.fields[0];
      if (!field) throw new Error("Expected a realtime internal API field");
      const roomId = String(Date.now()).slice(0, 13);
      const realtimePulse = await api<{ pulseCount: number }>(`/collection-tasks/${task.id}/metric-pulses`, exchanged.token, {
        method: "POST",
        body: {
          routeKey: "LIVE_DATA_SCREEN",
          pageType: "LIVE_DATA_SCREEN",
          localCapturedAt: new Date().toISOString(),
          tabState: "VISIBLE",
          sourceUrl: `https://eos.douyin.com/dp/liveScreen?room_id=${roomId}`,
          captureProtocolVersion: extensionCollectionProtocolVersion,
          metrics: [internalApiPulseMetric(field, 235371, "235,371")],
          captureMeta: {
            ...captureMeta("LIVE_DATA_SCREEN", [field.metricKey]),
            liveScreenInternalApi: {
              enabled: true,
              contractVersion: liveScreenInternalApiContractVersion,
              adapterVersion: liveScreenInternalApiAdapterVersion,
              roomId,
              roomIdSource: "URL",
              roomIdEvidence: { urlRoomIds: [roomId], domRoomIds: [] },
              endpointStatuses: [{
                endpoint: "key_index",
                status: "SUCCESS",
                acceptedBytes: 100
              }]
            }
          }
        }
      });
      expect(realtimePulse.pulseCount).toBe(1);
      expect(await prisma.dataSnapshot.count({ where: { taskId: task.id } })).toBe(0);

      const queued = await api<{ id: string; inputJson: { metricLayer: string; realtimeEvidence?: { routeKey: string; pageType: string } | null } }>(`/collection-tasks/${task.id}/decision-runs`, token, {
        method: "POST",
        body: {}
      });
      expect(queued.inputJson.metricLayer).toBe("REALTIME_API");
      expect(queued.inputJson.realtimeEvidence).toMatchObject({
        routeKey: "LIVE_DATA_SCREEN",
        pageType: "LIVE_DATA_SCREEN"
      });

      const storedRun = await prisma.decisionRun.findUniqueOrThrow({ where: { id: queued.id } });
      await prisma.decisionRun.update({
        where: { id: queued.id },
        data: {
          inputJson: {
            ...(storedRun.inputJson as Record<string, unknown>),
            latestAnalysis: {
              summary: "实时输入保持正式诊断兼容",
              riskLevel: "LOW",
              problems: [],
              suggestions: [],
              manualCheckItems: [],
              confidence: 0.9
            }
          }
        }
      });
      await prisma.dataSnapshot.deleteMany({ where: { taskId: task.id } });

      await processNextDecisionRun({
        workerId: `realtime-worker-${suffix}`,
        transport: createSyntheticDiagnosisTransport(syntheticDiagnosisCases[0]!)
      });

      const completed = await api<{
        status: string;
        errorCode: string | null;
        errorMessage: string | null;
        inputJson: { metricLayer: string; realtimeEvidence?: { routeKey: string; pageType: string } | null };
      }>(`/decision-runs/${queued.id}`, token);
      expect(completed).toMatchObject({ status: "SUCCEEDED", errorCode: null, errorMessage: null });
      expect(completed.inputJson.metricLayer).toBe("REALTIME_API");
      expect(completed.inputJson.realtimeEvidence).toMatchObject({
        routeKey: "LIVE_DATA_SCREEN",
        pageType: "LIVE_DATA_SCREEN"
      });
    } finally {
      process.env.LIVE_SCREEN_INTERNAL_API_ENABLED = previous;
    }
  });

  it("imports manual metrics idempotently and queues unknown columns", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `manual-${suffix}@example.com`, password: "password123", name: "Manual Metrics" }
    });
    const token = registered.token;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "手工录入账号", platformAccountId: `manual-${suffix}` }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: { accountProfileId: account.id, name: "手工录入项目", subjectType: "SERVICE_PROVIDER", operatorType: "SERVICE_PROVIDER_LIVE", cooperationType: "SERVICE_PROVIDER_CONTRACT", subjectConfidence: 1, serviceProviderName: "手工服务商" }
    });
    const task = await api<{ id: string }>("/collection-tasks", token, { method: "POST", body: { projectId: project.id, pageTitle: "手工录入任务" } });
    const body = {
      accountConfirmed: true,
      pageType: "LOCAL_PROMOTION_DASHBOARD",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      sourceLabel: "人工 CSV 验收",
      metrics: [
        { name: "毛利 ROI", value: 1.4 },
        { name: "消耗", value: 800, unit: "元" },
        { name: "订单数", value: 12 },
        { name: "灰度成交效率", value: 77 }
      ]
    };
    await apiError(`/collection-tasks/${task.id}/manual-metrics`, token, { method: "POST", body: { ...body, accountConfirmed: false } }, "VALIDATION_ERROR");
    await apiError(`/collection-tasks/${task.id}/manual-metrics`, token, {
      method: "POST",
      body: { ...body, metrics: [{ name: "access_token", value: "must-not-persist" }] }
    }, "SENSITIVE_METRIC_FORBIDDEN");
    const idempotencyKey = `manual:${suffix}`;
    const imported = await api<{ id: string; accountMatchStatus: string; normalizedMetrics: Array<{ metricKey: string }>; reviewedMetrics: Array<{ metricKey: string; reviewStatus: string }> }>(
      `/collection-tasks/${task.id}/manual-metrics`,
      token,
      { method: "POST", headers: { "idempotency-key": idempotencyKey }, body }
    );
    expect(imported.accountMatchStatus).toBe("MATCHED");
    expect(imported.normalizedMetrics.some((item) => item.metricKey === "gross_profit_roi")).toBe(true);
    expect(imported.reviewedMetrics.some((item) => item.metricKey === "gross_profit_roi" && item.reviewStatus === "CONFIRMED")).toBe(true);
    expect(imported.reviewedMetrics.some((item) => item.metricKey === "unknown" && item.reviewStatus === "PENDING")).toBe(true);
    const replayed = await api<{ id: string }>(`/collection-tasks/${task.id}/manual-metrics`, token, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body
    });
    expect(replayed.id).toBe(imported.id);
    expect(await prisma.dataSnapshot.count({ where: { taskId: task.id } })).toBe(1);
    const driftEvents = await api<Array<{ aliasNormalized: string }>>(`/projects/${project.id}/metric-drift-events?status=OPEN`, token);
    expect(driftEvents.some((event) => event.aliasNormalized.includes("灰度成交效率"))).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "MANUAL_METRICS_IMPORTED", taskId: task.id } })).toBe(1);
    const preview = await api<{ mode: string; readiness: { ready: boolean; blockingReasons: string[] } }>(`/collection-tasks/${task.id}/decision-preview`, token, { method: "POST", body: {} });
    expect(preview.mode).toBe("CONSERVATIVE_ONLY");
    expect(preview.readiness.blockingReasons.join(" ")).toContain("基础采集路线未完成");
    await apiError(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} }, "DECISION_NOT_READY");
  });
});

type ReviewMetricResponse = {
  id: string;
  metricKey: string;
  originalValue: string | null;
  reviewedValue: string | null;
  metricSource: string;
  confidence: number;
  rawEvidence?: unknown;
  reviewStatus: "PENDING" | "CONFIRMED" | "MODIFIED" | "IGNORED";
};

type DecisionRunResponse = {
  id: string;
  mode: "LEGACY_RULE" | "AI_SKILL_ORCHESTRATED";
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  confidence: number;
  inputJson: {
    metricLayer: "REVIEWED_METRIC";
    dataReviewStatus: "REVIEWED" | "UNREVIEWED";
    reviewCoverage: { confirmedCount: number; modifiedCount: number; ignoredCount: number; pendingCount: number; totalCount: number };
    metrics: Array<{ key: string; value: number | string | null }>;
  };
  finalResultJson: {
    dataQuality: { globalSafetyBlock: boolean; missingFields: string[] };
    actionProposals: Array<{ actionType: string }>;
    businessAnalysis: {
      mode?: string;
      findings: Array<{ dimension: string }>;
      recommendations: Array<{ title: string; dimension: string }>;
      metricExplanations: Array<{ title: string }>;
    };
  };
  manualCheckItemsJson: unknown;
  finalResult: {
    schemaVersion: "ai-diagnosis-result-v1";
    evidenceCatalog: Array<{ id: string }>;
  };
  actionProposals: Array<{ id: string; actionType: string; status: string; requiresApproval: boolean }>;
};

type ActionOutcomeResponse = {
  id: string;
  actionProposalId: string;
  observationWindow: "30m" | "2h" | "1d" | "custom";
  result: "IMPROVED" | "WORSENED" | "NO_CHANGE" | "UNCLEAR";
};

type ProjectOutcomeSummaryResponse = {
  total: number;
  byResult: Record<"IMPROVED" | "WORSENED" | "NO_CHANGE" | "UNCLEAR", number>;
  byActionType: Array<{ actionType: string; total: number }>;
};

async function completeDecisionRun(id: string, token: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const testCase = syntheticDiagnosisCases[attempt % syntheticDiagnosisCases.length]!;
    await processNextDecisionRun({
      workerId: `test-worker-${attempt}`,
      transport: createSyntheticDiagnosisTransport(testCase)
    });
    const run = await api<DecisionRunResponse>(`/decision-runs/${id}`, token);
    if (run.status === "SUCCEEDED") return run;
    if (run.status === "FAILED") throw new Error(`${id} failed during fake worker execution`);
  }
  throw new Error(`${id} did not reach a terminal status`);
}

function metric(key: string, name: string, value: number | string | null, unit?: string) {
  return { key, name, value, unit: unit || null, source: "manual" };
}

function captureMeta(adapterId: string, fields: string[]) {
  return {
    adapterId,
    adapterVersion: "1.0.0",
    pageFingerprint: `fixture-${adapterId}`,
    completeness: "COMPLETE",
    coverageRatio: 1,
    expectedFields: fields,
    extractedFields: fields,
    visibleRegions: ["fixture"],
    renderModes: ["DOM"],
    tabState: "VISIBLE",
    originalBytes: 100,
    acceptedBytes: 100,
    truncatedFields: [],
    truncationReasons: []
  };
}

function internalApiPulseMetric(
  field: (typeof liveScreenInternalApiContracts.key_index.fields)[number],
  value: number,
  displayValue: string
): VisibleMetric {
  return {
    key: field.metricKey,
    name: field.metricName,
    value,
    unit: field.unit,
    source: "network",
    metricSource: "XHR_JSON",
    confidence: 1,
    rawEvidence: {
      sourceType: "INTERNAL_API",
      bindingKind: "CARD",
      fieldLabel: field.fieldLabel,
      displayValue,
      normalizedValue: String(value),
      displayPrecision: field.displayPrecision,
      unitSource: field.unit ? "DEFAULT" : "NONE",
      timeRange: field.timeRange,
      timeRangeSource: "COMPONENT",
      timeRangeLocation: "internal-api-contract",
      componentPath: field.fieldPath,
      calibrationSignature: `${field.metricKey}|${field.timeRange}|${field.semanticScope}|${field.fieldPath}`,
      validationStatus: "TRUSTED",
      validationReasons: [],
      sourceStatus: "INTERNAL_API",
      apiCandidate: {
        value: String(value),
        displayValue,
        unit: field.unit,
        timeRange: field.timeRange,
        displayPrecision: field.displayPrecision,
        fieldPath: field.fieldPath,
        fieldLabel: field.fieldLabel
      },
      selectionReason: "仅 API 字段有效",
      semanticScope: field.semanticScope,
      apiContractVersion: liveScreenInternalApiContractVersion,
      apiAdapterVersion: liveScreenInternalApiAdapterVersion,
      endpointKey: "key_index",
      evidencePurpose: field.purpose
    }
  };
}

function hashForTest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function apiWithDecisionTiming<T>(
  path: string,
  token: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> }
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: requestHeaders(token, options.headers),
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!envelope.success) throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
  const timing = response.headers.get("server-timing") || "";
  const transactionMs = Number(timing.match(/decision-write;dur=([\d.]+)/)?.[1] || Number.POSITIVE_INFINITY);
  return { data: envelope.data, transactionMs };
}

async function api<T>(
  path: string,
  token: string | null,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: requestHeaders(token, options.headers),
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!envelope.success) {
    expect(envelope).toMatchObject({
      success: false,
      data: null,
      error: { code: expect.any(String), message: expect.any(String) }
    });
    throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
  }
  expect(envelope).toMatchObject({ success: true, error: null });
  expect(envelope.data).toBeDefined();
  if (path === "/auth/register" && envelope.success) {
    const email = (options.body as { email?: unknown } | undefined)?.email;
    const delivery = typeof email === "string" ? takeLatestVerificationForTest(email) : null;
    if (!delivery) throw new Error("Expected a test email verification delivery");
    const confirmation = await fetch(`${baseUrl}/auth/email-verifications/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: delivery.token })
    });
    const confirmedEnvelope = (await confirmation.json()) as ApiEnvelope<T>;
    if (!confirmedEnvelope.success) throw new Error(`${confirmedEnvelope.error.code}: ${confirmedEnvelope.error.message}`);
    const cookie = confirmation.headers.get("set-cookie")?.split(";")[0] || "";
    const csrfToken = (confirmedEnvelope.data as { csrfToken?: string }).csrfToken || "";
    if (cookie && csrfToken) return { ...(confirmedEnvelope.data as object), token: encodeTestSession(cookie, csrfToken) } as T;
  }
  if (path === "/auth/login") {
    const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
    const csrfToken = (envelope.success ? (envelope.data as { csrfToken?: string }).csrfToken : null) || "";
    if (cookie && csrfToken && envelope.success) {
      return { ...(envelope.data as object), token: encodeTestSession(cookie, csrfToken) } as T;
    }
  }
  return envelope.data;
}

async function apiError(path: string, token: string | null, options: { method?: string; body?: unknown }, expectedCode: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: requestHeaders(token),
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const envelope = (await response.json()) as ApiEnvelope<unknown>;
  expect(envelope).toMatchObject({
    success: false,
    data: null,
    error: { code: expectedCode, message: expect.any(String) }
  });
}

async function currentReviewSnapshotVersions(taskId: string, token: string) {
  const dashboard = await api<{
    summary: {
      routes: Array<{ snapshotId: string | null; snapshotUpdatedAt: string | null }>;
    };
  }>(`/collection-tasks/${taskId}/collection-dashboard`, token);
  return dashboard.summary.routes.flatMap((route) => route.snapshotId && route.snapshotUpdatedAt
    ? [{ snapshotId: route.snapshotId, expectedSnapshotUpdatedAt: route.snapshotUpdatedAt }]
    : []);
}

function requestHeaders(token: string | null, extra: Record<string, string> = {}) {
  if (token?.startsWith("test-session:")) {
    const { cookie, csrfToken } = decodeTestSession(token);
    return {
      "content-type": "application/json",
      cookie,
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "x-csrf-token": csrfToken,
      ...extra
    };
  }
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}

function encodeTestSession(cookie: string, csrfToken: string) {
  return `test-session:${Buffer.from(JSON.stringify({ cookie, csrfToken })).toString("base64url")}`;
}

function decodeTestSession(value: string) {
  return JSON.parse(Buffer.from(value.slice("test-session:".length), "base64url").toString("utf8")) as { cookie: string; csrfToken: string };
}
