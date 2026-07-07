import {
  identifyMetricKey,
  metricKeyLabels,
  standardizeMetricKey,
  type CollectionSnapshotPayload,
  type MetricKey,
  type VisibleMetric
} from "@douyin-local-life/shared";

const metricPatterns: Array<{ key: MetricKey; unit?: string; pattern: RegExp }> = [
  { key: "spend", unit: "元", pattern: /(?:消耗|广告消耗|今日消耗|投放消耗)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "daily_budget", unit: "元", pattern: /(?:日预算|预算)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "remaining_budget", unit: "元", pattern: /(?:剩余预算)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "impressions", pattern: /(?:曝光量|曝光次数|商品曝光人数|直播曝光人数|累计曝光次数)[^\d-]*([\d,.]+(?:万|千)?)/i },
  { key: "clicks", pattern: /(?:点击量|点击人数|商品点击人数)[^\d-]*([\d,.]+(?:万|千)?)/i },
  { key: "ctr", unit: "%", pattern: /(?:点击率|CTR|商品点击率)[^\d-]*([\d,.]+%?)/i },
  { key: "orders", pattern: /(?:成交订单数|成交人数|支付订单数|支付订单)[^\d-]*([\d,.]+(?:万|千)?)/i },
  { key: "cpa", unit: "元", pattern: /(?:转化成本|成交成本|订单成本|CPA)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "target_cpa", unit: "元", pattern: /(?:目标\s*CPA|目标成本)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "pay_roi", pattern: /(?:支付\s*ROI|付款\s*ROI)[^\d-]*([\d,.]+)/i },
  { key: "verify_roi", pattern: /(?:核销\s*ROI)[^\d-]*([\d,.]+)/i },
  { key: "gross_profit_roi", pattern: /(?:毛利\s*ROI|核销毛利\s*ROI)[^\d-]*([\d,.]+)/i },
  { key: "target_roi", pattern: /(?:目标\s*ROI)[^\d-]*([\d,.]+)/i },
  { key: "gmv", unit: "元", pattern: /(?:成交金额|支付金额|GMV)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "live_viewers", pattern: /(?:直播间观看人数|观看人数|看播人数|累计在线人数)[^\d-]*([\d,.]+(?:万|千)?)/i },
  { key: "gpm", pattern: /(?:GPM|千次观看成交金额)[^\d-]*([\d,.]+)/i },
  { key: "store_searches", pattern: /(?:门店搜索量|搜索量)[^\d-]*([\d,.]+(?:万|千)?)/i },
  { key: "poi_visits", pattern: /(?:POI访问|POI 访问|门店访问)[^\d-]*([\d,.]+(?:万|千)?)/i },
  { key: "shelf_gmv", unit: "元", pattern: /(?:货架成交|团购货架)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "search_gmv", unit: "元", pattern: /(?:搜索成交)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "gross_profit", unit: "元", pattern: /(?:核销毛利|毛利)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "merchant_subsidy", unit: "元", pattern: /(?:商家补贴)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i },
  { key: "service_fee", unit: "元", pattern: /(?:服务费|服务商费用)[^\d-]*([¥￥]?\s*[\d,.]+(?:万|千)?)/i }
];

export function normalizeMetrics(snapshot: CollectionSnapshotPayload): VisibleMetric[] {
  const known = new Map<MetricKey, VisibleMetric>();
  const unknown: VisibleMetric[] = [];

  for (const metric of snapshot.visibleMetricsJson) {
    const normalized = withSourceDefaults(metric);
    if (normalized.key === "unknown") {
      unknown.push(normalized);
    } else {
      known.set(normalized.key as MetricKey, normalized);
    }
  }

  for (const definition of metricPatterns) {
    if (known.has(definition.key)) continue;
    const matched = snapshot.rawDomText.match(definition.pattern);
    if (!matched?.[1]) continue;
    known.set(definition.key, {
      key: definition.key,
      name: metricKeyLabels[definition.key],
      value: parseMetricValue(matched[1], definition.unit),
      unit: definition.unit || null,
      source: "dom",
      metricSource: "DOM_TEXT",
      confidence: 0.6,
      rawEvidence: {
        sourceType: "DOM_TEXT",
        textSnippet: matched[0].slice(0, 160)
      }
    });
  }

  return [...known.values(), ...unknown];
}

function withSourceDefaults(metric: VisibleMetric): VisibleMetric {
  const standardKey = standardizeMetricKey(metric);
  const metricSource = metric.metricSource || metricSourceFromLegacy(metric.source);
  const isKnown = standardKey !== "unknown";
  return {
    ...metric,
    key: standardKey,
    name: isKnown ? metricKeyLabels[standardKey] : metric.name || metric.key || metricKeyLabels.unknown,
    metricSource,
    confidence: metric.confidence ?? defaultConfidence(metricSource, standardKey),
    rawEvidence:
      metric.rawEvidence ??
      (isKnown
        ? null
        : {
            sourceType: metricSource,
            path: "visibleMetricsJson",
            textSnippet: `${metric.key}:${metric.name}`
          })
  };
}

function parseMetricValue(raw: string, unit?: string) {
  const text = raw.trim();
  const multiplier = text.includes("万") ? 10_000 : text.includes("千") ? 1_000 : 1;
  const cleaned = text.replace(/[¥￥%\s,]/g, "").replace(/[万千]/g, "");
  const percent = text.includes("%") || unit === "%";
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return raw;
  return percent ? value / 100 : value * multiplier;
}

function metricSourceFromLegacy(source: VisibleMetric["source"]): NonNullable<VisibleMetric["metricSource"]> {
  if (source === "network") return "XHR_JSON";
  if (source === "table") return "TABLE";
  if (source === "manual") return "MANUAL_INPUT";
  return "DOM_TEXT";
}

function defaultConfidence(source: NonNullable<VisibleMetric["metricSource"]>, key: string) {
  if (identifyMetricKey(key) === "unknown") return 0.4;
  if (source === "MANUAL_INPUT") return 1;
  if (source === "XHR_JSON") return 0.85;
  if (source === "TABLE") return 0.75;
  if (source === "DOM_TEXT") return 0.6;
  return 0.5;
}
