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

describe("Route confirmation and partial diagnosis", () => {
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

});
