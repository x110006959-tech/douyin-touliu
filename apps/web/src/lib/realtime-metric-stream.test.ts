import { describe, expect, it } from "vitest";
import { createSseEventParser } from "./realtime-metric-stream";

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
});
