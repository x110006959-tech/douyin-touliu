import type { CaptureMeta, PageType, VisibleMetric } from "@douyin-local-life/shared";

export type PageAdapterInput = {
  document: Document;
  url: string;
  title: string;
  visibleText: string;
  tables: unknown[];
};

export type PageAdapter = {
  id: string;
  version: string;
  pageType: PageType;
  expectedFields: string[];
  detect(input: PageAdapterInput): boolean;
  extractMetrics(input: PageAdapterInput): VisibleMetric[];
  extractCoverage(input: PageAdapterInput, metrics: VisibleMetric[]): CaptureMeta;
};

type MetricDefinition = { key: string; name: string; unit?: string; labels: string[] };

const commonMetrics: MetricDefinition[] = [
  { key: "spend", name: "ad spend", unit: "yuan", labels: ["消耗", "广告消耗", "今日消耗"] },
  { key: "daily_budget", name: "daily budget", unit: "yuan", labels: ["日预算", "预算"] },
  { key: "remaining_budget", name: "remaining budget", unit: "yuan", labels: ["剩余预算"] },
  { key: "impressions", name: "impressions", labels: ["曝光次数", "曝光量", "商品曝光人数", "直播曝光人数"] },
  { key: "clicks", name: "clicks", labels: ["点击人数", "商品点击人数", "点击次数"] },
  { key: "ctr", name: "click through rate", unit: "%", labels: ["商品点击率", "点击率", "CTR"] },
  { key: "orders", name: "orders", labels: ["成交订单数", "支付订单", "支付订单数", "成交人数"] },
  { key: "pay_roi", name: "pay ROI", labels: ["支付 ROI", "付款 ROI"] },
  { key: "verify_roi", name: "verify ROI", labels: ["核销 ROI"] },
  { key: "gross_profit_roi", name: "gross profit ROI", labels: ["毛利 ROI"] },
  { key: "gmv", name: "GMV", unit: "yuan", labels: ["成交金额", "支付金额", "GMV"] },
  { key: "live_viewers", name: "live viewers", labels: ["直播间观看人数", "观看人数", "看播人数", "整场累计看播人数"] },
  { key: "store_searches", name: "store searches", labels: ["门店搜索量", "搜索量"] },
  { key: "poi_visits", name: "POI visits", labels: ["POI访问", "POI 访问", "门店访问"] },
  { key: "shelf_gmv", name: "shelf GMV", unit: "yuan", labels: ["货架成交", "团购货架"] },
  { key: "search_gmv", name: "search GMV", unit: "yuan", labels: ["搜索成交"] }
];

const adapters: PageAdapter[] = [
  createAdapter("live-screen", "LIVE_DATA_SCREEN", ["gmv", "live_viewers", "impressions", "clicks", "orders"], ["直播数据大屏", "直播间", "看播", "曝光人数", "成交人数"]),
  createAdapter("local-promotion", "LOCAL_PROMOTION_DASHBOARD", ["spend", "daily_budget", "pay_roi", "orders", "impressions", "clicks"], ["巨量本地推", "本地推", "投放", "出价", "预算", "消耗"]),
  createAdapter("task-table", "TASK_TABLE", ["spend", "daily_budget", "orders"], ["任务列表", "计划列表", "广告组", "单元", "创意", "状态"])
];

export function selectPageAdapter(input: PageAdapterInput): PageAdapter {
  return adapters.find((adapter) => adapter.detect(input)) || unknownAdapter;
}

function createAdapter(id: string, pageType: PageType, expectedFields: string[], keywords: string[]): PageAdapter {
  return {
    id,
    version: "1.0.0",
    pageType,
    expectedFields,
    detect(input) {
      const combined = `${input.title}\n${input.url}\n${input.visibleText.slice(0, 50_000)}`;
      return keywords.some((keyword) => combined.includes(keyword));
    },
    extractMetrics(input) {
      return extractMetricsFromText(input.visibleText);
    },
    extractCoverage(input, metrics) {
      return buildCaptureMeta(this, input, metrics);
    }
  };
}

const unknownAdapter: PageAdapter = {
  id: "unknown-page",
  version: "1.0.0",
  pageType: "UNKNOWN",
  expectedFields: [],
  detect: () => true,
  extractMetrics: (input) => extractMetricsFromText(input.visibleText),
  extractCoverage(input, metrics) {
    return buildCaptureMeta(this, input, metrics);
  }
};

function extractMetricsFromText(text: string): VisibleMetric[] {
  return commonMetrics.flatMap((definition) => {
    const evidence = extractValueAfterAnyLabel(text, definition.labels);
    if (!evidence) return [];
    return [{
      key: definition.key,
      name: definition.name,
      value: parseValue(evidence.raw, definition.unit),
      unit: definition.unit || null,
      source: "dom" as const,
      metricSource: "DOM_TEXT" as const,
      confidence: 0.6,
      rawEvidence: { sourceType: "DOM_TEXT", textSnippet: evidence.textSnippet }
    }];
  });
}

function buildCaptureMeta(adapter: PageAdapter, input: PageAdapterInput, metrics: VisibleMetric[]): CaptureMeta {
  const extractedFields = [...new Set(metrics.map((metric) => String(metric.key)))];
  const expected = adapter.expectedFields;
  const matched = expected.filter((field) => extractedFields.includes(field)).length;
  const coverageRatio = expected.length ? matched / expected.length : 0;
  const renderModes: CaptureMeta["renderModes"] = ["DOM"];
  if (input.document.querySelector("table")) renderModes.push("TABLE");
  if (input.document.querySelector("canvas")) renderModes.push("CANVAS");
  if (detectVirtualizedContent(input.document)) renderModes.push("VIRTUALIZED");
  const partialRender = renderModes.includes("CANVAS") || renderModes.includes("VIRTUALIZED");
  const completeness = adapter.pageType === "UNKNOWN" ? "UNKNOWN" : partialRender || coverageRatio < 0.75 ? "PARTIAL" : "COMPLETE";
  const originalBytes = byteLength(input.visibleText) + byteLength(safeStringify(input.tables));
  const truncatedFields = input.visibleText.length >= 200_000 ? ["rawDomText"] : [];
  return {
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    pageFingerprint: fingerprintPage(input),
    completeness,
    coverageRatio: Math.round(coverageRatio * 100) / 100,
    expectedFields: expected,
    extractedFields,
    visibleRegions: [...input.document.querySelectorAll("h1,h2,h3,[role=heading]")].slice(0, 30).map((element) => (element.textContent || "").trim()).filter(Boolean),
    renderModes: [...new Set(renderModes)],
    tabState: input.document.visibilityState === "visible" ? "VISIBLE" : "HIDDEN",
    originalBytes,
    acceptedBytes: originalBytes,
    truncatedFields,
    truncationReasons: truncatedFields.length ? ["DOM_TEXT_LIMIT"] : []
  };
}

function detectVirtualizedContent(document: Document) {
  return [...document.querySelectorAll("[aria-rowcount]")].some((element) => {
    const total = Number(element.getAttribute("aria-rowcount") || 0);
    const rendered = element.querySelectorAll('[role="row"]').length;
    return total > rendered && rendered > 0;
  });
}

function fingerprintPage(input: PageAdapterInput) {
  const headers = [...input.document.querySelectorAll("h1,h2,h3,th,[role=columnheader]")]
    .slice(0, 50)
    .map((element) => (element.textContent || "").trim())
    .join("|");
  let value = `${new URL(input.url).hostname}${new URL(input.url).pathname}|${input.title}|${headers}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function extractValueAfterAnyLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const index = text.indexOf(label);
    if (index < 0) continue;
    const slice = text.slice(index + label.length, index + label.length + 120);
    const matched = slice.match(/[¥￥]?\s*-?\d[\d,]*(?:\.\d+)?\s*(?:万|w|W|%)?/);
    if (matched?.[0]) return { raw: matched[0], textSnippet: text.slice(Math.max(0, index - 40), Math.min(text.length, index + label.length + 120)) };
  }
  return null;
}

function parseValue(raw: string, unit?: string) {
  const multiplier = /万|w/i.test(raw) ? 10_000 : 1;
  const percent = raw.includes("%") || unit === "%";
  const value = Number(raw.replace(/[¥￥,\s%万wW]/g, ""));
  if (!Number.isFinite(value)) return raw;
  const normalized = value * multiplier;
  return percent ? normalized / 100 : normalized;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function safeStringify(value: unknown) {
  try { return JSON.stringify(value) || ""; } catch { return ""; }
}
