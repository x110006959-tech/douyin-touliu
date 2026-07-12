import { describe, expect, it } from "vitest";
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
});
