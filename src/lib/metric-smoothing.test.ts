import type { LiveSnapshot } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { evaluateMetricSmoothing } from "./metric-smoothing";

function snapshot(id: string, capturedAt: string, refundRate: number | null): Pick<
  LiveSnapshot,
  | "id"
  | "accountId"
  | "liveRoomName"
  | "capturedAt"
  | "sourceEvidenceId"
  | "sourceQuality"
  | "complaintRate"
  | "badReviewRate"
  | "refundRate"
> {
  return {
    id,
    accountId: "account-1",
    liveRoomName: "测试直播",
    capturedAt: new Date(capturedAt),
    sourceEvidenceId: `evidence-${id}`,
    sourceQuality: "manual_verified",
    complaintRate: null,
    badReviewRate: null,
    refundRate
  };
}

describe("evaluateMetricSmoothing", () => {
  it("requires three increasing samples inside the smoothing window", () => {
    const current = snapshot("3", "2026-07-04T00:02:00.000Z", 0.2);
    const signals = evaluateMetricSmoothing(current, [
      snapshot("1", "2026-07-04T00:00:00.000Z", 0.1),
      snapshot("2", "2026-07-04T00:01:00.000Z", 0.13)
    ]);

    expect(signals.refundRate).toMatchObject({
      values: [0.1, 0.13, 0.2],
      trend: "increasing",
      confirmed: true
    });
  });

  it("does not confirm a single high-value spike", () => {
    const current = snapshot("3", "2026-07-04T00:02:00.000Z", 0.2);
    const signals = evaluateMetricSmoothing(current, [snapshot("2", "2026-07-04T00:01:00.000Z", 0.03)]);

    expect(signals.refundRate).toMatchObject({
      values: [0.03, 0.2],
      trend: "insufficient",
      confirmed: false
    });
  });

  it("ignores samples outside three minutes", () => {
    const current = snapshot("3", "2026-07-04T00:05:00.000Z", 0.2);
    const signals = evaluateMetricSmoothing(current, [
      snapshot("1", "2026-07-04T00:00:00.000Z", 0.1),
      snapshot("2", "2026-07-04T00:04:00.000Z", 0.13)
    ]);

    expect(signals.refundRate).toMatchObject({
      values: [0.13, 0.2],
      trend: "insufficient",
      confirmed: false
    });
  });
});
