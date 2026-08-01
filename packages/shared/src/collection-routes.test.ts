import { describe, expect, it } from "vitest";
import { assessCollectionQuality, detectActiveCollectionRoute, inferCollectionRoute, isSupportedCollectionUrl, isTrustedExtensionCollectionUrl } from "./collection-routes";

describe("collection routes", () => {
  it("prefers fixed target page semantics over a broad page type", () => {
    expect(inferCollectionRoute({ pageType: "LOCAL_PROMOTION_DASHBOARD", sourceUrl: "https://example.com/material/list" })).toBe("MATERIAL_LIBRARY");
    expect(inferCollectionRoute({ pageType: "UNKNOWN", sourceUrl: "https://example.com/hourly-trend" })).toBe("HOURLY_TREND");
    expect(inferCollectionRoute({ pageType: "LIVE_DATA_SCREEN", pageTitle: "商品列表" })).toBe("LIVE_PRODUCT_TAB");
    expect(inferCollectionRoute({ pageType: "LIVE_DATA_SCREEN", pageTitle: "流量分析" })).toBe("LIVE_TRAFFIC_TAB");
  });

  it("accepts the observed live dashboard host without widening unrelated domains", () => {
    expect(isSupportedCollectionUrl("https://localads.chengzijianzhan.cn/lamp/pc/liveboard2")).toBe(true);
    expect(isSupportedCollectionUrl("https://fake-localads.chengzijianzhan.cn/lamp/pc/liveboard2")).toBe(false);
    expect(isSupportedCollectionUrl("https://attacker.example.com")).toBe(false);
  });

  it("keeps extension collection hosts narrower than the legacy URL allowlist", () => {
    expect(isTrustedExtensionCollectionUrl("https://eos.douyin.com/any/user-opened/page")).toBe(true);
    expect(isTrustedExtensionCollectionUrl("https://localads.chengzijianzhan.cn/lamp/pc/liveboard2")).toBe(true);
    expect(isTrustedExtensionCollectionUrl("https://sub.eos.douyin.com/dp/liveScreen")).toBe(false);
    expect(isTrustedExtensionCollectionUrl("http://eos.douyin.com/dp/liveScreen")).toBe(false);
  });

  it("distinguishes live overview, product and traffic sections on the same page", () => {
    expect(detectActiveCollectionRoute({ sourceUrl: "https://eos.douyin.com/dp/liveScreen?tab=trend&mode=main" }).routeKey).toBe("LIVE_DATA_SCREEN");
    expect(detectActiveCollectionRoute({ sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=flow" }).routeKey).toBe("LIVE_TRAFFIC_TAB");
    expect(detectActiveCollectionRoute({ sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=product" }).routeKey).toBe("LIVE_PRODUCT_TAB");
  });

  it("recognizes localads fixed target routes by URL", () => {
    expect(detectActiveCollectionRoute({
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=1837899261171721&room_id=7662599526045485834"
    }).routeKey).toBe("LOCAL_PROMOTION_DASHBOARD");
    expect(detectActiveCollectionRoute({
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2?advid=1837899261171721&promotionType=3"
    }).routeKey).toBe("TASK_TABLE");
  });

  it("does not infer a section from generic navigation labels alone", () => {
    const detected = detectActiveCollectionRoute({
      pageType: "LIVE_DATA_SCREEN",
      sourceUrl: "https://eos.douyin.com/dp/liveScreen",
      visibleText: "概览 商品 流量 视频 营销 评论 违规"
    });
    expect(detected.routeKey).toBe("UNKNOWN");
    expect(detected.source).toBe("UNKNOWN");
  });

  it("uses selected tabs, unique content and one-shot manual confirmation", () => {
    expect(detectActiveCollectionRoute({ selectedTabLabels: ["商品"] }).routeKey).toBe("LIVE_PRODUCT_TAB");
    expect(detectActiveCollectionRoute({ visibleHeadings: ["直播流量", "流量分析"] }).routeKey).toBe("LIVE_TRAFFIC_TAB");
    expect(detectActiveCollectionRoute({ selectedTabLabels: ["商品", "流量"] }).routeKey).toBe("UNKNOWN");
    expect(detectActiveCollectionRoute({ manualOverride: "LIVE_DATA_SCREEN" })).toEqual(expect.objectContaining({
      routeKey: "LIVE_DATA_SCREEN",
      source: "MANUAL",
      manuallyConfirmed: true
    }));
  });

  it("requires a one-shot manual choice when URL and visible live-dashboard evidence disagree", () => {
    const detected = detectActiveCollectionRoute({
      sourceUrl: "https://eos.douyin.com/dp/liveScreen?mode=main",
      selectedTabLabels: ["商品"],
      visibleHeadings: ["商品列表"]
    });

    expect(detected).toEqual(expect.objectContaining({
      routeKey: "UNKNOWN",
      source: "UNKNOWN",
      manuallyConfirmed: false
    }));
  });

  it("marks missing and stale required routes as blocking", () => {
    const now = new Date("2026-07-12T04:00:00.000Z");
    const quality = assessCollectionQuality(
      ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN", "TASK_TABLE"],
      [
        { routeKey: "LOCAL_PROMOTION_DASHBOARD", localCollectedAt: "2026-07-12T03:58:00.000Z" },
        { routeKey: "LIVE_DATA_SCREEN", localCollectedAt: "2026-07-12T03:49:00.000Z" }
      ],
      now
    );
    expect(quality.completeness).toBe(0.33);
    expect(quality.staleRoutes).toEqual(["LIVE_DATA_SCREEN"]);
    expect(quality.missingRoutes).toEqual(["TASK_TABLE"]);
    expect(quality.blocksStrongActions).toBe(true);
  });

  it("accepts fresh and aging routes as a complete batch", () => {
    const now = new Date("2026-07-12T04:00:00.000Z");
    const quality = assessCollectionQuality(
      ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN"],
      [
        { routeKey: "LOCAL_PROMOTION_DASHBOARD", localCollectedAt: "2026-07-12T03:59:00.000Z" },
        { routeKey: "LIVE_DATA_SCREEN", localCollectedAt: "2026-07-12T03:54:00.000Z" }
      ],
      now
    );
    expect(quality.completeness).toBe(1);
    expect(quality.routes.map((route) => route.state)).toEqual(["FRESH", "AGING"]);
    expect(quality.blocksStrongActions).toBe(false);
  });
});
