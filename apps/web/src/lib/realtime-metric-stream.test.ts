import { describe, expect, it } from "vitest";
import { createSseEventParser, usableRealtimeMetrics } from "./realtime-metric-stream";

describe("realtime metric SSE parser", () => {
  it("reassembles chunked pulse events without confusing heartbeats or signals", () => {
    const received: Array<{ event: string; data: string }> = [];
    const parser = createSseEventParser((event) => received.push(event));

    parser.push("event: heartbeat\ndata: {\"at\":\"now\"}\n\nevent: pul");
    parser.push("se\r\ndata: {\"collectionTaskId\":\"task-1\"}\r\n\r\nevent: signals\ndata: []\n\n");

    expect(received).toEqual([
      { event: "heartbeat", data: "{\"at\":\"now\"}" },
      { event: "pulse", data: "{\"collectionTaskId\":\"task-1\"}" },
      { event: "signals", data: "[]" }
    ]);
  });

  it("joins multi-line SSE data", () => {
    const received: string[] = [];
    const parser = createSseEventParser((event) => received.push(event.data));

    parser.push("event: pulse\ndata: first\ndata: second\n\n");

    expect(received).toEqual(["first\nsecond"]);
  });

  it("accepts only fresh metrics from the expected route", () => {
    const now = Date.parse("2026-08-22T12:00:00.000Z");
    const frame = {
      collectionTaskId: "task-1",
      routeKey: "LOCAL_PROMOTION_DASHBOARD" as const,
      pageType: "LOCAL_PROMOTION_DASHBOARD" as const,
      observedAt: new Date(now - 5_000).toISOString(),
      receivedAt: new Date(now - 4_000).toISOString(),
      successfulEndpoints: ["pageMetrics"],
      metrics: [{ key: "spend", name: "消耗", value: "100", source: "network" as const }]
    };

    expect(usableRealtimeMetrics(frame, "LOCAL_PROMOTION_DASHBOARD", now)).toHaveLength(1);
    expect(usableRealtimeMetrics(frame, "LIVE_DATA_SCREEN", now)).toEqual([]);
    expect(usableRealtimeMetrics(frame, "LOCAL_PROMOTION_DASHBOARD", now + 120_000)).toEqual([]);
  });
});
