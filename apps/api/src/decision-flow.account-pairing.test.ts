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

describe("Account profiles and extension pairing", () => {
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
    await apiError("/extension/pairing-codes", token, {
      method: "POST",
      body: { accountProfileId: accountA.id, collectionTaskId: taskB.id }
    }, "EXTENSION_TASK_ACCOUNT_MISMATCH");
    const pairing = await api<{ code: string; expiresAt: string; task: { id: string } | null }>("/extension/pairing-codes", token, {
      method: "POST",
      body: { accountProfileId: accountA.id, collectionTaskId: taskA.id }
    });
    expect(pairing.code).toMatch(/^\d{6}$/);
    expect(pairing.task?.id).toBe(taskA.id);
    const preview = await api<{ account: { id: string }; task: { id: string } | null }>("/extension/pairing-codes/preview", null, {
      method: "POST",
      body: { code: pairing.code }
    });
    expect(preview).toMatchObject({ account: { id: accountA.id }, task: { id: taskA.id } });
    expect(await prisma.extensionPairingCode.findUniqueOrThrow({
      where: { codeHash: hashForTest(pairing.code) },
      select: { consumedAt: true }
    })).toEqual({ consumedAt: null });
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
      localPromotionInternalApi: { enabled: boolean; contractVersion: string; adapterVersion: string };
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
    expect(context.localPromotionInternalApi).toEqual({
      enabled: localPromotionInternalApiEnabled(),
      contractVersion: localPromotionInternalApiContractVersion,
      adapterVersion: localPromotionInternalApiAdapterVersion
    });
    await api(`/collection-tasks/${taskA.id}`, exchanged.token);
    await apiError(`/collection-tasks/${taskB.id}`, exchanged.token, {}, "EXTENSION_ACCOUNT_MISMATCH");
    const emptySummary = await api<{ snapshotCount: number; routes: Array<{ routeKey: string }> }>(`/collection-tasks/${taskA.id}/capture-summary`, token);
    expect(emptySummary.snapshotCount).toBe(0);
    expect(emptySummary.routes.length).toBeGreaterThan(0);
    const snapshotCountBeforePulse = await prisma.dataSnapshot.count({ where: { taskId: taskA.id } });
    await apiError(`/collection-tasks/${taskA.id}/metric-pulses`, exchanged.token, {
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
    }, "LIVE_SCREEN_INTERNAL_API_DISABLED");
    await apiError(`/collection-tasks/${taskA.id}/metric-pulses`, token, {
      method: "POST",
      body: {
        routeKey: "LIVE_DATA_SCREEN",
        pageType: "LIVE_DATA_SCREEN",
        localCapturedAt: new Date().toISOString(),
        tabState: "VISIBLE",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?room_id=${suffix}`,
        metrics: [metric("spend", "网页会话伪造脉冲", 100)],
        captureMeta: captureMeta("LIVE_DATA_SCREEN", ["spend"])
      }
    }, "METRIC_PULSE_EXTENSION_REQUIRED");
    const previousLocalPromotionApiEnabled = process.env.LOCAL_PROMOTION_INTERNAL_API_ENABLED;
    process.env.LOCAL_PROMOTION_INTERNAL_API_ENABLED = "true";
    try {
      const advertisingId = String(Date.now());
      const field = localPromotionInternalApiEndpointContracts.statQuery.fields[0]!;
      await expect(api<{ pulseCount: number }>(`/collection-tasks/${taskA.id}/metric-pulses`, exchanged.token, {
        method: "POST",
        body: {
          routeKey: "LOCAL_PROMOTION_DASHBOARD",
          pageType: "LOCAL_PROMOTION_DASHBOARD",
          localCapturedAt: new Date().toISOString(),
          tabState: "VISIBLE",
          sourceUrl: `https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=${advertisingId}`,
          captureProtocolVersion: extensionCollectionProtocolVersion,
          metrics: [localPromotionPulseMetric(field, 100.2, "100.20")],
          captureMeta: {
            ...captureMeta("LOCAL_PROMOTION_DASHBOARD", [field.metricKey]),
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
      })).resolves.toMatchObject({ pulseCount: 1 });
    } finally {
      if (previousLocalPromotionApiEnabled === undefined) delete process.env.LOCAL_PROMOTION_INTERNAL_API_ENABLED;
      else process.env.LOCAL_PROMOTION_INTERNAL_API_ENABLED = previousLocalPromotionApiEnabled;
    }
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
    await apiError(`/collection-tasks/${taskA.id}/metric-pulses`, exchanged.token, {
      method: "POST",
      body: {
        routeKey: "LIVE_PRODUCT_TAB",
        pageType: "LIVE_DATA_SCREEN",
        localCapturedAt: new Date().toISOString(),
        tabState: "VISIBLE",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?mode=product&room_id=${suffix}`,
        captureProtocolVersion: extensionCollectionProtocolVersion,
        metrics: [metric("orders", "商品订单", 1)],
        captureMeta: captureMeta("LIVE_PRODUCT_TAB", ["orders"])
      }
    }, "METRIC_PULSE_ROUTE_INVALID");
    await prisma.collectionRouteSource.delete({
      where: { taskId_routeKey: { taskId: taskA.id, routeKey: "LOCAL_PROMOTION_DASHBOARD" } }
    });
    await apiError(`/collection-tasks/${taskA.id}/metric-pulses`, exchanged.token, {
      method: "POST",
      body: {
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        pageType: "LOCAL_PROMOTION_DASHBOARD",
        localCapturedAt: new Date().toISOString(),
        tabState: "VISIBLE",
        sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=1",
        captureProtocolVersion: extensionCollectionProtocolVersion,
        metrics: [metric("spend", "未配置路线脉冲", 100)],
        captureMeta: captureMeta("LOCAL_PROMOTION_DASHBOARD", ["spend"])
      }
    }, "COLLECTION_ROUTE_NOT_CONFIGURED");
    await api(`/collection-tasks/${taskA.id}/routes/LOCAL_PROMOTION_DASHBOARD`, token, {
      method: "PUT",
      body: {}
    });
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
        extensionVersion: "0.2.6",
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: "integration-build",
        connectionSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
    const scopedStatus = await api(`/collection-tasks/${taskA.id}/extension-status?connectionSessionId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, token);
    expect(scopedStatus).toMatchObject({ state: "READY", connectionSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    const otherBrowser = await api(`/collection-tasks/${taskA.id}/extension-status?connectionSessionId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`, token);
    expect(otherBrowser).toMatchObject({ state: "PAIRED_NOT_CONNECTED", boundTaskId: null });
    await apiError(`/collection-tasks/${taskA.id}/extension-status?connectionSessionId=invalid`, token, {}, "VALIDATION_ERROR");
    await apiError("/extension/heartbeat", exchanged.token, {
      method: "POST",
      body: {
        collectionTaskId: taskB.id,
        extensionVersion: "0.2.6",
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

});
