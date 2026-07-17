import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";
import { createServer } from "./server.js";
import { takeLatestVerificationForTest } from "./email-verification.js";
import { prisma } from "./prisma.js";
import { resetRateLimitBuckets } from "./rate-limit.js";

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
      productVersion: "0.2.2",
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

    const project = await api<{ id: string; subjectType: string; operatorType: string; cooperationType: string; controlLevel: string }>("/projects", token, {
      method: "POST",
      body: {
        workspaceId: workspace.id,
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

    const collectionRun = await api<{ id: string; status: string; quality: { completeness: number } }>(`/collection-tasks/${task.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
    });
    expect(collectionRun.status).toBe("ACTIVE");

    const snapshotBody = {
      pageType: "LIVE_DATA_SCREEN",
      sourceUrl: "https://life.douyin.com/live-dashboard?access_token=must-not-persist",
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
      detectedAccountName: "V0.1 service provider project",
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
        detectedAccountName: "V0.1 service provider project",
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
    await api(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, { method: "POST", body: {} });

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
    const decisionRun = concurrentRuns[0];
    if (!decisionRun) throw new Error("Expected an idempotent decision run");
    expect(decisionRun.id).toBeTruthy();
    expect(decisionRun.actionProposals.length).toBeGreaterThanOrEqual(2);
    expect(decisionRun.actionProposals.every((proposal) => proposal.requiresApproval)).toBe(true);
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
    const explanationOnly = await api<{ responsePayload: { finalActionsSource: string; suggestions: Array<Record<string, unknown>> } }>(`/collection-tasks/${task.id}/explain`, token, {
      method: "POST",
      body: {}
    });
    expect(explanationOnly.responsePayload.finalActionsSource).toBe("decision-engine");
    expect(explanationOnly.responsePayload.suggestions.length).toBeGreaterThan(0);
    expect(explanationOnly.responsePayload.suggestions.every((suggestion) => !("actionType" in suggestion) && !("requiresApproval" in suggestion))).toBe(true);
    expect(await prisma.actionProposal.count({ where: { collectionTaskId: task.id } })).toBe(proposalsBeforeExplanation);
    expect(await prisma.aiAnalysisTask.count({ where: { collectionTaskId: task.id } })).toBe(explanationsBefore + 1);

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
    expect((await prisma.actionProposal.findUniqueOrThrow({ where: { id: observeTarget.id } })).status).toBe("EXPIRED");

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
        body: { routeKey: "LIVE_DATA_SCREEN", error: `collector timeout ${attempt + 1}` }
      });
    }
    const degradedRun = await api<{ status: string; routeHealth: Array<{ consecutiveFailures: number }> }>(
      `/collection-tasks/${task.id}/collection-runs/latest`,
      token
    );
    expect(degradedRun.status).toBe("DEGRADED");
    expect(degradedRun.routeHealth[0]?.consecutiveFailures).toBe(3);

    const auditLogs = await api<Array<{ action: string }>>(`/projects/${project.id}/audit-logs`, token);
    expect(auditLogs.some((log) => log.action === "CREATE_DECISION_RUN")).toBe(true);
    expect(auditLogs.some((log) => log.action === "CREATE_ACTION_PROPOSALS")).toBe(true);
    expect(auditLogs.some((log) => log.action === "APPROVE_ACTION_PROPOSAL")).toBe(true);
    expect(auditLogs.some((log) => log.action === "OBSERVE_ACTION_PROPOSAL")).toBe(true);
    expect(auditLogs.some((log) => log.action === "REJECT_ACTION_PROPOSAL")).toBe(true);
    expect(auditLogs.some((log) => log.action === "MARK_ACTION_MANUAL_EXECUTED")).toBe(true);
    expect(auditLogs.some((log) => log.action === "CREATE_ACTION_OUTCOME")).toBe(true);
    expect(auditLogs.some((log) => log.action === "collection_route.failed")).toBe(true);
    expect(auditLogs.some((log) => log.action === "action_proposal.expired")).toBe(true);
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
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        workspaceId: workspace.id,
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
          sourceUrl: "https://life.douyin.com/review-dashboard",
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
          detectedAccountName: "V0.1.1 reviewed metric project"
        }
      }
    );

    const initialReviewMetrics = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics`, token);
    expect(initialReviewMetrics.length).toBeGreaterThanOrEqual(6);
    expect(initialReviewMetrics.every((item) => item.reviewStatus === "PENDING")).toBe(true);
    expect(initialReviewMetrics.every((item) => item.metricSource !== undefined && typeof item.confidence === "number")).toBe(true);

    const conservativePreview = await api<{
      mode: string;
      createsRecords: boolean;
      readiness: { ready: boolean; blockingReasons: string[] };
      input: DecisionRunResponse["inputJson"];
      finalOutput: { manualCheckItems: string[] };
    }>(`/collection-tasks/${task.id}/decision-preview`, token, { method: "POST", body: {} });
    expect(conservativePreview).toMatchObject({ mode: "CONSERVATIVE_ONLY", createsRecords: false, readiness: { ready: false } });
    expect(conservativePreview.input.metricLayer).toBe("NORMALIZED_METRIC");
    expect(conservativePreview.input.dataReviewStatus).toBe("UNREVIEWED");
    expect(JSON.stringify(conservativePreview.finalOutput.manualCheckItems)).toContain("人工复核");
    await apiError(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} }, "DECISION_NOT_READY");

    const byKey = new Map(initialReviewMetrics.map((item) => [item.metricKey, item]));
    const roi = byKey.get("verify_roi");
    const spend = byKey.get("spend");
    const orders = byKey.get("orders");
    const clicks = byKey.get("clicks");
    if (!roi || !spend || !orders || !clicks) throw new Error("Expected review metric keys to exist");

    const confirmed = await api<ReviewMetricResponse>(`/review-metrics/${roi.id}`, token, {
      method: "PATCH",
      body: { reviewStatus: "CONFIRMED" }
    });
    expect(confirmed.reviewStatus).toBe("CONFIRMED");
    expect(confirmed.reviewedValue).toBe(confirmed.originalValue);

    const modified = await api<ReviewMetricResponse>(`/review-metrics/${clicks.id}`, token, {
      method: "PATCH",
      body: { reviewStatus: "MODIFIED", reviewedValue: "900" }
    });
    expect(modified.reviewStatus).toBe("MODIFIED");
    expect(modified.reviewedValue).toBe("900");
    expect(modified.metricSource).toBe("MANUAL_INPUT");

    const ignored = await api<ReviewMetricResponse>(`/review-metrics/${orders.id}`, token, {
      method: "PATCH",
      body: { reviewStatus: "IGNORED" }
    });
    expect(ignored.reviewStatus).toBe("IGNORED");

    const bulkUpdated = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics/bulk`, token, {
      method: "POST",
      body: { items: [{ metricId: spend.id, reviewStatus: "MODIFIED", reviewedValue: "1200" }] }
    });
    expect(bulkUpdated.some((item) => item.metricKey === "spend" && item.reviewStatus === "MODIFIED" && item.reviewedValue === "1200")).toBe(true);
    expect(bulkUpdated.some((item) => item.metricKey === "spend" && item.metricSource === "MANUAL_INPUT")).toBe(true);

    const confirmedAll = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, {
      method: "POST",
      body: {}
    });
    expect(confirmedAll.some((item) => item.reviewStatus === "PENDING")).toBe(false);
    expect(confirmedAll.find((item) => item.metricKey === "orders")?.reviewStatus).toBe("IGNORED");

    const reviewedRun = await api<DecisionRunResponse>(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} });
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
      "DECISION_RUN_USE_REVIEWED_METRICS"
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
        sourceUrl: "https://eos.douyin.com/dp/liveScreen?tab=trend&mode=main",
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
        captureMeta: {
          ...captureMeta("LIVE_DATA_SCREEN", ["pay_roi", "spend", "orders", "impressions", "ctr"]),
          completeness: "PARTIAL",
          coverageRatio: 0.83,
          renderModes: ["DOM", "CANVAS"]
        }
      }
    });
    await api(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, { method: "POST", body: {} });

    const summary = await api<{
      requiredRoutesCaptured: boolean;
      requiredRoutesAccountMatched: boolean;
      requiredRoutesComplete: boolean;
      routes: Array<{ routeKey: string; required: boolean; state: string }>;
    }>(`/collection-tasks/${task.id}/capture-summary`, token);
    expect(summary).toMatchObject({ requiredRoutesCaptured: true, requiredRoutesAccountMatched: true, requiredRoutesComplete: true });
    expect(summary.routes.find((route) => route.routeKey === "LIVE_DATA_SCREEN")).toMatchObject({ required: true, state: "PARTIAL" });

    const decision = await api<DecisionRunResponse>(`/collection-tasks/${task.id}/decision-runs`, token, {
      method: "POST",
      body: {}
    });
    expect(decision.finalResultJson.dataQuality.globalSafetyBlock).toBe(false);
    expect(decision.finalResultJson.dataQuality.missingFields).not.toContain("服务商后毛利 ROI");
    expect(decision.finalResultJson.businessAnalysis.mode).toBe("MANAGED_LIVE_GROWTH");
    expect(decision.finalResultJson.businessAnalysis.recommendations.length).toBeLessThan(3);
    expect(decision.finalResultJson.businessAnalysis.recommendations.some((recommendation) => recommendation.title.includes("自然流量与商业流量对照"))).toBe(false);
    expect(decision.finalResultJson.businessAnalysis.findings.some((finding) => finding.dimension === "PROFITABILITY")).toBe(false);
    expect(decision.finalResultJson.businessAnalysis.recommendations.some((recommendation) => recommendation.title === "用一轮讲解闭环验证直播间承接")).toBe(false);
    expect(decision.finalResultJson.businessAnalysis.recommendations.some((recommendation) => recommendation.title.startsWith("商品验证顺序："))).toBe(false);
    expect(decision.finalResultJson.businessAnalysis.metricExplanations.some((metric) => metric.title === "服务商后毛利 ROI")).toBe(false);
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
      visibleMetricsJson: [metric("impressions", "曝光量", 1000), metric("ctr", "点击率", 0.02, "%")],
      localCollectedAt: new Date(now - 60_000).toISOString(),
      captureMeta: { ...captureMeta("LOCAL_PROMOTION_DASHBOARD", ["impressions", "ctr"]), completeness: "PARTIAL", coverageRatio: 0.75 }
    });

    const initialSummary = await api<{
      pendingAccountConfirmationCount: number;
      routes: Array<{ routeKey: string; snapshotId: string | null }>;
    }>(`/collection-tasks/${task.id}/capture-summary`, token);
    expect(initialSummary.pendingAccountConfirmationCount).toBe(2);
    expect(initialSummary.routes.find((route) => route.routeKey === "LIVE_DATA_SCREEN")?.snapshotId).toBe(firstLive.id);
    expect(initialSummary.routes.find((route) => route.routeKey === "LOCAL_PROMOTION_DASHBOARD")?.snapshotId).toBe(localPromotion.id);

    const firstLiveVersion = (await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: firstLive.id } })).updatedAt.toISOString();
    await api(`/snapshots/${firstLive.id}/confirm-account`, token, { method: "POST", body: { confirmed: true, expectedUpdatedAt: firstLiveVersion } });
    expect((await api<{ pendingAccountConfirmationCount: number }>(`/collection-tasks/${task.id}/capture-summary`, token)).pendingAccountConfirmationCount).toBe(1);

    const newestLive = await upload({
      pageType: "LIVE_DATA_SCREEN",
      routeKey: "LIVE_DATA_SCREEN",
      sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=main",
      rawDomText: "消耗 300 成交订单数 6",
      visibleMetricsJson: [metric("spend", "消耗", 300), metric("orders", "成交订单数", 6)],
      detectedAccountId: platformAccountId,
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
    const confirmedFirstLive = await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: firstLive.id } });
    await apiError(`/snapshots/${firstLive.id}/confirm-account`, token, {
      method: "POST",
      body: { confirmed: true, expectedUpdatedAt: confirmedFirstLive.updatedAt.toISOString() }
    }, "SNAPSHOT_NOT_CURRENT");
    const localPromotionVersion = (await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: localPromotion.id } })).updatedAt.toISOString();
    await api(`/snapshots/${localPromotion.id}/confirm-account`, token, { method: "POST", body: { confirmed: true, expectedUpdatedAt: localPromotionVersion } });

    const finalSummary = await api<{
      requiredRoutesAccountMatched: boolean;
      requiredRoutesComplete: boolean;
      pendingAccountConfirmationCount: number;
      routes: Array<{ routeKey: string; snapshotId: string | null; state: string }>;
      metrics: Array<{ metricKey: string; metricValue: string; routeKey: string | null }>;
    }>(`/collection-tasks/${task.id}/capture-summary`, token);
    expect(finalSummary.requiredRoutesAccountMatched).toBe(true);
    expect(finalSummary.requiredRoutesComplete).toBe(false);
    expect(finalSummary.pendingAccountConfirmationCount).toBe(0);
    expect(finalSummary.routes.find((route) => route.routeKey === "LIVE_DATA_SCREEN")).toMatchObject({ snapshotId: newestLive.id, state: "STALE" });
    expect(finalSummary.routes.find((route) => route.routeKey === "LOCAL_PROMOTION_DASHBOARD")?.snapshotId).toBe(localPromotion.id);
    expect(finalSummary.metrics.find((item) => item.metricKey === "spend" && item.routeKey === "LIVE_DATA_SCREEN")?.metricValue).toBe("300");

    await api(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, { method: "POST", body: {} });
    const decision = await api<DecisionRunResponse>(`/collection-tasks/${task.id}/decision-runs`, token, {
      method: "POST",
      body: {}
    });
    expect(decision.finalResultJson.actionProposals.some((proposal) => proposal.actionType === "REQUEST_MANUAL_REVIEW")).toBe(true);
    expect(decision.finalResultJson.actionProposals.some((proposal) => ["PAUSE_TASK", "INCREASE_BUDGET", "DECREASE_BUDGET"].includes(proposal.actionType))).toBe(false);
  });

  it("reuses account profiles without allowing cross-account evidence", async () => {
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
    await apiError("/account-profiles", token, { method: "POST", body: { accountName: "账号 A 重命名", platformAccountId: `advertiser-a-${suffix}` } }, "ACCOUNT_PROFILE_DUPLICATE");

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
    expect(firstTask.routeSources.length).toBeGreaterThanOrEqual(5);
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
    await apiError(`/collection-tasks/${firstTask.id}/snapshots`, token, { method: "POST", body: { ...baseSnapshot, detectedAccountId: `advertiser-b-${suffix}` } }, "ACCOUNT_MISMATCH");
    const manualRouteSnapshot = await api<{
      id: string;
      updatedAt: string;
      routeVerificationStatus: string;
      normalizedMetrics: unknown[];
    }>(`/collection-tasks/${firstTask.id}/snapshots`, token, {
      method: "POST",
      body: {
        ...baseSnapshot,
        sourceUrl: "https://eos.douyin.com/dp/liveScreen",
        routeKey: "LIVE_PRODUCT_TAB",
        detectedAccountId: `advertiser-a-${suffix}`,
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
    expect(manualRouteSnapshot.routeVerificationStatus).toBe("MANUAL_PENDING");
    expect(manualRouteSnapshot.normalizedMetrics).toHaveLength(0);
    const pendingRouteSummary = await api<{
      pendingRouteConfirmationCount: number;
      routes: Array<{ routeKey: string; state: string; routeVerificationStatus: string | null }>;
    }>(`/collection-tasks/${firstTask.id}/capture-summary`, token);
    expect(pendingRouteSummary.pendingRouteConfirmationCount).toBe(1);
    await apiError(`/snapshots/${manualRouteSnapshot.id}/confirm-route`, token, {
      method: "POST",
      body: { confirmed: true, routeKey: "LIVE_PRODUCT_TAB", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }
    }, "SNAPSHOT_NOT_CURRENT");
    const routeConfirmed = await api<{ routeVerificationStatus: string; normalizedMetrics: unknown[] }>(`/snapshots/${manualRouteSnapshot.id}/confirm-route`, token, {
      method: "POST",
      body: { confirmed: true, routeKey: "LIVE_PRODUCT_TAB", expectedUpdatedAt: manualRouteSnapshot.updatedAt }
    });
    expect(routeConfirmed.routeVerificationStatus).toBe("VERIFIED");
    expect(routeConfirmed.normalizedMetrics).toHaveLength(2);
    const unverified = await api<{ id: string; accountMatchStatus: string; normalizedMetrics: unknown[] }>(`/collection-tasks/${firstTask.id}/snapshots`, token, { method: "POST", body: baseSnapshot });
    expect(unverified.accountMatchStatus).toBe("UNVERIFIED");
    expect(unverified.normalizedMetrics).toHaveLength(0);
    const unverifiedSummary = await api<{
      requiredRoutesCaptured: boolean;
      requiredRoutesAccountMatched: boolean;
      pendingAccountConfirmationCount: number;
      routes: Array<{ routeKey: string; snapshotId: string | null; state: string; accountMatchStatus: string | null }>;
    }>(`/collection-tasks/${firstTask.id}/capture-summary`, token);
    expect(unverifiedSummary.routes.find((route) => route.routeKey === "LIVE_DATA_SCREEN")).toMatchObject({
      snapshotId: unverified.id,
      state: "UNVERIFIED",
      accountMatchStatus: "UNVERIFIED"
    });
    expect(unverifiedSummary.pendingAccountConfirmationCount).toBe(1);
    expect(unverifiedSummary.requiredRoutesAccountMatched).toBe(false);
    await apiError(`/collection-tasks/${firstTask.id}/snapshots/confirm-accounts`, otherUser.token, {
      method: "POST",
      body: { confirmed: true, snapshots: [{ snapshotId: unverified.id, expectedUpdatedAt: unverified.updatedAt }] }
    }, "TASK_NOT_FOUND");
    const crossTask = await api<{ id: string }>("/collection-tasks", token, {
      method: "POST",
      body: { projectId: cloned.id, pageTitle: "跨任务快照" }
    });
    const crossTaskSnapshot = await prisma.dataSnapshot.create({
      data: {
        taskId: crossTask.id,
        pageType: "LIVE_DATA_SCREEN",
        routeKey: "LIVE_DATA_SCREEN",
        rawDomText: "跨任务数据",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [],
        localCollectedAt: new Date(),
        accountMatchStatus: "UNVERIFIED"
      }
    });
    await apiError(`/collection-tasks/${firstTask.id}/snapshots/confirm-accounts`, token, {
      method: "POST",
      body: { confirmed: true, snapshots: [{ snapshotId: crossTaskSnapshot.id, expectedUpdatedAt: crossTaskSnapshot.updatedAt }] }
    }, "SNAPSHOT_TASK_MISMATCH");
    const nonCurrentSnapshot = await prisma.dataSnapshot.create({
      data: {
        taskId: firstTask.id,
        collectionRunId: accountRun.id,
        pageType: "TASK_TABLE",
        routeKey: "TASK_TABLE",
        rawDomText: "已被更新路线快照",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [],
        localCollectedAt: new Date(Date.now() - 60_000),
        accountMatchStatus: "MATCHED"
      }
    });
    const mismatchedSnapshot = await prisma.dataSnapshot.create({
      data: {
        taskId: firstTask.id,
        collectionRunId: accountRun.id,
        pageType: "TASK_TABLE",
        routeKey: "TASK_TABLE",
        rawDomText: "错误账号数据",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [],
        localCollectedAt: new Date(),
        accountMatchStatus: "MISMATCHED"
      }
    });
    await apiError(`/collection-tasks/${firstTask.id}/snapshots/confirm-accounts`, token, {
      method: "POST",
      body: { confirmed: true, snapshots: [{ snapshotId: mismatchedSnapshot.id, expectedUpdatedAt: mismatchedSnapshot.updatedAt }] }
    }, "ACCOUNT_MISMATCH");
    await apiError(`/collection-tasks/${firstTask.id}/snapshots/confirm-accounts`, token, {
      method: "POST",
      body: { confirmed: true, snapshots: [{ snapshotId: nonCurrentSnapshot.id, expectedUpdatedAt: nonCurrentSnapshot.updatedAt }] }
    }, "SNAPSHOT_NOT_CURRENT");
    await prisma.dataSnapshot.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        taskId: firstTask.id,
        collectionRunId: accountRun.id,
        pageType: "TASK_TABLE",
        routeKey: "TASK_TABLE",
        rawDomText: `高频路线快照 ${index}`,
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [],
        localCollectedAt: new Date(Date.now() + index + 1),
        accountMatchStatus: "MATCHED" as const
      }))
    });
    const confirmed = await api<{
      confirmedCount: number;
      skippedCount: number;
      reviewMetricCount: number;
      routeResults: Array<{ snapshotId: string; routeKey: string; result: string }>;
    }>(`/collection-tasks/${firstTask.id}/snapshots/confirm-accounts`, token, {
      method: "POST",
      body: { confirmed: true, snapshots: [{ snapshotId: unverified.id, expectedUpdatedAt: unverified.updatedAt }], note: "批量确认测试" }
    });
    expect(confirmed).toMatchObject({ confirmedCount: 1, skippedCount: 0 });
    expect(confirmed.reviewMetricCount).toBeGreaterThan(0);
    expect(confirmed.routeResults).toContainEqual({ snapshotId: unverified.id, routeKey: "LIVE_DATA_SCREEN", result: "CONFIRMED" });
    const confirmedSnapshot = await prisma.dataSnapshot.findUniqueOrThrow({ where: { id: unverified.id }, select: { updatedAt: true } });
    const replayedConfirmation = await api<{ confirmedCount: number; skippedCount: number; reviewMetricCount: number }>(`/collection-tasks/${firstTask.id}/snapshots/confirm-accounts`, token, {
      method: "POST",
      body: { confirmed: true, snapshots: [{ snapshotId: unverified.id, expectedUpdatedAt: confirmedSnapshot.updatedAt.toISOString() }] }
    });
    expect(replayedConfirmation).toMatchObject({ confirmedCount: 0, skippedCount: 1, reviewMetricCount: 0 });
    const confirmedSummary = await api<{
      requiredRoutesComplete: boolean;
      pendingAccountConfirmationCount: number;
      routes: Array<{ routeKey: string; state: string; accountMatchStatus: string | null }>;
    }>(`/collection-tasks/${firstTask.id}/capture-summary`, token);
    expect(confirmedSummary.routes.find((route) => route.routeKey === "LIVE_DATA_SCREEN")).toMatchObject({
      state: "PARTIAL",
      accountMatchStatus: "MATCHED"
    });
    expect(confirmedSummary.pendingAccountConfirmationCount).toBe(0);
    expect(await prisma.collectionRouteHeartbeat.count({ where: { collectionRunId: accountRun.id, routeKey: "LIVE_DATA_SCREEN", consecutiveFailures: 0 } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "SNAPSHOT_ACCOUNTS_BULK_CONFIRMED", taskId: firstTask.id } })).toBe(2);

    await apiError(`/account-profiles/${accountA.id}`, token, { method: "DELETE", body: { accountName: "错误名称" } }, "ACCOUNT_DELETE_CONFIRMATION_MISMATCH");
    const deleted = await api<{ id: string; projectCount: number; taskCount: number }>(`/account-profiles/${accountA.id}`, token, {
      method: "DELETE",
      body: { accountName: accountA.accountName }
    });
    expect(deleted).toMatchObject({ id: accountA.id, projectCount: 2, taskCount: 2 });
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
    const taskA = await api<{ id: string }>("/collection-tasks", token, { method: "POST", body: { projectId: projectA.id, pageTitle: "插件任务 A" } });
    const taskB = await api<{ id: string }>("/collection-tasks", token, { method: "POST", body: { projectId: projectB.id, pageTitle: "插件任务 B" } });

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

    const context = await api<{ account: { id: string }; credential: { scopes: string[] } }>("/extension/context", exchanged.token);
    expect(context.account.id).toBe(accountA.id);
    await api(`/collection-tasks/${taskA.id}`, exchanged.token);
    await apiError(`/collection-tasks/${taskB.id}`, exchanged.token, {}, "EXTENSION_ACCOUNT_MISMATCH");
    const emptySummary = await api<{ snapshotCount: number; routes: Array<{ routeKey: string }> }>(`/collection-tasks/${taskA.id}/capture-summary`, token);
    expect(emptySummary.snapshotCount).toBe(0);
    expect(emptySummary.routes.length).toBeGreaterThan(0);
    await api("/extension/heartbeat", exchanged.token, {
      method: "POST",
      body: {
        collectionTaskId: taskA.id,
        extensionVersion: "0.2.2",
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: "integration-build",
        currentUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
        pageType: "LIVE_DATA_SCREEN",
        routeKey: "LIVE_DATA_SCREEN",
        collectable: true,
        tabState: "VISIBLE",
        detectedAccountId: `pair-a-${suffix}`,
        detectedAccountName: "插件账号 A",
        accountMatchStatus: "MATCHED",
        observedAt: new Date().toISOString()
      }
    });
    const liveStatus = await api<{ state: string; boundTaskId: string; currentUrl: string }>(`/collection-tasks/${taskA.id}/extension-status`, token);
    expect(liveStatus).toMatchObject({ state: "READY", boundTaskId: taskA.id, currentUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2" });
    await apiError("/extension/heartbeat", exchanged.token, {
      method: "POST",
      body: {
        collectionTaskId: taskB.id,
        extensionVersion: "0.2.2",
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: "integration-build",
        currentUrl: "https://localads.chengzijianzhan.cn/",
        pageType: "LOCAL_PROMOTION_DASHBOARD",
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        collectable: true,
        tabState: "VISIBLE",
        accountMatchStatus: "UNVERIFIED",
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

  it("imports account-confirmed manual metrics idempotently and queues unknown columns", async () => {
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
  confidence: number;
  inputJson: {
    metricLayer: "REVIEWED_METRIC" | "NORMALIZED_METRIC";
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
