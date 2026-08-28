import { describe, expect, it } from "vitest";
import {
  isExactLocalPromotionInternalApiPage,
  localPromotionApiMetricKeys,
  localPromotionInternalApiDataSetKey,
  localPromotionInternalApiEndpointContracts,
  localPromotionInternalApiFields,
  localPromotionInternalApiFrameId,
  localPromotionInternalApiModuleId,
  localPromotionInternalApiPageMetricsRequestSchema,
  localPromotionInternalApiPromoteMetaRequestSchema,
  localPromotionInternalApiRequestSchema,
  localPromotionPulseMetricKeys,
  resolveLocalPromotionIdentity
} from "./local-promotion-internal-api";

describe("local promotion internal API contract", () => {
  it("accepts only the approved liveboard path", () => {
    expect(isExactLocalPromotionInternalApiPage("https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123")).toBe(true);
    expect(isExactLocalPromotionInternalApiPage("https://localads.chengzijianzhan.cn/lamp/pc/liveboard2/extra")).toBe(false);
    expect(isExactLocalPromotionInternalApiPage("https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2")).toBe(false);
    expect(isExactLocalPromotionInternalApiPage("http://localads.chengzijianzhan.cn/lamp/pc/liveboard2")).toBe(false);
    expect(isExactLocalPromotionInternalApiPage("https://localads.chengzijianzhan.cn:444/lamp/pc/liveboard2")).toBe(false);
    expect(isExactLocalPromotionInternalApiPage("https://user@localads.chengzijianzhan.cn/lamp/pc/liveboard2")).toBe(false);
  });

  it("keeps daily budget DOM-only until a stable API field is approved", () => {
    expect(localPromotionPulseMetricKeys).toContain("daily_budget");
    expect(localPromotionApiMetricKeys).not.toContain("daily_budget");
    expect(new Set(Object.values(localPromotionInternalApiEndpointContracts).flatMap((endpoint) => endpoint.fields.map((field) => field.metricKey))))
      .toEqual(new Set(localPromotionApiMetricKeys));
  });

  it("pins the screenshot card set to the two verified platform groups", () => {
    expect(localPromotionApiMetricKeys).toEqual([
      "total_watch_count",
      "gmv",
      "orders",
      "gpm",
      "live_viewers",
      "clicks",
      "average_watch_duration_seconds",
      "current_online_viewers",
      "spend",
      "full_domain_gmv",
      "full_domain_orders",
      "full_domain_pay_roi",
      "full_domain_product_clicks"
    ]);
    expect(localPromotionInternalApiFields.filter((field) => field.groupKeys[0] === "group_total_data").map((field) => field.metricKey))
      .toEqual(localPromotionApiMetricKeys.slice(0, 8));
    expect(localPromotionInternalApiFields.filter((field) => field.groupKeys[0] === "roi2_promotion").map((field) => field.metricKey))
      .toEqual(localPromotionApiMetricKeys.slice(8));
    expect(localPromotionInternalApiFields.map((field) => field.fieldPath).every((path) => path === "data.StatsData.Totals[metric].Value"))
      .toBe(true);
  });

  it("keeps pageMetrics metadata-only and validates the fixed statQuery contract", () => {
    expect(localPromotionInternalApiEndpointContracts.pageMetrics.fields).toHaveLength(0);
    expect(localPromotionInternalApiEndpointContracts.liveReportPromoteMeta.fields).toHaveLength(0);
    expect(localPromotionInternalApiEndpointContracts.liveReportPromoteMeta.path)
      .toBe("/api/lamp/pc/v2/statistics/data/getLiveReportPromoteMeta");
    expect(localPromotionInternalApiEndpointContracts.statQuery.fields.map((field) => field.metricKey))
      .toEqual(expect.arrayContaining(localPromotionApiMetricKeys));
    expect(localPromotionInternalApiEndpointContracts.statQuery.fallbackPaths)
      .toEqual(["/api/lamp/pc/v3/data/statQuery"]);

    expect(localPromotionInternalApiPageMetricsRequestSchema.safeParse({
      frameId: localPromotionInternalApiFrameId,
      advid: "123"
    }).success).toBe(true);
    expect(localPromotionInternalApiPageMetricsRequestSchema.safeParse({
      frameId: "unexpected-frame",
      advid: "123"
    }).success).toBe(false);
    expect(localPromotionInternalApiPageMetricsRequestSchema.safeParse({
      frameId: localPromotionInternalApiFrameId
    }).success).toBe(false);
    expect(localPromotionInternalApiPromoteMetaRequestSchema.safeParse({
      iesCoreUserId: "789",
      roomId: "456",
      advid: "123"
    }).success).toBe(true);

    const validRequest = {
      FrameId: localPromotionInternalApiFrameId,
      ModuleId: localPromotionInternalApiModuleId,
      DataSetKey: localPromotionInternalApiDataSetKey,
      Metrics: ["metric_spend"],
      Filters: {
        ConditionRelationshipType: 1,
        Conditions: [
          { Field: "advertiser_id", Values: ["123"], Operator: 7 },
          { Field: "is_order", Values: ["1"], Operator: 6 }
        ]
      },
      PageParams: { Limit: -1, Offset: 0 }
    };
    expect(localPromotionInternalApiRequestSchema.safeParse(validRequest).success).toBe(true);
    expect(localPromotionInternalApiRequestSchema.safeParse({
      ...validRequest,
      Filters: {
        ConditionRelationshipType: 1,
        Conditions: [
          { Field: "stat_time", Values: ["1780074000000", "1780243200000"], Operator: 9 },
          { Field: "ad_id", Values: ["10001", "10002"], Operator: 7 }
        ]
      }
    }).success).toBe(true);
    expect(localPromotionInternalApiRequestSchema.safeParse({
      ...validRequest,
      Filters: {
        ...validRequest.Filters,
        Conditions: [{ Field: "advertiser_id", Values: ["123"], Operator: "IN" }]
      }
    }).success).toBe(false);
    expect(localPromotionInternalApiRequestSchema.safeParse({
      ...validRequest,
      FrameId: "unexpected-frame"
    }).success).toBe(false);
  });

  it("resolves the fixed identity fields and fails closed on conflicts", () => {
    expect(resolveLocalPromotionIdentity({
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=123&room_id=456&selected_advid=123&selected_aweme_id=789"
    })).toMatchObject({
      advid: "123",
      roomId: "456",
      selectedAdvid: "123",
      selectedAwemeId: "789",
      source: "URL"
    });
    expect(resolveLocalPromotionIdentity({
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123",
      dom: { selectedAdvid: ["456"] }
    }).source).toBe("MISMATCH");
    expect(resolveLocalPromotionIdentity({
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=123&selected_advid=456"
    }).source).toBe("MISMATCH");
    expect(resolveLocalPromotionIdentity({
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?selected_advid=123&selected_advid=not-an-id"
    }).source).toBe("MISMATCH");
    expect(resolveLocalPromotionIdentity({
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      dom: { selectedAdvid: ["123"] }
    })).toMatchObject({ selectedAdvid: "123", source: "DOM" });
  });
});
