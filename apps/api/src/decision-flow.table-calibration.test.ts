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

describe("Table calibration and conservative diagnosis", () => {
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
      overviewCards: Array<{ displayKey: string; status: string; candidates: unknown[] }>;
      tableReviewCoverage: { totalCount: number; pendingCount: number };
    }>(`/collection-tasks/${task.id}/collection-dashboard`, token);
    expect(dashboard.summary.tables).toMatchObject([{
      snapshotId: snapshot.id,
      routeDetectionConfidence: 0.98,
      bindingStatus: "REQUIRES_REVIEW",
      rows: [["投流单元", "消耗", "订单"], ["计划 A", "100", "2"]]
    }]);
    expect(dashboard.overviewCards).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayKey: "live_gmv" }),
      expect.objectContaining({ displayKey: "local_full_domain_gmv" })
    ]));
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

    const confirmedMetrics = await api<Array<{ id: string; reviewStatus: string }>>(
      `/collection-tasks/${task.id}/review-metrics/confirm-all`,
      token,
      {
        method: "POST",
        body: { snapshotVersions: await currentReviewSnapshotVersions(task.id, token) }
      }
    );
    expect(confirmedMetrics.some((metric) => metric.reviewStatus === "PENDING")).toBe(false);

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

  it("confirms uncalibrated table cells at task level and keeps formal diagnosis conservative", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const registered = await api<{ token: string }>("/auth/register", null, {
      method: "POST",
      body: { email: `table-uncalibrated-confirm-${suffix}@example.com`, password: "password123", name: "Table Uncalibrated Confirm" }
    });
    const token = registered.token;
    const accountId = `table-uncalibrated-account-${suffix}`;
    const account = await api<{ id: string }>("/account-profiles", token, {
      method: "POST",
      body: { accountName: "未校准表格确认账号", platformAccountId: accountId }
    });
    const project = await api<{ id: string }>("/projects", token, {
      method: "POST",
      body: {
        accountProfileId: account.id,
        name: "未校准表格确认项目",
        subjectType: "SERVICE_PROVIDER",
        operatorType: "SERVICE_PROVIDER_LIVE",
        cooperationType: "SERVICE_PROVIDER_CONTRACT",
        subjectConfidence: 1,
        serviceProviderName: "未校准表格确认服务商"
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
        pageTitle: "未校准表格确认直播概览",
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
    expect(confirmed).toEqual({ confirmedCount: 6, totalCount: 6, tableCount: 1 });
    expect(await prisma.tableCellReview.count({
      where: { snapshotId: snapshot.id, reviewStatus: "CONFIRMED" }
    })).toBe(6);

    const preview = await api<{ mode: string; input: { dataReviewStatus: string } }>(
      `/collection-tasks/${task.id}/decision-preview`,
      token,
      { method: "POST", body: {} }
    );
    expect(preview.mode).toBe("CONSERVATIVE_ONLY");
    expect(preview.input.dataReviewStatus).toBe("UNREVIEWED");
  });

});
