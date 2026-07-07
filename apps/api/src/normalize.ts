import type { CollectionSnapshotPayload, VisibleMetric } from "@douyin-local-life/shared";

const metricPatterns: Array<{ key: string; name: string; unit?: string; pattern: RegExp }> = [
  { key: "spend", name: "消耗", unit: "元", pattern: /(?:消耗|广告消耗|今日消耗)[^\d-]*([¥￥]?\s*[\d,.]+)/i },
  { key: "daily_budget", name: "日预算", unit: "元", pattern: /(?:日预算|预算)[^\d-]*([¥￥]?\s*[\d,.]+)/i },
  { key: "remaining_budget", name: "剩余预算", unit: "元", pattern: /(?:剩余预算)[^\d-]*([¥￥]?\s*[\d,.]+)/i },
  { key: "impressions", name: "曝光量", pattern: /(?:曝光量|曝光次数|商品曝光人数|直播曝光人数)[^\d-]*([\d,.]+)/i },
  { key: "clicks", name: "点击量", pattern: /(?:点击量|点击人数|商品点击人数)[^\d-]*([\d,.]+)/i },
  { key: "ctr", name: "点击率", unit: "%", pattern: /(?:点击率|CTR|商品点击率)[^\d-]*([\d,.]+%?)/i },
  { key: "conversions", name: "成交人数", pattern: /(?:成交人数|成交订单数|支付订单)[^\d-]*([\d,.]+)/i },
  { key: "cpa", name: "转化成本", unit: "元", pattern: /(?:转化成本|成交成本|CPA)[^\d-]*([¥￥]?\s*[\d,.]+)/i },
  { key: "pay_roi", name: "支付 ROI", pattern: /(?:支付\s*ROI|付款\s*ROI)[^\d-]*([\d,.]+)/i },
  { key: "verify_roi", name: "核销 ROI", pattern: /(?:核销\s*ROI)[^\d-]*([\d,.]+)/i },
  { key: "gross_profit_roi", name: "毛利 ROI", pattern: /(?:毛利\s*ROI)[^\d-]*([\d,.]+)/i },
  { key: "gmv", name: "成交金额", unit: "元", pattern: /(?:成交金额|支付金额|GMV)[^\d-]*([¥￥]?\s*[\d,.]+)/i },
  { key: "live_viewers", name: "直播间观看人数", pattern: /(?:直播间观看人数|观看人数|看播人数)[^\d-]*([\d,.]+)/i },
  { key: "store_searches", name: "门店搜索量", pattern: /(?:门店搜索量|搜索量)[^\d-]*([\d,.]+)/i },
  { key: "poi_visits", name: "POI 访问量", pattern: /(?:POI访问|POI 访问|门店访问)[^\d-]*([\d,.]+)/i },
  { key: "shelf_gmv", name: "货架成交 GMV", unit: "元", pattern: /(?:货架成交|团购货架)[^\d-]*([¥￥]?\s*[\d,.]+)/i },
  { key: "search_gmv", name: "搜索成交 GMV", unit: "元", pattern: /(?:搜索成交)[^\d-]*([¥￥]?\s*[\d,.]+)/i }
];

function parseMetricValue(raw: string, unit?: string) {
  const cleaned = raw.replace(/[¥￥,\s]/g, "");
  const percent = cleaned.endsWith("%") || unit === "%";
  const value = Number(cleaned.replace("%", ""));
  if (!Number.isFinite(value)) return raw;
  return percent ? value / 100 : value;
}

export function normalizeMetrics(snapshot: CollectionSnapshotPayload): VisibleMetric[] {
  const byKey = new Map<string, VisibleMetric>();
  for (const metric of snapshot.visibleMetricsJson) {
    byKey.set(metric.key, metric);
  }

  for (const definition of metricPatterns) {
    if (byKey.has(definition.key)) continue;
    const matched = snapshot.rawDomText.match(definition.pattern);
    if (!matched?.[1]) continue;
    byKey.set(definition.key, {
      key: definition.key,
      name: definition.name,
      value: parseMetricValue(matched[1], definition.unit),
      unit: definition.unit || null,
      source: "dom"
    });
  }

  return [...byKey.values()];
}
