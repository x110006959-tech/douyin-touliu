import { afterEach, describe, expect, it, vi } from "vitest";
import { bridgeRecoveryRequestTimeoutMs, fetchWithTimeout } from "./request-timeout";
import serviceWorkerSource from "./service-worker.ts?raw";

function functionSource(name: string, nextName: string) {
  const start = serviceWorkerSource.indexOf(`async function ${name}`);
  const end = serviceWorkerSource.indexOf(`\nasync function ${nextName}`, start + 1);
  return serviceWorkerSource.slice(start, end === -1 ? undefined : end);
}

describe("extension request timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps both recovery requests inside the five-second web bridge budget", () => {
    expect(bridgeRecoveryRequestTimeoutMs * 2).toBeLessThan(5_000);
  });

  it("passes the caller timeout budget to context refresh and heartbeat requests", () => {
    expect(functionSource("refreshBoundContext", "apiContext")).toContain("}, timeoutMs);");
    expect(functionSource("reportExtensionHeartbeat", "enqueueSnapshotUpload")).toContain("}, timeoutMs);");
  });

  it("keeps status polling read-only and reports sync heartbeat failures", () => {
    expect(functionSource("getBridgeStatus", "syncCurrentTaskFromBridge")).not.toContain("fetchWithTimeout");
    const syncSource = functionSource("syncCurrentTaskFromBridge", "isPopupSender");
    expect(syncSource).toContain('errorCode: "HEARTBEAT_FAILED"');
    expect(syncSource).toContain("contextRefreshErrorCode(response.status)");
    expect(syncSource).not.toContain('stopLivePulse("TASK_CHANGED")');
  });

  it("confirms the target task heartbeat before persisting an automatic task switch", () => {
    const syncSource = functionSource("syncCurrentTaskFromBridge", "isPopupSender");
    const heartbeatIndex = syncSource.indexOf("reportExtensionHeartbeatForCredentials({");
    const persistIndex = syncSource.indexOf("await chrome.storage.local.set({ [STORAGE.CONFIG]: nextConfig");

    expect(heartbeatIndex).toBeGreaterThan(-1);
    expect(syncSource.slice(heartbeatIndex, persistIndex)).toContain("collectionTaskId: task.id");
    expect(persistIndex).toBeGreaterThan(heartbeatIndex);
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
