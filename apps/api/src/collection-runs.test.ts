import { describe, expect, it } from "vitest";
import { refreshCollectionRunStatus } from "./collection-runs.js";

describe("collection run refresh", () => {
  it("uses the newest snapshot across required and optional routes", async () => {
    const requiredAt = new Date("2026-07-28T12:00:00.000Z");
    const optionalAt = new Date("2026-07-28T12:05:00.000Z");
    let updateData: Record<string, unknown> | null = null;
    const run = {
      id: "run-1",
      taskId: "task-1",
      status: "ACTIVE",
      requiredRoutesJson: ["LIVE_DATA_SCREEN"],
      startedAt: requiredAt,
      lastSnapshotAt: requiredAt,
      completedAt: null,
      routeHealth: []
    };
    const tx = {
      collectionRun: {
        findUnique: async () => run,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return { ...run, ...data };
        }
      },
      dataSnapshot: {
        findFirst: async ({ where }: { where: { collectionRunId?: string; OR?: unknown[] } }) => (
          where.OR ? { id: "required-snapshot" } : { localCollectedAt: optionalAt }
        ),
        findMany: async () => [{
          id: "required-snapshot",
          collectionRunId: "run-1",
          routeKey: "LIVE_DATA_SCREEN",
          pageType: "LIVE_DATA_SCREEN",
          localCollectedAt: requiredAt,
          routeVerificationStatus: "VERIFIED",
          captureMetaJson: {
            completeness: "COMPLETE",
            coverageRatio: 1,
            adapterId: "live",
            adapterVersion: "1",
            pageFingerprint: "fixture",
            expectedFields: [],
            extractedFields: [],
            truncationReasons: []
          }
        }]
      }
    };

    await refreshCollectionRunStatus(tx as never, "run-1");

    expect(updateData).toMatchObject({ lastSnapshotAt: optionalAt });
  });
});
