"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  collectionRouteLabels,
  identifyMetricKey,
  metricCategories,
  metricKeyCategories,
  type CollectionDashboardDTO,
  type MetricCategory,
  type MetricReviewStatus,
  type ReviewedMetricDTO,
  type TableCellReviewDTO
} from "@douyin-local-life/shared";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { apiFetch, createIdempotencyKey } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import type { DecisionPreview } from "../task-types";
import { collectionDashboardCalibrationState, collectionDashboardRefreshMode } from "./refresh-policy";

type CellDraft = {
  reviewedValue: string;
  reviewStatus: Exclude<MetricReviewStatus, "PENDING">;
};

export default function CollectionDashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token, hydrated } = useAuth();
  const [dashboard, setDashboard] = useState<CollectionDashboardDTO | null>(null);
  const [metrics, setMetrics] = useState<ReviewedMetricDTO[]>([]);
  const [metricDrafts, setMetricDrafts] = useState<Record<string, string>>({});
  const [metricPeriodDrafts, setMetricPeriodDrafts] = useState<Record<string, string>>({});
  const [cellDrafts, setCellDrafts] = useState<Record<string, CellDraft>>({});
  const [tablePages, setTablePages] = useState<Record<string, number>>({});
  const [routeFilter, setRouteFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | MetricReviewStatus>("ALL");
  const [metricCategoryFilter, setMetricCategoryFilter] = useState<"ALL" | MetricCategory>("ALL");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshAvailable, setRefreshAvailable] = useState(false);
  const latestCaptureRef = useRef<string | null>(null);
  const decisionIdempotencyKey = useRef("");

  async function load() {
    if (!token) return;
    setError("");
    try {
      const [nextDashboard, nextMetrics] = await Promise.all([
        apiFetch<CollectionDashboardDTO>(`/collection-tasks/${params.id}/collection-dashboard`, token),
        apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics`, token)
      ]);
      setDashboard(nextDashboard);
      setMetrics(nextMetrics);
      setMetricDrafts(Object.fromEntries(nextMetrics.map((metric) => [metric.id, metric.reviewedValue ?? metric.originalValue ?? ""])));
      setMetricPeriodDrafts(Object.fromEntries(nextMetrics.map((metric) => [metric.id, metric.timeRange && metric.timeRange !== "UNKNOWN" ? metric.timeRange : ""])));
      setCellDrafts((current) => retainCurrentCellDrafts(current, nextDashboard));
      latestCaptureRef.current = nextDashboard.summary.latestCapturedAt;
      setRefreshAvailable(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取校准大屏失败");
    }
  }

  useEffect(() => { void load(); }, [params.id, token]);

  const hasUnsavedEdits = useMemo(() => (
    Object.keys(cellDrafts).length > 0
    || metrics.some((metric) => (metricDrafts[metric.id] ?? "") !== (metric.reviewedValue ?? metric.originalValue ?? ""))
    || metrics.some((metric) => (metricPeriodDrafts[metric.id] ?? "") !== (metric.timeRange && metric.timeRange !== "UNKNOWN" ? metric.timeRange : ""))
  ), [cellDrafts, metricDrafts, metricPeriodDrafts, metrics]);
  const refreshMode = collectionDashboardRefreshMode(
    dashboard?.summary.collectionRun?.status,
    hasUnsavedEdits
  );

  useEffect(() => {
    if (!token || refreshMode === "IDLE") return;
    const timer = window.setInterval(() => {
      if (refreshMode === "CHECK_ONLY") {
        void checkForNewCapture();
        return;
      }
      void load();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [params.id, refreshMode, token]);

  async function checkForNewCapture() {
    if (!token) return;
    try {
      const nextDashboard = await apiFetch<CollectionDashboardDTO>(`/collection-tasks/${params.id}/collection-dashboard`, token);
      if (nextDashboard.summary.latestCapturedAt !== latestCaptureRef.current) setRefreshAvailable(true);
    } catch {
      // The existing data remains editable; a later refresh will report a readable error.
    }
  }

  const visibleMetrics = useMemo(() => metrics.filter((metric) => {
    const routeMatches = routeFilter === "ALL" || metricRouteKey(metric, dashboard) === routeFilter;
    const categoryMatches = metricCategoryFilter === "ALL" || metricCategory(metric.metricKey) === metricCategoryFilter;
    return routeMatches && categoryMatches && (statusFilter === "ALL" || metric.reviewStatus === statusFilter);
  }), [dashboard, metricCategoryFilter, metrics, routeFilter, statusFilter]);
  const visibleTables = useMemo(() => dashboard?.summary.tables.filter((table) => {
    if (routeFilter !== "ALL" && table.routeKey !== routeFilter) return false;
    if (statusFilter === "ALL") return true;
    return table.rows.some((row, rowIndex) => row.some((_cell, columnIndex) =>
      (cellReviewAt(table, rowIndex, columnIndex)?.reviewStatus || "PENDING") === statusFilter
    ));
  }) || [], [dashboard, routeFilter, statusFilter]);

  async function updateMetric(metric: ReviewedMetricDTO, reviewStatus: Exclude<MetricReviewStatus, "PENDING">) {
    if (!token) return;
    const expectedSnapshotUpdatedAt = snapshotVersionForMetric(metric, dashboard);
    if (!expectedSnapshotUpdatedAt) {
      setError("当前指标不属于可校准的最新快照，请刷新后重试");
      return;
    }
    setBusy(`metric:${metric.id}`); setError("");
    try {
      const updated = await apiFetch<ReviewedMetricDTO>(`/review-metrics/${metric.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          expectedSnapshotUpdatedAt,
          reviewStatus,
          reviewedValue: reviewStatus === "MODIFIED" ? metricDrafts[metric.id] || "" : undefined,
          timeRange: reviewStatus === "MODIFIED" ? metricPeriodDrafts[metric.id] || "" : undefined
        })
      });
      setMetrics((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage("指标校准已保存。");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存指标失败");
    } finally { setBusy(""); }
  }

  async function confirmAllMetrics() {
    if (!token) return;
    const snapshotVersions = snapshotVersionsForMetrics(metrics, dashboard);
    if (!snapshotVersions) {
      setError("当前指标不属于可校准的最新快照，请刷新后重试");
      return;
    }
    setBusy("confirm-metrics"); setError("");
    try {
      const updated = await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics/confirm-all`, token, {
        method: "POST",
        body: JSON.stringify({ snapshotVersions })
      });
      setMetrics(updated);
      setMetricDrafts(Object.fromEntries(updated.map((metric) => [metric.id, metric.reviewedValue ?? metric.originalValue ?? ""])));
      setMetricPeriodDrafts(Object.fromEntries(updated.map((metric) => [metric.id, metric.timeRange && metric.timeRange !== "UNKNOWN" ? metric.timeRange : ""])));
      setMessage("全部待确认指标已确认。");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "批量确认指标失败");
    } finally { setBusy(""); }
  }

  async function confirmAndRunDiagnosis() {
    if (!token || !dashboard) return;
    if (hasUnsavedEdits) {
      setError("存在尚未保存的修改，请先保存或刷新后再生成诊断。");
      return;
    }

    setBusy("confirm-and-diagnose");
    setError("");
    setMessage("");
    try {
      let currentDashboard = dashboard;
      let currentMetrics = metrics;

      if (currentDashboard.reviewCoverage.pendingCount > 0) {
        const snapshotVersions = snapshotVersionsForMetrics(currentMetrics, currentDashboard);
        if (!snapshotVersions) throw new Error("指标快照已变化，请刷新后重试。");
        await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics/confirm-all`, token, {
          method: "POST",
          body: JSON.stringify({ snapshotVersions })
        });
        [currentDashboard, currentMetrics] = await Promise.all([
          apiFetch<CollectionDashboardDTO>(`/collection-tasks/${params.id}/collection-dashboard`, token),
          apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics`, token)
        ]);
      }

      if (currentDashboard.tableReviewCoverage.pendingCount > 0) {
        const snapshotVersions = snapshotVersionsForTables(currentDashboard);
        if (!snapshotVersions.length) throw new Error("表格快照已变化，请刷新后重试。");
        await apiFetch<{ confirmedCount: number }>(`/collection-tasks/${params.id}/table-cell-reviews/confirm-all`, token, {
          method: "POST",
          body: JSON.stringify({ snapshotVersions })
        });
        currentDashboard = await apiFetch<CollectionDashboardDTO>(
          `/collection-tasks/${params.id}/collection-dashboard`,
          token
        );
      }

      const remainingReviewCount = currentDashboard.reviewCoverage.pendingCount
        + currentDashboard.tableReviewCoverage.pendingCount;
      if (remainingReviewCount > 0) {
        throw new Error(`仍有 ${remainingReviewCount} 项数据待复核，请刷新后检查。`);
      }

      const preview = await apiFetch<DecisionPreview>(`/collection-tasks/${params.id}/decision-preview`, token, {
        method: "POST",
        body: "{}"
      });
      if (preview.mode === "CONSERVATIVE_ONLY") {
        router.push(`/tasks/${params.id}?preview=1#diagnosis`);
        return;
      }

      decisionIdempotencyKey.current ||= createIdempotencyKey(`decision:${params.id}`);
      await apiFetch(`/collection-tasks/${params.id}/decision-runs`, token, {
        method: "POST",
        headers: { "idempotency-key": decisionIdempotencyKey.current },
        body: "{}"
      });
      decisionIdempotencyKey.current = "";
      router.push(`/tasks/${params.id}#diagnosis`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "确认数据并生成诊断失败");
    } finally {
      setBusy("");
    }
  }

  function setCellDraft(table: CollectionDashboardDTO["summary"]["tables"][number], rowIndex: number, columnIndex: number, patch: Partial<CellDraft>) {
    const existing = getCellDraft(table, rowIndex, columnIndex, cellReviewAt(table, rowIndex, columnIndex), cellValueAt(table, rowIndex, columnIndex));
    setCellDrafts((current) => ({ ...current, [cellKey(table, rowIndex, columnIndex)]: { ...existing, ...patch } }));
  }

  async function saveTable(
    table: CollectionDashboardDTO["summary"]["tables"][number],
    rowOffset: number,
    rowCount: number,
    confirmPage = false
  ) {
    if (!token) return;
    if (confirmPage && table.bindingStatus !== "TRUSTED") {
      setError("该表头或行列结构尚未校准。请逐格核对后选择“修改”保存，系统不会直接批量确认原值。");
      return;
    }
    const items = table.rows.slice(rowOffset, rowOffset + rowCount).flatMap((row, localRowIndex) => row.map((_cell, columnIndex) => {
      const rowIndex = rowOffset + localRowIndex;
      const review = cellReviewAt(table, rowIndex, columnIndex);
      const draft = getCellDraft(table, rowIndex, columnIndex, review, cellValueAt(table, rowIndex, columnIndex));
      if (!confirmPage && !cellDrafts[cellKey(table, rowIndex, columnIndex)]) return null;
      const reviewStatus = confirmPage && (!review || review.reviewStatus === "PENDING") ? "CONFIRMED" as const : draft.reviewStatus;
      if (!confirmPage && reviewStatus === "CONFIRMED" && table.bindingStatus !== "TRUSTED") {
        return { tableIndex: table.tableIndex, rowIndex, columnIndex, reviewedValue: draft.reviewedValue, reviewStatus: "MODIFIED" as const };
      }
      return {
        tableIndex: table.tableIndex,
        rowIndex,
        columnIndex,
        reviewedValue: draft.reviewStatus === "MODIFIED" ? draft.reviewedValue : undefined,
        reviewStatus
      };
    }).filter((item): item is NonNullable<typeof item> => Boolean(item)));
    if (!items.length) { setMessage("没有需要保存的表格校准。"); return; }
    setBusy(`table:${table.snapshotId}:${table.tableIndex}`); setError("");
    try {
      await apiFetch<TableCellReviewDTO[]>(`/collection-tasks/${params.id}/table-cell-reviews/bulk`, token, {
        method: "POST",
        body: JSON.stringify({ snapshotId: table.snapshotId, expectedSnapshotUpdatedAt: table.snapshotUpdatedAt, items })
      });
      setCellDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${table.snapshotId}:${table.tableIndex}:`))));
      setMessage(confirmPage ? "当前页单元格已批量确认。" : table.bindingStatus === "TRUSTED" ? "当前页表格校准已保存。" : "已保存逐格核对值；完成整表核对后，系统会记住该表头与行列结构。");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存表格校准失败");
    } finally { setBusy(""); }
  }

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState />;
  if (!dashboard) return <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">{error || "正在读取校准大屏..."}</main>;

  const routeOptions = dashboard.summary.routes.map((route) => ({ key: route.routeKey, label: route.label }));
  const latestCapturedAt = dashboard.summary.latestCapturedAt ? new Date(dashboard.summary.latestCapturedAt).toLocaleString("zh-CN") : "暂无";
  const hourlyRows = dashboard.summary.structuredData.flatMap((record) => record.kind === "HOURLY_ROWS" ? record.rows : []);
  const coreMetrics = prioritizeCoreMetrics(
    dashboard.summary.metrics.filter((metric) => (
      identifyMetricKey(metric.metricKey) !== "unknown"
      && metric.reviewStatus !== "IGNORED"
    ))
  );
  const leadCoreMetric = coreMetrics[0] || null;
  const supportingCoreMetrics = coreMetrics.slice(1);
  const capturedRouteCount = dashboard.summary.routes.filter((route) => Boolean(route.snapshotId)).length;
  const requiredRouteCount = dashboard.summary.routes.filter((route) => route.required).length;
  const pendingReviewCount = dashboard.reviewCoverage.pendingCount + dashboard.tableReviewCoverage.pendingCount;
  const calibrationState = collectionDashboardCalibrationState(dashboard.summary.snapshotCount, pendingReviewCount);
  const calibrationLabel = calibrationState === "EMPTY"
    ? "尚无采集数据"
    : calibrationState === "PENDING"
      ? `${pendingReviewCount} 项待校准`
      : "校准已完成";
  const calibrationTone = calibrationState === "COMPLETE"
    ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-200"
    : "border-amber-300/40 bg-amber-400/10 text-amber-200";
  return (
    <main className="min-h-screen bg-[#06101f] px-3 py-3 text-slate-100 sm:px-5 sm:py-5">
      <header className="mx-auto flex max-w-[1680px] flex-col gap-4 border-b border-slate-700/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Link className="text-sm font-medium text-cyan-300 transition hover:text-cyan-100" href={`/tasks/${params.id}`}>返回任务</Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">采集校准大屏</h1>
            <span className={`border px-2 py-1 text-xs font-medium ${calibrationTone}`}>{calibrationLabel}</span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-400">{dashboard.task.accountName} <span className="px-1 text-slate-600">/</span> {dashboard.task.projectName} <span className="px-1 text-slate-600">/</span> {dashboard.task.title || "采集任务"}</p>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden border border-slate-700 bg-slate-700 text-sm sm:grid-cols-4">
          <DashboardStat label="最近采集" value={latestCapturedAt} />
          <DashboardStat label="采集批次" value={collectionRunStatusLabel(dashboard.summary.collectionRun?.status)} tone={refreshMode === "IDLE" ? "slate" : "cyan"} />
          <DashboardStat label="路线覆盖" value={`${capturedRouteCount} / ${dashboard.summary.routes.length}`} tone={capturedRouteCount === dashboard.summary.routes.length ? "cyan" : "amber"} />
          <DashboardStat label="校准待办" value={calibrationState === "EMPTY" ? "待采集" : `${pendingReviewCount} 项`} tone={calibrationState === "COMPLETE" ? "cyan" : "amber"} />
        </div>
      </header>

      {error ? <p className="mx-auto mt-4 max-w-[1600px] border border-red-400/60 bg-red-950/60 p-3 text-sm text-red-200">{error}</p> : null}
      {message ? <p className="mx-auto mt-4 max-w-[1600px] border border-cyan-400/30 bg-cyan-950/50 p-3 text-sm text-cyan-100">{message}</p> : null}

      <section className="mx-auto mt-4 max-w-[1680px] overflow-hidden border border-cyan-300/30 bg-[#0d4eca] shadow-[0_20px_48px_rgba(0,63,190,0.28)]">
        <div className="grid gap-6 bg-[linear-gradient(135deg,rgba(111,180,255,0.28),transparent_46%)] px-5 py-6 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2.4fr)] lg:px-8 lg:py-7">
          <div className="border-b border-blue-100/25 pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
            <p className="text-sm font-medium text-blue-100">全任务核心指标</p>
            <p className="mt-1 text-xs text-blue-100/75">已汇总 {coreMetrics.length} 项标准指标；不同页面口径独立保留，不跨路线相加。</p>
            {leadCoreMetric ? <><strong className="mt-5 block text-5xl font-semibold text-white sm:text-6xl">{formatOverviewMetricValue(leadCoreMetric)}</strong><p className="mt-3 text-sm text-blue-50">{leadCoreMetric.metricName} <span className="text-blue-100/70">· {reviewLabel(leadCoreMetric.reviewStatus)}</span></p><p className="mt-2 text-xs text-blue-100/65">{overviewMetricSource(leadCoreMetric)}</p></> : <p className="mt-6 max-w-sm text-sm leading-6 text-blue-100">当前没有可展示的已验证核心指标。完成页面路线确认和采集后，真实数据会显示在这里。</p>}
          </div>
          <div className="grid grid-cols-2 content-center gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {supportingCoreMetrics.map((metric, index) => <OverviewMetric key={`${metric.routeKey}:${metric.metricKey}:${index}`} metric={metric} />)}
            {!supportingCoreMetrics.length && leadCoreMetric ? <p className="col-span-full text-sm text-blue-100/75">当前仅采集到一项标准指标。</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-100/20 bg-[#0b3da6] px-5 py-2.5 text-xs text-blue-50 lg:px-8"><span>原始值保持不变，只有确认或修改后的值进入正式诊断</span><span>必采路线 {requiredRouteCount} 条 · 当前快照 {dashboard.summary.snapshotCount} 份</span></div>
      </section>

      <section className="mx-auto mt-4 max-w-[1680px] border border-slate-700/80 bg-[#0a172a] p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">路线进度</h2><p className="mt-1 text-xs text-slate-500">每条路线独立保留最新快照；重复采集同一页面不会替代其它路线。</p></div><span className="text-xs text-slate-400">{capturedRouteCount} / {dashboard.summary.routes.length} 已采集</span></div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {dashboard.summary.routes.map((route) => <RouteProgressCard key={route.routeKey} route={route} />)}
        </div>
      </section>

      <section className="mx-auto mt-4 flex max-w-[1680px] flex-col gap-4 border border-cyan-300/30 bg-[#0a2440] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-white">下一步：确认可信数据并生成诊断</h2>
          <p className="mt-1 text-sm text-slate-300">
            {pendingReviewCount > 0
              ? `系统只会自动确认已校准结构中的 ${pendingReviewCount} 项数据；字段、单位、周期或位置异常的数据必须逐项核对。`
              : "当前批次已完成校准，可以直接生成正式诊断并进入诊断与建议。"}
          </p>
          {hasUnsavedEdits ? <p className="mt-2 text-xs text-amber-200">存在尚未保存的修改，请先在下方详细数据中保存。</p> : null}
        </div>
        <Button
          className="h-11 shrink-0 bg-cyan-400 px-6 text-slate-950 hover:bg-cyan-300"
          disabled={Boolean(busy) || calibrationState === "EMPTY" || hasUnsavedEdits}
          onClick={() => void confirmAndRunDiagnosis()}
          type="button"
        >
          {busy === "confirm-and-diagnose" ? "正在确认并分析..." : "确认可信数据并生成诊断"}
        </Button>
      </section>

      <details className="mx-auto mt-4 max-w-[1680px] border border-slate-700/80 bg-[#081426]">
        <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-slate-100 marker:hidden">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>详细指标与原始表格</span>
            <span className="font-normal text-slate-400">{metrics.length} 项指标 · {dashboard.tableReviewCoverage.totalCount} 个表格单元格 · 点击展开</span>
          </span>
        </summary>
        <div className="border-t border-slate-700/80 pb-4">
      <section className="mx-auto mt-4 max-w-[1680px] border border-slate-700/80 bg-[#0a172a] p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div className="grid gap-2 sm:grid-cols-3"><label className="grid gap-1 text-xs text-slate-400">路线筛选<Select className="border-slate-600 bg-slate-950 text-slate-100" value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}><option value="ALL">全部路线</option>{routeOptions.map((route) => <option key={route.key} value={route.key}>{route.label}</option>)}</Select></label><label className="grid gap-1 text-xs text-slate-400">指标类别<Select className="border-slate-600 bg-slate-950 text-slate-100" value={metricCategoryFilter} onChange={(event) => setMetricCategoryFilter(event.target.value as typeof metricCategoryFilter)}><option value="ALL">全部类别</option>{metricCategories.map((category) => <option key={category} value={category}>{metricCategoryLabel(category)}</option>)}</Select></label><label className="grid gap-1 text-xs text-slate-400">复核状态<Select className="border-slate-600 bg-slate-950 text-slate-100" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="ALL">全部状态</option><option value="PENDING">待复核</option><option value="CONFIRMED">已确认</option><option value="MODIFIED">已修改</option><option value="IGNORED">已忽略</option></Select></label></div><Button className="border border-cyan-300/30 bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={Boolean(busy) || !metrics.some((metric) => metric.reviewStatus === "PENDING" && metric.bindingStatus === "TRUSTED")} onClick={() => void confirmAllMetrics()} type="button">确认全部已校准指标</Button></div>
      </section>

      {refreshAvailable ? <div className="mx-auto mt-3 flex max-w-[1680px] flex-wrap items-center justify-between gap-3 border border-cyan-300/30 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-100"><span>检测到新的采集数据。当前有未保存校准，未自动覆盖。</span><button className="border border-cyan-300/50 px-3 py-1.5 text-xs font-medium hover:bg-cyan-300/10" onClick={() => void load()} type="button">刷新数据</button></div> : null}

      <section className="mx-auto mt-4 grid max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <section className="border border-slate-700/80 bg-[#0a172a]"><div className="flex flex-col gap-2 border-b border-slate-700 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-white">核心指标校准</h2><p className="mt-1 text-xs text-slate-500">逐项核对“后台字段标签 → 后台显示值 → 系统精确值 → 字段位置 → 周期”；只有可信数据进入正式诊断。</p></div><span className="text-xs text-slate-400">当前筛选 {visibleMetrics.length} 项</span></div>{visibleMetrics.length ? <div className="overflow-x-auto"><table className="min-w-[1280px] w-full text-left text-sm"><thead className="bg-slate-900 text-xs text-slate-400"><tr><th className="px-3 py-2">指标</th><th className="px-3 py-2">后台字段标签</th><th className="px-3 py-2">后台显示值</th><th className="px-3 py-2">系统精确值 / 单位</th><th className="px-3 py-2">字段位置与校验</th><th className="px-3 py-2">校准值 / 周期</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">操作</th></tr></thead><tbody>{visibleMetrics.map((metric) => <tr className="border-t border-slate-800/90 hover:bg-slate-900/60" key={metric.id}><td className="px-3 py-3 font-medium text-slate-100">{metric.metricName}</td><td className="px-3 py-3 text-slate-300">{metric.fieldLabel || "未记录"}</td><td className="px-3 py-3 text-slate-300">{metric.displayValue ?? metric.originalValue ?? "数据缺失"}</td><td className="px-3 py-3 text-slate-300">{formatNormalizedMetricValue(metric)}<p className="mt-1 text-[11px] text-slate-500">单位来源：{metric.unitSource || "未标注"} · 展示精度：{metric.displayPrecision ?? "--"}</p></td><td className="px-3 py-3"><MetricEvidenceCell metric={metric} /></td><td className="px-3 py-3"><div className="grid gap-2"><Input aria-label={`${metric.metricName} 校准值`} className="h-8 w-36 border-slate-600 bg-slate-950 text-slate-100" value={metricDrafts[metric.id] ?? ""} onChange={(event) => setMetricDrafts((current) => ({ ...current, [metric.id]: event.target.value }))} /><Input aria-label={`${metric.metricName} 统计周期`} className="h-8 w-36 border-slate-600 bg-slate-950 text-slate-100" placeholder="例如：今日" value={metricPeriodDrafts[metric.id] ?? ""} onChange={(event) => setMetricPeriodDrafts((current) => ({ ...current, [metric.id]: event.target.value }))} /></div></td><td className="px-3 py-3"><ReviewBadge status={metric.reviewStatus} /></td><td className="px-3 py-3"><div className="flex gap-1"><MiniButton disabled={Boolean(busy) || metric.bindingStatus === "INVALID"} onClick={() => void updateMetric(metric, "CONFIRMED")}>确认</MiniButton><MiniButton disabled={Boolean(busy) || !(metricPeriodDrafts[metric.id] || "").trim()} onClick={() => void updateMetric(metric, "MODIFIED")}>修改</MiniButton><MiniButton disabled={Boolean(busy)} onClick={() => void updateMetric(metric, "IGNORED")}>忽略</MiniButton></div></td></tr>)}</tbody></table></div> : <EmptyState label="当前筛选没有可校准指标。先确认页面路线后重新采集，系统不会生成虚构数据。" />}</section>

          <section className="border border-slate-700/80 bg-[#0a172a]"><div className="border-b border-slate-700 px-4 py-3"><h2 className="font-semibold text-white">小时趋势</h2></div>{hourlyRows.length ? <HourlyTrend rows={hourlyRows} /> : <EmptyState label="当前快照没有真实小时趋势数据，不生成模拟曲线。" />}</section>

          {visibleTables.map((table) => {
            const tableKey = `${table.snapshotId}:${table.tableIndex}`;
            const pageSize = tablePageSize(table);
            const pageCount = Math.max(1, Math.ceil(table.rows.length / pageSize));
            const page = Math.min(tablePages[tableKey] || 0, pageCount - 1);
            const rowOffset = page * pageSize;
            const pageRows = table.rows.slice(rowOffset, rowOffset + pageSize);
            return (
            <section className="border border-slate-700/80 bg-[#0a172a]" key={`${table.snapshotId}:${table.tableIndex}`}>
              <div className="flex flex-col gap-2 border-b border-slate-700 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div><h2 className="font-semibold">{collectionRouteLabels[table.routeKey || "UNKNOWN"] || table.pageType || "结构化表格"}</h2><p className="text-xs text-slate-400">来源路线：{collectionRouteLabels[table.routeKey || "UNKNOWN"] || table.pageType || "未知路线"} · 周期：{table.timeRange || "缺失"} · 行标识：{table.identityColumn || "未识别"}（第 {table.identityColumnIndex == null ? "--" : table.identityColumnIndex + 1} 列） · 结构状态：{table.bindingStatus === "TRUSTED" ? "已校准" : "待逐格核对"} · 采集于 {new Date(table.capturedAt).toLocaleString("zh-CN")}</p><p className="mt-1 text-xs text-slate-500">结构位置：{table.bindingLocation || "未记录"}</p>{table.bindingStatus !== "TRUSTED" ? <p className="mt-1 text-xs text-amber-200">{table.bindingReasons.join("；")}</p> : null}</div>
                <div className="flex flex-wrap gap-2"><Button className="h-8 border border-slate-600 bg-slate-800 px-3 text-xs text-slate-100" disabled={Boolean(busy)} onClick={() => void saveTable(table, rowOffset, pageRows.length)} type="button">保存当前页逐格核对</Button><Button className="h-8 px-3 text-xs" disabled={Boolean(busy) || table.bindingStatus !== "TRUSTED"} onClick={() => void saveTable(table, rowOffset, pageRows.length, true)} type="button">确认当前页单元格</Button></div>
              </div>
              <div className="overflow-x-auto"><table className="min-w-max w-full text-left text-sm"><tbody>{pageRows.map((row, localRowIndex) => { const rowIndex = rowOffset + localRowIndex; return <tr className="border-t border-slate-800" key={rowIndex}>{row.map((cell, columnIndex) => <EditableCell cell={cell} draft={getCellDraft(table, rowIndex, columnIndex, cellReviewAt(table, rowIndex, columnIndex), String(cell ?? ""))} key={columnIndex} review={cellReviewAt(table, rowIndex, columnIndex)} rowIndex={rowIndex} setDraft={(patch) => setCellDraft(table, rowIndex, columnIndex, patch)} />)}</tr>; })}</tbody></table></div>
              {pageCount > 1 ? <div className="flex items-center justify-end gap-2 border-t border-slate-700 px-4 py-3 text-xs"><button className="border border-slate-600 px-3 py-1 disabled:opacity-40" disabled={page === 0 || Boolean(busy)} onClick={() => setTablePages((current) => ({ ...current, [tableKey]: page - 1 }))} type="button">上一页</button><span className="text-slate-400">第 {page + 1} / {pageCount} 页</span><button className="border border-slate-600 px-3 py-1 disabled:opacity-40" disabled={page >= pageCount - 1 || Boolean(busy)} onClick={() => setTablePages((current) => ({ ...current, [tableKey]: page + 1 }))} type="button">下一页</button></div> : null}
            </section>
            );
          })}
          {!visibleTables.length ? <section className="border border-dashed border-slate-700 bg-slate-900/50"><EmptyState label="当前筛选下没有真实采集表格。系统不会生成模拟趋势或虚构表格。" /></section> : null}
        </div>
        <aside className="space-y-4"><section className="border border-slate-700/80 bg-[#0a172a] p-4"><h2 className="font-semibold text-white">数据可用性</h2><p className="mt-2 text-3xl font-semibold text-cyan-300">{dashboard.summary.coverageRatio == null ? "--" : `${Math.round(dashboard.summary.coverageRatio * 100)}%`}</p><p className="mt-1 text-sm text-slate-400">已采集路线平均覆盖率</p><div className="mt-4 space-y-3 border-t border-slate-800 pt-4 text-sm"><div className="flex justify-between gap-3"><span className="text-slate-400">任务绑定</span><strong className="text-emerald-300">服务端已验证</strong></div><div className="flex justify-between gap-3"><span className="text-slate-400">尚待采集</span><strong>{dashboard.summary.routes.filter((route) => !route.snapshotId).length} 条</strong></div><div className="flex justify-between gap-3"><span className="text-slate-400">路线待确认</span><strong className={dashboard.summary.pendingRouteConfirmationCount ? "text-amber-300" : "text-emerald-300"}>{dashboard.summary.pendingRouteConfirmationCount} 条</strong></div><div className="flex justify-between gap-3"><span className="text-slate-400">趋势数据</span><strong className={hourlyRows.length ? "text-emerald-300" : "text-slate-500"}>{hourlyRows.length ? `${hourlyRows.length} 条` : "未采集"}</strong></div></div></section><section className="border border-slate-700/80 bg-[#0a172a] p-4"><h2 className="font-semibold text-white">校准状态</h2><ReviewSummary label="指标" coverage={dashboard.reviewCoverage} /><ReviewSummary label="表格" coverage={dashboard.tableReviewCoverage} /></section></aside>
      </section>
        </div>
      </details>
    </main>
  );
}

function retainCurrentCellDrafts(current: Record<string, CellDraft>, dashboard: CollectionDashboardDTO) {
  const keys = new Set(dashboard.summary.tables.flatMap((table) => table.rows.flatMap((row, rowIndex) => row.map((_cell, columnIndex) => cellKey(table, rowIndex, columnIndex)))));
  return Object.fromEntries(Object.entries(current).filter(([key]) => keys.has(key)));
}

function cellKey(table: CollectionDashboardDTO["summary"]["tables"][number], rowIndex: number, columnIndex: number) { return `${table.snapshotId}:${table.tableIndex}:${rowIndex}:${columnIndex}`; }
function cellReviewAt(table: CollectionDashboardDTO["summary"]["tables"][number], rowIndex: number, columnIndex: number) { return table.cellReviews.find((review) => review.rowIndex === rowIndex && review.columnIndex === columnIndex) || null; }
function cellValueAt(table: CollectionDashboardDTO["summary"]["tables"][number], rowIndex: number, columnIndex: number) { return String(table.rows[rowIndex]?.[columnIndex] ?? ""); }
function getCellDraft(table: CollectionDashboardDTO["summary"]["tables"][number], rowIndex: number, columnIndex: number, review: TableCellReviewDTO | null, fallback: string): CellDraft { return { reviewedValue: review?.reviewedValue ?? review?.originalValue ?? fallback, reviewStatus: (review?.reviewStatus === "PENDING" ? "CONFIRMED" : review?.reviewStatus || "CONFIRMED") as CellDraft["reviewStatus"] }; }
function metricRouteKey(metric: ReviewedMetricDTO, dashboard: CollectionDashboardDTO | null) { return dashboard?.summary.routes.find((route) => route.snapshotId === metric.snapshotId)?.routeKey || metric.pageType || "UNKNOWN"; }
function snapshotVersionForMetric(metric: ReviewedMetricDTO, dashboard: CollectionDashboardDTO | null) { return dashboard?.summary.routes.find((route) => route.snapshotId === metric.snapshotId)?.snapshotUpdatedAt || null; }
function snapshotVersionsForMetrics(metrics: ReviewedMetricDTO[], dashboard: CollectionDashboardDTO | null) {
  const versions = new Map<string, string>();
  for (const metric of metrics) {
    if (!metric.snapshotId) return null;
    const expectedSnapshotUpdatedAt = snapshotVersionForMetric(metric, dashboard);
    if (!expectedSnapshotUpdatedAt) return null;
    versions.set(metric.snapshotId, expectedSnapshotUpdatedAt);
  }
  return [...versions].map(([snapshotId, expectedSnapshotUpdatedAt]) => ({ snapshotId, expectedSnapshotUpdatedAt }));
}
function snapshotVersionsForTables(dashboard: CollectionDashboardDTO) {
  const versions = new Map<string, string>();
  for (const table of dashboard.summary.tables) {
    const existingVersion = versions.get(table.snapshotId);
    if (existingVersion && existingVersion !== table.snapshotUpdatedAt) return [];
    versions.set(table.snapshotId, table.snapshotUpdatedAt);
  }
  return [...versions].map(([snapshotId, expectedSnapshotUpdatedAt]) => ({ snapshotId, expectedSnapshotUpdatedAt }));
}
function metricCategory(metricKey: string): MetricCategory { return metricKeyCategories[identifyMetricKey(metricKey)]; }
function metricCategoryLabel(category: MetricCategory) { const labels: Record<MetricCategory, string> = { ROI: "ROI", COST: "成本", CONVERSION: "转化", TRAFFIC: "流量", LIVE_ROOM: "直播间", FULL_DOMAIN: "全域", SERVICE_PROVIDER: "服务商", RISK: "风险", ACTIVITY: "活动", TIMING: "时段", UNKNOWN: "未分类" }; return labels[category]; }
function formatRouteDetectionConfidence(value: number | null) { return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "缺失"; }
function tablePageSize(table: CollectionDashboardDTO["summary"]["tables"][number]) { const columnCount = Math.max(1, ...table.rows.map((row) => row.length)); return Math.max(1, Math.floor(240 / columnCount)); }
function MetricSourceCell({ dashboard, metric }: { dashboard: CollectionDashboardDTO; metric: ReviewedMetricDTO }) { const route = dashboard.summary.routes.find((item) => item.snapshotId === metric.snapshotId); return <div className="text-xs text-slate-400"><p>{route?.label || metric.pageType || "未知路线"} · {Math.round(metric.confidence * 100)}%</p><p className="mt-1 text-slate-500">{route?.lastCapturedAt ? new Date(route.lastCapturedAt).toLocaleString("zh-CN") : "采集时间缺失"}</p></div>; }
function MetricEvidenceCell({ metric }: { metric: ReviewedMetricDTO }) { const trusted = metric.bindingStatus === "TRUSTED"; const invalid = metric.bindingStatus === "INVALID"; return <div className="text-xs"><p className={invalid ? "text-red-300" : trusted ? "text-emerald-300" : "text-amber-200"}>{invalid ? "异常：不可直接确认" : trusted ? "结构已校准" : "待核对字段关系"}</p><p className="mt-1 text-slate-500">周期：{metric.timeRange && metric.timeRange !== "UNKNOWN" ? metric.timeRange : "缺失"}</p><p className="mt-1 text-slate-500">位置：{metric.bindingLocation || "未记录"}</p>{metric.bindingReasons?.length ? <p className="mt-1 max-w-56 text-red-200">{metric.bindingReasons.join("；")}</p> : null}</div>; }
function HourlyTrend({ rows }: { rows: Extract<CollectionDashboardDTO["summary"]["structuredData"][number], { kind: "HOURLY_ROWS" }>["rows"] }) { const maxViews = Math.max(1, ...rows.map((row) => row.liveViews || 0)); return <div className="overflow-x-auto p-4"><div className="min-w-[720px] space-y-2">{rows.map((row, index) => <div className="grid grid-cols-[110px_minmax(180px,1fr)_90px_90px] items-center gap-3 text-xs" key={`${row.intervalStart || row.intervalLabel || "hour"}:${index}`}><span className="text-slate-400">{row.intervalLabel || row.intervalStart || "时间缺失"}</span><div className="h-4 bg-slate-800"><div className="h-full bg-cyan-500" style={{ width: `${Math.max(0, ((row.liveViews || 0) / maxViews) * 100)}%` }} /></div><span>看播 {row.liveViews ?? "缺失"}</span><span>ROI {row.roi ?? "缺失"}</span></div>)}</div></div>; }

function DashboardStat({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "amber" | "cyan" }) { return <div className={`min-w-28 bg-[#0b1729] px-3 py-2 ${tone === "amber" ? "text-amber-200" : tone === "cyan" ? "text-cyan-200" : "text-slate-100"}`}><p className="text-xs text-slate-500">{label}</p><strong className="mt-1 block truncate text-sm">{value}</strong></div>; }
function RouteState({ state }: { state: string }) { const tone = ["UPLOADED", "FRESH"].includes(state) ? "border-cyan-300/35 bg-cyan-400/10 text-cyan-200" : state === "FAILED" ? "border-red-300/35 bg-red-400/10 text-red-200" : "border-amber-300/35 bg-amber-400/10 text-amber-200"; return <span className={`border px-2 py-1 text-xs font-medium ${tone}`}>{routeStateLabel(state)}</span>; }
function RouteProgressCard({ route }: { route: CollectionDashboardDTO["summary"]["routes"][number] }) {
  const tone = routeTone(route.state);
  const nextStep = routeNextStep(route);
  return <article className={`border-l-2 border border-slate-700 bg-[#0d1d33] p-3 ${tone.border}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-medium text-slate-100">{route.label}</h3><p className="mt-1 text-xs text-slate-500">{route.required ? "必采路线" : "补充路线"} · {route.metricCount} 项指标</p></div><RouteState state={route.state} /></div><div className="mt-3 h-1.5 bg-slate-800"><div className={`h-full ${tone.bar}`} style={{ width: route.snapshotId ? `${Math.max(24, Math.round((route.coverageRatio ?? 1) * 100))}%` : "0%" }} /></div><p className="mt-2 text-xs text-slate-400">{route.lastCapturedAt ? `最近采集 ${formatCaptureTime(route.lastCapturedAt)}` : nextStep}</p>{route.lastError ? <p className="mt-1 text-xs text-red-300">{route.lastError}</p> : route.state === "MANUAL_PENDING" ? <p className="mt-1 text-xs text-amber-200">当前快照待确认路线，不会进入校准。</p> : null}</article>;
}
function OverviewMetric({ metric }: { metric: CollectionDashboardDTO["summary"]["overviewMetrics"][number] }) { return <div><p className="text-xs text-blue-100/80">{metric.metricName}</p><strong className="mt-1 block text-xl font-semibold text-white sm:text-2xl">{formatOverviewMetricValue(metric)}</strong><p className="mt-1 text-xs text-blue-100/65">{Math.round(metric.confidence * 100)}% · {reviewLabel(metric.reviewStatus)}</p><p className="mt-1 text-[11px] leading-4 text-blue-100/55">{overviewMetricSource(metric)}</p></div>; }
function ReviewBadge({ status }: { status: MetricReviewStatus }) { const colors: Record<MetricReviewStatus, string> = { PENDING: "bg-amber-950 text-amber-200", CONFIRMED: "bg-cyan-950 text-cyan-200", MODIFIED: "bg-cyan-950 text-cyan-100", IGNORED: "bg-slate-800 text-slate-300" }; return <span className={`px-2 py-1 text-xs ${colors[status]}`}>{status === "PENDING" ? "待复核" : status === "CONFIRMED" ? "已确认" : status === "MODIFIED" ? "已修改" : "已忽略"}</span>; }
function MiniButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button className="border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:border-cyan-400 disabled:opacity-50" type="button" {...props}>{children}</button>; }
function EmptyState({ label }: { label: string }) { return <p className="p-5 text-sm text-slate-400">{label}</p>; }
function ReviewSummary({ label, coverage }: { label: string; coverage: { totalCount: number; pendingCount: number; confirmedCount: number; modifiedCount: number } }) { return <div className="mt-3 border-t border-slate-800 pt-3 text-sm"><div className="flex justify-between"><span className="text-slate-400">{label}</span><strong>{coverage.totalCount} 项</strong></div><p className="mt-1 text-xs text-slate-400">待复核 {coverage.pendingCount} · 已确认 {coverage.confirmedCount} · 已修改 {coverage.modifiedCount}</p></div>; }
function EditableCell({ cell, review, draft, setDraft, rowIndex }: { cell: string; review: TableCellReviewDTO | null; draft: CellDraft; setDraft: (patch: Partial<CellDraft>) => void; rowIndex: number }) { return <td className={`min-w-40 border-r border-slate-800 px-2 py-2 align-top ${rowIndex === 0 ? "bg-slate-800/70 font-semibold" : ""}`}><p className="mb-1 max-w-48 break-words text-xs text-slate-400">采集值：{cell || "空"}</p><Input aria-label="校准值" className="h-8 min-w-32 border-slate-700 bg-slate-950 text-slate-100" value={draft.reviewedValue} onChange={(event) => setDraft({ reviewedValue: event.target.value, reviewStatus: "MODIFIED" })} /><div className="mt-1 flex items-center justify-between gap-2"><Select className="h-7 border-slate-700 bg-slate-950 text-xs text-slate-200" value={draft.reviewStatus} onChange={(event) => setDraft({ reviewStatus: event.target.value as CellDraft["reviewStatus"] })}><option value="CONFIRMED">确认</option><option value="MODIFIED">修改</option><option value="IGNORED">忽略</option></Select>{review ? <ReviewBadge status={review.reviewStatus} /> : <span className="text-xs text-amber-300">待复核</span>}</div></td>; }

function prioritizeCoreMetrics(metrics: CollectionDashboardDTO["summary"]["metrics"]) {
  const priority = [
    "full_domain_pay_roi",
    "pay_roi",
    "verify_roi",
    "gross_profit_roi",
    "target_roi",
    "gmv",
    "spend",
    "daily_budget",
    "remaining_budget",
    "orders",
    "cpa",
    "target_cpa",
    "impressions",
    "clicks",
    "ctr",
    "live_viewers",
    "gpm"
  ];
  return [...metrics].sort((left, right) => {
    const leftIndex = priority.indexOf(identifyMetricKey(left.metricKey));
    const rightIndex = priority.indexOf(identifyMetricKey(right.metricKey));
    return (leftIndex < 0 ? priority.length : leftIndex) - (rightIndex < 0 ? priority.length : rightIndex);
  });
}
function formatMetricValue(value: string, unit: string | null) { return `${value}${unit === "yuan" ? " 元" : unit || ""}`; }
function formatOverviewMetricValue(metric: CollectionDashboardDTO["summary"]["overviewMetrics"][number]) { return metric.displayValue || formatMetricValue(metric.metricValue, metric.metricUnit); }
function formatNormalizedMetricValue(metric: ReviewedMetricDTO) { const value = metric.normalizedValue ?? metric.originalValue ?? "数据缺失"; return metric.metricUnit === "%" ? `${value}（比例）` : formatMetricValue(value, metric.metricUnit || null); }
function reviewLabel(status: MetricReviewStatus) { return status === "PENDING" ? "待复核" : status === "CONFIRMED" ? "已确认" : status === "MODIFIED" ? "已修改" : "已忽略"; }
function routeStateLabel(state: string) { const labels: Record<string, string> = { PENDING: "待切换页面", READY: "待采集", MISSING: "尚未采集", UPLOADED: "已采集", FRESH: "数据新鲜", AGING: "即将过期", PARTIAL: "部分可见", MANUAL_PENDING: "路线待确认", STALE: "数据已过期", FAILED: "采集失败" }; return labels[state] || state; }
function routeTone(state: string) { return ["UPLOADED", "FRESH"].includes(state) ? { border: "border-l-cyan-400", bar: "bg-cyan-400" } : state === "FAILED" ? { border: "border-l-red-400", bar: "bg-red-400" } : { border: "border-l-amber-400", bar: "bg-amber-400" }; }
function routeNextStep(route: CollectionDashboardDTO["summary"]["routes"][number]) { if (route.state === "PENDING") return "切换到该页面后点击采集"; if (route.state === "READY") return "打开该页面后点击采集"; if (route.state === "FAILED") return "查看失败原因后重新采集"; if (route.state === "STALE") return "数据已过期，请重新采集"; return "等待数据状态更新"; }
function formatCaptureTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "时间缺失" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function overviewMetricSource(metric: CollectionDashboardDTO["summary"]["overviewMetrics"][number]) { return `${collectionRouteLabels[metric.routeKey || "UNKNOWN"] || "未知路线"} · ${formatCaptureTime(metric.capturedAt)}`; }
function collectionRunStatusLabel(status: CollectionDashboardDTO["summary"]["collectionRun"] extends infer Run ? Run extends { status: infer Status } ? Status | undefined : undefined : undefined) { const labels: Record<string, string> = { ACTIVE: "采集中", DEGRADED: "采集降级", COMPLETED: "已完成", STOPPED: "已停止" }; return status ? labels[String(status)] || String(status) : "未开始"; }
