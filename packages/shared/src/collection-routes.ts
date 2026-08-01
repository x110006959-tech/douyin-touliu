export const collectionRouteKeys = [
  "LOCAL_PROMOTION_DASHBOARD",
  "LIVE_DATA_SCREEN",
  "LIVE_PRODUCT_TAB",
  "LIVE_TRAFFIC_TAB",
  "TASK_TABLE",
  "MATERIAL_LIBRARY",
  "HOURLY_TREND",
  "UNKNOWN"
] as const;

export type CollectionRouteKey = (typeof collectionRouteKeys)[number];
export type CollectionRouteState = "FRESH" | "AGING" | "STALE" | "MISSING";
export type CollectionRouteDetectionSource = "MANUAL" | "URL" | "ACTIVE_TAB" | "VISIBLE_CONTENT" | "PAGE_TYPE" | "UNKNOWN";

export type CollectionRouteDetection = {
  routeKey: CollectionRouteKey;
  source: CollectionRouteDetectionSource;
  confidence: number;
  manuallyConfirmed: boolean;
  evidence: string[];
};

export type CollectionRouteTemplate = {
  routeKey: CollectionRouteKey;
  label: string;
  website: string;
  purpose: string;
  required: boolean;
  urlHint: string;
};

export const collectionRouteTemplates: CollectionRouteTemplate[] = [
  {
    routeKey: "LIVE_DATA_SCREEN",
    label: "直播数据大屏概览",
    website: "抖音生活服务直播数据大屏",
    purpose: "采集成交、观看、曝光和直播间承接指标",
    required: true,
    urlHint: "请在已登录的直播数据大屏打开概览页面"
  },
  {
    routeKey: "LIVE_PRODUCT_TAB",
    label: "直播大屏商品页",
    website: "抖音生活服务直播数据大屏",
    purpose: "采集商品支付、订单、曝光和商品转化数据",
    required: false,
    urlHint: "请在已登录的直播数据大屏切换到“商品”"
  },
  {
    routeKey: "LIVE_TRAFFIC_TAB",
    label: "直播大屏流量页",
    website: "抖音生活服务直播数据大屏",
    purpose: "采集自然流量、商业流量和流量趋势",
    required: false,
    urlHint: "请在已登录的直播数据大屏切换到“流量”"
  },
  {
    routeKey: "LOCAL_PROMOTION_DASHBOARD",
    label: "巨量本地推数据总览",
    website: "巨量本地推",
    purpose: "采集消耗、预算、ROI、订单和成本指标",
    required: true,
    urlHint: "请在已登录的巨量本地推后台打开数据总览"
  },
  {
    routeKey: "TASK_TABLE",
    label: "巨量本地推任务列表",
    website: "巨量本地推",
    purpose: "采集计划状态、预算、出价和任务层级数据",
    required: true,
    urlHint: "请在已登录的巨量本地推后台打开任务或计划列表"
  }
];

export const collectionRouteLabels = Object.fromEntries(
  collectionRouteTemplates.map((route) => [route.routeKey, route.label])
) as Partial<Record<CollectionRouteKey, string>>;

export const supportedCollectionHosts = [
  "douyin.com",
  "douyinlife.com",
  "juliangengine.com",
  "oceanengine.com",
  "bytedance.com",
  "localads.chengzijianzhan.cn"
] as const;

// Extension host permissions are deliberately narrower than the legacy URL allowlist.
export const trustedExtensionCollectionHosts = [
  "eos.douyin.com",
  "localads.chengzijianzhan.cn"
] as const;

export function isSupportedCollectionUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return supportedCollectionHosts.some((allowed) => host === allowed || (allowed !== "localads.chengzijianzhan.cn" && host.endsWith(`.${allowed}`)));
  } catch {
    return false;
  }
}

export function isTrustedExtensionCollectionUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && trustedExtensionCollectionHosts.includes(url.hostname.toLowerCase() as typeof trustedExtensionCollectionHosts[number]);
  } catch {
    return false;
  }
}

export const collectionFreshnessPolicy = {
  agingAfterMs: 5 * 60 * 1000,
  staleAfterMs: 10 * 60 * 1000,
  patrolIntervalMs: 60 * 1000,
  heartbeatUploadMs: 5 * 60 * 1000,
  routeFailureThreshold: 3
} as const;

export const defaultRequiredCollectionRoutes: CollectionRouteKey[] = [
  "LOCAL_PROMOTION_DASHBOARD",
  "LIVE_DATA_SCREEN",
  "TASK_TABLE"
];

export type CollectionRouteHealth = {
  routeKey: CollectionRouteKey;
  state: CollectionRouteState;
  lastCollectedAt: string | null;
  ageMs: number | null;
};

export type CollectionQuality = {
  requiredRoutes: CollectionRouteKey[];
  routes: CollectionRouteHealth[];
  diagnostics?: import("./collection-diagnostics.js").CollectionRouteDiagnostic[];
  completeness: number;
  missingRoutes: CollectionRouteKey[];
  staleRoutes: CollectionRouteKey[];
  blocksStrongActions: boolean;
};

export function normalizeCollectionRouteKey(value: unknown): CollectionRouteKey {
  return collectionRouteKeys.includes(value as CollectionRouteKey) ? (value as CollectionRouteKey) : "UNKNOWN";
}

export function detectActiveCollectionRoute(input: {
  pageType?: string | null;
  sourceUrl?: string | null;
  pageTitle?: string | null;
  selectedTabLabels?: string[];
  visibleHeadings?: string[];
  visibleText?: string | null;
  manualOverride?: CollectionRouteKey | null;
}): CollectionRouteDetection {
  if (input.manualOverride && input.manualOverride !== "UNKNOWN") {
    return {
      routeKey: input.manualOverride,
      source: "MANUAL",
      confidence: 1,
      manuallyConfirmed: true,
      evidence: [`人工选择：${collectionRouteLabels[input.manualOverride] || input.manualOverride}`]
    };
  }

  const urlRoute = routeFromUrl(input.sourceUrl);
  const selectedRoutes = [...new Set((input.selectedTabLabels || []).map(routeFromSelectedLabel).filter((route): route is CollectionRouteKey => Boolean(route)))];
  if (selectedRoutes.length > 1) {
    return {
      routeKey: "UNKNOWN",
      source: "UNKNOWN",
      confidence: 0,
      manuallyConfirmed: false,
      evidence: [`检测到冲突的选中分栏：${selectedRoutes.join(" / ")}`]
    };
  }

  const headingRoutes = [...new Set([input.pageTitle || "", ...(input.visibleHeadings || [])]
    .map(routeFromSpecificHeading)
    .filter((route): route is CollectionRouteKey => Boolean(route)))];
  if (headingRoutes.length > 1) {
    return {
      routeKey: "UNKNOWN",
      source: "UNKNOWN",
      confidence: 0,
      manuallyConfirmed: false,
      evidence: [`检测到冲突的专属标题：${headingRoutes.join(" / ")}`]
    };
  }

  const content = `${input.pageTitle || ""}\n${(input.visibleHeadings || []).join("\n")}\n${input.visibleText || ""}`;
  const scores: Array<{ routeKey: CollectionRouteKey; score: number; markers: string[] }> = [
    scoreRoute("LIVE_PRODUCT_TAB", content, ["商品列表", "关注商品", "推荐返场", "商品画像", "商品曝光次数", "商品点击人数", "支付成功用户数"]),
    scoreRoute("LIVE_TRAFFIC_TAB", content, ["直播流量", "流量分析", "小时看播次数", "小时自然看播次数", "小时商业看播次数", "流量渠道", "引流短视频"]),
    scoreRoute("LIVE_DATA_SCREEN", content, ["直播间成交金额", "趋势分析", "用户画像", "转化分析", "累计曝光次数", "商品转化率"])
  ].filter((item) => item.score >= 2);
  scores.sort((left, right) => right.score - left.score);
  const contentWinner = scores.length && (scores.length === 1 || scores[0]!.score > scores[1]!.score)
    ? scores[0]!
    : null;
  const candidates = [
    urlRoute ? { routeKey: urlRoute, source: "URL" as const, confidence: 0.98, evidence: `URL：${urlRoute}` } : null,
    selectedRoutes[0] ? { routeKey: selectedRoutes[0], source: "ACTIVE_TAB" as const, confidence: 0.92, evidence: `选中分栏：${(input.selectedTabLabels || []).join(" / ")}` } : null,
    headingRoutes[0] ? { routeKey: headingRoutes[0], source: "VISIBLE_CONTENT" as const, confidence: 0.9, evidence: `专属标题：${collectionRouteLabels[headingRoutes[0]] || headingRoutes[0]}` } : null,
    contentWinner ? { routeKey: contentWinner.routeKey, source: "VISIBLE_CONTENT" as const, confidence: Math.min(0.9, 0.68 + contentWinner.score * 0.05), evidence: contentWinner.markers.map((marker) => `可见内容：${marker}`).join("；") } : null
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  const distinctRoutes = [...new Set(candidates.map((candidate) => candidate.routeKey))];
  if (distinctRoutes.length > 1) {
    return {
      routeKey: "UNKNOWN",
      source: "UNKNOWN",
      confidence: 0,
      manuallyConfirmed: false,
      evidence: candidates.map((candidate) => candidate.evidence)
    };
  }
  const candidate = candidates[0];
  if (candidate) {
    return {
      routeKey: candidate.routeKey,
      source: candidate.source,
      confidence: candidate.confidence,
      manuallyConfirmed: false,
      evidence: candidates.map((item) => item.evidence)
    };
  }

  const pageType = normalizeCollectionRouteKey(input.pageType);
  if (pageType !== "UNKNOWN" && pageType !== "LIVE_DATA_SCREEN") {
    return { routeKey: pageType, source: "PAGE_TYPE", confidence: 0.7, manuallyConfirmed: false, evidence: [`页面类型：${pageType}`] };
  }
  return { routeKey: "UNKNOWN", source: "UNKNOWN", confidence: 0, manuallyConfirmed: false, evidence: ["当前可见区域不足以确定分栏"] };
}

export function inferCollectionRoute(input: { pageType?: string | null; sourceUrl?: string | null; pageTitle?: string | null }): CollectionRouteKey {
  const detected = detectActiveCollectionRoute({ ...input, visibleHeadings: input.pageTitle ? [input.pageTitle] : [] });
  if (detected.routeKey !== "UNKNOWN") return detected.routeKey;
  const haystack = `${input.sourceUrl || ""}\n${input.pageTitle || ""}`.toLowerCase();
  if (/material|creative|素材/.test(haystack)) return "MATERIAL_LIBRARY";
  if (/hour|trend|小时|趋势/.test(haystack)) return "HOURLY_TREND";
  if (/task|campaign|计划|任务/.test(haystack)) return "TASK_TABLE";
  const pageType = normalizeCollectionRouteKey(input.pageType);
  if (pageType !== "UNKNOWN" && pageType !== "LIVE_DATA_SCREEN") return pageType;
  if (/promotion|local|投放|本地推/.test(haystack)) return "LOCAL_PROMOTION_DASHBOARD";
  return "UNKNOWN";
}

function routeFromUrl(value?: string | null): CollectionRouteKey | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const mode = ["mode", "tab", "view", "section"].map((key) => url.searchParams.get(key)?.toLowerCase() || "").join(" ");
    if (host === "localads.chengzijianzhan.cn" && /\/lamp\/pc\/liveboard2(?:\/|$)/.test(path)) return "LOCAL_PROMOTION_DASHBOARD";
    if (host === "localads.chengzijianzhan.cn" && /\/lamp\/pc\/promotion\/roi2(?:\/|$)/.test(path)) return "TASK_TABLE";
    if (/\b(product|products|goods|commodity)\b/.test(mode) || /\/(product|goods)(?:\/|$)/.test(path)) return "LIVE_PRODUCT_TAB";
    if (/\b(traffic|flow|channel)\b/.test(mode) || /\/(traffic|flow)(?:\/|$)/.test(path)) return "LIVE_TRAFFIC_TAB";
    if ((/\b(main|overview|summary)\b/.test(mode) && /live|room|screen|liveboard/.test(path))) return "LIVE_DATA_SCREEN";
    if (/material|creative/.test(path)) return "MATERIAL_LIBRARY";
    if (/task|campaign/.test(path)) return "TASK_TABLE";
  } catch {
    return null;
  }
  return null;
}

function routeFromSelectedLabel(value: string): CollectionRouteKey | null {
  const label = value.replace(/[\s\u00a0]+/g, "").replace(/[（(].*?[）)]/g, "");
  if (["概览", "直播概览", "数据概览"].includes(label)) return "LIVE_DATA_SCREEN";
  if (["商品", "商品分析", "商品列表"].includes(label)) return "LIVE_PRODUCT_TAB";
  if (["流量", "流量分析", "直播流量"].includes(label)) return "LIVE_TRAFFIC_TAB";
  return null;
}

function routeFromSpecificHeading(value: string): CollectionRouteKey | null {
  const heading = value.replace(/[\s\u00a0]+/g, "");
  if (/商品列表|关注商品|推荐返场|商品画像/.test(heading)) return "LIVE_PRODUCT_TAB";
  if (/直播流量|流量分析|流量趋势/.test(heading)) return "LIVE_TRAFFIC_TAB";
  if (/直播间成交金额|直播数据大屏概览/.test(heading)) return "LIVE_DATA_SCREEN";
  return null;
}

function scoreRoute(routeKey: CollectionRouteKey, content: string, markers: string[]) {
  const matched = markers.filter((marker) => content.includes(marker));
  return { routeKey, score: matched.length, markers: matched };
}

export function assessCollectionQuality(
  requiredRoutes: readonly CollectionRouteKey[],
  snapshots: Array<{ routeKey?: string | null; pageType?: string | null; sourceUrl?: string | null; pageTitle?: string | null; localCollectedAt: Date | string }>,
  now = new Date()
): CollectionQuality {
  const required = [...new Set(requiredRoutes.map(normalizeCollectionRouteKey).filter((route) => route !== "UNKNOWN"))];
  const latest = new Map<CollectionRouteKey, Date>();
  for (const snapshot of snapshots) {
    const routeKey = normalizeCollectionRouteKey(snapshot.routeKey) === "UNKNOWN" ? inferCollectionRoute(snapshot) : normalizeCollectionRouteKey(snapshot.routeKey);
    const collectedAt = snapshot.localCollectedAt instanceof Date ? snapshot.localCollectedAt : new Date(snapshot.localCollectedAt);
    if (Number.isNaN(collectedAt.getTime())) continue;
    const previous = latest.get(routeKey);
    if (!previous || collectedAt > previous) latest.set(routeKey, collectedAt);
  }

  const routes = required.map((routeKey): CollectionRouteHealth => {
    const collectedAt = latest.get(routeKey);
    if (!collectedAt) return { routeKey, state: "MISSING", lastCollectedAt: null, ageMs: null };
    const ageMs = Math.max(0, now.getTime() - collectedAt.getTime());
    const state: CollectionRouteState = ageMs > collectionFreshnessPolicy.staleAfterMs
      ? "STALE"
      : ageMs > collectionFreshnessPolicy.agingAfterMs
        ? "AGING"
        : "FRESH";
    return { routeKey, state, lastCollectedAt: collectedAt.toISOString(), ageMs };
  });
  const missingRoutes = routes.filter((route) => route.state === "MISSING").map((route) => route.routeKey);
  const staleRoutes = routes.filter((route) => route.state === "STALE").map((route) => route.routeKey);
  const available = routes.filter((route) => route.state === "FRESH" || route.state === "AGING").length;
  const completeness = required.length ? Math.round((available / required.length) * 100) / 100 : 1;
  return {
    requiredRoutes: required,
    routes,
    completeness,
    missingRoutes,
    staleRoutes,
    blocksStrongActions: missingRoutes.length > 0 || staleRoutes.length > 0
  };
}
