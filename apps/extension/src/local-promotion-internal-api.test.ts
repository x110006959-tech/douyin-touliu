import { afterEach, describe, expect, it, vi } from "vitest";
import {
  localPromotionApiMetricKeys,
  localPromotionInternalApiDataSetKey,
  localPromotionInternalApiFields,
  localPromotionInternalApiFrameId,
  localPromotionInternalApiModuleId,
  type LocalPromotionInternalApiMetricGroupKey
} from "@douyin-local-life/shared";
import {
  collectLocalPromotionInternalApi,
  localPromotionInternalApiRequestTimeoutMs
} from "./local-promotion-internal-api";
import contentSource from "./content.ts?raw";
import serviceWorkerSource from "./service-worker.ts?raw";
import { createLocalPromotionPulseSnapshot } from "./local-promotion-pulse-snapshot";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("local promotion internal API adapter", () => {
  it("wires local-promotion pulses to the shared abort controller", () => {
    expect(contentSource).toContain("collectInWorker: true");
    expect(contentSource).not.toContain("collectLocalPromotionInternalApi");
    expect(serviceWorkerSource).toContain("await collectLocalPromotionInternalApi");
    expect(serviceWorkerSource).toContain("signal: collectionController.signal");
    expect(serviceWorkerSource).toContain("payload.loopId !== state.loopId");
    expect(contentSource).toContain("loopId: loop.loopId");
    expect(serviceWorkerSource).toContain("localPromotionIdentityKey(collection.captureMeta.identity) !== state.identityKey");
    expect(serviceWorkerSource).toContain('stopLivePulse("IDENTITY_CHANGED", undefined, undefined, state)');
    expect(serviceWorkerSource).toContain('appendLog("local_promotion_pulse.capture_diagnostics"');
    expect(serviceWorkerSource).toContain('result.status, "metric-pulses", result.retryAfterMs');
    expect(contentSource).toContain("buildFingerprint: __PXXIS_EXTENSION_BUILD__");
    expect(serviceWorkerSource).toContain("pageContext?.buildFingerprint !== __PXXIS_EXTENSION_BUILD__");
    const startSource = serviceWorkerSource.slice(
      serviceWorkerSource.indexOf("async function startLocalPromotionPulse"),
      serviceWorkerSource.indexOf("async function submitLocalPromotionPulse")
    );
    expect(startSource.indexOf("pageContext?.buildFingerprint !== __PXXIS_EXTENSION_BUILD__"))
      .toBeLessThan(startSource.indexOf("const session = await ensureCollectionSession();"));
    expect(startSource).toContain("localPromotionApi.contractVersion !== localPromotionInternalApiContractVersion");
    expect(startSource).toContain("localPromotionApi.adapterVersion !== localPromotionInternalApiAdapterVersion");
    expect(startSource.indexOf("localPromotionApi.contractVersion !== localPromotionInternalApiContractVersion"))
      .toBeLessThan(startSource.indexOf("const session = await ensureCollectionSession();"));
    expect(startSource.indexOf("localPromotionApi.adapterVersion !== localPromotionInternalApiAdapterVersion"))
      .toBeLessThan(startSource.indexOf("const session = await ensureCollectionSession();"));
    expect(startSource.indexOf("localPromotionApi.adapterVersion !== localPromotionInternalApiAdapterVersion"))
      .toBeLessThan(startSource.indexOf("BEGIN_LOCAL_PROMOTION_PULSE_LOOP"));
  });

  it("keeps diagnostics when a usable partial or fallback result still has a reason", () => {
    expect(serviceWorkerSource).toContain("const hasCollectionDiagnostics = collection.captureMeta.endpointStatuses.some((status) => Boolean(status.reason));");
    expect(serviceWorkerSource).toContain("Boolean(collection.diagnostics.statQueryFallback)");
    expect(serviceWorkerSource).toContain("|| hasCollectionDiagnostics");
  });

  it("reads fixed metric definitions, queries fixed stat groups, and never retains the response body", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(statQueryResponse("group_total_data"))
      .mockResolvedValueOnce(statQueryResponse("roi2_promotion"));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch).toHaveBeenNthCalledWith(1,
      `https://localads.chengzijianzhan.cn/api/lamp/pc/v2/statistics/data/pageMetrics?frameId=${localPromotionInternalApiFrameId}&advid=123`,
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store" })
    );
    expect(fetch).toHaveBeenNthCalledWith(2,
      "https://localads.chengzijianzhan.cn/api/lamp/pc/v2/statistics/data/getLiveReportPromoteMeta?iesCoreUserId=789&roomId=456&advid=123",
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store" })
    );
    expect(fetch).toHaveBeenNthCalledWith(3,
      "https://localads.chengzijianzhan.cn/api/lamp/pc/v2/statistics/data/statQuery?advid=123",
      expect.objectContaining({ method: "POST", credentials: "include", cache: "no-store" })
    );
    const totalQuery = JSON.parse(String((fetch.mock.calls[2]![1] as RequestInit).body));
    expect(totalQuery).toMatchObject({
      FrameId: localPromotionInternalApiFrameId,
      ModuleId: localPromotionInternalApiModuleId,
      DataSetKey: localPromotionInternalApiDataSetKey,
      Metrics: [
        "platform_total_watch_count",
        "platform_gmv",
        "platform_orders",
        "platform_gpm",
        "platform_live_viewers",
        "platform_clicks",
        "platform_average_watch_duration_seconds",
        "platform_current_online_viewers"
      ],
      PageParams: { Limit: -1, Offset: 0 }
    });
    expect(totalQuery.Filters.Conditions).toEqual([
      { Field: "room_id", Values: ["456"], Operator: 7 }
    ]);
    const roi2Query = JSON.parse(String((fetch.mock.calls[3]![1] as RequestInit).body));
    expect(roi2Query.Metrics).toEqual([
      "platform_spend",
      "platform_full_domain_gmv",
      "platform_full_domain_orders",
      "platform_full_domain_pay_roi",
      "platform_full_domain_product_clicks"
    ]);
    expect(roi2Query.Filters.Conditions).toEqual([
      { Field: "advertiser_id", Values: ["123"], Operator: 7 },
      { Field: "room_id", Values: ["456"], Operator: 7 },
      { Field: "stat_time", Values: ["1780074000000", "1780243200000"], Operator: 9 },
      { Field: "ad_id", Values: ["10001", "10002"], Operator: 7 }
    ]);
    expect(result.metrics.map((metric) => metric.key)).toEqual([
      ...localPromotionApiMetricKeys
    ]);
    expect(Object.fromEntries(result.metrics.map((metric) => [metric.key, metric.value]))).toEqual({
      total_watch_count: "95400",
      gmv: "308400.00",
      orders: "12900",
      gpm: "3232.60",
      live_viewers: "68500",
      clicks: "124200",
      average_watch_duration_seconds: "72",
      current_online_viewers: "0",
      spend: "4910.57",
      full_domain_gmv: "308200.00",
      full_domain_orders: "12800",
      full_domain_pay_roi: "62.76",
      full_domain_product_clicks: "124400"
    });
    expect(result.metrics.every((metric) => metric.rawEvidence?.evidencePurpose === "PULSE_ONLY")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("platform_spend");
    expect(JSON.stringify(result)).not.toContain("platform_added_metadata");
    expect(JSON.stringify(result)).not.toContain("daily_budget");
  });

  it("resolves trusted metrics from the nested groups shape used by the platform UI", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse(undefined, true))
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(statQueryResponse("group_total_data"))
      .mockResolvedValueOnce(statQueryResponse("roi2_promotion"));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(result.metrics.map((metric) => metric.key)).toEqual([
      ...localPromotionApiMetricKeys
    ]);
  });

  it("does not issue requests without a trusted advertising identity", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2"
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses.every((status) => status.reason === "IDENTITY_UNAVAILABLE")).toBe(true);
  });

  it("does not issue requests from a lookalike or non-approved page", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn:444/lamp/pc/liveboard2?selected_advid=123"
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.captureMeta.endpointStatuses.every((status) => status.reason === "PAGE_FORBIDDEN")).toBe(true);
  });

  it("discards earlier metrics when a later stat group contains sensitive content", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(statQueryResponse("group_total_data"))
      .mockResolvedValueOnce(jsonResponse({ status_code: 0, data: { StatsData: { Totals: {}, token: "forbidden" } } })));

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({ status: "ABORTED", reason: "SENSITIVE_RESPONSE" });
  });

  it("stops immediately when the page-metrics response wrapper drifts", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ result: { ModuleInfos: [] } }))
      .mockResolvedValueOnce(statQueryResponse("group_total_data"));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses).toEqual([
      expect.objectContaining({ endpoint: "pageMetrics", status: "ABORTED", reason: "SCHEMA_MISMATCH" })
    ]);
  });

  it("keeps an approved stat response with no usable metrics endpoint-specific", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(statQueryResponse("group_total_data", false))
      .mockResolvedValueOnce(statQueryResponse("promotion", false))
      .mockResolvedValueOnce(statQueryResponse("roi2_promotion", false)));

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses).toEqual([
      expect.objectContaining({ endpoint: "pageMetrics", status: "SUCCESS" }),
      expect.objectContaining({ endpoint: "liveReportPromoteMeta", status: "SUCCESS" }),
      expect.objectContaining({ endpoint: "statQuery", status: "SUCCESS", reason: "NO_USABLE_METRICS" })
    ]);
  });

  it("keeps a page-metrics transport failure from issuing a stat query", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch: private details"));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses).toEqual([
      expect.objectContaining({ endpoint: "pageMetrics", reason: "REQUEST_FAILED" })
    ]);
    expect(JSON.stringify(result)).not.toContain("private details");
  });

  it.each([
    ["HTTP", () => new Response(null, { status: 503 }), "HTTP_503"],
    ["JSON", () => new Response("{not-json", { status: 200 }), "JSON_PARSE_FAILED"]
  ])("keeps a page-metrics %s failure endpoint-specific", async (_kind, response, expectedReason) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses).toEqual([
      expect.objectContaining({ endpoint: "pageMetrics", reason: expectedReason })
    ]);
  });

  it("times out a page-metrics request with its endpoint preserved", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(hangingRequest));

    const pending = collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });
    await vi.advanceTimersByTimeAsync(localPromotionInternalApiRequestTimeoutMs);

    await expect(pending).resolves.toMatchObject({
      metrics: [],
      captureMeta: {
        endpointStatuses: [expect.objectContaining({ endpoint: "pageMetrics", reason: "REQUEST_TIMEOUT" })]
      }
    });
  });

  it("times out a stat-query request with its endpoint preserved", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockImplementationOnce(hangingRequest);
    vi.stubGlobal("fetch", fetch);

    const pending = collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(localPromotionInternalApiRequestTimeoutMs);

    const result = await pending;
    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({
      endpoint: "statQuery",
      reason: "REQUEST_TIMEOUT"
    });
  });

  it("tries remaining stat-query groups after recoverable failures and retains the first failure reason when none succeed", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "no-store" }), { status: 503 }))
      .mockResolvedValueOnce(new Response("{not-json", { status: 200 }))
      .mockResolvedValueOnce(statQueryResponse("roi2_promotion", false));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses).toEqual([
      expect.objectContaining({ endpoint: "pageMetrics", status: "SUCCESS" }),
      expect.objectContaining({ endpoint: "liveReportPromoteMeta", status: "SUCCESS" }),
      expect.objectContaining({ endpoint: "statQuery", reason: "HTTP_503" })
    ]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps earlier trusted metrics when a later stat-query group has a recoverable failure", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(statQueryResponse("group_total_data"))
      .mockResolvedValueOnce(new Response("{not-json", { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(result.metrics.map((metric) => metric.key)).toEqual([
      "total_watch_count",
      "gmv",
      "orders",
      "gpm",
      "live_viewers",
      "clicks",
      "average_watch_duration_seconds",
      "current_online_viewers"
    ]);
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({ endpoint: "statQuery", status: "SUCCESS", reason: "PARTIAL_METRICS" });
  });

  it("uses the fixed v3 fallback after a v2 stat-query business error", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(jsonResponse({ status_code: 40001, message: "业务暂不可用" }))
      .mockResolvedValueOnce(statQueryResponse("group_total_data"))
      .mockResolvedValueOnce(statQueryResponse("roi2_promotion"));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch).toHaveBeenNthCalledWith(3,
      "https://localads.chengzijianzhan.cn/api/lamp/pc/v2/statistics/data/statQuery?advid=123",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenNthCalledWith(4,
      "https://localads.chengzijianzhan.cn/api/lamp/pc/v3/data/statQuery?advid=123",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.metrics.map((metric) => metric.key)).toEqual([
      ...localPromotionApiMetricKeys
    ]);
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({ endpoint: "statQuery", status: "SUCCESS", reason: "V3_FALLBACK" });
    expect(result.diagnostics?.statQueryFallback).toEqual({ attempted: true, succeeded: true });
  });

  it("keeps later metrics and records a failed v3 fallback reason", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(jsonResponse({ status_code: 40001, message: "业务暂不可用" }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(statQueryResponse("roi2_promotion"));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(result.metrics.map((metric) => metric.key)).toEqual([
      "spend",
      "full_domain_gmv",
      "full_domain_orders",
      "full_domain_pay_roi",
      "full_domain_product_clicks"
    ]);
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({ endpoint: "statQuery", status: "SUCCESS", reason: "PARTIAL_METRICS" });
    expect(result.diagnostics?.statQueryFallback).toEqual({ attempted: true, succeeded: false, failureReason: "HTTP_503" });
  });

  it("does not fall back to v3 after an authentication or rate-limit stop", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({ endpoint: "statQuery", status: "ABORTED", reason: "HTTP_401" });
    expect(result.diagnostics?.statQueryFallback).toBeUndefined();
  });

  it("keeps usable approved metrics when the page exposes only part of the fixed set", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse([
        ...localPromotionInternalApiFields.filter((field) => field.metricKey !== "spend"),
        { ...localPromotionInternalApiFields.find((field) => field.metricKey === "spend")!, metadataLabels: ["未批准标签"] }
      ]))
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(statQueryResponse("group_total_data"))
      .mockResolvedValueOnce(statQueryResponse("roi2_promotion"));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.metrics.map((metric) => metric.key)).toEqual([
      ...localPromotionApiMetricKeys.filter((key) => key !== "spend")
    ]);
    expect(result.captureMeta.endpointStatuses).toEqual([
      expect.objectContaining({ endpoint: "pageMetrics", status: "SUCCESS" }),
      expect.objectContaining({ endpoint: "liveReportPromoteMeta", status: "SUCCESS" }),
      expect.objectContaining({ endpoint: "statQuery", status: "SUCCESS" })
    ]);
  });

  it("matches approved platform labels with display units without widening metric discovery", async () => {
    const gmvField = localPromotionInternalApiFields.find((field) => field.metricKey === "gmv")!;
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse([{ ...gmvField, metadataLabels: ["整体成交金额(元)"] }]))
      .mockResolvedValueOnce(statQueryResponse("group_total_data"));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.metrics.map((metric) => metric.key)).toEqual(["gmv"]);
  });

  it("stops before querying values when no approved metadata labels are present", async () => {
    const fieldsWithoutApprovedLabels = localPromotionInternalApiFields.map((field) => ({
      ...field,
      metadataLabels: ["未批准标签"] as readonly ["未批准标签"]
    }));
    const fetch = vi.fn().mockResolvedValueOnce(pageMetricsResponse(fieldsWithoutApprovedLabels));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({ endpoint: "pageMetrics", reason: "NO_USABLE_METRICS" });
    expect(result.diagnostics).toMatchObject({
      matchedMetricKeys: [],
      missingMetricKeys: [...localPromotionApiMetricKeys]
    });
    expect(result.diagnostics?.metadataGroups[0]?.labels).toEqual(
      Array.from({ length: 8 }, () => "未批准标签")
    );
    expect(JSON.stringify(result.diagnostics)).not.toContain("platform_");
  });

  it("treats duplicate approved metric definitions as fatal schema drift", async () => {
    const duplicatedSpend = localPromotionInternalApiFields.find((field) => field.metricKey === "spend")!;
    const fetch = vi.fn().mockResolvedValueOnce(pageMetricsResponse([
      ...localPromotionInternalApiFields,
      { ...duplicatedSpend }
    ]));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({
      endpoint: "pageMetrics",
      status: "ABORTED",
      reason: "SCHEMA_MISMATCH"
    });
  });

  it("enforces the statQuery byte limit across all fixed group requests", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(statQueryResponse("group_total_data", true, 55 * 1024))
      .mockResolvedValueOnce(statQueryResponse("roi2_promotion", true, 55 * 1024));
    vi.stubGlobal("fetch", fetch);

    const result = await collectLocalPromotionInternalApi({
      enabled: true,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789"
    });

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.metrics).toEqual([]);
    expect(result.captureMeta.endpointStatuses.at(-1)).toMatchObject({
      endpoint: "statQuery",
      status: "ABORTED",
      reason: "BYTE_LIMIT"
    });
  });

  it("builds a route-scoped API-only pulse snapshot in the worker", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(pageMetricsResponse())
      .mockResolvedValueOnce(promoteMetaResponse())
      .mockResolvedValueOnce(statQueryResponse("group_total_data"))
      .mockResolvedValueOnce(statQueryResponse("roi2_promotion"))
      .mockResolvedValueOnce(statQueryResponse("promotion")));
    const sourceUrl = "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&room_id=456&selected_aweme_id=789";
    const collection = await collectLocalPromotionInternalApi({ enabled: true, url: sourceUrl });

    const snapshot = createLocalPromotionPulseSnapshot({
      collection,
      collectionRunId: "run-1",
      sourceUrl,
      tabState: "HIDDEN",
      collectedAt: "2026-08-24T16:00:00.000Z"
    });

    expect(snapshot).toMatchObject({
      pageType: "LOCAL_PROMOTION_DASHBOARD",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      rawDomText: "",
      rawNetworkJson: [],
      rawTableData: [],
      collectionRunId: "run-1",
      captureMeta: {
        adapterId: "local-promotion-internal-api-pulse",
        tabState: "HIDDEN",
        localPromotionInternalApi: { evidencePurpose: "PULSE_ONLY" }
      }
    });
    expect(snapshot.visibleMetricsJson.map((metric) => metric.key)).toEqual([
      ...localPromotionApiMetricKeys
    ]);
  });
});

function pageMetricsResponse(fields = localPromotionInternalApiFields, nested = false) {
  const groups = new Map<LocalPromotionInternalApiMetricGroupKey, Array<Record<string, unknown>>>();
  for (const field of fields) {
    const groupKey = field.groupKeys[0]!;
    const metrics = groups.get(groupKey) || [];
    metrics.push({ Type: 1, Name: platformMetricName(field), NameZh: field.metadataLabels[0] });
    groups.set(groupKey, metrics);
  }
  return jsonResponse({
    status_code: 0,
    data: {
      ModuleInfos: [{
        ModuleId: localPromotionInternalApiModuleId,
        DataSetInfo: {
          Identifier: localPromotionInternalApiDataSetKey,
          DataSetGroupInfos: [...groups.entries()].map(([GroupKey, MetricOrDimension]) => nested
            ? { GroupKey: `container_${GroupKey}`, Groups: [{ GroupKey, MetricOrDimension }] }
            : { GroupKey, MetricOrDimension })
        }
      }],
      platform_added_metadata: { ignored: true }
    }
  });
}

function statQueryResponse(groupKey: LocalPromotionInternalApiMetricGroupKey, includeValues = true, paddingBytes = 0) {
  const totals: Record<string, { Value: string | number }> = {};
  if (includeValues) {
    for (const field of localPromotionInternalApiFields.filter((candidate) => candidate.groupKeys.includes(groupKey))) {
      const values: Record<string, string | number> = {
        total_watch_count: 95400,
        gmv: "308400.00",
        orders: 12900,
        gpm: "3232.60",
        live_viewers: 68500,
        clicks: 124200,
        average_watch_duration_seconds: 72,
        current_online_viewers: 0,
        spend: "4910.57",
        full_domain_gmv: "308200.00",
        full_domain_orders: 12800,
        full_domain_pay_roi: "62.76",
        full_domain_product_clicks: 124400
      };
      totals[platformMetricName(field)] = { Value: values[field.metricKey]! };
    }
  }
  return jsonResponse({
    status_code: 0,
    data: {
      StatsData: { Totals: totals },
      ...(paddingBytes ? { padding: "x".repeat(paddingBytes) } : {})
    }
  });
}

function promoteMetaResponse() {
  return jsonResponse({
    status_code: 0,
    data: {
      data: {
        liveTimeInterval: { startTime: 1780074000, endTime: 1780156800 },
        roi2AdIdsUnderThisAdvID: ["10001", "10002"]
      }
    }
  });
}

function platformMetricName(field: { metricKey: string }) {
  return `platform_${field.metricKey}`;
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function hangingRequest(_input: RequestInfo | URL, init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    const rejectAborted = () => reject(new DOMException("aborted", "AbortError"));
    if (init?.signal?.aborted) rejectAborted();
    else init?.signal?.addEventListener("abort", rejectAborted, { once: true });
  });
}
