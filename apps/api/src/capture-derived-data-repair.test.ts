import { describe, expect, it } from "vitest";
import {
  inspectCurrentVerifiedCaptureDerivedData,
  repairCurrentVerifiedCaptureDerivedData
} from "./capture-derived-data-repair.js";

const collectedAt = new Date("2026-07-28T12:00:00.000Z");

describe("capture derived-data repair", () => {
  it("repairs verified evidence and leaves MANUAL_PENDING evidence untouched", async () => {
    const fixture = repairFixture({ complete: false });

    const result = await repairCurrentVerifiedCaptureDerivedData(fixture.tx as never, "task-1");

    expect(result).toMatchObject({
      taskId: "task-1",
      repairedSnapshotIds: ["verified"],
      repairedRouteKeys: ["LOCAL_PROMOTION_DASHBOARD"],
      normalizedMetricCount: 1,
      reviewedMetricCount: 1
    });
    expect(fixture.calls).toEqual(expect.arrayContaining([
      "normalized",
      "reviewed",
      "route",
      "heartbeat",
      "task"
    ]));
    expect(fixture.calls.join(",")).not.toContain("pending");
  });

  it("dry-run reports the same gaps without writing data", async () => {
    const fixture = repairFixture({ complete: false });

    const result = await inspectCurrentVerifiedCaptureDerivedData(fixture.tx as never, "task-1");

    expect(result).toMatchObject({
      repairedSnapshotIds: ["verified"],
      normalizedMetricCount: 1,
      reviewedMetricCount: 1
    });
    expect(fixture.calls).toEqual([]);
  });

  it("is idempotent when all derived records and statuses already exist", async () => {
    const fixture = repairFixture({ complete: true });

    const result = await repairCurrentVerifiedCaptureDerivedData(fixture.tx as never, "task-1");

    expect(result).toEqual({
      taskId: "task-1",
      repairedSnapshotIds: [],
      normalizedMetricCount: 0,
      reviewedMetricCount: 0,
      repairedRouteKeys: []
    });
    expect(fixture.calls).toEqual([]);
  });
});

function repairFixture({ complete }: { complete: boolean }) {
  const calls: string[] = [];
  let normalizedCreated = complete;
  let reviewedCreated = complete;
  const normalized = () => normalizedCreated ? [{
    id: "normalized-verified",
    metricKey: "spend",
    metricName: "消耗",
    metricValue: "100",
    metricUnit: null,
    metricSource: "DOM_TEXT",
    confidence: 0.6,
    rawEvidence: null,
    reviewedMetric: reviewedCreated ? { id: "reviewed-verified" } : null
  }] : [];
  const verified = () => snapshot("verified", "LOCAL_PROMOTION_DASHBOARD", "VERIFIED", normalized());
  const pending = () => snapshot("pending", "LIVE_DATA_SCREEN", "MANUAL_PENDING", []);
  const healthyHeartbeat = {
    routeKey: "LOCAL_PROMOTION_DASHBOARD",
    consecutiveFailures: 0,
    lastAttemptAt: collectedAt,
    lastSuccessAt: collectedAt,
    lastErrorCode: null,
    lastError: null
  };

  const tx = {
    collectionTask: {
      findUnique: async () => ({
        id: "task-1",
        status: complete ? "UPLOADED" : "REVIEWING",
        finishedAt: complete ? collectedAt : null,
        project: { workspaceId: "workspace-1" },
        routeSources: [
          {
            routeKey: "LOCAL_PROMOTION_DASHBOARD",
            status: complete ? "CAPTURED" : "PENDING",
            lastCapturedAt: complete ? collectedAt : null,
            lastError: null
          },
          { routeKey: "LIVE_DATA_SCREEN", status: "PENDING", lastCapturedAt: null, lastError: null }
        ],
        collectionRuns: [{
          id: "run-1",
          status: "ACTIVE",
          lastSnapshotAt: complete ? collectedAt : null,
          routeHealth: complete ? [healthyHeartbeat] : []
        }]
      }),
      update: async () => { calls.push("task"); return null; }
    },
    dataSnapshot: {
      findFirst: async ({ where }: { where: { OR?: Array<{ routeKey?: string }> } }) => {
        if (!where.OR) return { localCollectedAt: collectedAt };
        const routeKey = where.OR[0]?.routeKey;
        return { id: routeKey === "LIVE_DATA_SCREEN" ? "pending" : "verified" };
      },
      findMany: async () => [verified(), pending()],
      findUniqueOrThrow: async () => ({ ...verified(), normalizedMetrics: normalized() })
    },
    metricAliasOverride: { findMany: async () => [] },
    normalizedMetric: {
      createMany: async () => {
        normalizedCreated = true;
        calls.push("normalized");
        return { count: 1 };
      }
    },
    reviewedMetric: {
      findMany: async () => reviewedCreated ? [{
        id: "reviewed-verified",
        normalizedMetricId: "normalized-verified",
        reviewStatus: "PENDING",
        createdAt: collectedAt,
        metricKey: "spend"
      }] : [],
      createMany: async () => {
        reviewedCreated = true;
        calls.push("reviewed");
        return { count: 1 };
      }
    },
    collectionRouteSource: {
      updateMany: async () => { calls.push("route"); return { count: 1 }; }
    },
    collectionRouteHeartbeat: {
      upsert: async () => { calls.push("heartbeat"); return healthyHeartbeat; }
    },
    collectionRun: {
      findUnique: async () => ({
        id: "run-1",
        taskId: "task-1",
        status: "ACTIVE",
        requiredRoutesJson: ["LOCAL_PROMOTION_DASHBOARD"],
        startedAt: collectedAt,
        lastSnapshotAt: complete ? collectedAt : null,
        completedAt: null,
        stoppedAt: null,
        createdAt: collectedAt,
        updatedAt: collectedAt,
        routeHealth: complete ? [healthyHeartbeat] : []
      }),
      update: async () => { calls.push("run"); return null; }
    }
  };

  return { calls, tx };
}

function snapshot(
  id: string,
  routeKey: string,
  routeVerificationStatus: "VERIFIED" | "MANUAL_PENDING",
  normalizedMetrics: unknown[]
) {
  return {
    id,
    taskId: "task-1",
    pageType: routeKey === "LOCAL_PROMOTION_DASHBOARD" ? "LOCAL_PROMOTION_DASHBOARD" : "LIVE_DATA_SCREEN",
    routeKey,
    routeVerificationStatus,
    visibleMetricsJson: [{
      key: "spend",
      name: "消耗",
      value: 100,
      source: "dom",
      metricSource: "DOM_TEXT",
      confidence: 0.6
    }],
    captureMetaJson: null,
    localCollectedAt: collectedAt,
    createdAt: collectedAt,
    collectionRunId: "run-1",
    normalizedMetrics
  };
}
