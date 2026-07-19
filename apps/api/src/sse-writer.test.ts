import { describe, expect, it } from "vitest";
import { createLatestSseWriter, maxSseBufferedBytes } from "./sse-writer.js";

describe("latest SSE writer", () => {
  it("coalesces backpressured updates to the newest signal set", () => {
    const response = new FakeSseResponse();
    const writer = createLatestSseWriter(response, (value: string[]) => value.join(","));

    response.nextWriteReturns = false;
    writer.push(["first"]);
    writer.push(["second"]);
    writer.push(["latest"]);
    expect(response.writes).toEqual(["first"]);

    response.writableLength = 0;
    response.emitDrain();
    expect(response.writes).toEqual(["first", "latest"]);
  });

  it("does not add heartbeats while a latest update is waiting for drain", () => {
    const response = new FakeSseResponse();
    const writer = createLatestSseWriter(response, (value: string) => value);

    response.writableLength = maxSseBufferedBytes + 1;
    writer.push("latest");
    expect(writer.canWriteHeartbeat()).toBe(false);

    writer.close();
    response.writableLength = 0;
    response.emitDrain();
    expect(response.writes).toEqual([]);
  });
});

class FakeSseResponse {
  destroyed = false;
  writableEnded = false;
  writableLength = 0;
  nextWriteReturns = true;
  writes: string[] = [];
  private drainListeners = new Set<() => void>();

  once(_event: "drain", listener: () => void) {
    this.drainListeners.add(listener);
  }

  off(_event: "drain", listener: () => void) {
    this.drainListeners.delete(listener);
  }

  write(chunk: string) {
    this.writes.push(chunk);
    const writable = this.nextWriteReturns;
    this.nextWriteReturns = true;
    return writable;
  }

  emitDrain() {
    const listeners = [...this.drainListeners];
    this.drainListeners.clear();
    for (const listener of listeners) listener();
  }
}
