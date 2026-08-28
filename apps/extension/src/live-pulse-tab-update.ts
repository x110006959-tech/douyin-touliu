import {
  isExactLocalPromotionInternalApiPage,
  localPromotionIdentityKey,
  resolveLocalPromotionIdentity,
  resolveLiveScreenRoomId
} from "@douyin-local-life/shared";
import { isExactLiveScreenPage } from "./live-screen-pulse-page";

export type LivePulseTabUpdateState = {
  routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD";
  identityKey: string;
};

/**
 * A history/replaceState URL update may be emitted without a real page load.
 * Keep the pulse only when the exact source route and its trusted identity are
 * unchanged; a loading event is handled separately by the worker as a hard
 * navigation stop.
 */
export function canKeepLivePulseForUrlUpdate(state: LivePulseTabUpdateState, nextUrl: string) {
  if (state.routeKey === "LIVE_DATA_SCREEN") {
    return isExactLiveScreenPage(nextUrl) && liveScreenIdentityFromUrl(nextUrl) === state.identityKey;
  }
  if (!isExactLocalPromotionInternalApiPage(nextUrl)) return false;
  const identity = resolveLocalPromotionIdentity({ url: nextUrl });
  return identity.source !== "MISMATCH"
    && Boolean(identity.advid || identity.selectedAdvid)
    && localPromotionIdentityKey(identity) === state.identityKey;
}

function liveScreenIdentityFromUrl(value: string) {
  try {
    const url = new URL(value);
    return resolveLiveScreenRoomId({
      urlRoomIds: url.searchParams.getAll("room_id"),
      domRoomIds: []
    }).value;
  } catch {
    return null;
  }
}
