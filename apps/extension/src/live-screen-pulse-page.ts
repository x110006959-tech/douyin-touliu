import type { CollectionRouteDetection } from "@douyin-local-life/shared/collection-routes";

export type LivePulsePageContext = {
  pageType: "LIVE_DATA_SCREEN";
  routeKey: CollectionRouteDetection["routeKey"];
  routeDetection: CollectionRouteDetection;
  livePulseEligible: boolean;
  livePulseRoomId: string | null;
  livePulseFailureCode: "ROOM_ID_UNAVAILABLE" | null;
};

export function isExactLiveScreenPage(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "eos.douyin.com" && url.pathname === "/dp/liveScreen";
  } catch {
    return false;
  }
}

/**
 * API pulses observe the room-level key_index endpoint. They are not formal
 * snapshots, so an unconfirmed visual tab must not prevent a valid live page
 * from starting its API-only observation loop.
 */
export function livePulseRouteDetection(detected: CollectionRouteDetection): CollectionRouteDetection {
  const evidence = "实时 API 脉冲：精确直播数据大屏 URL";
  return {
    routeKey: "LIVE_DATA_SCREEN",
    source: "PAGE_TYPE",
    confidence: 0.98,
    manuallyConfirmed: false,
    evidence: detected.evidence.includes(evidence) ? [...detected.evidence] : [...detected.evidence, evidence]
  };
}

export function livePulsePageContext(input: {
  routeDetection: CollectionRouteDetection;
  roomId: string | null;
}): LivePulsePageContext {
  const hasRoomId = Boolean(input.roomId);
  const routeDetection = livePulseRouteDetection(input.routeDetection);
  return {
    pageType: "LIVE_DATA_SCREEN",
    routeKey: routeDetection.routeKey,
    routeDetection,
    livePulseEligible: hasRoomId,
    livePulseRoomId: input.roomId,
    livePulseFailureCode: hasRoomId ? null : "ROOM_ID_UNAVAILABLE"
  };
}
