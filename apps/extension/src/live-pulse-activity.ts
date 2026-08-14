import type { CollectionRouteKey, CollectionSnapshotPayload } from "@douyin-local-life/shared";

export type LivePulseActivity = {
  tabId: number;
  currentUrl: string;
  pageType: CollectionSnapshotPayload["pageType"];
  routeKey?: CollectionRouteKey;
  collectable: boolean;
  tabState: "VISIBLE" | "HIDDEN" | "FROZEN" | "DISCARDED" | "UNKNOWN";
  observedAt: string;
  lastError?: string | null;
};

type LivePulseActivityInput = Omit<LivePulseActivity, "tabId">;

export function livePulseActivityForTab(activity: LivePulseActivityInput, tabId: number): LivePulseActivity | null {
  if (!Number.isInteger(tabId) || tabId <= 0 || typeof activity.currentUrl !== "string" || !activity.currentUrl) return null;
  return { ...activity, tabId };
}

export function isLivePulseActivityReporter(livePulseTabId: number | null | undefined, reportingTabId: number | null | undefined) {
  return Number.isInteger(livePulseTabId)
    && Number.isInteger(reportingTabId)
    && livePulseTabId === reportingTabId;
}
