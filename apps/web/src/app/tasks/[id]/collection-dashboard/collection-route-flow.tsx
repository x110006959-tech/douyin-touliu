import type { CollectionDashboardDTO } from "@douyin-local-life/shared";

type DashboardRoute = CollectionDashboardDTO["summary"]["routes"][number];

export function CollectionRouteFlow({
  routes,
  historicalRoutes,
}: {
  routes: DashboardRoute[];
  historicalRoutes: DashboardRoute[];
}) {
  const readyCount = routes.filter(routeHasUsableData).length;
  return (
    <div>
      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_88px_minmax(240px,0.72fr)]">
        <div className="grid gap-2">
          {routes.map((route) => <RouteProgressCard key={route.routeKey} route={route} />)}
          {!routes.length ? (
            <p className="border border-dashed border-white/20 bg-white/5 p-4 text-sm text-slate-300">
              当前任务尚未配置有效采集线路。
            </p>
          ) : null}
        </div>
        <div className="relative hidden min-h-28 items-center justify-center lg:flex" aria-hidden="true">
          <span className="absolute left-0 right-1/2 top-1/4 h-px bg-cyan-300/60" />
          <span className="absolute left-0 right-1/2 top-3/4 h-px bg-amber-300/60" />
          <span className="absolute bottom-1/4 left-1/2 top-1/4 w-px bg-white/20" />
          <span className="absolute left-1/2 right-0 top-1/2 h-px bg-white/20" />
          <span className="relative z-10 grid h-9 w-9 place-items-center rounded-full border border-indigo-200/20 bg-indigo-400/15 text-lg text-indigo-100 shadow-sm">
            →
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-slate-300 lg:hidden" aria-hidden="true">
          <span className="h-px flex-1 bg-white/15" />
          <span>↓ 汇入经营数据总览</span>
          <span className="h-px flex-1 bg-white/15" />
        </div>
        <div className="flex min-h-28 flex-col justify-center rounded-lg border border-cyan-200/15 bg-cyan-300/10 p-4">
          <p className="text-xs font-medium text-cyan-100">统一汇入</p>
          <p className="mt-1 text-base font-semibold text-white">经营数据总览</p>
          <p className="mt-2 text-xs leading-5 text-slate-200">
            {routes.length ? `${readyCount} 条线路已有可用数据` : "等待有效线路"}
            {readyCount === routes.length && routes.length ? "，可以继续校准与诊断。" : "，未就绪线路不会被静默忽略。"}
          </p>
        </div>
      </div>
      {historicalRoutes.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-xs text-slate-300">
          <span className="font-medium text-slate-200">历史线路</span>
          {historicalRoutes.map((route) => (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1" key={route.routeKey}>
              {route.label} · 已退出当前采集
            </span>
          ))}
          <span>仅保留已有记录，不计入线路进度，也无需再次采集。</span>
        </div>
      ) : null}
    </div>
  );
}

export function routeHasUsableData(route: DashboardRoute) {
  return Boolean(route.snapshotId) || ["UPLOADED", "FRESH"].includes(route.state);
}

export function routeNeedsAttention(route: DashboardRoute) {
  return ["AGING", "PARTIAL", "MANUAL_PENDING", "STALE", "FAILED"].includes(route.state);
}

export function sortPrimaryRoutes(routes: DashboardRoute[]) {
  const order = ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN"];
  return [...routes].sort((left, right) => order.indexOf(left.routeKey) - order.indexOf(right.routeKey));
}

function RouteProgressCard({ route }: { route: DashboardRoute }) {
  const tone = routeTone(route.state);
  const nextStep = routeNextStep(route);
  return (
    <article className={`relative rounded-lg border-l-[3px] border border-white/10 bg-white/[0.06] p-3 shadow-sm ${tone.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{routeDisplayLabel(route.routeKey, route.label)}</h3>
          <p className="mt-1 text-xs text-slate-300">
            {route.routeKey === "LIVE_DATA_SCREEN" ? "直播现场数据" : "投放经营数据"} · {route.metricCount} 项指标
          </p>
        </div>
        <RouteState state={route.state} />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full ${tone.bar}`}
          style={{
            width: routeHasUsableData(route) ? `${Math.max(24, Math.round((route.coverageRatio ?? 1) * 100))}%` : "0%",
          }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-300">
        {route.lastCapturedAt ? `最近采集 ${formatCaptureTime(route.lastCapturedAt)}` : nextStep}
      </p>
      {route.lastError ? (
        <p className="mt-1 text-xs text-red-200">{route.lastError}</p>
      ) : route.state === "MANUAL_PENDING" ? (
        <p className="mt-1 text-xs text-amber-200">当前快照待确认路线，不会进入校准。</p>
      ) : null}
    </article>
  );
}

function RouteState({ state }: { state: string }) {
  const tone = ["UPLOADED", "FRESH"].includes(state)
    ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-100"
    : state === "FAILED"
      ? "border-red-200/20 bg-red-300/10 text-red-100"
      : "border-amber-200/20 bg-amber-300/10 text-amber-100";
  return <span className={`rounded-full border px-2 py-1 text-xs font-medium ${tone}`}>{routeStateLabel(state)}</span>;
}

function routeStateLabel(state: string) {
  const labels: Record<string, string> = {
    PENDING: "待切换页面",
    READY: "待采集",
    MISSING: "尚未采集",
    UPLOADED: "已采集",
    FRESH: "数据新鲜",
    AGING: "即将过期",
    PARTIAL: "部分可见",
    MANUAL_PENDING: "路线待确认",
    STALE: "数据已过期",
    FAILED: "采集失败",
  };
  return labels[state] || state;
}

function routeTone(state: string) {
  return ["UPLOADED", "FRESH"].includes(state)
    ? { border: "border-l-emerald-500", bar: "bg-emerald-500" }
    : state === "FAILED"
      ? { border: "border-l-red-500", bar: "bg-red-500" }
      : { border: "border-l-amber-500", bar: "bg-amber-500" };
}

function routeNextStep(route: DashboardRoute) {
  if (route.state === "PENDING") return "切换到该页面后点击采集";
  if (route.state === "READY") return "打开该页面后点击采集";
  if (route.state === "FAILED") return "查看失败原因后重新采集";
  if (route.state === "STALE") return "数据已过期，请重新采集";
  return "等待数据状态更新";
}

function routeDisplayLabel(routeKey: DashboardRoute["routeKey"], fallback: string) {
  if (routeKey === "LOCAL_PROMOTION_DASHBOARD") return "本地推数据总览";
  if (routeKey === "LIVE_DATA_SCREEN") return "直播数据大屏";
  return fallback;
}

function formatCaptureTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间缺失"
    : date.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
