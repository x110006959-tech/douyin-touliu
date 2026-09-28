import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import {
  collectionRouteTemplates,
  defaultCollectionRouteTemplates,
  extensionBridgeProtocolVersion,
  extensionCollectionProtocolVersion,
  localPromotionInternalApiAdapterVersion,
  localPromotionInternalApiContractVersion,
  localPromotionInternalApiEndpointContracts,
  liveScreenInternalApiContracts,
  liveScreenInternalApiAdapterVersion,
  liveScreenInternalApiContractVersion
} from "@douyin-local-life/shared";
import { createServer } from "./server.js";
import { prisma } from "./prisma.js";
import { resetRateLimitBuckets } from "./rate-limit.js";
import { processNextDecisionRun } from "./ai-diagnosis/worker.js";
import { buildDiagnosisContext } from "./project-history.js";
import { createSyntheticDiagnosisTransport } from "./ai-diagnosis/synthetic-evaluation.js";
import { syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import { liveScreenInternalApiEnabled } from "./live-screen-internal-api-config.js";
import { localPromotionInternalApiEnabled } from "./local-promotion-internal-api-config.js";
import { LlmTransportError } from "@douyin-local-life/llm";
import type { DiagnosisFinalModelOutput } from "@douyin-local-life/shared/diagnosis";
import {
  type ActionOutcomeResponse,
  type DecisionRunResponse,
  type ProjectOutcomeSummaryResponse,
  type ReviewMetricResponse,
  captureMeta,
  createDecisionFlowApiClient,
  hashForTest,
  internalApiPulseMetric,
  localPromotionPulseMetric,
  metric,
  restoreDecisionTestEnvironment
} from "./decision-flow-test-support.js";

const app = createServer();
let server: Server;
let baseUrl = "";
const { api, apiError, apiWithDecisionTiming, completeDecisionRun, currentReviewSnapshotVersions } = createDecisionFlowApiClient(() => baseUrl);

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
      productVersion: "0.2.6",
      gitSha: expect.any(String)
    });
    expect((await api<{ gitSha: string }>("/version", null)).gitSha).not.toBe("unknown");
  });

  it("keeps the full decision, approval, manual execution, and audit trail loop", async () => {
    const email = `v01-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    const password = "password123";

    const registered = await api<{ token: string; user: { id: string; workspaceId: string; creditBalance: number } }>("/auth/register", null, {
      method: "POST",
      body: { email, password, name: "V0.1 Smoke" }
    });
    expect(registered.user.workspaceId).toBeTruthy();
    expect(registered.user.creditBalance).toBe(5);

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

    await apiError(`/collection-tasks/${task.id}/decision-targets`, token, {
      method: "PUT",
      body: { targetRoi: 0 }
    }, "VALIDATION_ERROR");
    const savedDecisionTargets = await api<{ targetRoi: number | null; updatedAt: string | null }>(
      `/collection-tasks/${task.id}/decision-targets`,
      token,
      { method: "PUT", body: { targetRoi: 1.4 } }
    );
    expect(savedDecisionTargets).toMatchObject({ targetRoi: 1.4 });
    expect(savedDecisionTargets.updatedAt).toBeTruthy();
    const collectionDashboard = await api<{ decisionTargets: { targetRoi: number | null } }>(
      `/collection-tasks/${task.id}/collection-dashboard`,
      token
    );
    expect(collectionDashboard.decisionTargets.targetRoi).toBe(1.4);
    expect(await prisma.reviewedMetric.count({
      where: { taskId: task.id, snapshotId: null, metricKey: "target_roi", metricSource: "MANUAL_INPUT" }
    })).toBe(1);

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

    await apiError(`/collection-tasks/${task.id}/metric-pulses`, token, {
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
    }, "METRIC_PULSE_EXTENSION_REQUIRED");

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

    const previousAiDiagnosisEnabled = process.env.AI_DIAGNOSIS_ENABLED;
    const previousDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
    try {
      process.env.AI_DIAGNOSIS_ENABLED = "true";
      delete process.env.DEEPSEEK_API_KEY;
      await apiError(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} }, "DEEPSEEK_API_KEY_MISSING");
      expect(await prisma.decisionRun.count({ where: { collectionTaskId: task.id } })).toBe(decisionCountBeforePreview);

      const pendingWithoutConfiguration = await prisma.decisionRun.create({
        data: {
          projectId: project.id,
          collectionTaskId: task.id,
          mode: "AI_SKILL_ORCHESTRATED",
          status: "PENDING",
          evidenceFingerprint: "configuration-preflight",
          strategyVersion: "managed-live-growth-skills-v4",
          currentStage: "QUEUED"
        }
      });
      await expect(processNextDecisionRun({ workerId: "test-worker-configuration-preflight" })).resolves.toBeNull();
      await expect(prisma.decisionRun.findUniqueOrThrow({ where: { id: pendingWithoutConfiguration.id } })).resolves.toMatchObject({
        status: "PENDING",
        currentStage: "QUEUED"
      });
      expect(await prisma.actionProposal.count({ where: { decisionRunId: pendingWithoutConfiguration.id } })).toBe(0);
      await prisma.decisionRun.delete({ where: { id: pendingWithoutConfiguration.id } });
    } finally {
      restoreDecisionTestEnvironment("AI_DIAGNOSIS_ENABLED", previousAiDiagnosisEnabled);
      restoreDecisionTestEnvironment("DEEPSEEK_API_KEY", previousDeepSeekApiKey);
    }

    await prisma.user.update({ where: { id: registered.user.id }, data: { creditBalance: 0 } });
    await apiError(`/collection-tasks/${task.id}/decision-runs`, token, {
      method: "POST",
      body: {},
      headers: { "idempotency-key": `insufficient-${Date.now()}` }
    }, "INSUFFICIENT_CREDITS");
    expect(await prisma.decisionRun.count({ where: { collectionTaskId: task.id } })).toBe(decisionCountBeforePreview);
    await prisma.user.update({ where: { id: registered.user.id }, data: { creditBalance: 5 } });
    await resetRateLimitBuckets();

    const decisionKey = `decision-${Date.now()}`;
    const decisionKeys = Array.from({ length: 6 }, () => decisionKey);
    const concurrentResults = await Promise.all(decisionKeys.map(async (decisionKey) => {
      const startedAt = performance.now();
      const timed = await apiWithDecisionTiming<{
        id: string;
        strategyVersion: string;
        skillSetVersion: string;
        actionProposals: Array<{ id: string; status: string; requiresApproval: boolean }>;
      }>(
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
    expect((await api<{ creditBalance: number }>("/credits", token)).creditBalance).toBe(4);
    const queuedRun = concurrentRuns[0];
    if (!queuedRun) throw new Error("Expected an idempotent decision run");
    expect(queuedRun.id).toBeTruthy();
    expect(queuedRun).toMatchObject({
      strategyVersion: "managed-live-growth-skills-v11",
      skillSetVersion: "managed-live-growth-skills-v11"
    });
    expect(queuedRun.actionProposals).toHaveLength(0);
    const decisionRun = await completeDecisionRun(queuedRun.id, token);
    expect(decisionRun.status).toBe("SUCCEEDED");
    expect((await api<{ creditBalance: number }>("/credits", token)).creditBalance).toBe(4);
    expect(decisionRun.actionProposals.length).toBeGreaterThanOrEqual(1);
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
    const unchangedEvidenceRun = await api<{ id: string; reuseReason?: string }>(`/collection-tasks/${task.id}/decision-runs`, token, {
      method: "POST",
      headers: { "idempotency-key": `${decisionKey}-unchanged-evidence` },
      body: {}
    });
    expect(unchangedEvidenceRun).toMatchObject({ id: decisionRun.id, reuseReason: "UNCHANGED_EVIDENCE" });

    const reuseKey = `${decisionKey}-unchanged-evidence`;
    const archivesBeforeRetry = await prisma.projectAnalysisArchive.count({ where: { collectionTaskId: task.id } });
    const runsBeforeRetry = await prisma.decisionRun.count({ where: { collectionTaskId: task.id } });
    const reusedRetries = await Promise.all(Array.from({ length: 3 }, () => api<{ id: string }>(`/collection-tasks/${task.id}/decision-runs`, token, {
      method: "POST", headers: { "idempotency-key": reuseKey }, body: {}
    })));
    expect(reusedRetries.every((run) => run.id === decisionRun.id)).toBe(true);
    expect(await prisma.projectAnalysisArchive.count({ where: { collectionTaskId: task.id } })).toBe(archivesBeforeRetry);
    expect(await prisma.decisionRun.count({ where: { collectionTaskId: task.id } })).toBe(runsBeforeRetry);
    expect((await api<{ creditBalance: number }>("/credits", token)).creditBalance).toBe(4);

    const concurrentReuseKey = `${decisionKey}-concurrent-reuse`;
    const firstReuses = await Promise.all(Array.from({ length: 3 }, () => api<{ id: string }>(`/collection-tasks/${task.id}/decision-runs`, token, {
      method: "POST", headers: { "idempotency-key": concurrentReuseKey }, body: {}
    })));
    expect(firstReuses.every((run) => run.id === decisionRun.id)).toBe(true);
    expect(await prisma.projectAnalysisArchive.count({ where: { collectionTaskId: task.id, archiveKey: `analysis:${task.id}:${concurrentReuseKey}` } })).toBe(1);
    expect(await prisma.decisionRun.count({ where: { collectionTaskId: task.id } })).toBe(runsBeforeRetry);

    const latest = await api<{ id: string; actionProposals: Array<{ id: string }> }>(`/collection-tasks/${task.id}/decision-runs/latest`, token);
    expect(concurrentRuns.some((run) => run.id === latest.id)).toBe(true);

    // The model now emits one plan. Create a separate lifecycle fixture so
    // pagination and independent approval/observation transitions stay covered.
    await prisma.actionProposal.create({ data: {
      decisionRunId: decisionRun.id, projectId: project.id, collectionTaskId: task.id,
      actionType: "CHECK_CREATIVE", title: "Independent lifecycle fixture", reason: "Verify the observation transition independently.",
      riskLevel: "LOW", confidence: 0.8, requiresApproval: true, status: "PENDING_APPROVAL",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), dedupeKey: `${project.id}:${task.id}:CHECK_CREATIVE:lifecycle`
    } });
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

    const failedRunFixture = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: registered.user.id }, data: { creditBalance: { decrement: 1 } } });
      return tx.decisionRun.create({
        data: {
          projectId: project.id,
          collectionTaskId: task.id,
          mode: "AI_SKILL_ORCHESTRATED",
          status: "PENDING",
          evidenceFingerprint: decisionRun.evidenceFingerprint,
          strategyVersion: "managed-live-growth-skills-v10",
          currentStage: "QUEUED",
          inputJson: decisionRun.inputJson,
          creditCharged: true
        }
      });
    });
    expect((await api<{ creditBalance: number }>("/credits", token)).creditBalance).toBe(3);
    const completedArchive = await prisma.projectAnalysisArchive.findFirstOrThrow({ where: { decisionRunId: decisionRun.id } });
    await prisma.projectAnalysisArchive.create({
      data: {
        archiveKey: `failed-history-${failedRunFixture.id}`,
        projectId: project.id,
        collectionTaskId: task.id,
        sessionId: completedArchive.sessionId,
        decisionRunId: failedRunFixture.id,
        status: "QUEUED",
        metricsJson: completedArchive.metricsJson,
        historyContextJson: completedArchive.historyContextJson
      }
    });
    await processNextDecisionRun({
      workerId: "test-worker-provider-failure",
      transport: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        async chat(request) {
          if (request.messages.some((message) => message.role === "system" && message.content?.includes("诊断综合器"))) {
            throw new Error("synthetic provider failure");
          }
          return createSyntheticDiagnosisTransport(syntheticDiagnosisCases[0]!).chat(request);
        }
      }
    });
    const failedRun = await api<{ status: string; errorCode: string | null; currentStage: string | null; finalResult: unknown; trustedFacts: { target: { status: string }; cause: { status: string } } | null; actionProposals: unknown[] }>(
      `/decision-runs/${failedRunFixture.id}`,
      token
    );
    expect(failedRun).toMatchObject({ status: "FAILED", errorCode: "AI_DIAGNOSIS_FAILED", currentStage: expect.stringContaining("FAILED:"), finalResult: null, trustedFacts: { cause: { status: "UNCONFIRMED" } } });
    expect(failedRun.trustedFacts?.target.status).toBeTruthy();
    expect(failedRun.actionProposals).toHaveLength(0);
    expect(failedRun.currentStage).toBe("FAILED:SYNTHESIZING_ACTION_PLAN");
    await expect(prisma.decisionRun.findUniqueOrThrow({ where: { id: failedRunFixture.id } })).resolves.toMatchObject({ creditCharged: true, creditRefunded: true });
    expect((await api<{ creditBalance: number }>("/credits", token)).creditBalance).toBe(4);
    await processNextDecisionRun({ workerId: "test-worker-provider-failure-retry", transport: createSyntheticDiagnosisTransport(syntheticDiagnosisCases[0]!) });
    expect((await api<{ creditBalance: number }>("/credits", token)).creditBalance).toBe(4);
    expect(await prisma.diagnosisSkillExecution.count({ where: { decisionRunId: failedRunFixture.id, status: "SUCCEEDED" } })).toBeGreaterThan(1);
    await expect(prisma.projectAnalysisArchive.findFirst({ where: { decisionRunId: failedRunFixture.id }, select: { status: true } })).resolves.toMatchObject({ status: "FAILED" });

    for (const diagnosticCase of ["invalid", "repaired", "lease-lost"] as const) {
      const diagnosticRun = await prisma.decisionRun.create({
        data: {
          projectId: project.id, collectionTaskId: task.id, mode: "AI_SKILL_ORCHESTRATED", status: "PENDING",
          evidenceFingerprint: decisionRun.evidenceFingerprint, inputJson: decisionRun.inputJson,
          strategyVersion: "validation-diagnostic-test", currentStage: "QUEUED"
        }
      });
      const diagnosticArchive = await prisma.projectAnalysisArchive.create({
        data: {
          archiveKey: `diagnostic-${diagnosticRun.id}`, projectId: project.id, collectionTaskId: task.id,
          sessionId: completedArchive.sessionId, decisionRunId: diagnosticRun.id, status: "QUEUED",
          metricsJson: completedArchive.metricsJson, historyContextJson: completedArchive.historyContextJson
        }
      });
      const base = createSyntheticDiagnosisTransport(syntheticDiagnosisCases[0]!);
      let synthesisCalls = 0;
      let validFinalResponse: Awaited<ReturnType<typeof base.chat>> | undefined;
      await processNextDecisionRun({
        workerId: `test-diagnostic-${diagnosticCase}`,
        transport: {
          ...base,
          async chat(request) {
            if (!request.messages.some((message) => message.role === "system" && message.content?.includes("诊断综合器"))) return base.chat(request);
            // Repair's last user message contains validation feedback, not the
            // original evidence catalog. Reuse its valid evidence-bound output.
            validFinalResponse ??= await base.chat(request);
            const response = validFinalResponse;
            synthesisCalls++;
            if (synthesisCalls > 1 && diagnosticCase === "repaired") return response;
            if (synthesisCalls > 1 && diagnosticCase === "lease-lost") {
              await prisma.decisionRun.update({ where: { id: diagnosticRun.id }, data: { leaseOwner: "replacement-worker" } });
            }
            const output = JSON.parse(response.message.content!) as DiagnosisFinalModelOutput;
            output.experiments[0]!.steps = [synthesisCalls === 1 ? "提高预算后观察成交" : "降低预算；api_key=private-diagnostic-value"];
            output.coreConclusion = "unrelated-output-not-for-diagnostic";
            return { ...response, message: { ...response.message, content: JSON.stringify(output) } };
          }
        }
      });
      expect(synthesisCalls).toBe(2);
      const diagnosticLogs = await prisma.auditLog.findMany({
        where: { action: "AI_DIAGNOSIS_VALIDATION_FAILED", detailJson: { path: ["decisionRunId"], equals: diagnosticRun.id } }
      });
      if (diagnosticCase === "invalid") {
        expect(diagnosticLogs).toHaveLength(1);
        expect(diagnosticLogs[0]).toMatchObject({
          projectId: project.id, taskId: task.id,
          detailJson: {
            stage: "SYNTHESIZING_ACTION_PLAN", finalErrorCode: "DIAGNOSIS_OUTPUT_INVALID",
            validationDiagnostics: [
              { path: "experiments.0.steps.0", stepText: "提高预算后观察成交", detectedVariables: ["预算"], textRedacted: false },
              { path: "experiments.0.steps.0", stepText: "[REDACTED_SENSITIVE_STEP]", detectedVariables: ["预算"], textRedacted: true }
            ]
          }
        });
        expect(JSON.stringify(diagnosticLogs)).not.toMatch(/private-diagnostic-value|unrelated-output-not-for-diagnostic/);
        await expect(prisma.decisionRun.findUniqueOrThrow({ where: { id: diagnosticRun.id } })).resolves.toMatchObject({ status: "FAILED", aiResultJson: null, finalResultJson: null });
        await expect(prisma.projectAnalysisArchive.findUniqueOrThrow({ where: { id: diagnosticArchive.id } })).resolves.toMatchObject({ status: "FAILED" });
        expect(await prisma.actionProposal.count({ where: { decisionRunId: diagnosticRun.id } })).toBe(0);
      } else {
        expect(diagnosticLogs).toHaveLength(0);
        await expect(prisma.decisionRun.findUniqueOrThrow({ where: { id: diagnosticRun.id } })).resolves.toMatchObject({ status: diagnosticCase === "repaired" ? "SUCCEEDED" : "RUNNING" });
        if (diagnosticCase === "lease-lost") {
          await expect(prisma.projectAnalysisArchive.findUniqueOrThrow({ where: { id: diagnosticArchive.id } })).resolves.toMatchObject({ status: "QUEUED" });
          // This isolated test owns the deliberately orphaned fixture.
          await prisma.decisionRun.delete({ where: { id: diagnosticRun.id } });
        }
      }
    }

    const terminalModelFailures = [
      { code: "DEEPSEEK_TIMEOUT", message: "DeepSeek 请求超时" },
      { code: "DEEPSEEK_RATE_LIMITED", message: "DeepSeek 请求频率受限" },
      { code: "DIAGNOSIS_OUTPUT_INVALID", message: "模型结构化诊断在一次修复后仍不合法" }
    ] as const;
    for (const failure of terminalModelFailures) {
      const fixture = await prisma.decisionRun.create({
        data: {
          projectId: project.id,
          collectionTaskId: task.id,
          mode: "AI_SKILL_ORCHESTRATED",
          status: "PENDING",
          evidenceFingerprint: decisionRun.evidenceFingerprint,
          strategyVersion: "managed-live-growth-skills-v4",
          currentStage: "QUEUED"
        }
      });
      await processNextDecisionRun({
        workerId: `test-worker-${failure.code.toLowerCase()}`,
        transport: {
          provider: "deepseek",
          model: "deepseek-v4-flash",
          async chat() {
            if (failure.code !== "DIAGNOSIS_OUTPUT_INVALID") {
              throw new LlmTransportError(failure.code, failure.message, failure.code === "DEEPSEEK_RATE_LIMITED");
            }
            return {
              message: { role: "assistant" as const, content: "{}" },
              finishReason: "stop",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
            };
          }
        }
      });
      await expect(prisma.decisionRun.findUniqueOrThrow({ where: { id: fixture.id } })).resolves.toMatchObject({
        status: "FAILED",
        errorCode: failure.code,
        finalResultJson: null
      });
      expect(await prisma.actionProposal.count({ where: { decisionRunId: fixture.id } })).toBe(0);
    }

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

    const executionMemory = await buildDiagnosisContext(prisma, { projectId: project.id, collectionTaskId: task.id, scenario: "UNSPECIFIED" });
    expect(executionMemory.manualActions).toEqual([expect.objectContaining({ actionProposalId: approveTarget.id, outcome: expect.objectContaining({ result: "IMPROVED" }) })]);
    const isolatedMemory = await buildDiagnosisContext(prisma, { projectId: project.id, collectionTaskId: "other-task", scenario: "UNSPECIFIED" });
    expect(isolatedMemory.manualActions).toEqual([]);
    const newContextRun = await api<DecisionRunResponse>(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} });
    expect(newContextRun.id).not.toBe(decisionRun.id);
    await completeDecisionRun(newContextRun.id, token);
    const sceneRun = await api<DecisionRunResponse>(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: { scenario: "POST_LIVE_REVIEW" } });
    expect(sceneRun.id).not.toBe(newContextRun.id);
    await completeDecisionRun(sceneRun.id, token);
    const frozenScene = await prisma.decisionRun.findUniqueOrThrow({ where: { id: sceneRun.id }, select: { inputJson: true } });
    expect(frozenScene.inputJson).toMatchObject({ diagnosisContext: { scenario: "POST_LIVE_REVIEW", manualActions: executionMemory.manualActions } });

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
    // This flow now also completes two new diagnoses to verify frozen execution
    // memory and scenario reuse. Keep all assertions; allow their DB round trips.
  }, 15_000);

});
