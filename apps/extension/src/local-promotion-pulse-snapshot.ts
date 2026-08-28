import {
  localPromotionApiMetricKeys,
  localPromotionInternalApiAdapterVersion,
  type CaptureTabState,
  type CollectionSnapshotPayload
} from "@douyin-local-life/shared";
import type { LocalPromotionInternalApiCollection } from "./local-promotion-internal-api";
import { sanitizeSnapshotPayload } from "./safety";

export function createLocalPromotionPulseSnapshot(input: {
  collection: LocalPromotionInternalApiCollection;
  collectionRunId: string | null;
  sourceUrl: string;
  tabState: CaptureTabState;
  collectedAt?: string;
}): CollectionSnapshotPayload {
  const extractedFields = [...new Set(input.collection.metrics.map((metric) => metric.key))]
    .filter((key) => localPromotionApiMetricKeys.includes(key as (typeof localPromotionApiMetricKeys)[number]));
  const successfulBytes = input.collection.captureMeta.endpointStatuses
    .reduce((total, status) => total + status.acceptedBytes, 0);
  const coverageRatio = extractedFields.length / localPromotionApiMetricKeys.length;
  return sanitizeSnapshotPayload({
    pageType: "LOCAL_PROMOTION_DASHBOARD",
    sourceUrl: input.sourceUrl,
    pageTitle: "巨量本地推数据总览",
    rawDomText: "",
    rawNetworkJson: [],
    rawTableData: [],
    visibleMetricsJson: input.collection.metrics,
    screenshotUrl: null,
    localCollectedAt: input.collectedAt || new Date().toISOString(),
    collectionRunId: input.collectionRunId,
    routeKey: "LOCAL_PROMOTION_DASHBOARD",
    captureMeta: {
      adapterId: "local-promotion-internal-api-pulse",
      adapterVersion: localPromotionInternalApiAdapterVersion,
      pageFingerprint: `local-promotion-internal-api-pulse:${localPromotionInternalApiAdapterVersion}`,
      completeness: coverageRatio === 1 ? "COMPLETE" : extractedFields.length ? "PARTIAL" : "UNKNOWN",
      coverageRatio,
      expectedFields: [...localPromotionApiMetricKeys],
      extractedFields,
      visibleRegions: ["internal-api"],
      renderModes: [],
      tabState: input.tabState,
      originalBytes: successfulBytes,
      acceptedBytes: successfulBytes,
      truncatedFields: [],
      truncationReasons: [],
      routeDetection: {
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        source: "PAGE_TYPE",
        confidence: 1,
        manuallyConfirmed: false,
        evidence: ["精确本地推数据总览 URL 与固定内部 API 契约"]
      },
      localPromotionInternalApi: input.collection.captureMeta
    }
  }) as CollectionSnapshotPayload;
}
