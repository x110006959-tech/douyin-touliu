import { afterEach, describe, expect, it } from "vitest";
import type { MetricPulse, VisibleMetric } from "@douyin-local-life/shared";
import {
  clearRealtimeSignalStore,
  latestRealtimeMetricFrame,
  recordMetricPulse,
  subscribeRealtimeMetricFrames,
  subscribeRealtimeSignals
} from "./realtime-signals.js";

afterEach(clearRealtimeSignalStore);

describe("realtime signals", () => {
  it("emits factual ROI and order-stall signals without creating action proposals", () => {
    const start = Date.parse("2026-07-12T12:00:00.000Z");
    expect(recordMetricPulse("task-1", pulse(start, [metric("verify_roi", 2), metric("spend", 100), metric("orders", 5)]), start).signals).toEqual([]);
    const result = recordMetricPulse("task-1", pulse(start + 35_000, [metric("verify_roi", 1.4), metric("spend", 180), metric("orders", 5)]), start + 35_000);
    expect(result.signals.map((signal) => signal.kind)).toEqual(expect.arrayContaining(["ROI_CHANGE", "ORDER_STALL"]));
    expect(result.signals.every((signal) => !("actionType" in signal))).toBe(true);
  });

  it("keeps an in-memory bounded pulse history", () => {
    const start = Date.parse("2026-07-12T12:00:00.000Z");
    let count = 0;
    for (let index = 0; index < 250; index += 1) {
      count = recordMetricPulse("task-2", pulse(start + index * 5_000, [metric("spend", index)]), start + index * 5_000).pulseCount;
    }
    expect(count).toBeLessThanOrEqual(180);
  });

  it("notifies active SSE subscribers and stops after unsubscribe", () => {
    const received: number[] = [];
    const unsubscribe = subscribeRealtimeSignals("task-3", (signals) => received.push(signals.length));
    const start = Date.parse("2026-07-12T12:00:00.000Z");
    recordMetricPulse("task-3", pulse(start, [metric("spend", 100)]), start);
    unsubscribe();
    recordMetricPulse("task-3", pulse(start + 35_000, [metric("spend", 180)]), start + 35_000);
    expect(received).toEqual([0]);
  });

  it("publishes the latest metric frame for a live dashboard without persisting a snapshot", () => {
    const received: string[] = [];
    const unsubscribe = subscribeRealtimeMetricFrames("task-4", (frame) => received.push(String(frame.metrics[0]?.value)));
    const start = Date.parse("2026-07-12T12:00:00.000Z");

    const result = recordMetricPulse("task-4", pulse(start, [metric("spend", 100)]), start);
    expect(result.frame).toMatchObject({
      collectionTaskId: "task-4",
      observedAt: new Date(start).toISOString(),
      receivedAt: new Date(start).toISOString(),
      successfulEndpoints: []
    });
    expect(latestRealtimeMetricFrame("task-4", start)?.metrics[0]?.value).toBe(100);
    expect(latestRealtimeMetricFrame("task-4", start + 15 * 60_000 + 1)).toBeNull();
    expect(received).toEqual(["100"]);

    unsubscribe();
    recordMetricPulse("task-4", pulse(start + 5_000, [metric("spend", 120)]), start + 5_000);
    expect(received).toEqual(["100"]);
  });

  it("turns live-room API values into factual trends and manual observation suggestions", () => {
    const start = Date.parse("2026-08-12T12:00:00.000Z");
    recordMetricPulse("task-live", pulse(start, [
      metric("gmv", 100_000),
      metric("current_online_viewers", 100),
      metric("live_viewers", 20_000),
      metric("live_room_click_rate", 0.06),
      metric("gpm", 3_000)
    ]), start);

    const result = recordMetricPulse("task-live", pulse(start + 35_000, [
      metric("gmv", 101_400),
      metric("current_online_viewers", 75),
      metric("live_viewers", 20_120),
      metric("live_room_click_rate", 0.045),
      metric("gpm", 2_400)
    ]), start + 35_000);

    expect(result.signals.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "TRAFFIC_CHANGE",
      "CLICK_RATE_CHANGE",
      "GPM_CHANGE",
      "GMV_MOMENTUM"
    ]));
    expect(result.signals.find((item) => item.kind === "CLICK_RATE_CHANGE")).toMatchObject({
      severity: "CRITICAL",
      suggestion: expect.stringContaining("人工检查")
    });
    expect(result.signals.find((item) => item.kind === "GMV_MOMENTUM")?.message).toContain("折算约");
  });

  it("warns when watch growth is not followed by GMV growth", () => {
    const start = Date.parse("2026-08-12T12:00:00.000Z");
    recordMetricPulse("task-stall", pulse(start, [metric("gmv", 10_000), metric("live_viewers", 5_000)]), start);
    const result = recordMetricPulse("task-stall", pulse(start + 35_000, [metric("gmv", 10_000), metric("live_viewers", 5_030)]), start + 35_000);

    expect(result.signals).toContainEqual(expect.objectContaining({
      kind: "GMV_MOMENTUM",
      severity: "WARNING",
      message: expect.stringContaining("成交金额未增长")
    }));
  });
});

function pulse(at: number, metrics: VisibleMetric[]): MetricPulse {
  return {
    routeKey: "LOCAL_PROMOTION_DASHBOARD",
    pageType: "LOCAL_PROMOTION_DASHBOARD",
    localCapturedAt: new Date(at).toISOString(),
    tabState: "VISIBLE",
    metrics,
    captureMeta: {
      adapterId: "test",
      adapterVersion: "1",
      pageFingerprint: "abc",
      completeness: "COMPLETE",
      coverageRatio: 1,
      expectedFields: metrics.map((item) => String(item.key)),
      extractedFields: metrics.map((item) => String(item.key)),
      visibleRegions: [],
      renderModes: ["DOM"],
      tabState: "VISIBLE",
      originalBytes: 100,
      acceptedBytes: 100,
      truncatedFields: [],
      truncationReasons: []
    }
  };
}

function metric(key: string, value: number): VisibleMetric {
  return { key, name: key, value, source: "manual", metricSource: "MANUAL_INPUT", confidence: 1 };
}
