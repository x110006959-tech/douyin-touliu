import { afterEach, describe, expect, it, vi } from "vitest";
import { extensionCollectionProtocolVersion, type MetricPulse } from "@douyin-local-life/shared";
import { metricPulseUploadTimeoutMs, uploadMetricPulseRequest } from "./metric-pulse-upload";

describe("metric pulse upload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the local upload timeout below the five-second pulse cadence", () => {
    expect(metricPulseUploadTimeoutMs).toBeLessThan(5_000);
  });

  it("aborts an in-flight upload when pulse execution stops", async () => {
    const caller = new AbortController();
    vi.stubGlobal("fetch", hangingFetch());

    const pending = uploadMetricPulseRequest({ url: "http://127.0.0.1/pulse", token: "test-token", pulse: pulse(), signal: caller.signal });
    caller.abort();

    await expect(pending).resolves.toEqual({ ok: false, error: "PULSE_UPLOAD_ABORTED" });
  });

  it("aborts the entire response operation when the upload budget expires", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", hangingFetch());

    const pending = uploadMetricPulseRequest({ url: "http://127.0.0.1/pulse", token: "test-token", pulse: pulse(), timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toEqual({ ok: false, error: "PULSE_UPLOAD_TIMEOUT" });
  });

  it("returns the stable server error code and bounded Retry-After without exposing the response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "RATE_LIMITED", detail: "do-not-expose" } }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": "3" }
    })));

    await expect(uploadMetricPulseRequest({ url: "http://127.0.0.1/pulse", token: "test-token", pulse: pulse() }))
      .resolves.toEqual({ ok: false, status: 429, error: "RATE_LIMITED", retryAfterMs: 3_000 });
  });

  it("treats any HTTP 2xx response as upload success and ignores analysis fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        pulseCount: 8,
        signals: [{
          id: "task:GPM_CHANGE:now",
          kind: "GPM_CHANGE",
          severity: "WARNING",
          message: "近30秒 GPM 下降 20%",
          suggestion: "人工核对讲解节奏。",
          observedAt: "2026-08-12T12:00:35.000Z",
          evidence: { responseBody: "not-retained" }
        }]
      }
    }), { status: 202, headers: { "content-type": "application/json" } })));

    await expect(uploadMetricPulseRequest({ url: "http://127.0.0.1/pulse", token: "test-token", pulse: pulse() }))
      .resolves.toEqual({ ok: true });
  });

  it("does not require a response body on successful uploads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(uploadMetricPulseRequest({ url: "http://127.0.0.1/pulse", token: "test-token", pulse: pulse() }))
      .resolves.toEqual({ ok: true });
  });
});

function hangingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }));
}

function pulse(): MetricPulse {
  return {
    collectionRunId: null,
    routeKey: "LIVE_DATA_SCREEN",
    pageType: "LIVE_DATA_SCREEN",
    localCapturedAt: new Date(0).toISOString(),
    tabState: "VISIBLE",
    metrics: [],
    captureMeta: {
      adapterId: "test",
      adapterVersion: "1",
      pageFingerprint: "test",
      completeness: "UNKNOWN",
      coverageRatio: 0,
      expectedFields: [],
      extractedFields: [],
      visibleRegions: [],
      renderModes: ["DOM"],
      tabState: "VISIBLE",
      originalBytes: 0,
      acceptedBytes: 0,
      truncatedFields: [],
      truncationReasons: []
    },
    sourceUrl: "https://eos.douyin.com/dp/liveScreen",
    captureProtocolVersion: extensionCollectionProtocolVersion
  };
}
