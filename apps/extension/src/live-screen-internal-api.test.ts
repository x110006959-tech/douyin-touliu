import { describe, expect, it, vi } from "vitest";
import { collectLiveScreenInternalApi, liveScreenInternalApiRequestTimeoutMs, readApprovedFieldValue } from "./live-screen-internal-api";

describe("live screen internal API adapter", () => {
  it("does not upload or retain room ID evidence while the feature is disabled", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await collectLiveScreenInternalApi({
      enabled: false,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.captureMeta.roomId).toBeUndefined();
    expect(result.captureMeta.roomIdEvidence).toBeUndefined();
  });

  it("projects only fixed pulse fields and never retains a response body", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({
      code: 0,
      data: platformKeyIndexData()
    }));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("/life/api/live_screen/v5/key_index");
    expect(result.metrics).toHaveLength(7);
    expect(result.metrics.every((metric) => metric.rawEvidence?.evidencePurpose === "PULSE_ONLY")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("responseJson");
  });

  it("accepts platform-added fields but projects only the fixed key-index whitelist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      code: 0,
      data: {
        ...platformKeyIndexData(),
        platform_added_metadata: { ignored: true }
      }
    })));

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(result.captureMeta.endpointStatuses[0]).toMatchObject({ endpoint: "key_index", status: "SUCCESS" });
    expect(result.metrics.map((metric) => metric.key)).toEqual([
      "gmv",
      "current_online_viewers",
      "average_watch_duration_seconds",
      "gpm",
      "orders",
      "transaction_users",
      "product_conversion_rate"
    ]);
    expect(JSON.stringify(result)).not.toContain("platform_added_metadata");
  });

  it("normalizes the platform status_code/result envelope without widening the field contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      status_code: 0,
      result: platformKeyIndexData({ CurrentUserCnt: { key: "CurrentUserCnt", value: 18 } })
    })));

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(result.metrics).toHaveLength(7);
    expect(result.captureMeta.endpointStatuses[0]).toMatchObject({ endpoint: "key_index", status: "SUCCESS" });
  });

  it("treats null platform metrics as missing values without rejecting valid sibling metrics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      code: 0,
      data: {
        ...platformKeyIndexData(),
        PayGmv: { key: "PayGmv", value: null },
        CurrentUserCnt: { key: "CurrentUserCnt", value: null },
        ClientAvgWatchDuration: { key: "ClientAvgWatchDuration", value: null }
      }
    })));

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(result.captureMeta.endpointStatuses[0]).toMatchObject({ endpoint: "key_index", status: "SUCCESS" });
    expect(result.metrics.map((metric) => metric.key)).toEqual([
      "gpm",
      "orders",
      "transaction_users",
      "product_conversion_rate"
    ]);
  });

  it("labels a successful key-index response with no usable approved metrics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      code: 0,
      data: {
        PayGmv: { key: "PayGmv", value: null },
        CurrentUserCnt: { key: "CurrentUserCnt", value: null },
        ClientAvgWatchDuration: { key: "ClientAvgWatchDuration", value: "not-a-duration" },
        GPM: { key: "GPM", value: null },
        PayOrderCnt: { key: "PayOrderCnt", value: null },
        PayUvAll: { key: "PayUvAll", value: null },
        GoodsCvr: { key: "GoodsCvr", value: null },
        unknown_metric: 99
      }
    })));

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses[0]).toMatchObject({
      endpoint: "key_index",
      status: "SUCCESS",
      reason: "PULSE_KEY_INDEX_NO_USABLE_METRICS"
    });
  });

  it("reads only exact approved paths, including an explicitly reviewed alias", () => {
    const data = {
      primary: null,
      reviewed_alias: 18,
      unapproved_alias: 99
    };

    expect(readApprovedFieldValue(data, ["data.primary", "data.reviewed_alias"])).toEqual({
      value: 18,
      fieldPath: "data.reviewed_alias"
    });
    expect(readApprovedFieldValue(data, ["data.primary"])).toBeNull();
  });

  it("keeps endpoint-level business and HTTP failure reasons", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 7, data: {} }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetch);

    const business = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });
    const http = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(business.captureMeta.endpointStatuses[0]).toMatchObject({ reason: "BUSINESS_ERROR" });
    expect(http.captureMeta.endpointStatuses[0]).toMatchObject({ reason: "HTTP_503" });
  });

  it("rejects sensitive response content before projection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      code: 0,
      data: { CurrentUserCnt: { key: "CurrentUserCnt", value: 12 }, token: "forbidden" }
    })));

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses[0]).toMatchObject({ status: "ABORTED", reason: "SENSITIVE_RESPONSE" });
  });

  it("discards earlier API evidence when a later snapshot endpoint returns sensitive content", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { minute_rows: [{ interval_label: "12:01", live_views: 20 }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { live_viewers: 12, token: "forbidden" } }));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "SNAPSHOT"
    });

    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.minuteRows).toBeUndefined();
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({ status: "ABORTED", reason: "SENSITIVE_RESPONSE" });
  });

  it("normalizes percentage evidence before it reaches the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      code: 0,
      data: platformKeyIndexData()
    })));

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(result.metrics.find((metric) => metric.key === "product_conversion_rate")?.rawEvidence?.normalizedValue).toBe("0.4824");
  });

  it("normalizes average watch duration to seconds while preserving its display value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ code: 0, data: platformKeyIndexData() })));

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    const duration = result.metrics.find((metric) => metric.key === "average_watch_duration_seconds");
    expect(duration?.value).toBe("59.76s");
    expect(duration?.rawEvidence?.normalizedValue).toBe("59.76");
  });

  it("keeps minute rows in formal snapshots without creating a metric from every row", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { minute_rows: [{ interval_label: "12:01", live_views: 20 }, { interval_label: "12:02", live_views: "25" }] }
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {}
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "SNAPSHOT"
    });

    expect(result.metrics).toHaveLength(0);
    expect(result.captureMeta.minuteRows).toEqual([
      { intervalLabel: "12:01", liveViews: "20" },
      { intervalLabel: "12:02", liveViews: "25" }
    ]);
  });

  it("never requests minute trends in a real-time pulse", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
      code: 0,
        data: platformKeyIndexData()
      }))
      .mockResolvedValueOnce(jsonResponse({ unexpected: "minute endpoint must stay uncalled" }));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe("/life/api/live_screen/v5/key_index");
    expect(result.metrics).toHaveLength(7);
    expect(result.captureMeta.minuteRows).toBeUndefined();
  });

  it("reports a hanging key-index request as a bounded endpoint timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")), { once: true });
    })));

    const pending = collectLiveScreenInternalApi({
      enabled: true,
      roomId: "123",
      roomIdSource: "URL",
      roomIdEvidence: { urlRoomIds: ["123"], domRoomIds: [] },
      mode: "PULSE"
    });
    await vi.advanceTimersByTimeAsync(liveScreenInternalApiRequestTimeoutMs);

    await expect(pending).resolves.toMatchObject({
      metrics: [],
      captureMeta: { endpointStatuses: [{ endpoint: "key_index", status: "FAILED", reason: "REQUEST_TIMEOUT" }] }
    });
  });
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function platformKeyIndexData(overrides: Record<string, unknown> = {}) {
  return {
    PayGmv: { key: "PayGmv", value: "78,008" },
    CurrentUserCnt: { key: "CurrentUserCnt", value: 129 },
    ClientAvgWatchDuration: { key: "ClientAvgWatchDuration", value: "59.76s" },
    GPM: { key: "GPM", value: "2,830.9" },
    PayOrderCnt: { key: "PayOrderCnt", value: "10,386" },
    PayUvAll: { key: "PayUvAll", value: "8,084" },
    GoodsCvr: { key: "GoodsCvr", value: "48.24%" },
    ...overrides
  };
}
