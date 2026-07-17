import { describe, expect, it } from "vitest";
import { decisionEvidenceFingerprint } from "./decision-evidence.js";

const baseTask = {
  project: { id: "project-1", updatedAt: new Date("2026-07-16T12:00:00.000Z") },
  snapshots: [{
    id: "snapshot-1",
    routeKey: "LIVE_DATA_SCREEN",
    pageType: "LIVE_DATA_SCREEN",
    collectionRunId: "run-1",
    localCollectedAt: new Date("2026-07-16T12:00:00.000Z"),
    createdAt: new Date("2026-07-16T12:00:00.000Z"),
    accountMatchStatus: "MATCHED",
    routeVerificationStatus: "VERIFIED",
    accountConfirmedAt: new Date("2026-07-16T12:00:00.000Z"),
    routeConfirmedAt: null,
    updatedAt: new Date("2026-07-16T12:00:00.000Z")
  }],
  reviewedMetrics: [{
    id: "review-1",
    snapshotId: "snapshot-1",
    reviewStatus: "CONFIRMED",
    reviewedValue: "1.2",
    updatedAt: new Date("2026-07-16T12:00:00.000Z")
  }],
  collectionRuns: [{ id: "run-1", updatedAt: new Date("2026-07-16T12:00:00.000Z") }],
  routeSources: [{
    routeKey: "LIVE_DATA_SCREEN",
    required: true,
    sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=main",
    status: "CAPTURED",
    updatedAt: new Date("2026-07-16T12:00:00.000Z")
  }]
};

describe("decisionEvidenceFingerprint", () => {
  it("changes when current evidence, review, run, or configuration changes", () => {
    const baseline = decisionEvidenceFingerprint(baseTask);

    expect(decisionEvidenceFingerprint({
      ...baseTask,
      snapshots: [{ ...baseTask.snapshots[0], id: "snapshot-2", localCollectedAt: new Date("2026-07-16T12:01:00.000Z") }]
    })).not.toBe(baseline);
    expect(decisionEvidenceFingerprint({
      ...baseTask,
      reviewedMetrics: [{ ...baseTask.reviewedMetrics[0], reviewedValue: "1.3", updatedAt: new Date("2026-07-16T12:01:00.000Z") }]
    })).not.toBe(baseline);
    expect(decisionEvidenceFingerprint({
      ...baseTask,
      collectionRuns: [{ ...baseTask.collectionRuns[0], updatedAt: new Date("2026-07-16T12:01:00.000Z") }]
    })).not.toBe(baseline);
    expect(decisionEvidenceFingerprint({
      ...baseTask,
      routeSources: [{ ...baseTask.routeSources[0], sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=product", updatedAt: new Date("2026-07-16T12:01:00.000Z") }]
    })).not.toBe(baseline);
  });
});
