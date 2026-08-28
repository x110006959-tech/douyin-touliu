import { describe, expect, it } from "vitest";
import {
  extensionCollectionProtocolVersion,
  liveScreenPulseCoreMetricKeys
} from "@douyin-local-life/shared";
import {
  livePulseButtonState,
  livePulseMetricCoverage,
  localPromotionPulseMetricCoverage,
  livePulseOutcomeMessage,
  livePulseStatusText,
  normalizeLivePulseMetricKeys,
  parseLivePulseOutcome,
  safeLivePulseFailureReason
} from "./live-pulse-status";

const outcomeVersion = {
  buildFingerprint: "current-build",
  collectionProtocolVersion: extensionCollectionProtocolVersion
} as const;

const outcomeContext = {
  ...outcomeVersion,
  endpointKeys: ["key_index"]
} as const;

describe("live pulse status", () => {
  it("keeps a schema failure actionable after the active session has stopped", () => {
    const outcome = {
      taskId: "task-1",
      reason: "SCHEMA_MISMATCH",
      endpoint: "key_index",
      occurredAt: "2026-08-10T10:00:00.000Z",
      failure: true,
      ...outcomeVersion
    } as const;

    expect(livePulseStatusText({ active: false, lastOutcome: outcome }, true)).toBe(
      "API 响应结构不匹配（key_index），已停止。"
    );
    expect(livePulseOutcomeMessage(outcome)).toContain("已停止");
  });

  it("does not replace an active session status with an old failure", () => {
    expect(livePulseStatusText({ active: true, successCount: 0 }, true)).toBe("API 已启动，正在发起首轮请求");
  });

  it("keeps the session active while honoring the server retry window", () => {
    expect(livePulseStatusText({
      active: true,
      rateLimitedUntil: new Date(Date.now() + 5_000).toISOString()
    }, true)).toContain("Retry-After");
  });

  it("shows the first and second checked failure while the pulse is still active", () => {
    expect(livePulseStatusText({
      active: true,
      consecutiveFailures: 1,
      lastFailureReason: "PULSE_KEY_INDEX_NO_USABLE_METRICS",
      lastFailureEndpoint: "key_index"
    }, true)).toContain("第 1/3 次失败（key_index）");
    expect(livePulseStatusText({
      active: true,
      consecutiveFailures: 2,
      lastFailureReason: "HTTP_503",
      lastFailureEndpoint: "key_index"
    }, true)).toContain("第 2/3 次失败（key_index）");
  });

  it("offers restart after a failed active session stops", () => {
    expect(livePulseButtonState({ active: true }, true, true)).toEqual({
      text: "停止 API 持续采集",
      disabled: false
    });
    expect(livePulseButtonState({ active: false }, true, true)).toEqual({
      text: "开始 API 持续采集",
      disabled: false
    });
  });

  it("keeps the live action disabled until pairing and the internal API are both verified", () => {
    expect(livePulseButtonState({ active: false }, false, true).disabled).toBe(true);
    expect(livePulseButtonState({ active: false }, true, false).disabled).toBe(true);
  });

  it("reports complete seven-metric coverage in the shared core order", () => {
    const suppliedKeys = [
      "product_conversion_rate",
      "orders",
      "gmv",
      "average_watch_duration_seconds",
      "current_online_viewers",
      "gpm",
      "transaction_users"
    ];

    expect(livePulseMetricCoverage(suppliedKeys)).toEqual({
      keys: [...liveScreenPulseCoreMetricKeys],
      count: 7,
      total: 7,
      presentLabels: [
        "直播间成交金额",
        "在线人数",
        "人均观看时长",
        "千次观看成交金额",
        "成交订单数",
        "成交人数",
        "商品转化率"
      ],
      missingLabels: []
    });
  });

  it("reports missing labels and filters unknown or duplicate metric keys", () => {
    const suppliedKeys = [
      "orders",
      "unknown_metric",
      "gmv",
      "orders",
      "transaction_users",
      "current_online_viewers",
      "gpm"
    ];

    expect(normalizeLivePulseMetricKeys(suppliedKeys)).toEqual([
      "gmv",
      "current_online_viewers",
      "gpm",
      "orders",
      "transaction_users"
    ]);
    expect(livePulseMetricCoverage(suppliedKeys)).toMatchObject({
      count: 5,
      total: 7,
      missingLabels: ["人均观看时长", "商品转化率"]
    });
  });

  it("reports local promotion coverage using the thirteen target metrics", () => {
    expect(localPromotionPulseMetricCoverage([
      "gmv",
      "full_domain_pay_roi",
      "gmv",
      "unknown_metric"
    ])).toMatchObject({
      count: 2,
      total: 13,
      presentLabels: ["整体成交金额(元)", "全域支付ROI"],
      missingLabels: expect.arrayContaining(["全域消耗(元)", "累计观看次数"])
    });
  });

  it("shows the checked final reason after three consecutive failures", () => {
    const outcome = {
      taskId: "task-1",
      reason: "THREE_CONSECUTIVE_FAILURES",
      endpoint: "statQuery",
      lastFailureReason: "PULSE_METRICS_MISSING",
      occurredAt: "2026-08-11T09:30:00.000Z",
      failure: true,
      ...outcomeVersion
    } as const;

    expect(livePulseOutcomeMessage(outcome)).toContain("API 未返回可用白名单指标");
    expect(livePulseOutcomeMessage(outcome)).toContain("最后端点：statQuery");
    expect(safeLivePulseFailureReason("PULSE_METRICS_MISSING")).toBe("PULSE_METRICS_MISSING");
    expect(safeLivePulseFailureReason("PULSE_KEY_INDEX_NO_USABLE_METRICS")).toBe("PULSE_KEY_INDEX_NO_USABLE_METRICS");
    expect(safeLivePulseFailureReason("NO_USABLE_METRICS")).toBe("NO_USABLE_METRICS");
    expect(safeLivePulseFailureReason("response body: secret=123")).toBeUndefined();
  });

  it("keeps immediate safety-stop endpoints actionable", () => {
    const base = {
      taskId: "task-1",
      routeKey: "LOCAL_PROMOTION_DASHBOARD" as const,
      tabId: 10,
      occurredAt: "2026-08-26T00:00:00.000Z",
      failure: true,
      ...outcomeVersion
    };

    expect(livePulseOutcomeMessage({ ...base, reason: "RATE_LIMITED", endpoint: "metric-pulses" }))
      .toContain("metric-pulses");
    expect(livePulseOutcomeMessage({ ...base, reason: "BYTE_LIMIT", endpoint: "statQuery" }))
      .toContain("statQuery");
  });

  it("keeps identity and page-script stops actionable", () => {
    expect(livePulseOutcomeMessage({
      taskId: "task-1",
      reason: "IDENTITY_CHANGED",
      occurredAt: "2026-08-11T09:30:00.000Z",
      failure: true,
      ...outcomeVersion
    })).toContain("广告身份已变化");
    expect(livePulseOutcomeMessage({
      taskId: "task-1",
      reason: "CONTENT_SCRIPT_UNAVAILABLE",
      occurredAt: "2026-08-11T09:30:00.000Z",
      failure: true,
      ...outcomeVersion
    })).toContain("刷新平台页");
  });

  it("drops a persisted failure from an older extension build", () => {
    expect(parseLivePulseOutcome({
      taskId: "task-1",
      reason: "SCHEMA_MISMATCH",
      endpoint: "room_minute_indicator",
      occurredAt: "2026-08-11T10:00:00.000Z",
      failure: true,
      buildFingerprint: "old-build",
      collectionProtocolVersion: 7
    }, outcomeContext)).toBeNull();
  });

  it("accepts only a failure produced by the current build and protocol", () => {
    expect(parseLivePulseOutcome({
      taskId: "task-1",
      reason: "SCHEMA_MISMATCH",
      endpoint: "key_index",
      occurredAt: "2026-08-11T10:00:00.000Z",
      failure: true,
      ...outcomeVersion
    }, outcomeContext)).toEqual({
      taskId: "task-1",
      reason: "SCHEMA_MISMATCH",
      endpoint: "key_index",
      occurredAt: "2026-08-11T10:00:00.000Z",
      failure: true,
      ...outcomeVersion
    });
  });

  it("keeps an outcome scoped to its source route and tab", () => {
    expect(parseLivePulseOutcome({
      taskId: "task-1",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      tabId: 42,
      reason: "PAGE_NAVIGATED",
      occurredAt: "2026-08-11T10:00:00.000Z",
      failure: true,
      ...outcomeVersion
    }, {
      ...outcomeVersion,
      endpointKeys: ["pageMetrics", "statQuery"]
    })).toMatchObject({
      taskId: "task-1",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      tabId: 42,
      reason: "PAGE_NAVIGATED"
    });
    expect(parseLivePulseOutcome({
      taskId: "task-1",
      routeKey: "OTHER_ROUTE",
      tabId: 42,
      reason: "PAGE_NAVIGATED",
      occurredAt: "2026-08-11T10:00:00.000Z",
      failure: true,
      ...outcomeVersion
    }, {
      ...outcomeVersion,
      endpointKeys: ["pageMetrics", "statQuery"]
    })).toBeNull();
  });
});
