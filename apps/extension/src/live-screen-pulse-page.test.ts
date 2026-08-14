import { describe, expect, it } from "vitest";
import { isExactLiveScreenPage, livePulsePageContext, livePulseRouteDetection } from "./live-screen-pulse-page";

describe("live-screen API pulse page identity", () => {
  it("accepts only the exact live dashboard page, including its supported visual modes", () => {
    expect(isExactLiveScreenPage("https://eos.douyin.com/dp/liveScreen?room_id=123&mode=main")).toBe(true);
    expect(isExactLiveScreenPage("https://eos.douyin.com/dp/liveScreen?room_id=123&mode=product")).toBe(true);
    expect(isExactLiveScreenPage("https://eos.douyin.com/dp/liveScreen/other?room_id=123")).toBe(false);
    expect(isExactLiveScreenPage("https://fake.eos.douyin.com/dp/liveScreen?room_id=123")).toBe(false);
    expect(isExactLiveScreenPage("http://eos.douyin.com/dp/liveScreen?room_id=123")).toBe(false);
  });

  it("uses the room-level route for API pulses without changing a formal snapshot decision", () => {
    expect(livePulseRouteDetection({
      routeKey: "UNKNOWN",
      source: "UNKNOWN",
      confidence: 0,
      manuallyConfirmed: false,
      evidence: ["当前可见区域不足以确定分栏"]
    })).toEqual({
      routeKey: "LIVE_DATA_SCREEN",
      source: "PAGE_TYPE",
      confidence: 0.98,
      manuallyConfirmed: false,
      evidence: ["当前可见区域不足以确定分栏", "实时 API 脉冲：精确直播数据大屏 URL"]
    });
  });

  it("makes a missing room identifier an immediate, fixed startup failure", () => {
    const routeDetection = livePulseRouteDetection({
      routeKey: "UNKNOWN",
      source: "UNKNOWN",
      confidence: 0,
      manuallyConfirmed: false,
      evidence: ["当前可见区域不足以确定分栏"]
    });

    expect(livePulsePageContext({ routeDetection, roomId: null })).toEqual(expect.objectContaining({
      pageType: "LIVE_DATA_SCREEN",
      routeKey: "LIVE_DATA_SCREEN",
      livePulseEligible: false,
      livePulseRoomId: null,
      livePulseFailureCode: "ROOM_ID_UNAVAILABLE"
    }));
    expect(livePulsePageContext({ routeDetection, roomId: "123" })).toEqual(expect.objectContaining({
      routeKey: "LIVE_DATA_SCREEN",
      livePulseEligible: true,
      livePulseRoomId: "123",
      livePulseFailureCode: null
    }));
  });
});
