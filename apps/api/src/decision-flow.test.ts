import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createServer } from "./server.js";
import { prisma } from "./prisma.js";

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

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});

describe("V0.1 API smoke flow", () => {
  it("reports database readiness", async () => {
    await expect(api<{ ok: boolean; database: string }>("/ready", null)).resolves.toEqual({ ok: true, database: "ready" });
    await expect(api<{ productVersion: string; gitSha: string }>("/version", null)).resolves.toMatchObject({
      productVersion: "0.2.1",
      gitSha: expect.any(String)
    });
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
      captureMeta: captureMeta("LIVE_DATA_SCREEN", ["verify_roi", "spend", "orders", "impressions", "ctr"])
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

    const decisionKeys = Array.from({ length: 50 }, (_, index) => `decision-${Date.now()}-${index}`);
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
    const transactionDurations = concurrentResults.map((result) => result.transactionMs).sort((a, b) => a - b);
    const p95Transaction = transactionDurations[Math.ceil(transactionDurations.length * 0.95) - 1] || 0;
    expect(p95Duration).toBeLessThan(2_000);
    expect(p95Transaction).toBeLessThan(150);
    expect(concurrentRuns.filter((run) => run.actionProposals.length > 0)).toHaveLength(1);
    const decisionRunIndex = concurrentRuns.findIndex((run) => run.actionProposals.length > 0);
    const decisionRun = concurrentRuns[decisionRunIndex];
    const decisionKey = decisionKeys[decisionRunIndex];
    if (!decisionRun || !decisionKey) throw new Error("Expected one serialized decision run to persist proposals");
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
    const explanationOnly = await api<{ responsePayload: { finalActionsSource: string } }>(`/collection-tasks/${task.id}/explain`, token, {
      method: "POST",
      body: {}
    });
    expect(explanationOnly.responsePayload.finalActionsSource).toBe("decision-engine");
    expect(explanationOnly.responsePayload).not.toHaveProperty("suggestions");
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
      beforeMetrics: { verify_roi: 0.8, orders: 0 },
      afterMetrics: { verify_roi: 1.1, orders: 3 },
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
            metric("spend", "spend", 1000),
            metric("orders", "orders", 3),
            metric("impressions", "impressions", 20000),
            metric("ctr", "CTR", 0.03, "%"),
            metric("gpm", "GPM", 120),
            metric("clicks", "clicks", 600)
          ],
          screenshotUrl: null,
          localCollectedAt: new Date().toISOString()
        }
      }
    );

    const initialReviewMetrics = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics`, token);
    expect(initialReviewMetrics.length).toBeGreaterThanOrEqual(6);
    expect(initialReviewMetrics.every((item) => item.reviewStatus === "PENDING")).toBe(true);
    expect(initialReviewMetrics.every((item) => item.metricSource !== undefined && typeof item.confidence === "number")).toBe(true);

    const fallbackRun = await api<DecisionRunResponse>(`/collection-tasks/${task.id}/decision-runs`, token, { method: "POST", body: {} });
    expect(fallbackRun.inputJson.metricLayer).toBe("NORMALIZED_METRIC");
    expect(fallbackRun.inputJson.dataReviewStatus).toBe("UNREVIEWED");
    expect(fallbackRun.confidence).toBeLessThan(0.9);
    expect(JSON.stringify(fallbackRun.manualCheckItemsJson)).toContain("人工复核");

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
      "DECISION_RUN_FALLBACK_NORMALIZED_METRICS",
      "DECISION_RUN_USE_REVIEWED_METRICS"
    ]) {
      expect(auditLogs.some((log) => log.action === action), `${action} audit log should exist`).toBe(true);
    }
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

async function apiWithDecisionTiming<T>(
  path: string,
  token: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> }
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(options.headers || {}) },
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
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
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
  return envelope.data;
}

async function apiError(path: string, token: string | null, options: { method?: string; body?: unknown }, expectedCode: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const envelope = (await response.json()) as ApiEnvelope<unknown>;
  expect(envelope).toMatchObject({
    success: false,
    data: null,
    error: { code: expectedCode, message: expect.any(String) }
  });
}
