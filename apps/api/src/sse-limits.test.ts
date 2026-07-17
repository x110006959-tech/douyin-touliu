import { afterEach, describe, expect, it, vi } from "vitest";
import { closeAllSseConnections, getSseConnectionMetrics, registerSseConnectionCloser, reserveSseConnection, resetSseConnectionLimits } from "./sse-limits.js";

afterEach(resetSseConnectionLimits);

describe("SSE connection limits", () => {
  it("caps a user and task at two connections and releases reservations once", () => {
    const first = reserveSseConnection("user-1", "task-1");
    const second = reserveSseConnection("user-1", "task-1");
    const blocked = reserveSseConnection("user-1", "task-1");

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 30 });
    expect(getSseConnectionMetrics().totalConnections).toBe(2);

    if (first.allowed) first.release();
    if (first.allowed) first.release();
    expect(getSseConnectionMetrics().totalConnections).toBe(1);
    expect(reserveSseConnection("user-1", "task-1").allowed).toBe(true);
  });

  it("caps a user across tasks at twenty connections", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(reserveSseConnection("user-1", `task-${index}`).allowed).toBe(true);
    }
    expect(reserveSseConnection("user-1", "task-extra")).toEqual({ allowed: false, retryAfterSeconds: 30 });
  });

  it("closes all active streams during graceful shutdown", () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    registerSseConnectionCloser(closeFirst);
    const unregisterSecond = registerSseConnectionCloser(closeSecond);

    closeAllSseConnections();
    unregisterSecond();
    closeAllSseConnections();

    expect(closeFirst).toHaveBeenCalledTimes(2);
    expect(closeSecond).toHaveBeenCalledTimes(1);
  });
});
