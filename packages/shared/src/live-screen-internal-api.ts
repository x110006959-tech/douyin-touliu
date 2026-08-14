import { z } from "zod";

export const liveScreenInternalApiContractVersion = "2026-08-14.1" as const;
export const liveScreenInternalApiAdapterVersion = "1.6.0" as const;

export const liveScreenRoomIdSources = ["URL", "DOM", "URL_AND_DOM", "MISSING", "MISMATCH"] as const;
export const liveScreenRoomIdPattern = /^\d{1,32}$/;

export type LiveScreenRoomIdSource = (typeof liveScreenRoomIdSources)[number];
export type LiveScreenRoomIdEvidence = {
  urlRoomIds: string[];
  domRoomIds: string[];
};
export type LiveScreenRoomIdResolution = {
  value: string | null;
  source: LiveScreenRoomIdSource;
  evidence: LiveScreenRoomIdEvidence;
};

export const liveScreenInternalApiEndpointKeys = [
  "key_index",
  "room_minute_indicator",
  "room_info",
  "follow_product",
  "product_trend",
  "conversion_funnel",
  "portrait",
  "marketing_data",
  "comment_info",
  "punish_info"
] as const;

export const liveScreenApiEvidencePurposes = ["PULSE_ONLY", "SNAPSHOT_EVIDENCE", "SNAPSHOT_DISPLAY_ONLY"] as const;

export type LiveScreenInternalApiEndpointKey = (typeof liveScreenInternalApiEndpointKeys)[number];
export type LiveScreenApiEvidencePurpose = (typeof liveScreenApiEvidencePurposes)[number];

export type LiveScreenInternalApiField = {
  metricKey: string;
  metricName: string;
  /** Primary path retained for stable display and backwards-readable metadata. */
  fieldPath: string;
  /** Exact, reviewed paths that may supply this metric. Unknown paths are never searched. */
  approvedFieldPaths: readonly [string, ...string[]];
  fieldLabel: string;
  unit: string | null;
  timeRange: "实时" | "本场";
  semanticScope: string;
  purpose: LiveScreenApiEvidencePurpose;
  displayPrecision: number;
  rowPath?: string;
  rowLabelPath?: string;
};

export type LiveScreenInternalApiEndpointContract = {
  key: LiveScreenInternalApiEndpointKey;
  path: `/life/api/live_screen/v5/${string}`;
  method: "POST";
  requestSchema: z.ZodType<{ room_id: string }>;
  responseSchema: z.ZodType<{ code: number; data: Record<string, unknown> }>;
  maxResponseBytes: number;
  fields: readonly LiveScreenInternalApiField[];
};

export const liveScreenPulseCoreMetricKeys = [
  "gmv",
  "current_online_viewers",
  "average_watch_duration_seconds",
  "gpm",
  "orders",
  "transaction_users",
  "product_conversion_rate"
] as const;

export const liveScreenPulseCoreMetricLabels: Record<(typeof liveScreenPulseCoreMetricKeys)[number], string> = {
  gmv: "直播间成交金额",
  current_online_viewers: "在线人数",
  average_watch_duration_seconds: "人均观看时长",
  gpm: "千次观看成交金额",
  orders: "成交订单数",
  transaction_users: "成交人数",
  product_conversion_rate: "商品转化率"
};

const requestSchema = z.object({ room_id: z.string().regex(/^\d{1,32}$/) }).strict();
// The platform may return null for a metric that has not produced a value yet.
// It is a valid response shape, but never becomes a collected metric.
const metricValueSchema = z.union([z.number().finite(), z.string().trim().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?%?$/)]).nullable();
const responseSchema = z.object({
  code: z.number().int(),
  data: z.record(z.string(), z.unknown())
}).passthrough();

const keyIndexResponseSchema = z.object({
  code: z.number().int(),
  // Field-level type checks happen only at the explicit approved paths below.
  // Keeping the object opaque here lets a single invalid/missing metric remain
  // a local projection miss instead of widening the whole endpoint contract.
  data: z.record(z.string(), z.unknown())
}).strip();

const roomMinuteIndicatorResponseSchema = z.object({
  code: z.literal(0),
  data: z.object({
    minute_rows: z.array(z.object({
      interval_label: z.string().trim().min(1).max(100),
      live_views: metricValueSchema
    }).strip()).max(120)
  }).strip()
}).strip();

const roomInfoResponseSchema = z.object({
  code: z.literal(0),
  data: z.object({
    live_viewers: metricValueSchema.optional(),
    impressions: metricValueSchema.optional(),
    clicks: metricValueSchema.optional(),
    orders: metricValueSchema.optional()
  }).strip()
}).strip();

const clickRateResponseSchema = z.object({
  code: z.literal(0),
  data: z.object({ product_click_rate: metricValueSchema.optional() }).strip()
}).strip();

function endpoint(
  key: LiveScreenInternalApiEndpointKey,
  fields: readonly LiveScreenInternalApiField[],
  maxResponseBytes = 96 * 1024,
  endpointResponseSchema: z.ZodType<{ code: number; data: Record<string, unknown> }> = responseSchema
): LiveScreenInternalApiEndpointContract {
  return {
    key,
    path: `/life/api/live_screen/v5/${key}`,
    method: "POST",
    requestSchema,
    responseSchema: endpointResponseSchema,
    maxResponseBytes,
    fields
  };
}

const realtime = (metricKey: string, metricName: string, fieldPath: string, fieldLabel: string, unit: string | null, semanticScope: string, displayPrecision = 0): LiveScreenInternalApiField => ({
  metricKey,
  metricName,
  fieldPath,
  approvedFieldPaths: [fieldPath],
  fieldLabel,
  unit,
  timeRange: "实时",
  semanticScope,
  purpose: "PULSE_ONLY",
  displayPrecision
});

const snapshot = (metricKey: string, metricName: string, fieldPath: string, fieldLabel: string, unit: string | null, semanticScope: string, displayPrecision = 0, rowPath?: string, rowLabelPath?: string): LiveScreenInternalApiField => ({
  metricKey,
  metricName,
  fieldPath,
  approvedFieldPaths: [fieldPath],
  fieldLabel,
  unit,
  timeRange: "本场",
  semanticScope,
  purpose: "SNAPSHOT_EVIDENCE",
  displayPrecision,
  rowPath,
  rowLabelPath
});

// This registry is intentionally fixed. The extension can only request these exact
// paths and persist these projected fields; it never keeps an endpoint response body.
export const liveScreenInternalApiContracts: Record<LiveScreenInternalApiEndpointKey, LiveScreenInternalApiEndpointContract> = {
  key_index: endpoint("key_index", [
    // The live page renders Object.keys(response.data), and every key-index item
    // exposes its display number through item.value. Keep this whitelist aligned
    // with the concrete data keys shipped by the platform bundle; never scan
    // arbitrary response keys or retain the response body.
    realtime("gmv", "直播间成交金额", "data.PayGmv.value", "直播间成交金额", "yuan", "直播间成交金额", 2),
    realtime("current_online_viewers", "在线人数", "data.CurrentUserCnt.value", "在线人数", null, "当前在线人数"),
    realtime("average_watch_duration_seconds", "人均观看时长", "data.ClientAvgWatchDuration.value", "人均观看时长", "s", "人均观看时长", 2),
    realtime("gpm", "千次观看成交金额", "data.GPM.value", "千次观看成交金额", "yuan", "千次观看成交金额", 2),
    realtime("orders", "成交订单数", "data.PayOrderCnt.value", "成交订单数", null, "成交订单数"),
    realtime("transaction_users", "成交人数", "data.PayUvAll.value", "成交人数", null, "成交人数"),
    realtime("product_conversion_rate", "商品转化率", "data.GoodsCvr.value", "商品转化率", "%", "商品转化率", 2)
  ], 64 * 1024, keyIndexResponseSchema),
  room_minute_indicator: endpoint("room_minute_indicator", [
    snapshot("hourly_live_views", "分钟看播次数", "data.minute_rows[].live_views", "分钟看播次数", null, "分钟趋势", 0, "data.minute_rows", "interval_label")
  ], 96 * 1024, roomMinuteIndicatorResponseSchema),
  room_info: endpoint("room_info", [
    snapshot("live_viewers", "整场累计看播人数", "data.live_viewers", "整场累计看播人数", null, "整场累计看播人数"),
    snapshot("impressions", "曝光次数", "data.impressions", "曝光次数", null, "曝光次数"),
    snapshot("clicks", "点击次数", "data.clicks", "点击次数", null, "点击次数"),
    snapshot("orders", "成交订单数", "data.orders", "成交订单数", null, "成交订单数")
  ], 64 * 1024, roomInfoResponseSchema),
  follow_product: endpoint("follow_product", [
    snapshot("product_click_rate", "商品点击率", "data.product_click_rate", "商品点击率", "%", "商品点击率", 2)
  ], 64 * 1024, clickRateResponseSchema),
  product_trend: endpoint("product_trend", []),
  conversion_funnel: endpoint("conversion_funnel", [
    snapshot("product_click_rate", "商品点击率", "data.product_click_rate", "商品点击率", "%", "商品点击率", 2)
  ], 64 * 1024, clickRateResponseSchema),
  portrait: endpoint("portrait", []),
  marketing_data: endpoint("marketing_data", []),
  // Comments and enforcement endpoints intentionally expose no free text or identity fields.
  comment_info: endpoint("comment_info", []),
  punish_info: endpoint("punish_info", [])
};

export const liveScreenSnapshotEndpointKeys = liveScreenInternalApiEndpointKeys.filter((key) => (
  liveScreenInternalApiContracts[key].fields.some((field) => field.purpose !== "PULSE_ONLY")
));

export function isLiveScreenInternalApiPath(value: string) {
  return (Object.values(liveScreenInternalApiContracts) as LiveScreenInternalApiEndpointContract[])
    .some((contract) => contract.path === value);
}

export function liveScreenEndpointKeysForMode(mode: "SNAPSHOT" | "PULSE") {
  if (mode === "SNAPSHOT") return [...liveScreenSnapshotEndpointKeys];
  // PULSE is intentionally isolated from formal snapshot evidence. A schema
  // change in the minute-trend endpoint must never interrupt real-time cards.
  return ["key_index"] as const;
}

export function isApprovedLiveScreenFieldPath(field: LiveScreenInternalApiField, fieldPath: string) {
  return field.approvedFieldPaths.includes(fieldPath);
}

export function resolveLiveScreenRoomId(input: {
  urlRoomIds: readonly (string | null | undefined)[];
  domRoomIds: readonly (string | null | undefined)[];
}): LiveScreenRoomIdResolution {
  const evidence = {
    urlRoomIds: normalizeRoomIds(input.urlRoomIds),
    domRoomIds: normalizeRoomIds(input.domRoomIds)
  };
  if (evidence.urlRoomIds.length > 1 || evidence.domRoomIds.length > 1) {
    return { value: null, source: "MISMATCH", evidence };
  }
  const urlRoomId = evidence.urlRoomIds[0] || null;
  const domRoomId = evidence.domRoomIds[0] || null;
  if (urlRoomId && domRoomId && urlRoomId !== domRoomId) {
    return { value: null, source: "MISMATCH", evidence };
  }
  if (urlRoomId && domRoomId) return { value: urlRoomId, source: "URL_AND_DOM", evidence };
  if (urlRoomId) return { value: urlRoomId, source: "URL", evidence };
  if (domRoomId) return { value: domRoomId, source: "DOM", evidence };
  return { value: null, source: "MISSING", evidence };
}

function normalizeRoomIds(values: readonly (string | null | undefined)[]) {
  return [...new Set(values
    .map((value) => value?.trim() || "")
    .filter((value) => liveScreenRoomIdPattern.test(value)))]
    // Two distinct values are sufficient to prove an ambiguous source while
    // keeping the uploaded evidence bounded and minimal.
    .slice(0, 2);
}
