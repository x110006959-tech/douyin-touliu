import { describe, expect, it } from "vitest";
import { selectPageAdapter } from "./page-adapters";

describe("local promotion page adapter", () => {
  it("keeps overall and full-domain payment ROI as separate metrics", () => {
    const input = {
      document: {} as Document,
      url: "https://localads.chengzijianzhan.cn/dashboard",
      title: "巨量本地推数据总览",
      visibleText: "整体支付ROI\n1.25\n全域支付ROI\n1.58\n消耗\n1,000\n成交订单数\n20",
      tables: []
    };
    const adapter = selectPageAdapter(input);
    const metrics = adapter.extractMetrics(input);
    expect(adapter.pageType).toBe("LOCAL_PROMOTION_DASHBOARD");
    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pay_roi", value: 1.25 }),
      expect.objectContaining({ key: "full_domain_pay_roi", value: 1.58 }),
      expect.objectContaining({ key: "spend", value: 1_000 }),
      expect.objectContaining({ key: "orders", value: 20 })
    ]));
  });

  it("uses one-shot manual route confirmation for local promotion route adapters", () => {
    expect(selectPageAdapter({
      document: {} as Document,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      title: "",
      visibleText: "",
      tables: [],
      routeKey: "LOCAL_PROMOTION_DASHBOARD"
    }).pageType).toBe("LOCAL_PROMOTION_DASHBOARD");

    expect(selectPageAdapter({
      document: {} as Document,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2",
      title: "",
      visibleText: "",
      tables: [],
      routeKey: "TASK_TABLE"
    }).pageType).toBe("TASK_TABLE");
  });
});

describe("live overview page adapter", () => {
  it("extracts GPM from the visible live dashboard", () => {
    const input = {
      document: {} as Document,
      url: "https://eos.douyin.com/dp/liveScreen?tab=trend&mode=main",
      title: "直播数据大屏",
      visibleText: "直播间成交金额\n659,571\n千次观看成交金额\n7,530.73元\n成交订单数\n13,527",
      tables: [],
      routeKey: "LIVE_DATA_SCREEN" as const
    };
    const adapter = selectPageAdapter(input);
    const metrics = adapter.extractMetrics(input);
    expect(adapter.version).toBe("1.2.0");
    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "gpm", value: 7_530.73, unit: "yuan" }),
      expect.objectContaining({ key: "orders", value: 13_527 })
    ]));
  });
});
