import type { CollectionRouteKey, CollectionSnapshotPayload } from "@douyin-local-life/shared";
import type { LivePulseActivity } from "./live-pulse-activity";
import type { LivePulseOutcome } from "./live-pulse-status";

export type CollectionSessionState = {
  taskId: string;
  collectionRunId: string;
  requiredRoutes: CollectionRouteKey[];
  startedAt: string;
};

export type PageActivity = {
  currentUrl: string;
  pageType: CollectionSnapshotPayload["pageType"];
  routeKey?: CollectionRouteKey;
  collectable: boolean;
  tabState: "VISIBLE" | "HIDDEN" | "FROZEN" | "DISCARDED" | "UNKNOWN";
  observedAt: string;
  lastError?: string | null;
};

export type RouteUploadState = Record<string, { fingerprint: string; lastUploadAt: number; consecutiveFailures: number }>;

export type PendingPairingConfirmation = {
  apiBaseUrl: string;
  code: string;
  label: string;
  account: { id: string; accountName: string };
  task: { id: string; pageTitle: string | null; projectId: string; projectName: string } | null;
  expiresAt: string;
  requestedAt: string;
};

export type PairingExchangeInput = Pick<PendingPairingConfirmation, "apiBaseUrl" | "code" | "label">;

export type PulseState = {
  loopId: string;
  tabId: number;
  taskId: string;
  identityKey: string;
  routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD";
  currentUrl: string;
  collectionRunId: string | null;
  startedAt: string;
  consecutiveFailures: number;
  successCount: number;
  lastSuccessAt: string | null;
  lastMetricCount: number;
  lastMetricKeys: string[];
  lastFailureReason: string | null;
  lastFailureEndpoint: string | null;
  rateLimitedUntil: string | null;
  uploadController: AbortController | null;
};

export type StoredPulseState = Omit<PulseState, "uploadController"> & {
  buildFingerprint: string;
  collectionProtocolVersion: number;
};

export type StoredPulseStateMap = Record<string, StoredPulseState>;
export type StoredPulseActivityMap = Record<string, LivePulseActivity>;
export type StoredPulseOutcomeMap = Record<string, LivePulseOutcome>;
