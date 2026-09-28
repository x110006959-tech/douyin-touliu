import {
  localPromotionApiMetricKeys,
  localPromotionPulseMetricLabels
} from "./local-promotion-internal-api.js";
import {
  liveScreenPulseCoreMetricKeys,
  liveScreenPulseCoreMetricLabels
} from "./live-screen-internal-api.js";
import {
  metricValueSemantic,
  metricValueText,
  type VisibleMetric
} from "./metric-value.js";
import {
  realtimeMetricFrameIsFresh,
  type RealtimeMetricFrame
} from "./realtime-evidence.js";
import { collectionRouteLabels, type CollectionRouteKey } from "./collection-routes.js";
import type {
  CaptureSummaryMetricDTO,
  MetricReviewStatus
} from "./index.js";
import type {
  DashboardOverviewCandidateDTO,
  DashboardOverviewCandidateStatus,
  DashboardOverviewCardDTO,
  DashboardOverviewSection,
  DashboardOverviewSourceType
} from "./collection-dashboard.js";

type CandidateReference = {
  routeKey: CollectionRouteKey;
  metricKey: string;
};

type OverviewDefinition = {
  displayKey: string;
  label: string;
  scopeLabel: string;
  section: DashboardOverviewSection;
  candidateReferences: CandidateReference[];
};

type CandidateMap = Map<string, DashboardOverviewCandidateDTO[]>;

const liveRealtimeMetricKeySet = new Set<string>(liveScreenPulseCoreMetricKeys);
const localRealtimeMetricKeySet = new Set<string>(localPromotionApiMetricKeys);

const overviewDefinitions: OverviewDefinition[] = [
  definition("live_gmv", "直播间成交金额", "直播间", "LIVE_ROOM", [
    reference("LIVE_DATA_SCREEN", "gmv"),
    reference("LOCAL_PROMOTION_DASHBOARD", "gmv")
  ]),
  definition("live_current_online_viewers", "当前在线人数", "直播间", "LIVE_ROOM", [
    reference("LIVE_DATA_SCREEN", "current_online_viewers"),
    reference("LOCAL_PROMOTION_DASHBOARD", "current_online_viewers")
  ]),
  definition("live_gpm", "千次观看成交金额", "直播间", "LIVE_ROOM", [
    reference("LIVE_DATA_SCREEN", "gpm"),
    reference("LOCAL_PROMOTION_DASHBOARD", "gpm")
  ]),
  definition("live_watch_duration", "人均观看时长", "直播间", "LIVE_ROOM", [
    reference("LIVE_DATA_SCREEN", "average_watch_duration_seconds"),
    reference("LOCAL_PROMOTION_DASHBOARD", "average_watch_duration_seconds")
  ]),
  definition("live_orders", "成交订单数", "直播间", "LIVE_ROOM", [
    reference("LIVE_DATA_SCREEN", "orders"),
    reference("LOCAL_PROMOTION_DASHBOARD", "orders")
  ]),
  definition("live_transaction_users", "成交人数", "直播间", "LIVE_ROOM", [
    reference("LIVE_DATA_SCREEN", "transaction_users")
  ]),
  definition("live_conversion", "商品转化率", "直播间", "LIVE_ROOM", [
    reference("LIVE_DATA_SCREEN", "product_conversion_rate")
  ]),
  definition("local_total_watch_count", "累计观看次数", "本场", "LIVE_ROOM", [
    reference("LOCAL_PROMOTION_DASHBOARD", "total_watch_count")
  ]),
  definition("local_live_viewers", "累计观看人数", "本场", "LIVE_ROOM", [
    reference("LOCAL_PROMOTION_DASHBOARD", "live_viewers")
  ]),
  definition("local_clicks", "累计商品点击次数", "本场", "LIVE_ROOM", [
    reference("LOCAL_PROMOTION_DASHBOARD", "clicks")
  ]),
  definition("local_spend", "全域消耗", "全域", "DELIVERY", [
    reference("LOCAL_PROMOTION_DASHBOARD", "spend")
  ]),
  definition("local_full_domain_gmv", "全域成交金额", "全域", "DELIVERY", [
    reference("LOCAL_PROMOTION_DASHBOARD", "full_domain_gmv")
  ]),
  definition("local_full_domain_orders", "全域成交订单数", "全域", "DELIVERY", [
    reference("LOCAL_PROMOTION_DASHBOARD", "full_domain_orders")
  ]),
  definition("local_full_domain_pay_roi", "全域支付 ROI", "全域", "DELIVERY", [
    reference("LOCAL_PROMOTION_DASHBOARD", "full_domain_pay_roi")
  ]),
  definition("local_full_domain_product_clicks", "全域商品点击次数", "全域", "DELIVERY", [
    reference("LOCAL_PROMOTION_DASHBOARD", "full_domain_product_clicks")
  ])
];

export function buildDashboardOverviewCards(
  summaryMetrics: CaptureSummaryMetricDTO[],
  realtimeFrames: RealtimeMetricFrame[] = [],
  now = Date.now()
): DashboardOverviewCardDTO[] {
  const candidatesByPair: CandidateMap = new Map();
  for (const metric of summaryMetrics) addCandidate(candidatesByPair, summaryCandidate(metric));
  for (const frame of realtimeFrames) {
    if (!isSupportedRealtimeFrame(frame) || !realtimeMetricFrameIsFresh(frame, now)) continue;
    for (const metric of frame.metrics) {
      if (!isSupportedRealtimeMetric(frame.routeKey, metric)) continue;
      addCandidate(candidatesByPair, realtimeCandidate(frame, metric));
    }
  }

  const cards = overviewDefinitions.map((definition) => createCard(definition, candidatesByPair));
  const registeredPairs = new Set(
    overviewDefinitions.flatMap((definition) => definition.candidateReferences.map((item) => candidatePair(item.routeKey, item.metricKey)))
  );
  const genericDefinitions = [...candidatesByPair.entries()]
    .filter(([pair]) => !registeredPairs.has(pair))
    .map(([pair, candidates]) => genericDefinition(pair, candidates))
    .sort((left, right) => left.displayKey.localeCompare(right.displayKey));
  return cards.concat(genericDefinitions.map((definition) => createCard(definition, candidatesByPair)));
}

function definition(
  displayKey: string,
  label: string,
  scopeLabel: string,
  section: DashboardOverviewSection,
  candidateReferences: CandidateReference[]
): OverviewDefinition {
  return { displayKey, label, scopeLabel, section, candidateReferences };
}

function reference(routeKey: CollectionRouteKey, metricKey: string): CandidateReference {
  return { routeKey, metricKey };
}

function createCard(definition: OverviewDefinition, candidatesByPair: CandidateMap): DashboardOverviewCardDTO {
  const candidates = definition.candidateReferences.flatMap((reference) => (
    [...(candidatesByPair.get(candidatePair(reference.routeKey, reference.metricKey)) || [])]
      .sort(compareCandidatePriority)
  ));
  const eligibleCandidates = candidates.filter((candidate) => candidate.valueStatus === "ELIGIBLE");
  const primary = eligibleCandidates[0] || null;
  const hasConflict = distinctValues(eligibleCandidates).length > 1;
  const status = !primary
    ? "MISSING"
    : hasConflict
      ? "CONFLICT"
      : primary.sourceType === "REALTIME_API" ? "REALTIME" : "SNAPSHOT";
  return {
    displayKey: definition.displayKey,
    label: definition.label,
    scopeLabel: definition.scopeLabel,
    section: definition.section,
    value: primary?.displayValue || primary?.normalizedValue || null,
    normalizedValue: primary?.normalizedValue || null,
    unit: primary?.unit || null,
    status,
    updatedAt: primary?.updatedAt || primary?.capturedAt || null,
    reviewStatus: primary?.reviewStatus || null,
    sourceRouteKey: primary?.routeKey || null,
    sourceType: primary?.sourceType || null,
    hasConflict,
    candidates
  };
}

function genericDefinition(pair: string, candidates: DashboardOverviewCandidateDTO[]): OverviewDefinition {
  const [routeKeyValue, metricKey] = pair.split("\u0000");
  const routeKey = toCollectionRouteKey(routeKeyValue);
  const first = candidates[0];
  return definition(
    `other:${routeKey}:${metricKey || "unknown"}`,
    first?.metricName || metricKey || "未命名指标",
    first?.scopeLabel || scopeLabelFor(routeKey, metricKey || "", first?.metricName),
    routeKey === "LIVE_DATA_SCREEN" ? "LIVE_ROOM" : "DELIVERY",
    [reference(routeKey, metricKey || "unknown")]
  );
}

function summaryCandidate(metric: CaptureSummaryMetricDTO): DashboardOverviewCandidateDTO {
  const routeKey = metric.routeKey || metric.provenance.routeKey || "UNKNOWN";
  const metricKey = overviewMetricKey(metric.metricKey, metric.metricName);
  const normalizedValue = metricValueText({ value: metric.metricValue }, metricValueSemantic(metricKey));
  const displayValue = firstText(metric.displayValue, metric.originalValue, metric.metricValue);
  return {
    routeKey,
    metricKey,
    metricName: textOrNull(metric.metricName) || metricKey,
    displayValue,
    normalizedValue,
    unit: metric.metricUnit,
    sourceType: "SNAPSHOT",
    capturedAt: textOrNull(metric.capturedAt),
    updatedAt: textOrNull(metric.capturedAt),
    snapshotId: metric.provenance.snapshotId,
    reviewStatus: metric.reviewStatus,
    valueStatus: candidateStatus(metric.reviewStatus, displayValue, normalizedValue),
    confidence: safeConfidence(metric.confidence),
    scopeLabel: scopeLabelFor(routeKey, metricKey, metric.metricName, metric.semanticScope ?? undefined)
  };
}

function realtimeCandidate(frame: RealtimeMetricFrame, metric: VisibleMetric): DashboardOverviewCandidateDTO {
  const metricKey = metric.key.trim();
  const normalizedValue = metricValueText(metric, metricValueSemantic(metricKey));
  const displayValue = firstText(metric.rawEvidence?.displayValue, metric.value);
  const hasInvalidEvidence = metric.rawEvidence?.validationStatus === "INVALID";
  return {
    routeKey: frame.routeKey,
    metricKey,
    metricName: textOrNull(metric.name) || realtimeMetricLabel(frame.routeKey, metricKey),
    scopeLabel: scopeLabelFor(frame.routeKey, metricKey, metric.name, metric.rawEvidence?.semanticScope),
    displayValue,
    normalizedValue,
    unit: metric.unit || null,
    sourceType: "REALTIME_API",
    capturedAt: textOrNull(frame.observedAt),
    updatedAt: textOrNull(frame.receivedAt),
    snapshotId: null,
    reviewStatus: "PENDING",
    valueStatus: hasInvalidEvidence
      ? "INVALID"
      : candidateStatus("PENDING", displayValue, normalizedValue),
    confidence: safeConfidence(metric.confidence ?? 1)
  };
}

function candidateStatus(
  reviewStatus: MetricReviewStatus,
  displayValue: string | null,
  normalizedValue: string | null
): DashboardOverviewCandidateStatus {
  if (reviewStatus === "IGNORED") return "IGNORED";
  if (normalizedValue) return "ELIGIBLE";
  return isEmptyDisplayValue(displayValue) ? "EMPTY" : "INVALID";
}

function compareCandidatePriority(left: DashboardOverviewCandidateDTO, right: DashboardOverviewCandidateDTO) {
  const sourceOrder = sourcePriority(left.sourceType) - sourcePriority(right.sourceType);
  if (sourceOrder) return sourceOrder;
  const leftTime = Date.parse(left.updatedAt || left.capturedAt || "");
  const rightTime = Date.parse(right.updatedAt || right.capturedAt || "");
  return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
}

function sourcePriority(sourceType: DashboardOverviewSourceType) {
  return sourceType === "REALTIME_API" ? 0 : 1;
}

function distinctValues(candidates: DashboardOverviewCandidateDTO[]) {
  return [...new Set(candidates.map((candidate) => candidate.normalizedValue).filter((value): value is string => Boolean(value)))];
}

function addCandidate(candidatesByPair: CandidateMap, candidate: DashboardOverviewCandidateDTO) {
  const pair = candidatePair(candidate.routeKey, candidate.metricKey);
  const candidates = candidatesByPair.get(pair) || [];
  candidates.push(candidate);
  candidatesByPair.set(pair, candidates);
}

function candidatePair(routeKey: CollectionRouteKey, metricKey: string) {
  return `${routeKey}\u0000${metricKey}`;
}

function isSupportedRealtimeFrame(frame: RealtimeMetricFrame) {
  return (frame.routeKey === "LIVE_DATA_SCREEN" && frame.pageType === "LIVE_DATA_SCREEN")
    || (frame.routeKey === "LOCAL_PROMOTION_DASHBOARD" && frame.pageType === "LOCAL_PROMOTION_DASHBOARD");
}

function isSupportedRealtimeMetric(routeKey: CollectionRouteKey, metric: VisibleMetric) {
  const allowed = routeKey === "LIVE_DATA_SCREEN" ? liveRealtimeMetricKeySet : localRealtimeMetricKeySet;
  return allowed.has(metric.key.trim());
}

function realtimeMetricLabel(routeKey: CollectionRouteKey, metricKey: string) {
  if (routeKey === "LIVE_DATA_SCREEN") {
    return liveScreenPulseCoreMetricLabels[metricKey as keyof typeof liveScreenPulseCoreMetricLabels] || metricKey;
  }
  return localPromotionPulseMetricLabels[metricKey as keyof typeof localPromotionPulseMetricLabels] || metricKey;
}

function overviewMetricKey(metricKey: string, metricName?: string) {
  const rawKey = metricKey.trim();
  if (rawKey) return metricKeyAliases[normalizeText(rawKey)] || rawKey;
  const normalizedName = normalizeText(metricName || "");
  return metricKeyAliases[normalizedName] || "unknown";
}

const metricKeyAliases: Record<string, string> = {
  "直播间成交金额": "gmv",
  "整体成交金额": "gmv",
  "整体成交金额元": "gmv",
  "在线人数": "current_online_viewers",
  "实时在线人数": "current_online_viewers",
  "人均观看时长": "average_watch_duration_seconds",
  "平均观看时长": "average_watch_duration_seconds",
  "千次观看成交金额": "gpm",
  "千次观看成交金额元": "gpm",
  "成交订单数": "orders",
  "整体成交订单数": "orders",
  "成交人数": "transaction_users",
  "商品转化率": "product_conversion_rate",
  "累计观看次数": "total_watch_count",
  "累计观看人数": "live_viewers",
  "累计商品点击次数": "clicks",
  "全域消耗": "spend",
  "全域消耗元": "spend",
  "全域成交金额": "full_domain_gmv",
  "全域成交金额元": "full_domain_gmv",
  "全域成交订单数": "full_domain_orders",
  "全域支付roi": "full_domain_pay_roi",
  "全域商品点击次数": "full_domain_product_clicks"
};

function scopeLabelFor(routeKey: CollectionRouteKey, metricKey: string, metricName?: string, semanticScope?: string) {
  const scope = normalizeText(semanticScope || metricName || "");
  if (scope.includes("全域") || metricKey.startsWith("full_domain_")) return "全域";
  if (routeKey === "LIVE_DATA_SCREEN" || scope.includes("直播间")) return "直播间";
  if (routeKey === "LOCAL_PROMOTION_DASHBOARD") return "本场整体";
  return collectionRouteLabels[routeKey] || "未知范围";
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[\s\u00a0（）()]/g, "");
}

function textOrNull(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = textOrNull(value);
    if (text) return text;
  }
  return null;
}

function isEmptyDisplayValue(value: string | null) {
  return !value || value === "--" || value === "-";
}

function safeConfidence(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function toCollectionRouteKey(value: string | undefined): CollectionRouteKey {
  const routes: CollectionRouteKey[] = [
    "LOCAL_PROMOTION_DASHBOARD",
    "LIVE_DATA_SCREEN",
    "LIVE_PRODUCT_TAB",
    "LIVE_TRAFFIC_TAB",
    "TASK_TABLE",
    "MATERIAL_LIBRARY",
    "HOURLY_TREND",
    "UNKNOWN"
  ];
  return routes.includes(value as CollectionRouteKey) ? value as CollectionRouteKey : "UNKNOWN";
}
