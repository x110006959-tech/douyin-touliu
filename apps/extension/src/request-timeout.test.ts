import { afterEach, describe, expect, it, vi } from "vitest";
import { bridgeRecoveryRequestTimeoutMs, fetchWithTimeout } from "./request-timeout";

describe("extension request timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps both recovery requests inside the five-second web bridge budget", () => {
    expect(bridgeRecoveryRequestTimeoutMs * 2).toBeLessThan(5_000);
  });

  it("aborts a hanging request within the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchWithTimeout("http://127.0.0.1:4300/extension/context", {}, 25);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("clears the timeout after a successful response", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal;
      return Promise.resolve(new Response("ok"));
    }));

    await fetchWithTimeout("http://127.0.0.1:4300/version", {}, 25);
    await vi.advanceTimersByTimeAsync(25);

    expect(signal?.aborted).toBe(false);
  });
});
