import { afterEach, describe, expect, it } from "vitest";
import type { MetricPulse, VisibleMetric } from "@douyin-local-life/shared";
import { clearRealtimeSignalStore, recordMetricPulse, subscribeRealtimeSignals } from "./realtime-signals.js";

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
