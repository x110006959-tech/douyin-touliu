import { describe, expect, it } from "vitest";
import { canKeepLivePulseForUrlUpdate } from "./live-pulse-tab-update";

describe("live pulse tab URL updates", () => {
  it("keeps a live pulse for a same-room history update", () => {
    expect(canKeepLivePulseForUrlUpdate({ routeKey: "LIVE_DATA_SCREEN", identityKey: "123" }, "https://eos.douyin.com/dp/liveScreen?room_id=room-1"))
      .toBe(false);
    expect(canKeepLivePulseForUrlUpdate({ routeKey: "LIVE_DATA_SCREEN", identityKey: "123" }, "https://eos.douyin.com/dp/liveScreen?room_id=123&tab=trend"))
      .toBe(true);
  });

  it("stops when a live pulse URL loses or changes its trusted room", () => {
    expect(canKeepLivePulseForUrlUpdate({ routeKey: "LIVE_DATA_SCREEN", identityKey: "123" }, "https://eos.douyin.com/dp/liveScreen?room_id=456"))
      .toBe(false);
    expect(canKeepLivePulseForUrlUpdate({ routeKey: "LIVE_DATA_SCREEN", identityKey: "123" }, "https://eos.douyin.com/dp/liveScreen"))
      .toBe(false);
    expect(canKeepLivePulseForUrlUpdate({ routeKey: "LIVE_DATA_SCREEN", identityKey: "123" }, "https://eos.douyin.com/dp/liveScreen?room_id=123&room_id=456"))
      .toBe(false);
  });

  it("keeps a local-promotion pulse only for the same complete URL identity", () => {
    const identityKey = JSON.stringify({
      advid: "1870840348951692",
      roomId: "7674474231211952905",
      selectedAdvid: "1870840348951692",
      selectedAwemeId: "2294020472581562"
    });
    expect(canKeepLivePulseForUrlUpdate(
      { routeKey: "LOCAL_PROMOTION_DASHBOARD", identityKey },
      "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=1870840348951692&room_id=7674474231211952905&selected_advid=1870840348951692&selected_aweme_id=2294020472581562&tab=trend"
    )).toBe(true);
    expect(canKeepLivePulseForUrlUpdate(
      { routeKey: "LOCAL_PROMOTION_DASHBOARD", identityKey },
      "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=1870840348951692&room_id=7674474231211952905&selected_advid=1870840348951692&selected_aweme_id=999"
    )).toBe(false);
  });
});
