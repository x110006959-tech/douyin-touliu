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

describe("Reviewed metric calibration", () => {
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

  it("persists field binding calibration when confirm-all confirms reviewed evidence", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `confirm-all-calibration-${suffix}@example.com`, password: "password123", name: "Confirm All Calibration" }
    });
    const token = registered.token;
    const accountId = `confirm-all-calibration-account-${suffix}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "确认全部校准账号", platformAccountId: accountId }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        accountProfileId: account.id,
        name: "确认全部校准项目",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        subjectConfidence: 1,
        serviceProviderName: "确认全部校准服务商"
      }
    });
    const task = await api<{ id: string }>("/collection-tasks", token, {
      method: "POST",
      body: { projectId: project.id, sourceUrl: "https://eos.douyin.com/dp/liveScreen" }
    });
    const run = await api<{ id: string }>(`/collection-tasks/${task.id}/collection-runs`, token, {
      method: "POST",
      body: { requiredRoutes: ["LIVE_DATA_SCREEN"] }
    });
    await api<{ id: string }>(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      body: {
        pageType: "LIVE_DATA_SCREEN",
        routeKey: "LIVE_DATA_SCREEN",
        sourceUrl: `https://eos.douyin.com/dp/liveScreen?advertiser_id=${accountId}`,
        pageTitle: "确认全部校准大屏",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [{
          key: "gmv",
          name: "GMV",
          value: "5000",
          unit: "元",
          source: "dom",
          metricSource: "DOM_TEXT",
          confidence: 1,
          rawEvidence: {
            sourceType: "DOM_TEXT",
            bindingKind: "CARD",
            fieldLabel: "GMV",
            displayValue: "5000元",
            normalizedValue: "5000",
            displayPrecision: 0,
            unitSource: "VALUE",
            timeRange: "今日",
            timeRangeSource: "COMPONENT",
            timeRangeLocation: "section:0>span:0",
            componentPath: "section:0>span:0",
            calibrationSignature: "CARD:GMV:root.0",
            validationStatus: "REQUIRES_REVIEW",
            validationReasons: []
          }
        }],
        localCollectedAt: new Date().toISOString(),
        collectionRunId: run.id,
        detectedAccountId: accountId,
        accountMatchEvidence: { idSource: "URL:advertiser_id", nameSource: null },
        captureMeta: captureMeta("LIVE_DATA_SCREEN", ["gmv"])
      }
    });

    const taskWorkspace = await prisma.collectionTask.findUniqueOrThrow({
      where: { id: task.id },
      select: { project: { select: { workspaceId: true } } }
    });
    const calibrationCountBefore = await prisma.collectionBindingCalibration.count({
      where: { workspaceId: taskWorkspace.project.workspaceId }
    });
    await api(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, {
      method: "POST",
      body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
    });
    const confirmedMetrics = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics`, token);
    expect(confirmedMetrics.find((metric) => metric.metricKey === "gmv")).toMatchObject({
      reviewStatus: "CONFIRMED",
      bindingStatus: "TRUSTED"
    });
    expect(await prisma.collectionBindingCalibration.count({
      where: { workspaceId: taskWorkspace.project.workspaceId }
    })).toBe(calibrationCountBefore + 1);
    expect(await prisma.collectionBindingCalibration.findFirst({
      where: { workspaceId: taskWorkspace.project.workspaceId, bindingKind: "METRIC", bindingKey: "gmv" }
    })).toMatchObject({ bindingSignature: "CARD:GMV:root.0" });
  });

  it("keeps source-conflict metrics out of task-level confirmation and later decision input", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `source-conflict-confirm-${suffix}@example.com`, password: "password123", name: "Source Conflict Confirm" }
    });
    const token = registered.token;
    const accountId = `source-conflict-account-${suffix}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "来源冲突确认账号", platformAccountId: accountId }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        accountProfileId: account.id,
        name: "来源冲突确认项目",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        subjectConfidence: 1,
        serviceProviderName: "来源冲突确认服务商"
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
    const sourceSnapshot = await api<{ id: string }>(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      body: {
        pageType: "LOCAL_PROMOTION_DASHBOARD",
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
        pageTitle: "巨量本地推数据总览",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [
          metric("spend", "消耗", "1200", "元"),
          metric("orders", "成交订单数", 3)
        ],
        localCollectedAt: new Date().toISOString(),
        collectionRunId: run.id,
        captureMeta: captureMeta("LOCAL_PROMOTION_DASHBOARD", ["spend", "orders"])
      }
    });

    const spendConflictEvidence = {
      sourceType: "DOM_TEXT",
      bindingKind: "CARD",
      fieldLabel: "消耗",
      displayValue: "1200元",
      normalizedValue: "1200",
      displayPrecision: 0,
      unitSource: "VALUE",
      timeRange: "今日",
      timeRangeSource: "COMPONENT",
      timeRangeLocation: "section:0>span:0",
      componentPath: "section:0>span:0",
      calibrationSignature: "CARD:消耗:root.0",
      validationStatus: "INVALID",
      validationReasons: ["SOURCE_CONFLICT"],
      sourceStatus: "SOURCE_CONFLICT",
      semanticScope: "API_SCOPE",
      apiCandidate: {
        value: "1200",
        displayValue: "1200元",
        unit: "元",
        unitSource: "DEFAULT",
        scope: "API_SCOPE",
        scopeExplicit: true,
        timeRange: "今日",
        displayPrecision: 0,
        fieldPath: "data.spend",
        fieldLabel: "消耗"
      },
      domCandidate: {
        value: "1300",
        displayValue: "1300元",
        unit: "元",
        unitSource: "VALUE",
        scope: "DOM_SCOPE",
        scopeExplicit: true,
        timeRange: "今日",
        displayPrecision: 0,
        fieldPath: "section:0>span:0",
        fieldLabel: "消耗"
      }
    };

    const spendReviewUpdate = await prisma.reviewedMetric.updateMany({
      where: { taskId: task.id, metricKey: "spend" },
      data: {
        originalValue: null,
        rawEvidence: spendConflictEvidence
      }
    });
    expect(spendReviewUpdate.count).toBe(1);

    const spendSnapshotEvidenceUpdate = await prisma.normalizedMetric.updateMany({
      where: { snapshotId: sourceSnapshot.id, metricKey: "spend" },
      data: { rawEvidence: spendConflictEvidence }
    });
    expect(spendSnapshotEvidenceUpdate.count).toBe(1);

    const invalidOrderUpdate = await prisma.reviewedMetric.updateMany({
      where: { taskId: task.id, metricKey: "orders" },
      data: {
        rawEvidence: {
          sourceType: "DOM_TEXT",
          validationStatus: "INVALID",
          validationReasons: ["FIELD_BINDING_AMBIGUOUS"]
        }
      }
    });
    expect(invalidOrderUpdate.count).toBe(1);

    const confirmed = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics/confirm-all`, token, {
      method: "POST",
      body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
    });
    expect(confirmed.find((metric) => metric.metricKey === "orders")?.reviewStatus).toBe("PENDING");
    expect(confirmed.find((metric) => metric.metricKey === "spend")?.reviewStatus).toBe("PENDING");

    const auditLogs = await api<Array<{ action: string; detailJson?: { blockedSourceConflictMetricCount?: number; blockedInvalidMetricCount?: number } }>>(
      `/projects/${project.id}/audit-logs`,
      token
    );
    const confirmAllAudit = auditLogs.find((log) => log.action === "REVIEW_METRICS_CONFIRM_ALL");
    expect(confirmAllAudit?.detailJson?.blockedSourceConflictMetricCount).toBe(1);
    expect(confirmAllAudit?.detailJson?.blockedInvalidMetricCount).toBe(1);

    const preview = await api<{ mode: string; input: { dataReviewStatus: string; metrics: Array<{ key: string; value: number | string | null }> } }>(
      `/collection-tasks/${task.id}/decision-preview`,
      token,
      { method: "POST", body: {} }
    );
    expect(preview.input.metrics.some((metric) => metric.key === "spend" && (metric.value === "1200" || metric.value === "1300"))).toBe(false);

    const spendMetric = confirmed.find((metric) => metric.metricKey === "spend");
    const ordersMetric = confirmed.find((metric) => metric.metricKey === "orders");
    if (!spendMetric || !ordersMetric) throw new Error("Expected source-conflict fixture metrics to be initialized");
    const resolvedSnapshotVersion = (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt;
    const ignoredConflict = await api<ReviewMetricResponse>(`/review-metrics/${spendMetric.id}`, token, {
      method: "PATCH",
      body: {
        reviewStatus: "IGNORED",
        sourceSelection: "IGNORE",
        expectedSnapshotUpdatedAt: resolvedSnapshotVersion
      }
    });
    expect(ignoredConflict.reviewStatus).toBe("IGNORED");

    const resolvedInvalidMetric = await api<ReviewMetricResponse>(`/review-metrics/${ordersMetric.id}`, token, {
      method: "PATCH",
      body: {
        reviewStatus: "MODIFIED",
        reviewedValue: "3",
        timeRange: "今日",
        expectedSnapshotUpdatedAt: (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt
      }
    });
    expect(resolvedInvalidMetric.reviewStatus).toBe("MODIFIED");

    const resolvedPreview = await api<{ mode: string; input: { dataReviewStatus: string; metrics: Array<{ key: string; value: number | string | null }> } }>(
      `/collection-tasks/${task.id}/decision-preview`,
      token,
      { method: "POST", body: {} }
    );
    expect(resolvedPreview.mode).toBe("FORMAL_READY");
    expect(resolvedPreview.input.dataReviewStatus).toBe("REVIEWED");
    expect(resolvedPreview.input.metrics.some((metric) => metric.key === "orders" && metric.value === 3)).toBe(true);
    expect(resolvedPreview.input.metrics.some((metric) => metric.key === "spend")).toBe(false);
  });

  it("persists a selected DOM candidate into both review evidence and later decision input", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `source-conflict-dom-${suffix}@example.com`, password: "password123", name: "Source Conflict DOM" }
    });
    const token = registered.token;
    const accountId = `source-conflict-dom-account-${suffix}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "来源冲突 DOM 账号", platformAccountId: accountId }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        accountProfileId: account.id,
        name: "来源冲突 DOM 项目",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        subjectConfidence: 1,
        serviceProviderName: "来源冲突 DOM 服务商"
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
    const sourceSnapshot = await api<{ id: string }>(`/collection-tasks/${task.id}/snapshots`, token, {
      method: "POST",
      body: {
        pageType: "LOCAL_PROMOTION_DASHBOARD",
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
        pageTitle: "巨量本地推数据总览",
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [],
        visibleMetricsJson: [
          metric("spend", "消耗", "1200", "元"),
          metric("orders", "成交订单数", 3)
        ],
        localCollectedAt: new Date().toISOString(),
        collectionRunId: run.id,
        captureMeta: captureMeta("LOCAL_PROMOTION_DASHBOARD", ["spend", "orders"])
      }
    });

    const conflictEvidence = (
      apiValue: string,
      domValue: string,
      unit: string | null,
      fieldLabel: string,
      apiPath: string,
      domPath: string,
      calibrationSignature: string
    ) => ({
      sourceType: "DOM_TEXT",
      bindingKind: "CARD",
      fieldLabel,
      displayValue: `${apiValue}${unit || ""}`,
      normalizedValue: apiValue,
      displayPrecision: 0,
      unitSource: "VALUE",
      timeRange: "今日",
      timeRangeSource: "COMPONENT",
      timeRangeLocation: "section:0>span:0",
      componentPath: domPath,
      calibrationSignature,
      validationStatus: "INVALID",
      validationReasons: ["SOURCE_CONFLICT"],
      sourceStatus: "SOURCE_CONFLICT",
      semanticScope: "API_SCOPE",
      apiCandidate: {
        value: apiValue,
        displayValue: `${apiValue}${unit || ""}`,
        unit,
        unitSource: unit ? "DEFAULT" as const : "NONE" as const,
        scope: "API_SCOPE",
        scopeExplicit: true,
        timeRange: "今日",
        displayPrecision: 0,
        fieldPath: apiPath,
        fieldLabel
      },
      domCandidate: {
        value: domValue,
        displayValue: `${domValue}${unit || ""}`,
        unit,
        unitSource: unit ? "VALUE" as const : "NONE" as const,
        scope: "DOM_SCOPE",
        scopeExplicit: true,
        timeRange: "今日",
        displayPrecision: 0,
        fieldPath: domPath,
        fieldLabel
      }
    });
    const spendConflictEvidence = conflictEvidence("1200", "1300", "元", "消耗", "data.spend", "section:0>span:0", "CARD:消耗:root.0");
    const ordersConflictEvidence = conflictEvidence("3", "5", null, "成交订单数", "data.orders", "section:0>span:1", "CARD:成交订单数:root.0");

    const spendReviewUpdate = await prisma.reviewedMetric.updateMany({
      where: { taskId: task.id, metricKey: "spend" },
      data: { originalValue: null, rawEvidence: spendConflictEvidence }
    });
    expect(spendReviewUpdate.count).toBe(1);
    const ordersReviewUpdate = await prisma.reviewedMetric.updateMany({
      where: { taskId: task.id, metricKey: "orders" },
      data: { originalValue: null, rawEvidence: ordersConflictEvidence }
    });
    expect(ordersReviewUpdate.count).toBe(1);

    const spendSnapshotUpdate = await prisma.normalizedMetric.updateMany({
      where: { snapshotId: sourceSnapshot.id, metricKey: "spend" },
      data: { rawEvidence: spendConflictEvidence }
    });
    expect(spendSnapshotUpdate.count).toBe(1);
    const ordersSnapshotUpdate = await prisma.normalizedMetric.updateMany({
      where: { snapshotId: sourceSnapshot.id, metricKey: "orders" },
      data: { rawEvidence: ordersConflictEvidence }
    });
    expect(ordersSnapshotUpdate.count).toBe(1);

    const reviewedMetrics = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics`, token);
    const spendMetric = reviewedMetrics.find((metric) => metric.metricKey === "spend");
    const ordersMetric = reviewedMetrics.find((metric) => metric.metricKey === "orders");
    if (!spendMetric || !ordersMetric) throw new Error("Expected source-conflict review metrics");

    const selected = await api<ReviewMetricResponse>(`/review-metrics/${spendMetric.id}`, token, {
      method: "PATCH",
      body: {
        reviewStatus: "CONFIRMED",
        sourceSelection: "DOM",
        expectedSnapshotUpdatedAt: (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt
      }
    });
    expect(selected.reviewStatus).toBe("CONFIRMED");
    expect(selected.reviewedValue).toBe("1300");
    expect(selected.normalizedValue).toBe("1300");
    expect(selected.metricSource).toBe("DOM_TEXT");
    expect(selected.scope).toBe("DOM_SCOPE");
    const selectedEvidence = selected.rawEvidence as Record<string, unknown> | null | undefined;
    expect(selectedEvidence?.normalizedValue).toBe("1300");
    expect(selectedEvidence?.displayValue).toBe("1300元");
    expect(selectedEvidence?.sourceType).toBe("DOM_TEXT");
    expect(selectedEvidence?.sourceStatus).toBe("DOM_TEXT");
    expect(selectedEvidence?.unitSource).toBe("VALUE");
    expect(selectedEvidence?.semanticScope).toBe("DOM_SCOPE");
    expect(selectedEvidence?.manualSourceSelection).toBe("DOM");

    const normalizedMetric = await prisma.normalizedMetric.findFirstOrThrow({
      where: { snapshotId: sourceSnapshot.id, metricKey: "spend" }
    });
    expect(normalizedMetric.metricValue).toBe("1300");
    expect(normalizedMetric.metricSource).toBe("DOM_TEXT");
    expect(normalizedMetric.confidence).toBe(1);
    const normalizedEvidence = normalizedMetric.rawEvidence as Record<string, unknown> | null;
    expect(normalizedEvidence?.normalizedValue).toBe("1300");
    expect(normalizedEvidence?.displayValue).toBe("1300元");
    expect(normalizedEvidence?.sourceType).toBe("DOM_TEXT");
    expect(normalizedEvidence?.unitSource).toBe("VALUE");
    expect(normalizedEvidence?.validationStatus).toBe("TRUSTED");

    const bulkSelected = await api<Array<ReviewMetricResponse>>(`/collection-tasks/${task.id}/review-metrics/bulk`, token, {
      method: "POST",
      body: {
        items: [{
          metricId: ordersMetric.id,
          reviewStatus: "CONFIRMED",
          sourceSelection: "DOM",
          expectedSnapshotUpdatedAt: (await currentReviewSnapshotVersions(task.id, token))[0]?.expectedSnapshotUpdatedAt
        }]
      }
    });
    expect(bulkSelected).toHaveLength(1);
    expect(bulkSelected[0]?.reviewStatus).toBe("CONFIRMED");
    expect(bulkSelected[0]?.reviewedValue).toBe("5");
    expect(bulkSelected[0]?.normalizedValue).toBe("5");
    expect(bulkSelected[0]?.metricSource).toBe("DOM_TEXT");
    expect(bulkSelected[0]?.scope).toBe("DOM_SCOPE");
    const bulkEvidence = bulkSelected[0]?.rawEvidence as Record<string, unknown> | null | undefined;
    expect(bulkEvidence?.normalizedValue).toBe("5");
    expect(bulkEvidence?.displayValue).toBe("5");
    expect(bulkEvidence?.sourceType).toBe("DOM_TEXT");
    expect(bulkEvidence?.sourceStatus).toBe("DOM_TEXT");
    expect(bulkEvidence?.unitSource).toBe("NONE");
    expect(bulkEvidence?.semanticScope).toBe("DOM_SCOPE");
    expect(bulkEvidence?.manualSourceSelection).toBe("DOM");

    const bulkNormalizedMetric = await prisma.normalizedMetric.findFirstOrThrow({
      where: { snapshotId: sourceSnapshot.id, metricKey: "orders" }
    });
    expect(bulkNormalizedMetric.metricValue).toBe("5");
    expect(bulkNormalizedMetric.metricSource).toBe("DOM_TEXT");
    expect(bulkNormalizedMetric.confidence).toBe(1);
    const bulkNormalizedEvidence = bulkNormalizedMetric.rawEvidence as Record<string, unknown> | null;
    expect(bulkNormalizedEvidence?.normalizedValue).toBe("5");
    expect(bulkNormalizedEvidence?.displayValue).toBe("5");
    expect(bulkNormalizedEvidence?.sourceType).toBe("DOM_TEXT");
    expect(bulkNormalizedEvidence?.unitSource).toBe("NONE");
    expect(bulkNormalizedEvidence?.validationStatus).toBe("TRUSTED");

    const preview = await api<{
      mode: string;
      input: {
        dataReviewStatus: string;
        metrics: Array<{
          key: string;
          value: number | string | null;
          metricSource?: string;
          rawEvidence?: { sourceType?: string; semanticScope?: string } | null;
        }>;
      };
    }>(
      `/collection-tasks/${task.id}/decision-preview`,
      token,
      { method: "POST", body: {} }
    );
    expect(preview.mode).toBe("FORMAL_READY");
    expect(preview.input.dataReviewStatus).toBe("REVIEWED");
    expect(preview.input.metrics.some((metric) => metric.key === "spend" && metric.value === 1300)).toBe(true);
    expect(preview.input.metrics.some((metric) => metric.key === "spend" && (metric.value === "1200" || metric.value === 1200))).toBe(false);
    expect(preview.input.metrics.some((metric) => metric.key === "orders" && metric.value === 5)).toBe(true);
    expect(preview.input.metrics.some((metric) => metric.key === "orders" && (metric.value === "3" || metric.value === 3))).toBe(false);
    expect(preview.input.metrics.some((metric) => (
      metric.key === "spend"
      && metric.metricSource === "DOM_TEXT"
      && metric.rawEvidence?.sourceType === "DOM_TEXT"
      && metric.rawEvidence?.semanticScope === "DOM_SCOPE"
    ))).toBe(true);
    expect(preview.input.metrics.some((metric) => (
      metric.key === "orders"
      && metric.metricSource === "DOM_TEXT"
      && metric.rawEvidence?.sourceType === "DOM_TEXT"
      && metric.rawEvidence?.semanticScope === "DOM_SCOPE"
    ))).toBe(true);
  });

});
