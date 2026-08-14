import type { MetricValueSemantic } from "./metric-value.js";
import type { CollectionRouteKey } from "./collection-routes.js";

export type CollectionMetricFieldDefinition = {
  key: string;
  name: string;
  unit?: string;
  labels: readonly string[];
};

export type CollectionTableFieldDefinition = {
  key: string;
  semantic: MetricValueSemantic;
  labels: readonly string[];
  identity?: boolean;
};

export type CollectionFieldProfile = {
  adapterId: string;
  pageType: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD" | "TASK_TABLE";
  keywords: readonly string[];
  metricKeys: readonly string[];
  periodRequired: true;
  tableFields: readonly CollectionTableFieldDefinition[];
};

export const collectionMetricFieldDefinitions: readonly CollectionMetricFieldDefinition[] = [
  { key: "spend", name: "ad spend", unit: "yuan", labels: ["消耗", "广告消耗", "今日消耗", "全域消耗(元)"] },
  { key: "daily_budget", name: "daily budget", unit: "yuan", labels: ["日预算", "预算"] },
  { key: "remaining_budget", name: "remaining budget", unit: "yuan", labels: ["剩余预算"] },
  { key: "impressions", name: "impressions", labels: ["曝光次数", "曝光量"] },
  { key: "clicks", name: "clicks", labels: ["点击次数", "全域商品点击次数"] },
  { key: "ctr", name: "click through rate", unit: "%", labels: ["点击率", "CTR"] },
  { key: "orders", name: "orders", labels: ["成交订单数", "支付订单", "支付订单数", "全域成交订单数"] },
  { key: "pay_roi", name: "整体支付 ROI", labels: ["整体支付ROI", "整体支付 ROI", "付款 ROI"] },
  { key: "full_domain_pay_roi", name: "全域支付 ROI", labels: ["全域支付ROI", "全域支付 ROI", "全域ROI", "全域 ROI"] },
  { key: "verify_roi", name: "verify ROI", labels: ["核销 ROI"] },
  { key: "gross_profit_roi", name: "gross profit ROI", labels: ["毛利 ROI"] },
  { key: "gmv", name: "GMV", unit: "yuan", labels: ["成交金额", "支付金额", "GMV", "全域成交金额(元)"] },
  { key: "gpm", name: "GPM", unit: "yuan", labels: ["千次观看成交金额", "GPM"] },
  { key: "live_viewers", name: "live viewers", labels: ["直播间观看人数", "观看人数", "看播人数", "整场累计看播人数"] },
  { key: "current_online_viewers", name: "current online viewers", labels: ["当前在线人数", "实时在线人数", "在线人数"] },
  { key: "average_watch_duration_seconds", name: "average watch duration", unit: "s", labels: ["人均观看时长", "平均观看时长"] },
  { key: "exposure_users", name: "exposure users", labels: ["曝光人数", "商品曝光人数", "直播曝光人数"] },
  { key: "click_users", name: "click users", labels: ["点击人数", "商品点击人数"] },
  { key: "transaction_users", name: "transaction users", labels: ["成交人数", "支付人数"] },
  { key: "product_click_rate", name: "product click rate", unit: "%", labels: ["商品点击率"] },
  { key: "product_conversion_rate", name: "product conversion rate", unit: "%", labels: ["商品转化率"] },
  { key: "live_room_click_rate", name: "live room click rate", unit: "%", labels: ["直播间点击率"] },
  { key: "hourly_live_views", name: "小时看播次数", labels: ["小时看播次数"] },
  { key: "hourly_natural_live_views", name: "小时自然看播次数", labels: ["小时自然看播次数"] },
  { key: "hourly_commercial_live_views", name: "小时商业看播次数", labels: ["小时商业看播次数"] },
  { key: "store_searches", name: "store searches", labels: ["门店搜索量", "搜索量"] },
  { key: "poi_visits", name: "POI visits", labels: ["POI访问", "POI 访问", "门店访问"] },
  { key: "shelf_gmv", name: "shelf GMV", unit: "yuan", labels: ["货架成交", "团购货架"] },
  { key: "search_gmv", name: "search GMV", unit: "yuan", labels: ["搜索成交"] }
] as const;

const productTableFields: readonly CollectionTableFieldDefinition[] = [
  { key: "id", semantic: "UNKNOWN", labels: ["商品ID", "商品编号", "SPUID", "商品编码"], identity: true },
  { key: "name", semantic: "UNKNOWN", labels: ["商品名称", "商品标题", "商品名"], identity: true },
  { key: "price", semantic: "CURRENCY", labels: ["售价", "商品售价", "原价"] },
  { key: "seckillPrice", semantic: "CURRENCY", labels: ["秒杀价", "活动价", "到手价"] },
  { key: "paymentAmount", semantic: "CURRENCY", labels: ["支付金额", "成交金额", "商品成交金额", "GMV"] },
  { key: "orders", semantic: "COUNT", labels: ["支付订单数", "支付订单", "成交订单数", "成交订单", "订单数"] },
  { key: "impressions", semantic: "COUNT", labels: ["商品曝光人数", "商品曝光", "曝光人数", "曝光量", "曝光"] },
  { key: "clicks", semantic: "COUNT", labels: ["商品点击人数", "商品点击", "点击人数", "点击量", "点击"] },
  { key: "detailVisits", semantic: "COUNT", labels: ["商品详情访问人数", "商品详情访问", "详情访问人数", "详情访问"] },
  { key: "submitVisits", semantic: "COUNT", labels: ["提单访问人数", "提单访问", "提交订单人数", "提单人数"] },
  { key: "submitRate", semantic: "PERCENTAGE", labels: ["提单率", "提交订单率"] },
  { key: "conversionRate", semantic: "PERCENTAGE", labels: ["支付转化率", "成交转化率", "转化率"] }
] as const;

const trafficTableFields: readonly CollectionTableFieldDefinition[] = [
  { key: "period", semantic: "UNKNOWN", labels: ["时间段", "时间", "时段", "小时"], identity: true },
  { key: "liveViews", semantic: "COUNT", labels: ["小时看播次数", "看播次数"] },
  { key: "naturalLiveViews", semantic: "COUNT", labels: ["小时自然看播次数", "自然看播次数"] },
  { key: "commercialLiveViews", semantic: "COUNT", labels: ["小时商业看播次数", "商业看播次数"] }
] as const;

const taskTableFields: readonly CollectionTableFieldDefinition[] = [
  { key: "id", semantic: "UNKNOWN", labels: ["投流单元ID", "单元ID", "任务ID", "计划ID"], identity: true },
  { key: "name", semantic: "UNKNOWN", labels: ["投流单元", "单元名称", "任务名称", "计划名称", "广告组名称"], identity: true },
  { key: "status", semantic: "UNKNOWN", labels: ["投放状态", "任务状态", "计划状态", "状态"] },
  { key: "budget", semantic: "CURRENCY", labels: ["日预算", "每日预算", "预算"] },
  { key: "spend", semantic: "CURRENCY", labels: ["广告消耗", "总消耗", "消耗"] },
  { key: "roi", semantic: "ROI", labels: ["支付ROI", "核销ROI", "整体支付ROI", "ROI"] },
  { key: "targetRoi", semantic: "ROI", labels: ["目标ROI", "目标支付ROI", "ROI目标"] },
  { key: "orders", semantic: "COUNT", labels: ["支付订单数", "支付订单", "成交订单数", "订单数"] },
  { key: "impressions", semantic: "COUNT", labels: ["曝光量", "曝光次数", "曝光"] },
  { key: "clicks", semantic: "COUNT", labels: ["点击量", "点击次数", "点击人数", "点击"] },
  { key: "ctr", semantic: "PERCENTAGE", labels: ["点击率", "CTR"] }
] as const;

export const collectionFieldProfiles: Partial<Record<CollectionRouteKey, CollectionFieldProfile>> = {
  LIVE_PRODUCT_TAB: {
    adapterId: "live-product-tab",
    pageType: "LIVE_DATA_SCREEN",
    keywords: ["商品列表", "关注商品", "推荐返场", "商品画像"],
    metricKeys: ["gmv", "orders", "impressions", "clicks", "ctr"],
    periodRequired: true,
    tableFields: productTableFields
  },
  LIVE_TRAFFIC_TAB: {
    adapterId: "live-traffic-tab",
    pageType: "LIVE_DATA_SCREEN",
    keywords: ["直播流量", "流量分析", "小时自然看播次数", "小时商业看播次数"],
    metricKeys: ["live_viewers", "hourly_live_views", "hourly_natural_live_views", "hourly_commercial_live_views"],
    periodRequired: true,
    tableFields: trafficTableFields
  },
  LIVE_DATA_SCREEN: {
    adapterId: "live-screen",
    pageType: "LIVE_DATA_SCREEN",
    keywords: ["直播数据大屏", "直播间", "看播", "曝光人数", "成交人数"],
    metricKeys: ["gmv", "current_online_viewers", "average_watch_duration_seconds", "gpm", "orders", "transaction_users", "product_conversion_rate"],
    periodRequired: true,
    tableFields: []
  },
  LOCAL_PROMOTION_DASHBOARD: {
    adapterId: "local-promotion",
    pageType: "LOCAL_PROMOTION_DASHBOARD",
    keywords: ["巨量本地推", "本地推", "投放", "出价", "预算", "消耗"],
    metricKeys: ["spend", "daily_budget", "pay_roi", "full_domain_pay_roi", "gmv", "orders", "impressions", "clicks"],
    periodRequired: true,
    tableFields: []
  },
  TASK_TABLE: {
    adapterId: "task-table",
    pageType: "TASK_TABLE",
    keywords: ["任务列表", "计划列表", "广告组", "单元", "创意", "状态"],
    metricKeys: ["spend", "daily_budget", "orders"],
    periodRequired: true,
    tableFields: taskTableFields
  }
};

export function metricFieldsForRoute(routeKey: CollectionRouteKey) {
  const keys = new Set(collectionFieldProfiles[routeKey]?.metricKeys || []);
  return collectionMetricFieldDefinitions.filter((definition) => keys.has(definition.key));
}

export function isAllowedCollectionMetricLabel(routeKey: CollectionRouteKey, metricKey: string, label: string) {
  const definition = metricFieldsForRoute(routeKey).find((item) => item.key === metricKey);
  if (!definition) return false;
  const normalized = normalizeCollectionFieldName(label);
  return definition.labels.some((candidate) => normalizeCollectionFieldName(candidate) === normalized);
}

export function tableFieldForHeader(routeKey: CollectionRouteKey, header: string) {
  const normalized = normalizeCollectionFieldName(header);
  return collectionFieldProfiles[routeKey]?.tableFields.find((field) => (
    field.labels.some((candidate) => normalizeCollectionFieldName(candidate) === normalized)
  )) || null;
}

export function normalizeCollectionFieldName(value: string) {
  return value.toLowerCase().replace(/[\s_\-—/（）()：:·]/g, "").replace(/(?:人民币|元|%|倍)$/, "");
}
