export const collectionRouteKeys = [
  "LOCAL_PROMOTION_DASHBOARD",
  "LIVE_DATA_SCREEN",
  "TASK_TABLE",
  "MATERIAL_LIBRARY",
  "HOURLY_TREND",
  "UNKNOWN"
] as const;

export type CollectionRouteKey = (typeof collectionRouteKeys)[number];
export type CollectionRouteState = "FRESH" | "AGING" | "STALE" | "MISSING";

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
  completeness: number;
  missingRoutes: CollectionRouteKey[];
  staleRoutes: CollectionRouteKey[];
  blocksStrongActions: boolean;
};

export function normalizeCollectionRouteKey(value: unknown): CollectionRouteKey {
  return collectionRouteKeys.includes(value as CollectionRouteKey) ? (value as CollectionRouteKey) : "UNKNOWN";
}

export function inferCollectionRoute(input: { pageType?: string | null; sourceUrl?: string | null; pageTitle?: string | null }): CollectionRouteKey {
  const haystack = `${input.sourceUrl || ""}\n${input.pageTitle || ""}`.toLowerCase();
  if (/material|creative|素材/.test(haystack)) return "MATERIAL_LIBRARY";
  if (/hour|trend|小时|趋势/.test(haystack)) return "HOURLY_TREND";
  if (/task|campaign|计划|任务/.test(haystack)) return "TASK_TABLE";
  if (/live|room|直播|大屏/.test(haystack)) return "LIVE_DATA_SCREEN";
  const pageType = normalizeCollectionRouteKey(input.pageType);
  if (pageType !== "UNKNOWN") return pageType;
  if (/promotion|local|投放|本地推/.test(haystack)) return "LOCAL_PROMOTION_DASHBOARD";
  return "UNKNOWN";
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
