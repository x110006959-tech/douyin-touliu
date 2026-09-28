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

describe("Realtime evidence and manual metric import", () => {
  it("reuses stored multi-route realtime evidence for AI diagnosis without snapshot confirmation", async () => {
    const previousLiveScreenApiEnabled = process.env.LIVE_SCREEN_INTERNAL_API_ENABLED;
    const previousLocalPromotionApiEnabled = process.env.LOCAL_PROMOTION_INTERNAL_API_ENABLED;
    process.env.LIVE_SCREEN_INTERNAL_API_ENABLED = "true";
    process.env.LOCAL_PROMOTION_INTERNAL_API_ENABLED = "true";
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
        body: { requiredRoutes: ["LIVE_DATA_SCREEN", "LOCAL_PROMOTION_DASHBOARD"] }
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
      const localPromotionField = localPromotionInternalApiEndpointContracts.statQuery.fields[0];
      if (!localPromotionField) throw new Error("Expected a local promotion realtime internal API field");
      const advertisingId = String(Date.now());
      const localPromotionPulse = await api<{ pulseCount: number }>(`/collection-tasks/${task.id}/metric-pulses`, exchanged.token, {
        method: "POST",
        body: {
          routeKey: "LOCAL_PROMOTION_DASHBOARD",
          pageType: "LOCAL_PROMOTION_DASHBOARD",
          localCapturedAt: new Date().toISOString(),
          tabState: "VISIBLE",
          sourceUrl: `https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=${advertisingId}`,
          captureProtocolVersion: extensionCollectionProtocolVersion,
          metrics: [localPromotionPulseMetric(localPromotionField, 100.2, "100.20")],
          captureMeta: {
            ...captureMeta("LOCAL_PROMOTION_DASHBOARD", [localPromotionField.metricKey]),
            localPromotionInternalApi: {
              enabled: true,
              contractVersion: localPromotionInternalApiContractVersion,
              adapterVersion: localPromotionInternalApiAdapterVersion,
              identity: {
                advid: null,
                roomId: null,
                selectedAdvid: advertisingId,
                selectedAwemeId: null,
                source: "URL",
                evidence: {
                  url: { advid: [], roomId: [], selectedAdvid: [advertisingId], selectedAwemeId: [] },
                  dom: { advid: [], roomId: [], selectedAdvid: [], selectedAwemeId: [] }
                }
              },
              endpointStatuses: [
                { endpoint: "pageMetrics", status: "SUCCESS", acceptedBytes: 100 },
                { endpoint: "statQuery", status: "SUCCESS", acceptedBytes: 100 }
              ],
              evidencePurpose: "PULSE_ONLY"
            }
          }
        }
      });
      expect(localPromotionPulse.pulseCount).toBe(2);
      expect(await prisma.dataSnapshot.count({ where: { taskId: task.id } })).toBe(0);
      const historyAfterPulses = await api<{ sessions: Array<{ pointCount: number }>; defaultPeriodComparison: { status: string } }>(`/projects/${project.id}/history`, token);
      expect(historyAfterPulses.sessions[0]?.pointCount).toBeGreaterThanOrEqual(2);
      expect(historyAfterPulses.defaultPeriodComparison.status).toBe("INSUFFICIENT");

      const queued = await api<{ id: string; inputJson: { metricLayer: string; realtimeEvidence?: { routeKey: string; pageType: string } | null; realtimeEvidenceItems?: Array<{ routeKey: string; pageType: string }> } }>(`/collection-tasks/${task.id}/decision-runs`, token, {
        method: "POST",
        body: {}
      });
      expect(queued.inputJson.metricLayer).toBe("REALTIME_API");
      expect(await prisma.projectAnalysisArchive.findFirst({ where: { decisionRunId: queued.id }, select: { status: true, metricsJson: true } })).toMatchObject({ status: "QUEUED" });
      expect(queued.inputJson.realtimeEvidence).toMatchObject({
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        pageType: "LOCAL_PROMOTION_DASHBOARD"
      });
      expect(queued.inputJson.realtimeEvidenceItems).toEqual(expect.arrayContaining([
        expect.objectContaining({ routeKey: "LOCAL_PROMOTION_DASHBOARD", pageType: "LOCAL_PROMOTION_DASHBOARD" }),
        expect.objectContaining({ routeKey: "LIVE_DATA_SCREEN", pageType: "LIVE_DATA_SCREEN" })
      ]));

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
        inputJson: { metricLayer: string; realtimeEvidence?: { routeKey: string; pageType: string } | null; realtimeEvidenceItems?: Array<{ routeKey: string; pageType: string }> };
      }>(`/decision-runs/${queued.id}`, token);
      expect(completed).toMatchObject({ status: "SUCCEEDED", errorCode: null, errorMessage: null });
      await expect(prisma.projectAnalysisArchive.findFirst({ where: { decisionRunId: queued.id }, select: { status: true } })).resolves.toMatchObject({ status: "SUCCEEDED" });
      expect(completed.inputJson.metricLayer).toBe("REALTIME_API");
      expect(completed.inputJson.realtimeEvidence).toMatchObject({
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        pageType: "LOCAL_PROMOTION_DASHBOARD"
      });
      expect(completed.inputJson.realtimeEvidenceItems).toEqual(expect.arrayContaining([
        expect.objectContaining({ routeKey: "LOCAL_PROMOTION_DASHBOARD", pageType: "LOCAL_PROMOTION_DASHBOARD" }),
        expect.objectContaining({ routeKey: "LIVE_DATA_SCREEN", pageType: "LIVE_DATA_SCREEN" })
      ]));
    } finally {
      if (previousLiveScreenApiEnabled === undefined) delete process.env.LIVE_SCREEN_INTERNAL_API_ENABLED;
      else process.env.LIVE_SCREEN_INTERNAL_API_ENABLED = previousLiveScreenApiEnabled;
      if (previousLocalPromotionApiEnabled === undefined) delete process.env.LOCAL_PROMOTION_INTERNAL_API_ENABLED;
      else process.env.LOCAL_PROMOTION_INTERNAL_API_ENABLED = previousLocalPromotionApiEnabled;
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
