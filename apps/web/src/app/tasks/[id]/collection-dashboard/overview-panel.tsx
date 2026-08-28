import type { ReactNode } from "react";
import {
  collectionRouteLabels,
  type DashboardOverviewCardDTO,
  type DashboardOverviewCandidateDTO,
  type MetricReviewStatus
} from "@douyin-local-life/shared";
import type { RealtimeMetricStreamStatus } from "@/lib/realtime-metric-stream";

type OverviewPanelProps = {
  cards: DashboardOverviewCardDTO[];
  latestUpdatedAt: string | null;
  realtimeStatus: RealtimeMetricStreamStatus;
  hasRealtimeFrame: boolean;
  action: ReactNode;
  routeCoverageLabel: string;
  snapshotCount: number;
};

export function OverviewPanel({
  cards,
  latestUpdatedAt,
  realtimeStatus,
  hasRealtimeFrame,
  action,
  routeCoverageLabel,
  snapshotCount
}: OverviewPanelProps) {
  const byKey = new Map(cards.map((card) => [card.displayKey, card]));
  const hero = byKey.get("live_gmv");
  const sideMetrics = selectCards(byKey, ["local_total_watch_count", "live_orders"]);
  const operatingMetrics = selectCards(byKey, [
    "live_gpm",
    "local_live_viewers",
    "live_watch_duration",
    "live_current_online_viewers",
    "local_clicks",
    "live_transaction_users",
    "live_conversion"
  ]);
  const deliveryMetrics = selectCards(byKey, [
    "local_spend",
    "local_full_domain_gmv",
    "local_full_domain_orders",
    "local_full_domain_pay_roi",
    "local_full_domain_product_clicks"
  ]);
  const availableCount = [...sideMetrics, ...operatingMetrics, ...deliveryMetrics, ...(hero ? [hero] : [])]
    .filter((card) => card.status !== "MISSING").length;

  return (
    <section className="mx-auto mt-4 max-w-[1680px] overflow-hidden rounded-2xl border border-indigo-300/20 bg-[radial-gradient(circle_at_12%_0%,rgba(70,89,227,0.22),transparent_31%),linear-gradient(145deg,#081833_0%,#0b1d42_50%,#102752_100%)] shadow-[0_24px_62px_rgba(2,6,23,0.42)]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-5 text-white sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">经营数据总览</h2>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${realtimeStatusClass(realtimeStatus, hasRealtimeFrame)}`}>
              {realtimeStatusLabel(realtimeStatus, hasRealtimeFrame)}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">
            直播现场与投放经营使用同一套信息层级；实时 API 约每 30 秒更新一次，关键数值、来源、统计范围与更新时间仍可追溯。
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          <p className="text-xs text-slate-300">
            {latestUpdatedAt ? `最近更新 ${formatOverviewTime(latestUpdatedAt)}` : "等待首次数据"}
          </p>
          {action}
        </div>
      </div>

      <div className="p-3 sm:p-5">
        <section
          className="relative overflow-hidden rounded-[28px] border border-indigo-200/20 bg-[radial-gradient(circle_at_50%_-10%,rgba(116,137,255,0.62),transparent_38%),linear-gradient(135deg,#4a61e8_0%,#4255d9_44%,#273aa8_100%)] px-4 py-7 text-white shadow-[0_24px_55px_rgba(22,35,119,0.4)] sm:px-7 lg:px-10 lg:py-10"
          data-testid="unified-overview-board"
        >
          <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-0 h-64 w-64 rounded-full bg-indigo-950/25 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold tracking-wide">投放经营 / 全域数据</h3>
                <p className="mt-1 text-xs text-indigo-100/85">同名指标已按统一口径合并，来源冲突时保留核对提示，不相加、不平均。</p>
              </div>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-indigo-50">线路：{routeCoverageLabel}</span>
            </div>

            <div className="mt-8 grid items-center gap-6 lg:grid-cols-[1fr_1.45fr_1fr] lg:gap-10">
              <BoardMetric card={sideMetrics[0]} />
              <BoardMetric card={hero} featured />
              <BoardMetric card={sideMetrics[1]} />
            </div>

            <div className="mt-9 grid grid-cols-2 gap-x-5 gap-y-7 border-t border-white/12 pt-7 sm:grid-cols-3 lg:grid-cols-7">
              {operatingMetrics.map((card) => <BoardMetric card={card} compact key={card.displayKey} />)}
            </div>

            <div className="my-9 flex items-center gap-4" aria-hidden="true">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/55 to-white/15" />
              <span className="h-1.5 w-1.5 rotate-45 border border-white/70" />
              <span className="h-px flex-1 bg-gradient-to-r from-white/15 via-white/55 to-transparent" />
            </div>

            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-semibold tracking-[0.18em] text-indigo-50">全域投放数据</p>
                <p className="mt-1 text-[11px] text-indigo-100/75">实时消耗、成交与转化效果</p>
              </div>
              <span className="text-[11px] text-indigo-100/75">{latestUpdatedAt ? `更新 ${formatOverviewTime(latestUpdatedAt)}` : "等待数据"}</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
              {deliveryMetrics.map((card) => <BoardMetric card={card} key={card.displayKey} />)}
            </div>
          </div>
        </section>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
          <span>主屏已合并 {availableCount} 项可用指标 · 同名数据只展示一个主值，原始证据保留在详细数据</span>
          <span>正式快照 {snapshotCount} 份 · {latestUpdatedAt ? `更新时间 ${formatOverviewTime(latestUpdatedAt)}` : "更新时间暂无"}</span>
        </div>
      </div>
    </section>
  );
}

function selectCards(cards: Map<string, DashboardOverviewCardDTO>, keys: string[]) {
  return keys.map((key) => cards.get(key)).filter((card): card is DashboardOverviewCardDTO => Boolean(card));
}

function BoardMetric({
  card,
  featured = false,
  compact = false
}: {
  card: DashboardOverviewCardDTO | undefined;
  featured?: boolean;
  compact?: boolean;
}) {
  if (!card) return <div className="min-h-[82px]" />;
  return (
    <article className={`min-w-0 text-center ${featured ? "lg:px-6" : ""}`}>
      <p className={`${featured ? "text-sm" : "text-xs"} font-medium text-indigo-100`}>{card.label}</p>
      <strong className={`mt-2 block break-words font-semibold tracking-tight text-white drop-shadow-sm ${featured ? "text-5xl sm:text-6xl" : compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}>
        {formatCardValue(card)}
      </strong>
      <div className="mt-2 flex min-w-0 items-center justify-center gap-1.5 text-[10px] text-indigo-100/75">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${card.status === "REALTIME" ? "bg-emerald-300" : card.status === "CONFLICT" ? "bg-amber-300" : card.status === "SNAPSHOT" ? "bg-blue-200" : "bg-slate-300/60"}`} />
        <span className="truncate">{cardStatusLabel(card.status)} · {card.updatedAt ? formatOverviewTime(card.updatedAt) : "时间暂无"}</span>
      </div>
      {card.status === "CONFLICT" ? <p className="mt-1 text-[10px] text-amber-100">来源值不同，请展开详情核对</p> : null}
      <SourceDetails card={card} dark />
    </article>
  );
}

function SourceDetails({ card, dark }: { card: DashboardOverviewCardDTO; dark: boolean }) {
  if (!card.candidates.length && card.status === "MISSING") return null;
  return (
    <details className={`mt-3 border-t pt-2 ${dark ? "border-white/15" : "border-slate-200"}`}>
      <summary className={`cursor-pointer list-none text-[11px] font-medium ${dark ? "text-indigo-100" : "text-indigo-700"}`}>
        查看来源详情{card.candidates.length ? ` · ${card.candidates.length} 个候选` : ""}
      </summary>
      <div className={`mt-2 space-y-2 text-[11px] ${dark ? "text-indigo-50/90" : "text-slate-600"}`}>
        {card.hasConflict ? <p className={dark ? "text-amber-200" : "text-amber-700"}>来源值不一致，系统未进行相加、平均或换算。</p> : null}
        {card.candidates.length ? card.candidates.map((candidate, index) => (
          <CandidateRow candidate={candidate} dark={dark} index={index} key={`${candidate.routeKey}:${candidate.metricKey}:${candidate.sourceType}:${index}`} />
        )) : <p>暂无有效来源候选。</p>}
      </div>
    </details>
  );
}

function CandidateRow({ candidate, dark, index }: { candidate: DashboardOverviewCandidateDTO; dark: boolean; index: number }) {
  return (
    <div className={`rounded-md px-2 py-2 ${dark ? "bg-slate-950/20" : "bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{index + 1}. {sourceTypeLabel(candidate.sourceType)} · {collectionRouteLabels[candidate.routeKey] || candidate.routeKey}</span>
        <strong>{formatCandidateValue(candidate)}</strong>
      </div>
      <p className="mt-1 opacity-75">口径：{candidate.scopeLabel} · {candidateStatusLabel(candidate.valueStatus)} · {reviewStatusLabel(candidate.reviewStatus)}</p>
      <p className="mt-1 opacity-75">采集：{candidate.capturedAt ? formatOverviewTime(candidate.capturedAt) : "暂无"}</p>
    </div>
  );
}

function formatCardValue(card: DashboardOverviewCardDTO) {
  if (!card.value) return "暂无数据";
  if (card.unit === "yuan" && !/[元¥￥]/.test(card.value)) return `${card.value} 元`;
  if (card.unit === "s" && !/[秒s]/i.test(card.value)) return `${card.value}s`;
  if (card.unit === "%" && !card.value.includes("%")) return `${card.value}%`;
  return card.value;
}

function formatCandidateValue(candidate: DashboardOverviewCandidateDTO) {
  if (!candidate.displayValue && !candidate.normalizedValue) return "暂无数据";
  const value = candidate.displayValue || candidate.normalizedValue || "暂无数据";
  if (candidate.valueStatus !== "ELIGIBLE") return `${value}（${candidateStatusLabel(candidate.valueStatus)}）`;
  if (candidate.unit === "yuan" && !/[元¥￥]/.test(value)) return `${value} 元`;
  if (candidate.unit === "s" && !/[秒s]/i.test(value)) return `${value}s`;
  if (candidate.unit === "%" && !value.includes("%")) return `${value}%`;
  return value;
}

function cardStatusLabel(status: DashboardOverviewCardDTO["status"]) {
  return status === "REALTIME" ? "实时 API" : status === "SNAPSHOT" ? "正式快照" : status === "CONFLICT" ? "来源冲突" : "暂无数据";
}

function sourceTypeLabel(sourceType: DashboardOverviewCandidateDTO["sourceType"]) {
  return sourceType === "REALTIME_API" ? "实时 API" : "正式快照";
}

function candidateStatusLabel(status: DashboardOverviewCandidateDTO["valueStatus"]) {
  return status === "ELIGIBLE" ? "可作为主值" : status === "INVALID" ? "无效候选" : status === "IGNORED" ? "已忽略" : "空值";
}

function reviewStatusLabel(status: MetricReviewStatus) {
  return status === "PENDING" ? "待复核" : status === "CONFIRMED" ? "已确认" : status === "MODIFIED" ? "已修改" : "已忽略";
}

function realtimeStatusLabel(status: RealtimeMetricStreamStatus, hasFrame: boolean) {
  if (status === "CONNECTED") return hasFrame ? "约每 30 秒更新" : "已连接，等待采集";
  if (status === "RECONNECTING") return "正在重连";
  return "正在连接";
}

function realtimeStatusClass(status: RealtimeMetricStreamStatus, hasFrame: boolean) {
  if (status === "CONNECTED" && hasFrame) return "border-emerald-300/30 bg-emerald-300/15 text-emerald-100";
  if (status === "CONNECTED" && !hasFrame) return "border-blue-300/30 bg-blue-300/15 text-blue-100";
  return "border-amber-300/30 bg-amber-300/15 text-amber-100";
}

function formatOverviewTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间缺失" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
