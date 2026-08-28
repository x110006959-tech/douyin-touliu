import { z } from "zod";

export const localPromotionInternalApiContractVersion = "2026-08-28.2" as const;
export const localPromotionInternalApiAdapterVersion = "1.2.1" as const;
export const localPromotionInternalApiPageUrl = "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2" as const;
export const localPromotionInternalApiFrameId = "7405161088825688102" as const;
export const localPromotionInternalApiModuleId = "7405161354203529243" as const;
export const localPromotionInternalApiDataSetKey = "pc_data_liveboard_center_data_card" as const;

export const localPromotionInternalApiEndpointKeys = ["pageMetrics", "liveReportPromoteMeta", "statQuery"] as const;
export type LocalPromotionInternalApiEndpointKey = (typeof localPromotionInternalApiEndpointKeys)[number];
export const localPromotionInternalApiMetricGroupKeys = ["group_total_data", "promotion", "roi2_promotion"] as const;
export type LocalPromotionInternalApiMetricGroupKey = (typeof localPromotionInternalApiMetricGroupKeys)[number];
export const localPromotionInternalApiEvidencePurposes = ["PULSE_ONLY"] as const;
export type LocalPromotionInternalApiEvidencePurpose = (typeof localPromotionInternalApiEvidencePurposes)[number];

export const localPromotionPulseMetricKeys = [
  "total_watch_count",
  "gmv",
  "orders",
  "gpm",
  "live_viewers",
  "clicks",
  "average_watch_duration_seconds",
  "current_online_viewers",
  "spend",
  "full_domain_gmv",
  "full_domain_orders",
  "full_domain_pay_roi",
  "full_domain_product_clicks",
  "daily_budget"
] as const;
export const localPromotionApiMetricKeys = [
  "total_watch_count",
  "gmv",
  "orders",
  "gpm",
  "live_viewers",
  "clicks",
  "average_watch_duration_seconds",
  "current_online_viewers",
  "spend",
  "full_domain_gmv",
  "full_domain_orders",
  "full_domain_pay_roi",
  "full_domain_product_clicks"
] as const;
export type LocalPromotionPulseMetricKey = (typeof localPromotionPulseMetricKeys)[number];
export type LocalPromotionApiMetricKey = (typeof localPromotionApiMetricKeys)[number];

export const localPromotionPulseMetricLabels: Record<LocalPromotionPulseMetricKey, string> = {
  total_watch_count: "累计观看次数",
  gmv: "整体成交金额(元)",
  orders: "整体成交订单数",
  gpm: "千次观看成交金额(元)",
  live_viewers: "累计观看人数",
  clicks: "累计商品点击次数",
  average_watch_duration_seconds: "人均观看时长",
  current_online_viewers: "实时在线人数",
  spend: "全域消耗(元)",
  full_domain_gmv: "全域成交金额(元)",
  full_domain_orders: "全域成交订单数",
  full_domain_pay_roi: "全域支付ROI",
  full_domain_product_clicks: "全域商品点击次数",
  daily_budget: "日预算",
};

export type LocalPromotionInternalApiIdentityFields = {
  advid: string[];
  roomId: string[];
  selectedAdvid: string[];
  selectedAwemeId: string[];
};
export type LocalPromotionInternalApiIdentityEvidence = {
  url: LocalPromotionInternalApiIdentityFields;
  dom: LocalPromotionInternalApiIdentityFields;
};
export type LocalPromotionInternalApiIdentityResolution = {
  advid: string | null;
  roomId: string | null;
  selectedAdvid: string | null;
  selectedAwemeId: string | null;
  source: "URL" | "DOM" | "URL_AND_DOM" | "MISSING" | "MISMATCH";
  evidence: LocalPromotionInternalApiIdentityEvidence;
};

export type LocalPromotionInternalApiField = {
  metricKey: LocalPromotionApiMetricKey;
  metricName: string;
  fieldPath: "data.StatsData.Totals[metric].Value";
  approvedFieldPaths: readonly [string, ...string[]];
  fieldLabel: string;
  unit: string | null;
  semanticScope: string;
  displayPrecision: number;
  endpoint: LocalPromotionInternalApiEndpointKey;
  purpose: LocalPromotionInternalApiEvidencePurpose;
  groupKeys: readonly [LocalPromotionInternalApiMetricGroupKey, ...LocalPromotionInternalApiMetricGroupKey[]];
  metadataLabels: readonly [string, ...string[]];
};

// pageMetrics 只返回平台定义；实际指标值必须通过 statQuery 的固定 Totals 路径读取。
// metadataLabels/groupKeys 是受控匹配白名单，不能演变为任意字段发现或原始平台 ID 契约。
export const localPromotionInternalApiFields: readonly LocalPromotionInternalApiField[] = [
  { metricKey: "total_watch_count", metricName: "累计观看次数", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "累计观看次数", unit: null, semanticScope: "本场累计观看次数", displayPrecision: 0, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["group_total_data"], metadataLabels: ["累计观看次数", "累计观看总人数"] },
  { metricKey: "gmv", metricName: "整体成交金额(元)", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "整体成交金额(元)", unit: "yuan", semanticScope: "本场整体成交金额", displayPrecision: 2, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["group_total_data"], metadataLabels: ["整体成交金额(元)", "整体成交金额"] },
  { metricKey: "orders", metricName: "整体成交订单数", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "整体成交订单数", unit: null, semanticScope: "本场整体成交订单数", displayPrecision: 0, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["group_total_data"], metadataLabels: ["整体成交订单数"] },
  { metricKey: "gpm", metricName: "千次观看成交金额(元)", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "千次观看成交金额(元)", unit: "yuan", semanticScope: "本场千次观看成交金额", displayPrecision: 2, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["group_total_data"], metadataLabels: ["千次观看成交金额(元)", "千次观看成交金额"] },
  { metricKey: "live_viewers", metricName: "累计观看人数", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "累计观看人数", unit: null, semanticScope: "本场累计观看人数", displayPrecision: 0, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["group_total_data"], metadataLabels: ["累计观看人数"] },
  { metricKey: "clicks", metricName: "累计商品点击次数", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "累计商品点击次数", unit: null, semanticScope: "本场累计商品点击次数", displayPrecision: 0, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["group_total_data"], metadataLabels: ["累计商品点击次数"] },
  { metricKey: "average_watch_duration_seconds", metricName: "人均观看时长", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "人均观看时长", unit: "s", semanticScope: "本场人均观看时长", displayPrecision: 0, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["group_total_data"], metadataLabels: ["人均观看时长"] },
  { metricKey: "current_online_viewers", metricName: "实时在线人数", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "实时在线人数", unit: null, semanticScope: "本场实时在线人数", displayPrecision: 0, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["group_total_data"], metadataLabels: ["实时在线人数"] },
  { metricKey: "spend", metricName: "全域消耗(元)", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "全域消耗(元)", unit: "yuan", semanticScope: "本场全域消耗", displayPrecision: 2, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["roi2_promotion"], metadataLabels: ["全域消耗(元)", "全域消耗"] },
  { metricKey: "full_domain_gmv", metricName: "全域成交金额(元)", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "全域成交金额(元)", unit: "yuan", semanticScope: "本场全域成交金额", displayPrecision: 2, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["roi2_promotion"], metadataLabels: ["全域成交金额(元)", "全域成交金额"] },
  { metricKey: "full_domain_orders", metricName: "全域成交订单数", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "全域成交订单数", unit: null, semanticScope: "本场全域成交订单数", displayPrecision: 0, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["roi2_promotion"], metadataLabels: ["全域成交订单数"] },
  { metricKey: "full_domain_pay_roi", metricName: "全域支付ROI", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "全域支付ROI", unit: null, semanticScope: "本场全域支付 ROI", displayPrecision: 2, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["roi2_promotion"], metadataLabels: ["全域支付ROI", "全域支付 ROI", "全域投放ROI", "全域投放 ROI"] },
  { metricKey: "full_domain_product_clicks", metricName: "全域商品点击次数", fieldPath: "data.StatsData.Totals[metric].Value", approvedFieldPaths: ["data.StatsData.Totals[metric].Value"], fieldLabel: "全域商品点击次数", unit: null, semanticScope: "本场全域商品点击次数", displayPrecision: 0, endpoint: "statQuery", purpose: "PULSE_ONLY", groupKeys: ["roi2_promotion"], metadataLabels: ["全域商品点击次数"] }
];

export const localPromotionInternalApiEndpointContracts = {
  pageMetrics: {
    key: "pageMetrics" as const,
    method: "GET" as const,
    path: "/api/lamp/pc/v2/statistics/data/pageMetrics" as const,
    maxResponseBytes: 96 * 1024,
    fields: [] as readonly LocalPromotionInternalApiField[]
  },
  liveReportPromoteMeta: {
    key: "liveReportPromoteMeta" as const,
    method: "GET" as const,
    path: "/api/lamp/pc/v2/statistics/data/getLiveReportPromoteMeta" as const,
    maxResponseBytes: 64 * 1024,
    // 仅瞬时读取直播时间区间与当前广告 ID 白名单，用于构造 roi2_promotion 的固定过滤条件。
    fields: [] as readonly LocalPromotionInternalApiField[]
  },
  statQuery: {
    key: "statQuery" as const,
    method: "POST" as const,
    path: "/api/lamp/pc/v2/statistics/data/statQuery" as const,
    // 平台前端在账号命中 BFF 白名单时会把同一请求切到 v3；v2 仍是主路径，v3 仅作业务失败后的固定兜底。
    fallbackPaths: ["/api/lamp/pc/v3/data/statQuery"] as const,
    maxResponseBytes: 96 * 1024,
    fields: localPromotionInternalApiFields.filter((field) => field.endpoint === "statQuery")
  }
} as const;

export function isExactLocalPromotionInternalApiPage(value: string) {
  try {
    const url = new URL(value);
    return url.origin === "https://localads.chengzijianzhan.cn"
      && !url.username
      && !url.password
      && url.pathname === "/lamp/pc/liveboard2";
  } catch {
    return false;
  }
}

export function resolveLocalPromotionIdentity(input: {
  url: string;
  dom?: Partial<LocalPromotionInternalApiIdentityFields>;
}): LocalPromotionInternalApiIdentityResolution {
  const parsed = new URL(input.url);
  const rawUrlEvidence = {
    advid: parsed.searchParams.getAll("advid"),
    roomId: parsed.searchParams.getAll("room_id"),
    selectedAdvid: parsed.searchParams.getAll("selected_advid"),
    selectedAwemeId: parsed.searchParams.getAll("selected_aweme_id")
  };
  const rawDomEvidence = {
    advid: input.dom?.advid || [],
    roomId: input.dom?.roomId || [],
    selectedAdvid: input.dom?.selectedAdvid || [],
    selectedAwemeId: input.dom?.selectedAwemeId || []
  };
  const urlEvidence = {
    advid: normalizeIdentity(rawUrlEvidence.advid),
    roomId: normalizeIdentity(rawUrlEvidence.roomId),
    selectedAdvid: normalizeIdentity(rawUrlEvidence.selectedAdvid),
    selectedAwemeId: normalizeIdentity(rawUrlEvidence.selectedAwemeId)
  };
  const domEvidence = {
    advid: normalizeIdentity(rawDomEvidence.advid),
    roomId: normalizeIdentity(rawDomEvidence.roomId),
    selectedAdvid: normalizeIdentity(rawDomEvidence.selectedAdvid),
    selectedAwemeId: normalizeIdentity(rawDomEvidence.selectedAwemeId)
  };
  const combinedEvidence = {
    advid: normalizeIdentity([...urlEvidence.advid, ...domEvidence.advid]),
    roomId: normalizeIdentity([...urlEvidence.roomId, ...domEvidence.roomId]),
    selectedAdvid: normalizeIdentity([...urlEvidence.selectedAdvid, ...domEvidence.selectedAdvid]),
    selectedAwemeId: normalizeIdentity([...urlEvidence.selectedAwemeId, ...domEvidence.selectedAwemeId])
  };
  const evidence = { url: urlEvidence, dom: domEvidence };
  const hasInvalidEvidence = [...Object.values(rawUrlEvidence), ...Object.values(rawDomEvidence)]
    .some((values) => values.some((value) => Boolean(value?.trim()) && !/^\d{1,64}$/.test(value.trim())));
  const sourceConflict = hasInvalidEvidence || Object.keys(urlEvidence).some((key) => {
    const urlValues = urlEvidence[key as keyof typeof urlEvidence];
    const domValues = domEvidence[key as keyof typeof domEvidence];
    return urlValues.length > 1 || domValues.length > 1 || (urlValues.length > 0 && domValues.length > 0 && urlValues[0] !== domValues[0]);
  });
  const advertisingIds = normalizeIdentity([...combinedEvidence.advid, ...combinedEvidence.selectedAdvid]);
  if (sourceConflict || Object.values(combinedEvidence).some((values) => values.length > 1) || advertisingIds.length > 1) {
    return { advid: null, roomId: null, selectedAdvid: null, selectedAwemeId: null, source: "MISMATCH", evidence };
  }
  const values = {
    advid: combinedEvidence.advid[0] || null,
    roomId: combinedEvidence.roomId[0] || null,
    selectedAdvid: combinedEvidence.selectedAdvid[0] || null,
    selectedAwemeId: combinedEvidence.selectedAwemeId[0] || null
  };
  const hasUrl = Object.values(urlEvidence).some((values) => values.length > 0);
  const hasDom = Object.values(domEvidence).some((values) => values.length > 0);
  return { ...values, source: hasUrl && hasDom ? "URL_AND_DOM" : hasUrl ? "URL" : hasDom ? "DOM" : "MISSING", evidence };
}

export function localPromotionIdentityKey(identity: Pick<LocalPromotionInternalApiIdentityResolution, "advid" | "roomId" | "selectedAdvid" | "selectedAwemeId">) {
  return JSON.stringify({
    advid: identity.advid,
    roomId: identity.roomId,
    selectedAdvid: identity.selectedAdvid,
    selectedAwemeId: identity.selectedAwemeId
  });
}

export const localPromotionInternalApiRequestSchema = z.object({
  FrameId: z.literal(localPromotionInternalApiFrameId),
  ModuleId: z.literal(localPromotionInternalApiModuleId),
  DataSetKey: z.literal(localPromotionInternalApiDataSetKey),
  Metrics: z.array(z.string().regex(/^[A-Za-z0-9_]{1,128}$/)).min(1).max(localPromotionApiMetricKeys.length),
  Filters: z.object({
    ConditionRelationshipType: z.literal(1),
    Conditions: z.array(z.union([
      z.object({
        Field: z.enum(["room_id", "advertiser_id", "is_order", "adlab_mode"]),
        Values: z.array(z.string().regex(/^\d{1,64}$/)).min(1).max(2),
        Operator: z.union([z.literal(6), z.literal(7)])
      }).strict(),
      z.object({
        Field: z.literal("stat_time"),
        Values: z.array(z.string().regex(/^\d{10,16}$/)).length(2),
        Operator: z.literal(9)
      }).strict(),
      z.object({
        Field: z.literal("ad_id"),
        Values: z.array(z.string().regex(/^\d{1,64}$/)).min(1).max(200),
        Operator: z.literal(7)
      }).strict()
    ])).min(1).max(6)
  }).strict().optional(),
  PageParams: z.object({ Limit: z.literal(-1), Offset: z.literal(0) }).strict()
}).strict();

export const localPromotionInternalApiPageMetricsRequestSchema = z.object({
  frameId: z.literal(localPromotionInternalApiFrameId),
  advid: z.string().regex(/^\d{1,64}$/)
}).strict();

export const localPromotionInternalApiPromoteMetaRequestSchema = z.object({
  iesCoreUserId: z.string().regex(/^\d{1,64}$/),
  roomId: z.string().regex(/^\d{1,64}$/),
  advid: z.string().regex(/^\d{1,64}$/)
}).strict();

function normalizeIdentity(values: readonly (string | null | undefined)[]) {
  return [...new Set(values.map((value) => value?.trim() || "").filter((value) => /^\d{1,64}$/.test(value)))].slice(0, 2);
}
