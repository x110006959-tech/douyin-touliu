import { z } from "zod";
import { pageTypes, type PageType } from "./collection-capture.js";
import { collectionRouteKeys, type CollectionRouteKey } from "./collection-routes.js";
import type { VisibleMetric } from "./metric-value.js";

export type RealtimeMetricFrame = {
  collectionTaskId: string;
  routeKey: CollectionRouteKey;
  pageType: PageType;
  observedAt: string;
  receivedAt: string;
  metrics: VisibleMetric[];
  successfulEndpoints: string[];
};

export const realtimeMetricFrameFreshnessMs = 60_000;

export function realtimeMetricFrameIsFresh(frame: RealtimeMetricFrame, now = Date.now()) {
  const observedAt = Date.parse(frame.observedAt);
  const receivedAt = Date.parse(frame.receivedAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(receivedAt)) return false;
  const freshestAt = Math.max(observedAt, receivedAt);
  return freshestAt <= now + realtimeMetricFrameFreshnessMs
    && now - freshestAt <= realtimeMetricFrameFreshnessMs;
}

export type RealtimeEvidenceSummary = {
  routeKey: CollectionRouteKey;
  pageType: PageType;
  observedAt: string;
  receivedAt: string;
  metricCount: number;
  successfulEndpoints: string[];
  source: "LIVE_SCREEN_INTERNAL_API" | "LOCAL_PROMOTION_INTERNAL_API";
};

export const realtimeEvidenceSummarySchema = z.object({
  routeKey: z.enum(collectionRouteKeys),
  pageType: z.enum(pageTypes),
  observedAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  metricCount: z.number().int().nonnegative(),
  successfulEndpoints: z.array(z.string().min(1)).max(20),
  source: z.enum(["LIVE_SCREEN_INTERNAL_API", "LOCAL_PROMOTION_INTERNAL_API"])
});

export function realtimeEvidenceRouteMatchesSource(evidence: RealtimeEvidenceSummary) {
  return evidence.source === "LIVE_SCREEN_INTERNAL_API"
    ? evidence.routeKey === "LIVE_DATA_SCREEN" && evidence.pageType === "LIVE_DATA_SCREEN"
    : evidence.routeKey === "LOCAL_PROMOTION_DASHBOARD" && evidence.pageType === "LOCAL_PROMOTION_DASHBOARD";
}
