import { describe, expect, it } from "vitest";
import { collectionFreshnessPolicy } from "@douyin-local-life/shared";
import { toCollectionRunDTO } from "./collection-runs.js";
import { buildDecisionInput, runDecisionEngine } from "./decision.js";

describe("V0.2 decision safety regressions", () => {
  it("anchors decisions to the newest collection run even before its first snapshot", () => {
    const now = new Date();
    const input = buildDecisionInput({
      id: "task-1",
      sourceUrl: "https://life.douyin.com/live-dashboard",
      pageTitle: "直播数据大屏",
      project: {
        id: "project-1",
        businessType: "DOUYIN_LOCAL_LIFE",
        subjectType: "MERCHANT_OFFICIAL",
        operatorType: "MERCHANT_SELF",
        cooperationType: "NONE",
        controlLevel: "MEDIUM",
        subjectConfidence: 1,
        serviceProviderName: null,
        serviceMode: null,
        serviceFee: null
      },
      snapshots: [{
        id: "old-snapshot",
        collectionRunId: "old-run",
        routeKey: "LIVE_DATA_SCREEN",
        pageType: "LIVE_DATA_SCREEN",
        localCollectedAt: now,
        rawDomText: "old run data",
        rawNetworkJson: [],
        rawTableData: [],
        normalizedMetrics: [{
          id: "metric-1",
          metricKey: "spend",
          metricName: "消耗",
          metricValue: "100",
          metricUnit: "元",
          metricSource: "MANUAL_INPUT",
          confidence: 1,
          rawEvidence: null
        }]
      }],
      reviewedMetrics: [],
      collectionRuns: [{
        id: "new-run",
        requiredRoutesJson: ["LIVE_DATA_SCREEN"],
        snapshots: [],
        routeHealth: []
      }]
    });

    expect(input.metrics).toEqual([]);
    expect(input.collectionQuality).toMatchObject({
      completeness: 0,
      missingRoutes: ["LIVE_DATA_SCREEN"],
      blocksStrongActions: true
    });
    expect(runDecisionEngine(input).finalOutput.dataQuality.blocksStrongActions).toBe(true);
  });

  it("keeps degraded route failures aligned with the exposed quality gate", () => {
    const now = new Date();
    const dto = toCollectionRunDTO({
      id: "run-1",
      taskId: "task-1",
      status: "DEGRADED",
      requiredRoutesJson: ["LIVE_DATA_SCREEN"],
      startedAt: now,
      lastSnapshotAt: now,
      completedAt: null,
      stoppedAt: null,
      createdAt: now,
      updatedAt: now,
      snapshots: [{ routeKey: "LIVE_DATA_SCREEN", pageType: "LIVE_DATA_SCREEN", localCollectedAt: now }],
      routeHealth: [{
        routeKey: "LIVE_DATA_SCREEN",
        consecutiveFailures: 3,
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastError: "timeout"
      }]
    });

    expect(dto.status).toBe("DEGRADED");
    expect(dto.quality.blocksStrongActions).toBe(true);
    expect(dto.quality.staleRoutes).toContain("LIVE_DATA_SCREEN");
    expect(dto.quality.routes[0]?.state).toBe("STALE");
  });

  it("accepts fully reviewed table evidence without requiring a normalized metric", () => {
    const now = new Date();
    const input = buildDecisionInput({
      id: "table-only-task",
      sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=main",
      pageTitle: "直播数据大屏",
      project: {
        id: "table-only-project",
        businessType: "DOUYIN_LOCAL_LIFE",
        subjectType: "MERCHANT_OFFICIAL",
        operatorType: "MERCHANT_SELF",
        cooperationType: "NONE",
        controlLevel: "MEDIUM",
        subjectConfidence: 1,
        serviceProviderName: null,
        serviceMode: null,
        serviceFee: null
      },
      snapshots: [{
        id: "table-only-snapshot",
        collectionRunId: "table-only-run",
        accountMatchStatus: "MATCHED",
        routeVerificationStatus: "VERIFIED",
        routeKey: "TASK_TABLE",
        pageType: "TASK_TABLE",
        localCollectedAt: now,
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [["任务", "消耗"], ["计划 A", "100"]],
        captureMetaJson: {
          pageFingerprint: "trusted-table-fixture",
          tableBindings: [{
            tableIndex: 0,
            headers: ["任务", "消耗"],
            identityColumn: "任务",
            bindingSignature: "任务|消耗",
            validationStatus: "TRUSTED",
            validationReasons: []
          }]
        },
        normalizedMetrics: [],
        tableCellReviews: [
          { tableIndex: 0, rowIndex: 0, columnIndex: 0, originalValue: "任务", reviewedValue: "任务", reviewStatus: "CONFIRMED" },
          { tableIndex: 0, rowIndex: 0, columnIndex: 1, originalValue: "消耗", reviewedValue: "消耗", reviewStatus: "CONFIRMED" },
          { tableIndex: 0, rowIndex: 1, columnIndex: 0, originalValue: "计划 A", reviewedValue: "计划 A", reviewStatus: "CONFIRMED" },
          { tableIndex: 0, rowIndex: 1, columnIndex: 1, originalValue: "100", reviewedValue: "120", reviewStatus: "MODIFIED" }
        ]
      }],
      reviewedMetrics: [],
      collectionRuns: [{
        id: "table-only-run",
        requiredRoutesJson: ["TASK_TABLE"],
        snapshots: [{ routeKey: "TASK_TABLE", pageType: "TASK_TABLE", localCollectedAt: now }],
        routeHealth: []
      }]
    });

    expect(input.dataReviewStatus).toBe("REVIEWED");
    expect(input.metrics).toEqual([]);
    expect(input.tables[0]?.rows[1]?.[1]).toBe("120");
    expect(input.reviewCoverage).toMatchObject({ totalCount: 4, pendingCount: 0, modifiedCount: 1 });
  });

  it("does not treat a historical reviewed table without binding evidence as trusted", () => {
    const now = new Date();
    const input = buildDecisionInput({
      id: "legacy-table-task",
      sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=main",
      pageTitle: "历史表格",
      project: {
        id: "legacy-table-project", businessType: "DOUYIN_LOCAL_LIFE", subjectType: "MERCHANT_OFFICIAL",
        operatorType: "MERCHANT_SELF", cooperationType: "NONE", controlLevel: "MEDIUM", subjectConfidence: 1,
        serviceProviderName: null, serviceMode: null, serviceFee: null
      },
      snapshots: [{
        id: "legacy-table-snapshot", collectionRunId: "legacy-table-run", routeVerificationStatus: "VERIFIED",
        routeKey: "TASK_TABLE", pageType: "TASK_TABLE", localCollectedAt: now,
        rawDomText: "", rawNetworkJson: [], rawTableData: [["任务", "消耗"], ["计划 A", "100"]], normalizedMetrics: [],
        tableCellReviews: [
          { tableIndex: 0, rowIndex: 0, columnIndex: 0, originalValue: "任务", reviewedValue: "任务", reviewStatus: "CONFIRMED" },
          { tableIndex: 0, rowIndex: 0, columnIndex: 1, originalValue: "消耗", reviewedValue: "消耗", reviewStatus: "CONFIRMED" },
          { tableIndex: 0, rowIndex: 1, columnIndex: 0, originalValue: "计划 A", reviewedValue: "计划 A", reviewStatus: "CONFIRMED" },
          { tableIndex: 0, rowIndex: 1, columnIndex: 1, originalValue: "100", reviewedValue: "100", reviewStatus: "CONFIRMED" }
        ]
      }],
      reviewedMetrics: [],
      collectionRuns: [{
        id: "legacy-table-run", requiredRoutesJson: ["TASK_TABLE"],
        snapshots: [{ routeKey: "TASK_TABLE", pageType: "TASK_TABLE", localCollectedAt: now }], routeHealth: []
      }]
    });

    expect(input.dataReviewStatus).toBe("UNREVIEWED");
    expect(input.tables).toEqual([]);
  });

  it("does not treat a confirmed legacy metric without binding evidence as trusted", () => {
    const now = new Date();
    const input = buildDecisionInput({
      id: "legacy-metric-task",
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      pageTitle: "历史指标",
      project: {
        id: "legacy-metric-project", businessType: "DOUYIN_LOCAL_LIFE", subjectType: "MERCHANT_OFFICIAL",
        operatorType: "MERCHANT_SELF", cooperationType: "NONE", controlLevel: "MEDIUM", subjectConfidence: 1,
        serviceProviderName: null, serviceMode: null, serviceFee: null
      },
      snapshots: [{
        id: "legacy-metric-snapshot", collectionRunId: "legacy-metric-run", routeVerificationStatus: "VERIFIED",
        routeKey: "LOCAL_PROMOTION_DASHBOARD", pageType: "LOCAL_PROMOTION_DASHBOARD", localCollectedAt: now,
        rawDomText: "", rawNetworkJson: [], rawTableData: [],
        normalizedMetrics: [{
          id: "legacy-spend", metricKey: "spend", metricName: "消耗", metricValue: "100", metricUnit: "元",
          metricSource: "DOM_TEXT", confidence: 1, rawEvidence: null
        }]
      }],
      reviewedMetrics: [{
        id: "legacy-spend-review", taskId: "legacy-metric-task", snapshotId: "legacy-metric-snapshot",
        normalizedMetricId: "legacy-spend", metricKey: "spend", metricName: "消耗", originalValue: "100",
        reviewedValue: "100", metricUnit: "元", metricSource: "DOM_TEXT", confidence: 1, rawEvidence: null,
        pageType: "LOCAL_PROMOTION_DASHBOARD", scope: null, timeRange: "今日", reviewStatus: "CONFIRMED",
        reviewerId: "reviewer", reviewedAt: now, createdAt: now, updatedAt: now
      }],
      collectionRuns: [{
        id: "legacy-metric-run", requiredRoutesJson: ["LOCAL_PROMOTION_DASHBOARD"],
        snapshots: [{ routeKey: "LOCAL_PROMOTION_DASHBOARD", pageType: "LOCAL_PROMOTION_DASHBOARD", localCollectedAt: now }], routeHealth: []
      }]
    });

    expect(input.dataReviewStatus).toBe("UNREVIEWED");
    expect(input.metrics).toEqual([]);
  });

  it("excludes stale metrics and tables from formal decision input", () => {
    const staleAt = new Date(Date.now() - collectionFreshnessPolicy.staleAfterMs);
    const input = buildDecisionInput({
      id: "stale-evidence-task",
      sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=main",
      pageTitle: "直播数据大屏",
      project: {
        id: "stale-evidence-project",
        businessType: "DOUYIN_LOCAL_LIFE",
        subjectType: "MERCHANT_OFFICIAL",
        operatorType: "MERCHANT_SELF",
        cooperationType: "NONE",
        controlLevel: "MEDIUM",
        subjectConfidence: 1,
        serviceProviderName: null,
        serviceMode: null,
        serviceFee: null
      },
      snapshots: [{
        id: "stale-evidence-snapshot",
        collectionRunId: "stale-evidence-run",
        accountMatchStatus: "MATCHED",
        routeVerificationStatus: "VERIFIED",
        routeKey: "TASK_TABLE",
        pageType: "TASK_TABLE",
        localCollectedAt: staleAt,
        rawDomText: "",
        rawNetworkJson: [],
        rawTableData: [["任务", "消耗"], ["计划 A", "100"]],
        normalizedMetrics: [{
          id: "stale-evidence-metric",
          metricKey: "spend",
          metricName: "消耗",
          metricValue: "100",
          metricUnit: "元",
          metricSource: "TABLE",
          confidence: 0.8,
          rawEvidence: null
        }],
        tableCellReviews: [
          { tableIndex: 0, rowIndex: 0, columnIndex: 0, originalValue: "任务", reviewedValue: "任务", reviewStatus: "CONFIRMED" },
          { tableIndex: 0, rowIndex: 0, columnIndex: 1, originalValue: "消耗", reviewedValue: "消耗", reviewStatus: "CONFIRMED" },
          { tableIndex: 0, rowIndex: 1, columnIndex: 0, originalValue: "计划 A", reviewedValue: "计划 A", reviewStatus: "CONFIRMED" },
          { tableIndex: 0, rowIndex: 1, columnIndex: 1, originalValue: "100", reviewedValue: "100", reviewStatus: "CONFIRMED" }
        ]
      }],
      reviewedMetrics: [{
        id: "stale-review",
        taskId: "stale-evidence-task",
        snapshotId: "stale-evidence-snapshot",
        normalizedMetricId: "stale-evidence-metric",
        metricKey: "spend",
        metricName: "消耗",
        originalValue: "100",
        reviewedValue: "100",
        metricUnit: "元",
        metricSource: "TABLE",
        confidence: 1,
        rawEvidence: null,
        pageType: "TASK_TABLE",
        scope: null,
        timeRange: null,
        reviewStatus: "CONFIRMED",
        reviewerId: "reviewer-1",
        reviewedAt: staleAt,
        createdAt: staleAt,
        updatedAt: staleAt
      }],
      collectionRuns: [{
        id: "stale-evidence-run",
        requiredRoutesJson: ["TASK_TABLE"],
        snapshots: [{ routeKey: "TASK_TABLE", pageType: "TASK_TABLE", localCollectedAt: staleAt }],
        routeHealth: []
      }]
    });

    expect(input.dataReviewStatus).toBe("UNREVIEWED");
    expect(input.metrics).toEqual([]);
    expect(input.tables).toEqual([]);
    expect(input.structuredCollectionData).toEqual([]);
  });

  it("blocks the whole decision input when any current metric binding failed validation", () => {
    const now = new Date();
    const input = buildDecisionInput({
      id: "invalid-binding-task",
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      pageTitle: "巨量本地推数据总览",
      project: {
        id: "invalid-binding-project", businessType: "DOUYIN_LOCAL_LIFE", subjectType: "MERCHANT_OFFICIAL",
        operatorType: "MERCHANT_SELF", cooperationType: "NONE", controlLevel: "MEDIUM", subjectConfidence: 1,
        serviceProviderName: null, serviceMode: null, serviceFee: null
      },
      snapshots: [{
        id: "invalid-binding-snapshot", collectionRunId: "invalid-binding-run", routeVerificationStatus: "VERIFIED",
        routeKey: "LOCAL_PROMOTION_DASHBOARD", pageType: "LOCAL_PROMOTION_DASHBOARD", localCollectedAt: now,
        rawDomText: "", rawNetworkJson: [], rawTableData: [], normalizedMetrics: [{
          id: "invalid-binding-metric", metricKey: "pay_roi", metricName: "整体支付 ROI", metricValue: "4", metricUnit: null,
          metricSource: "DOM_TEXT", confidence: 1,
          rawEvidence: { sourceType: "DOM_TEXT", validationStatus: "INVALID", validationReasons: ["FIELD_BINDING_AMBIGUOUS"] }
        }, {
          id: "valid-spend-metric", metricKey: "spend", metricName: "消耗", metricValue: "100", metricUnit: "元",
          metricSource: "DOM_TEXT", confidence: 1,
          rawEvidence: { sourceType: "DOM_TEXT", validationStatus: "TRUSTED", validationReasons: [] }
        }]
      }],
      reviewedMetrics: [{
        id: "invalid-binding-review", taskId: "invalid-binding-task", snapshotId: "invalid-binding-snapshot",
        normalizedMetricId: "invalid-binding-metric", metricKey: "pay_roi", metricName: "整体支付 ROI", originalValue: "4",
        reviewedValue: "4", metricUnit: null, metricSource: "DOM_TEXT", confidence: 1,
        rawEvidence: { sourceType: "DOM_TEXT", validationStatus: "INVALID", validationReasons: ["FIELD_BINDING_AMBIGUOUS"] },
        pageType: "LOCAL_PROMOTION_DASHBOARD", scope: null, timeRange: null, reviewStatus: "CONFIRMED",
        reviewerId: "reviewer", reviewedAt: now, createdAt: now, updatedAt: now
      }, {
        id: "valid-spend-review", taskId: "invalid-binding-task", snapshotId: "invalid-binding-snapshot",
        normalizedMetricId: "valid-spend-metric", metricKey: "spend", metricName: "消耗", originalValue: "100",
        reviewedValue: "100", metricUnit: "元", metricSource: "DOM_TEXT", confidence: 1,
        rawEvidence: { sourceType: "DOM_TEXT", validationStatus: "TRUSTED", validationReasons: [] },
        pageType: "LOCAL_PROMOTION_DASHBOARD", scope: null, timeRange: null, reviewStatus: "CONFIRMED",
        reviewerId: "reviewer", reviewedAt: now, createdAt: now, updatedAt: now
      }],
      collectionRuns: [{
        id: "invalid-binding-run", requiredRoutesJson: ["LOCAL_PROMOTION_DASHBOARD"],
        snapshots: [{ routeKey: "LOCAL_PROMOTION_DASHBOARD", pageType: "LOCAL_PROMOTION_DASHBOARD", localCollectedAt: now }], routeHealth: []
      }]
    });

    expect(input.metrics).toEqual([]);
    expect(input.tables).toEqual([]);
    expect(input.dataReviewStatus).toBe("UNREVIEWED");
  });
});
