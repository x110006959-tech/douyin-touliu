"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  aiDisclaimer,
  buildDashboardOverviewCards,
  collectionRouteLabels,
  identifyMetricKey,
  metricCategories,
  metricKeyCategories,
  type CollectionDashboardDTO,
  type MetricCategory,
  type MetricReviewStatus,
  type RealtimeMetricFrame,
  type ReviewedMetricDTO,
  type TableCellReviewDTO,
} from "@douyin-local-life/shared";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { apiBaseUrl, apiFetch, cookieSessionMarker, createIdempotencyKey } from "@/lib/api";
import { humanizeDiagnosisFailure } from "@/lib/diagnosis-presentation";
import { useAuth } from "@/lib/AuthContext";
import {
  subscribeRealtimeMetricStream,
  type RealtimeMetricStreamStatus,
  usableRealtimeMetrics,
} from "@/lib/realtime-metric-stream";
import { DiagnosisBusinessSummary } from "../diagnosis-business-summary";
import { DiagnosisComparison } from "../diagnosis-comparison";
import type { DecisionPreview, DecisionRun } from "../task-types";
import {
  CollectionRouteFlow,
  routeHasUsableData,
  routeNeedsAttention,
  sortPrimaryRoutes,
} from "./collection-route-flow";
import { OverviewPanel } from "./overview-panel";
import { collectionDashboardCalibrationState, collectionDashboardRefreshMode } from "./refresh-policy";

type CellDraft = {
  reviewedValue: string;
  reviewStatus: Exclude<MetricReviewStatus, "PENDING">;
};

export default function CollectionDashboardPage() {
  const params = useParams<{ id: string }>();
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
  const [realtimeFrames, setRealtimeFrames] = useState<Record<string, RealtimeMetricFrame>>({});
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeMetricStreamStatus>("CONNECTING");
  const [decisionPreview, setDecisionPreview] = useState<DecisionPreview | null>(null);
  const [decisionRun, setDecisionRun] = useState<DecisionRun | null>(null);
  const [savedTargetRoi, setSavedTargetRoi] = useState("");
  const [targetRoiDraft, setTargetRoiDraft] = useState("");
  const [targetRoiSaveState, setTargetRoiSaveState] = useState<"IDLE" | "PENDING" | "SAVING" | "SAVED" | "ERROR">("IDLE");
  const latestCaptureRef = useRef<string | null>(null);
  const decisionIdempotencyKey = useRef("");
  const targetRoiDraftRef = useRef("");
  const savedTargetRoiRef = useRef("");
  const targetRoiRequestedRef = useRef<string | null>(null);
  const targetRoiSaveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const targetRoiSaveTimerRef = useRef<number | null>(null);

  async function load() {
    if (!token) return;
    setError("");
    try {
      const [nextDashboard, nextMetrics, nextDecisionRun] = await Promise.all([
        apiFetch<CollectionDashboardDTO>(`/collection-tasks/${params.id}/collection-dashboard`, token),
        apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics`, token),
        apiFetch<DecisionRun | null>(`/collection-tasks/${params.id}/decision-runs/latest`, token),
      ]);
      setDashboard(nextDashboard);
      const nextTargetRoi = nextDashboard.decisionTargets.targetRoi === null ? "" : String(nextDashboard.decisionTargets.targetRoi);
      setTargetRoiDraft((current) => {
        const nextDraft = current === savedTargetRoi ? nextTargetRoi : current;
        targetRoiDraftRef.current = nextDraft;
        return nextDraft;
      });
      setSavedTargetRoi(nextTargetRoi);
      savedTargetRoiRef.current = nextTargetRoi;
      targetRoiRequestedRef.current = nextTargetRoi;
      setTargetRoiSaveState("IDLE");
      setMetrics(nextMetrics);
      setMetricDrafts(Object.fromEntries(nextMetrics.map((metric) => [metric.id, metric.reviewedValue ?? metric.originalValue ?? ""])));
      setMetricPeriodDrafts(
        Object.fromEntries(
          nextMetrics.map((metric) => [metric.id, metric.timeRange && metric.timeRange !== "UNKNOWN" ? metric.timeRange : ""]),
        ),
      );
      setCellDrafts((current) => retainCurrentCellDrafts(current, nextDashboard));
      setDecisionRun(nextDecisionRun);
      latestCaptureRef.current = nextDashboard.summary.latestCapturedAt;
      setRefreshAvailable(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取校准大屏失败");
    }
  }

  useEffect(() => {
    void load();
  }, [params.id, token]);

  useEffect(() => {
    if (!token || !dashboard) return;
    const draftValue = targetRoiDraft.trim();
    if (draftValue === savedTargetRoi && targetRoiRequestedRef.current === targetRoiDraft) return;
    setTargetRoiSaveState("PENDING");
    const draftAtSchedule = targetRoiDraft;
    targetRoiSaveTimerRef.current = window.setTimeout(() => {
      targetRoiSaveTimerRef.current = null;
      setTargetRoiSaveState("SAVING");
      void persistTargetRoi(draftAtSchedule)
        .then(() => {
          if (targetRoiDraftRef.current === draftAtSchedule) setTargetRoiSaveState("SAVED");
        })
        .catch((requestError) => {
          if (targetRoiDraftRef.current !== draftAtSchedule) return;
          setTargetRoiSaveState("ERROR");
          setError(requestError instanceof Error ? requestError.message : "自动保存目标 ROI 失败");
        });
    }, 700);
    return () => {
      if (targetRoiSaveTimerRef.current !== null) {
        window.clearTimeout(targetRoiSaveTimerRef.current);
        targetRoiSaveTimerRef.current = null;
      }
    };
  }, [dashboard, savedTargetRoi, targetRoiDraft, token]);

  useEffect(() => {
    if (!token || !decisionRun || !["PENDING", "RUNNING"].includes(decisionRun.status)) return;
    const timer = window.setTimeout(() => {
      void apiFetch<DecisionRun>(`/decision-runs/${decisionRun.id}`, token)
        .then((nextRun) => {
          setDecisionRun(nextRun);
          if (nextRun.status === "SUCCEEDED") setMessage("诊断已完成，结果和建议已显示在本页下方。");
          if (nextRun.status === "FAILED") setError(humanizeDiagnosisFailure(nextRun.errorCode, nextRun.errorMessage));
        })
        .catch((pollError) => setError(pollError instanceof Error ? pollError.message : "读取诊断进度失败"));
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [decisionRun, token]);

  useEffect(() => {
    setRealtimeFrames({});
    if (!token) return;
    return subscribeRealtimeMetricStream({
      url: `${apiBaseUrl}/collection-tasks/${params.id}/signals/stream`,
      authorizationToken: token === cookieSessionMarker ? null : token,
      onFrame: (frame) => setRealtimeFrames((current) => ({ ...current, [frame.routeKey]: frame })),
      onStatus: setRealtimeStatus,
    });
  }, [params.id, token]);

  const hasUnsavedReviewEdits = useMemo(
    () =>
      Object.keys(cellDrafts).length > 0 ||
      metrics.some((metric) => (metricDrafts[metric.id] ?? "") !== (metric.reviewedValue ?? metric.originalValue ?? "")) ||
      metrics.some(
        (metric) => (metricPeriodDrafts[metric.id] ?? "") !== (metric.timeRange && metric.timeRange !== "UNKNOWN" ? metric.timeRange : ""),
      ),
    [cellDrafts, metricDrafts, metricPeriodDrafts, metrics],
  );
  const targetRoiDirty = targetRoiDraft.trim() !== savedTargetRoi;
  const hasUnsavedEdits = hasUnsavedReviewEdits || targetRoiDirty;
  const targetRoiSaveTone = targetRoiSaveState === "ERROR"
    ? "text-red-200"
    : targetRoiDirty ? "text-amber-200" : "text-indigo-100/65";
  const targetRoiSaveIndicatorClass = targetRoiSaveState === "ERROR"
    ? "bg-red-300"
    : targetRoiDirty || targetRoiSaveState === "PENDING" || targetRoiSaveState === "SAVING"
      ? "bg-amber-300"
      : "bg-cyan-200";
  const refreshMode = collectionDashboardRefreshMode(dashboard?.summary.collectionRun?.status, hasUnsavedEdits);

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

  const visibleMetrics = useMemo(
    () =>
      metrics.filter((metric) => {
        const routeMatches = routeFilter === "ALL" || metricRouteKey(metric, dashboard) === routeFilter;
        const categoryMatches = metricCategoryFilter === "ALL" || metricCategory(metric.metricKey) === metricCategoryFilter;
        return routeMatches && categoryMatches && (statusFilter === "ALL" || metric.reviewStatus === statusFilter);
      }),
    [dashboard, metricCategoryFilter, metrics, routeFilter, statusFilter],
  );
  const visibleTables = useMemo(
    () =>
      dashboard?.summary.tables.filter((table) => {
        if (routeFilter !== "ALL" && table.routeKey !== routeFilter) return false;
        if (statusFilter === "ALL") return true;
        return table.rows.some((row, rowIndex) =>
          row.some((_cell, columnIndex) => (cellReviewAt(table, rowIndex, columnIndex)?.reviewStatus || "PENDING") === statusFilter),
        );
      }) || [],
    [dashboard, routeFilter, statusFilter],
  );
  const currentRealtimeFrames = useMemo<Record<string, RealtimeMetricFrame>>(
    () => Object.fromEntries(
      Object.entries(realtimeFrames).filter(([, frame]) => frame.collectionTaskId === params.id),
    ),
    [params.id, realtimeFrames],
  );
  const overviewCards = useMemo(() => {
    if (!dashboard) return [];
    const frames = Object.values(currentRealtimeFrames);
    return frames.length
      ? buildDashboardOverviewCards(dashboard.summary.metrics, frames)
      : dashboard.overviewCards || buildDashboardOverviewCards(dashboard.summary.metrics);
  }, [currentRealtimeFrames, dashboard]);

  async function updateMetric(metric: ReviewedMetricDTO, reviewStatus: Exclude<MetricReviewStatus, "PENDING">) {
    if (!token) return;
    const expectedSnapshotUpdatedAt = snapshotVersionForMetric(metric, dashboard);
    if (!expectedSnapshotUpdatedAt) {
      setError("当前指标不属于可校准的最新快照，请刷新后重试");
      return;
    }
    setBusy(`metric:${metric.id}`);
    setError("");
    try {
      const updated = await apiFetch<ReviewedMetricDTO>(`/review-metrics/${metric.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          expectedSnapshotUpdatedAt,
          reviewStatus,
          reviewedValue: reviewStatus === "MODIFIED" ? metricDrafts[metric.id] || "" : undefined,
          timeRange: reviewStatus === "MODIFIED" ? metricPeriodDrafts[metric.id] || "" : undefined,
        }),
      });
      setMetrics((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("指标校准已保存。");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存指标失败");
    } finally {
      setBusy("");
    }
  }

  async function resolveMetricConflict(metric: ReviewedMetricDTO, sourceSelection: "API" | "DOM" | "IGNORE") {
    if (!token) return;
    const expectedSnapshotUpdatedAt = snapshotVersionForMetric(metric, dashboard);
    if (!expectedSnapshotUpdatedAt) {
      setError("当前指标不属于可校准的最新快照，请刷新后重试");
      return;
    }
    setBusy(`metric:${metric.id}`);
    setError("");
    try {
      const updated = await apiFetch<ReviewedMetricDTO>(`/review-metrics/${metric.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          expectedSnapshotUpdatedAt,
          sourceSelection,
          reviewStatus: sourceSelection === "IGNORE" ? "IGNORED" : "CONFIRMED",
        }),
      });
      setMetrics((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("冲突来源选择已保存。");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存冲突选择失败");
    } finally {
      setBusy("");
    }
  }

  async function confirmAllMetrics() {
    if (!token) return;
    const snapshotVersions = snapshotVersionsForMetrics(metrics, dashboard);
    if (!snapshotVersions) {
      setError("当前指标不属于可校准的最新快照，请刷新后重试");
      return;
    }
    setBusy("confirm-metrics");
    setError("");
    try {
      const updated = await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics/confirm-all`, token, {
        method: "POST",
        body: JSON.stringify({ snapshotVersions }),
      });
      setMetrics(updated);
      setMetricDrafts(Object.fromEntries(updated.map((metric) => [metric.id, metric.reviewedValue ?? metric.originalValue ?? ""])));
      setMetricPeriodDrafts(
        Object.fromEntries(
          updated.map((metric) => [metric.id, metric.timeRange && metric.timeRange !== "UNKNOWN" ? metric.timeRange : ""]),
        ),
      );
      setMessage("全部待确认指标已确认。");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "批量确认指标失败");
    } finally {
      setBusy("");
    }
  }

  async function confirmAndRunDiagnosis() {
    if (!token || !dashboard) return;
    if (hasUnsavedReviewEdits) {
      setError("存在尚未保存的修改，请先保存或刷新后再生成诊断。");
      return;
    }

    setBusy("confirm-and-diagnose");
    setError("");
    setMessage("");
    try {
      let currentDashboard = dashboard;
      if (targetRoiDirty) {
        const saved = await flushTargetRoiSave();
        currentDashboard = { ...currentDashboard, decisionTargets: saved };
      }
      let currentMetrics = metrics;

      if (currentDashboard.reviewCoverage.pendingCount > 0) {
        const snapshotVersions = snapshotVersionsForMetrics(currentMetrics, currentDashboard, realtimeCoveredSnapshotIds);
        if (!snapshotVersions) throw new Error("指标快照已变化，请刷新后重试。");
        if (snapshotVersions.length) {
          await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics/confirm-all`, token, {
            method: "POST",
            body: JSON.stringify({ snapshotVersions }),
          });
          [currentDashboard, currentMetrics] = await Promise.all([
            apiFetch<CollectionDashboardDTO>(`/collection-tasks/${params.id}/collection-dashboard`, token),
            apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics`, token),
          ]);
        }
      }

      if (currentDashboard.tableReviewCoverage.pendingCount > 0) {
        const snapshotVersions = snapshotVersionsForTables(currentDashboard, realtimeCoveredSnapshotIds);
        if (snapshotVersions.length) {
          await apiFetch<{ confirmedCount: number }>(`/collection-tasks/${params.id}/table-cell-reviews/confirm-all`, token, {
            method: "POST",
            body: JSON.stringify({ snapshotVersions }),
          });
          currentDashboard = await apiFetch<CollectionDashboardDTO>(`/collection-tasks/${params.id}/collection-dashboard`, token);
        }
      }

      const remainingMetricCoverage = subtractCoveredSnapshotsFromMetricCoverage(currentDashboard.reviewCoverage, currentMetrics, realtimeCoveredSnapshotIds);
      const remainingTableCoverage = subtractCoveredSnapshotsFromTableCoverage(currentDashboard.tableReviewCoverage, currentDashboard, realtimeCoveredSnapshotIds);
      const remainingReviewCount = remainingMetricCoverage.pendingCount + remainingTableCoverage.pendingCount;
      if (remainingReviewCount > 0) {
        throw new Error(`仍有 ${remainingReviewCount} 项数据待复核，请刷新后检查。`);
      }

      const preview = await apiFetch<DecisionPreview>(`/collection-tasks/${params.id}/decision-preview`, token, {
        method: "POST",
        body: "{}",
      });
      setDashboard(currentDashboard);
      setMetrics(currentMetrics);
      setDecisionPreview(preview);
      if (preview.mode === "CONSERVATIVE_ONLY") {
        setMessage("当前证据只支持保守诊断，结果已显示在本页下方；本次不会创建动作建议。");
        scrollToDiagnosis();
        return;
      }

      const nextRun = await createDecisionRun();
      setMessage(decisionRunMessage(nextRun));
      scrollToDiagnosis();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "确认数据并生成诊断失败");
    } finally {
      setBusy("");
    }
  }

  function parseTargetRoiDraft(draft = targetRoiDraft) {
    const normalized = draft.trim();
    if (!normalized) return null;
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0 || value > 10_000) {
      throw new Error("目标 ROI 必须是大于 0 且不超过 10000 的数字。");
    }
    return value;
  }

  function persistTargetRoi(draft = targetRoiDraft) {
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const draftAtRequest = draft;
    targetRoiRequestedRef.current = draftAtRequest;
    const run = async () => {
      const targetRoi = parseTargetRoiDraft(draftAtRequest);
      const saved = await apiFetch<CollectionDashboardDTO["decisionTargets"]>(
        `/collection-tasks/${params.id}/decision-targets`,
        token,
        { method: "PUT", body: JSON.stringify({ targetRoi }) },
      );
      if (targetRoiDraftRef.current === draftAtRequest) {
        const savedValue = saved.targetRoi === null ? "" : String(saved.targetRoi);
        setSavedTargetRoi(savedValue);
        savedTargetRoiRef.current = savedValue;
        setTargetRoiDraft(savedValue);
        targetRoiDraftRef.current = savedValue;
        targetRoiRequestedRef.current = savedValue;
        setDashboard((current) => current ? { ...current, decisionTargets: saved } : current);
      }
      return saved;
    };
    const request = targetRoiSaveChainRef.current.then(run, run);
    targetRoiSaveChainRef.current = request.catch(() => undefined);
    return request;
  }

  async function flushTargetRoiSave() {
    if (targetRoiSaveTimerRef.current !== null) {
      window.clearTimeout(targetRoiSaveTimerRef.current);
      targetRoiSaveTimerRef.current = null;
    }
    const draft = targetRoiDraftRef.current;
    if (targetRoiRequestedRef.current === draft) {
      await targetRoiSaveChainRef.current;
      if (targetRoiDraftRef.current !== draft) return flushTargetRoiSave();
      if (draft.trim() === savedTargetRoiRef.current) {
        return dashboard?.decisionTargets || { targetRoi: null, updatedAt: null };
      }
      setTargetRoiSaveState("ERROR");
      throw new Error("目标 ROI 未成功保存，请修改后重试。");
    }
    if (draft.trim() === savedTargetRoiRef.current) {
      return dashboard?.decisionTargets || { targetRoi: null, updatedAt: null };
    }
    setTargetRoiSaveState("SAVING");
    const saved = await persistTargetRoi(draft);
    if (targetRoiDraftRef.current !== draft) return flushTargetRoiSave();
    setTargetRoiSaveState("SAVED");
    return saved;
  }

  async function runDecision() {
    if (!token) return;
    setBusy("decision");
    setError("");
    setMessage("");
    try {
      if (targetRoiDirty) await flushTargetRoiSave();
      const nextRun = await createDecisionRun();
      setMessage(decisionRunMessage(nextRun));
      scrollToDiagnosis();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建诊断失败");
    } finally {
      setBusy("");
    }
  }

  async function createDecisionRun() {
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    decisionIdempotencyKey.current ||= createIdempotencyKey(`decision:${params.id}`);
    const nextDecisionRun = await apiFetch<DecisionRun>(`/collection-tasks/${params.id}/decision-runs`, token, {
      method: "POST",
      headers: { "idempotency-key": decisionIdempotencyKey.current },
      body: "{}",
    });
    decisionIdempotencyKey.current = "";
    setDecisionPreview(null);
    setDecisionRun(nextDecisionRun);
    return nextDecisionRun;
  }

  function scrollToDiagnosis() {
    window.requestAnimationFrame(() => {
      document.getElementById("diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function setCellDraft(
    table: CollectionDashboardDTO["summary"]["tables"][number],
    rowIndex: number,
    columnIndex: number,
    patch: Partial<CellDraft>,
  ) {
    const existing = getCellDraft(
      table,
      rowIndex,
      columnIndex,
      cellReviewAt(table, rowIndex, columnIndex),
      cellValueAt(table, rowIndex, columnIndex),
    );
    setCellDrafts((current) => ({
      ...current,
      [cellKey(table, rowIndex, columnIndex)]: { ...existing, ...patch },
    }));
  }

  async function saveTable(
    table: CollectionDashboardDTO["summary"]["tables"][number],
    rowOffset: number,
    rowCount: number,
    confirmPage = false,
  ) {
    if (!token) return;
    if (confirmPage && table.bindingStatus !== "TRUSTED") {
      setError("该表头或行列结构尚未校准。请逐格核对后选择“修改”保存，系统不会直接批量确认原值。");
      return;
    }
    const items = table.rows.slice(rowOffset, rowOffset + rowCount).flatMap((row, localRowIndex) =>
      row
        .map((_cell, columnIndex) => {
          const rowIndex = rowOffset + localRowIndex;
          const review = cellReviewAt(table, rowIndex, columnIndex);
          const draft = getCellDraft(table, rowIndex, columnIndex, review, cellValueAt(table, rowIndex, columnIndex));
          if (!confirmPage && !cellDrafts[cellKey(table, rowIndex, columnIndex)]) return null;
          const reviewStatus = confirmPage && (!review || review.reviewStatus === "PENDING") ? ("CONFIRMED" as const) : draft.reviewStatus;
          if (!confirmPage && reviewStatus === "CONFIRMED" && table.bindingStatus !== "TRUSTED") {
            return {
              tableIndex: table.tableIndex,
              rowIndex,
              columnIndex,
              reviewedValue: draft.reviewedValue,
              reviewStatus: "MODIFIED" as const,
            };
          }
          return {
            tableIndex: table.tableIndex,
            rowIndex,
            columnIndex,
            reviewedValue: draft.reviewStatus === "MODIFIED" ? draft.reviewedValue : undefined,
            reviewStatus,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    );
    if (!items.length) {
      setMessage("没有需要保存的表格校准。");
      return;
    }
    setBusy(`table:${table.snapshotId}:${table.tableIndex}`);
    setError("");
    try {
      await apiFetch<TableCellReviewDTO[]>(`/collection-tasks/${params.id}/table-cell-reviews/bulk`, token, {
        method: "POST",
        body: JSON.stringify({
          snapshotId: table.snapshotId,
          expectedSnapshotUpdatedAt: table.snapshotUpdatedAt,
          items,
        }),
      });
      setCellDrafts((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${table.snapshotId}:${table.tableIndex}:`))),
      );
      setMessage(
        confirmPage
          ? "当前页单元格已批量确认。"
          : table.bindingStatus === "TRUSTED"
            ? "当前页表格校准已保存。"
            : "已保存逐格核对值；完成整表核对后，系统会记住该表头与行列结构。",
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存表格校准失败");
    } finally {
      setBusy("");
    }
  }

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState />;
  if (!dashboard) return <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">{error || "正在读取校准大屏..."}</main>;

  const routeOptions = dashboard.summary.routes.map((route) => ({
    key: route.routeKey,
    label: route.label,
  }));
  const latestCapturedAt = dashboard.summary.latestCapturedAt
    ? new Date(dashboard.summary.latestCapturedAt).toLocaleString("zh-CN")
    : "暂无";
  const hourlyRows = dashboard.summary.structuredData.flatMap((record) => (record.kind === "HOURLY_ROWS" ? record.rows : []));
  const liveRealtimeFrame = currentRealtimeFrames.LIVE_DATA_SCREEN;
  const localPromotionRealtimeFrame = currentRealtimeFrames.LOCAL_PROMOTION_DASHBOARD;
  const liveRealtimeMetrics = realtimeStatus === "CONNECTED" ? usableRealtimeMetrics(liveRealtimeFrame, "LIVE_DATA_SCREEN") : [];
  const localPromotionRealtimeMetrics = realtimeStatus === "CONNECTED" ? usableRealtimeMetrics(localPromotionRealtimeFrame, "LOCAL_PROMOTION_DASHBOARD") : [];
  const hasUsableRealtimeOverview = Boolean(liveRealtimeFrame?.pageType === "LIVE_DATA_SCREEN" && liveRealtimeMetrics.length);
  const hasUsableLocalPromotionRealtime = Boolean(localPromotionRealtimeFrame?.pageType === "LOCAL_PROMOTION_DASHBOARD" && localPromotionRealtimeMetrics.length);
  const realtimeCoveredSnapshotIds = new Set(dashboard.summary.routes.flatMap((route) => {
    const covered = (route.routeKey === "LIVE_DATA_SCREEN" && hasUsableRealtimeOverview)
      || (route.routeKey === "LOCAL_PROMOTION_DASHBOARD" && hasUsableLocalPromotionRealtime);
    return covered && route.snapshotId ? [route.snapshotId] : [];
  }));
  const effectiveRoutes = dashboard.summary.routes.map((route) => {
    const frame = route.routeKey === "LIVE_DATA_SCREEN" ? liveRealtimeFrame : route.routeKey === "LOCAL_PROMOTION_DASHBOARD" ? localPromotionRealtimeFrame : undefined;
    const routeMetrics = route.routeKey === "LIVE_DATA_SCREEN" ? liveRealtimeMetrics : localPromotionRealtimeMetrics;
    const covered = (route.routeKey === "LIVE_DATA_SCREEN" && hasUsableRealtimeOverview)
      || (route.routeKey === "LOCAL_PROMOTION_DASHBOARD" && hasUsableLocalPromotionRealtime);
    return covered
      ? {
          ...route,
          state: "UPLOADED" as const,
          routeVerificationStatus: "VERIFIED" as const,
          lastCapturedAt: frame?.receivedAt || frame?.observedAt || route.lastCapturedAt,
          metricCount: routeMetrics.length,
          coverageRatio: 1,
          lastError: null,
        }
      : route;
  });
  const activeRoutes = sortPrimaryRoutes(effectiveRoutes.filter((route) => (
    route.routeKey === "LOCAL_PROMOTION_DASHBOARD" || route.routeKey === "LIVE_DATA_SCREEN"
  )));
  const historicalRoutes = effectiveRoutes.filter((route) => (
    route.routeKey !== "LOCAL_PROMOTION_DASHBOARD" && route.routeKey !== "LIVE_DATA_SCREEN"
  ));
  const missingRouteCount = activeRoutes.filter((route) => !routeHasUsableData(route)).length;
  const attentionRouteCount = activeRoutes.filter(routeNeedsAttention).length;
  const pendingRouteConfirmationCount = activeRoutes.filter((route) => (
    route.routeVerificationStatus === "MANUAL_PENDING"
      && !(route.routeKey === "LIVE_DATA_SCREEN" && hasUsableRealtimeOverview)
      && !(route.routeKey === "LOCAL_PROMOTION_DASHBOARD" && hasUsableLocalPromotionRealtime)
  )).length;
  const requiredRouteCount = activeRoutes.filter((route) => route.required).length;
  const routeCoverageLabel = activeRoutes.length === 0
    ? "待配置"
    : missingRouteCount > 0
      ? `${missingRouteCount} 条待采集`
      : attentionRouteCount > 0
        ? `${attentionRouteCount} 条需关注`
        : "全部就绪";
  const routesFullyReady = activeRoutes.length > 0 && missingRouteCount === 0 && attentionRouteCount === 0;
  const latestRealtimeFrame = [
    hasUsableRealtimeOverview ? liveRealtimeFrame : null,
    hasUsableLocalPromotionRealtime ? localPromotionRealtimeFrame : null
  ]
    .filter((frame): frame is RealtimeMetricFrame => Boolean(frame))
    .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))[0];
  const latestOverviewAt = latestRealtimeFrame?.receivedAt || latestRealtimeFrame?.observedAt || dashboard.summary.latestCapturedAt;
  const effectiveReviewCoverage = subtractCoveredSnapshotsFromMetricCoverage(dashboard.reviewCoverage, metrics, realtimeCoveredSnapshotIds);
  const effectiveTableReviewCoverage = subtractCoveredSnapshotsFromTableCoverage(dashboard.tableReviewCoverage, dashboard, realtimeCoveredSnapshotIds);
  const pendingReviewCount = effectiveReviewCoverage.pendingCount + effectiveTableReviewCoverage.pendingCount;
  const effectiveSnapshotCount = Math.max(dashboard.summary.snapshotCount, hasUsableRealtimeOverview || hasUsableLocalPromotionRealtime ? 1 : 0);
  const calibrationState = collectionDashboardCalibrationState(effectiveSnapshotCount, pendingReviewCount);
  const calibrationLabel =
    calibrationState === "EMPTY" ? "尚无采集数据" : calibrationState === "PENDING" ? `${pendingReviewCount} 项待校准` : "校准已完成";
  const calibrationTone =
    calibrationState === "COMPLETE"
      ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-100"
      : "border-amber-200/20 bg-amber-300/10 text-amber-100";
  const formalReady = decisionPreview?.readiness.ready ?? (
    routesFullyReady && calibrationState === "COMPLETE"
  );
  const conservativePreview = decisionPreview?.mode === "CONSERVATIVE_ONLY" ? decisionPreview : null;
  const displayedDecisionRun = conservativePreview ? null : decisionRun;
  const diagnosticOutput = displayedDecisionRun?.mode === "LEGACY_RULE"
    ? {
        ...displayedDecisionRun.finalResultJson,
        diagnosis: displayedDecisionRun.diagnosis || "旧版规则诊断",
        riskLevel: displayedDecisionRun.riskLevel || "MEDIUM" as const,
        confidence: displayedDecisionRun.confidence ?? 0,
      }
    : decisionPreview?.finalOutput || null;
  const managedLiveGrowthMode = diagnosticOutput?.businessAnalysis?.mode === "MANAGED_LIVE_GROWTH";
  const evidenceAdvisories = activeRoutes.filter((route) => (
    route.required && (route.state === "PARTIAL" || route.state === "STALE")
  ));
  return (
    <main className="min-h-screen bg-[#050b1b] px-3 py-3 text-slate-100 sm:px-5 sm:py-5">
      <header className="mx-auto flex max-w-[1680px] flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Link className="text-sm font-medium text-indigo-200 transition hover:text-white" href={`/tasks/${params.id}`}>
            返回任务
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">经营数据大屏</h1>
            <span className={`border px-2 py-1 text-xs font-medium ${calibrationTone}`}>{calibrationLabel}</span>
          </div>
          <p className="mt-1 truncate text-sm text-slate-300">
            {dashboard.task.accountName} <span className="px-1 text-slate-500">/</span> {dashboard.task.projectName}{" "}
            <span className="px-1 text-slate-500">/</span> {dashboard.task.title || "采集任务"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 text-sm shadow-[0_10px_28px_rgba(2,6,23,0.2)] sm:grid-cols-4">
          <DashboardStat
            label="最近更新"
            value={latestOverviewAt ? new Date(latestOverviewAt).toLocaleString("zh-CN") : latestCapturedAt}
          />
          <DashboardStat
            label="采集状态"
            value={collectionRunStatusLabel(dashboard.summary.collectionRun?.status)}
            tone={refreshMode === "IDLE" ? "slate" : "blue"}
          />
          <DashboardStat
            label="线路状态"
            value={routeCoverageLabel}
            tone={routesFullyReady ? "green" : "amber"}
          />
          <DashboardStat
            label="校准待办"
            value={calibrationState === "EMPTY" ? "待采集" : `${pendingReviewCount} 项`}
            tone={calibrationState === "COMPLETE" ? "green" : "amber"}
          />
        </div>
      </header>

      {error ? (
        <p className="mx-auto mt-4 max-w-[1680px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="mx-auto mt-4 max-w-[1680px] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>
      ) : null}

      <OverviewPanel
        targetEditor={
          <div className="w-full max-w-[320px] rounded-xl border border-white/10 bg-slate-950/20 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_22px_rgba(2,6,23,0.16)] backdrop-blur-sm sm:w-[304px]">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <label className="text-xs font-semibold tracking-wide text-indigo-50" htmlFor="target-roi">本次目标 ROI</label>
                <p className="mt-0.5 truncate text-[11px] text-indigo-100/60">用于对比全域支付 ROI</p>
              </div>
              <div className="shrink-0">
                <Input
                  aria-label="本次目标 ROI"
                  className={[
                    "h-10 w-[106px] border-indigo-200/25 bg-slate-950/35 px-3 text-right text-sm font-semibold tabular-nums",
                    "text-white shadow-inner placeholder:text-indigo-100/35 focus-visible:border-cyan-200 focus-visible:ring-cyan-200/30"
                  ].join(" ")}
                  id="target-roi"
                  inputMode="decimal"
                  max="10000"
                  min="0.01"
                  onChange={(event) => {
                    targetRoiDraftRef.current = event.target.value;
                    setTargetRoiDraft(event.target.value);
                    setTargetRoiSaveState("PENDING");
                    setError("");
                  }}
                  placeholder="例如 50"
                  step="0.01"
                  type="number"
                  value={targetRoiDraft}
                />
              </div>
            </div>
            <p className={`mt-2 flex items-center gap-1.5 text-[11px] ${targetRoiSaveTone}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${targetRoiSaveIndicatorClass}`} />
              {targetRoiSaveState === "PENDING"
                ? "等待自动保存"
                : targetRoiSaveState === "SAVING"
                  ? "正在保存..."
                  : targetRoiSaveState === "ERROR"
                  ? "保存失败，请修改后重试"
                  : targetRoiSaveState === "SAVED"
                    ? "已保存"
                    : "设定本次经营对标基准"}
            </p>
          </div>
        }
        action={
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <Button
              className="h-10 bg-white px-5 text-indigo-700 shadow-sm hover:bg-indigo-50"
              disabled={
                Boolean(busy) ||
                calibrationState === "EMPTY" ||
                hasUnsavedReviewEdits ||
                metrics.some((metric) => (
                  !(metric.snapshotId && realtimeCoveredSnapshotIds.has(metric.snapshotId))
                  && metric.sourceStatus === "SOURCE_CONFLICT"
                  && !metric.manualSourceSelection
                ))
              }
              onClick={() => void confirmAndRunDiagnosis()}
              type="button"
            >
              {busy === "confirm-and-diagnose" ? "正在确认并分析..." : "确认可信数据并生成诊断"}
            </Button>
            <p className={`text-xs ${hasUnsavedReviewEdits || targetRoiDirty ? "text-amber-200" : "text-indigo-100/80"}`}>
              {hasUnsavedReviewEdits
                ? "存在未保存修改，请先在详细数据中保存"
                : targetRoiDirty
                  ? "目标 ROI 将在生成诊断前自动保存"
                : pendingReviewCount > 0
                  ? `${pendingReviewCount} 项可信数据将在生成诊断前确认`
                  : "数据已校准，可直接生成诊断"}
            </p>
          </div>
        }
        cards={overviewCards}
        hasRealtimeFrame={Boolean(latestRealtimeFrame)}
        latestUpdatedAt={latestOverviewAt}
        realtimeStatus={realtimeStatus}
        routeCoverageLabel={routeCoverageLabel}
        snapshotCount={dashboard.summary.snapshotCount}
      />

      <section className="mx-auto mt-4 max-w-[1680px] rounded-xl border border-white/10 bg-[#08142d] p-3 text-slate-100 shadow-[0_14px_34px_rgba(2,6,23,0.18)] sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">采集线路</h2>
            <p className="mt-1 text-xs text-slate-300">两条有效线路共同汇入经营总览，各自保留来源和更新时间。</p>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-medium text-indigo-100">{routeCoverageLabel}</span>
        </div>
        <CollectionRouteFlow historicalRoutes={historicalRoutes} routes={activeRoutes} />
      </section>

      <details className="mx-auto mt-4 max-w-[1680px] rounded-xl border border-white/10 bg-[#08142d] shadow-[0_14px_34px_rgba(2,6,23,0.18)]">
        <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-white marker:hidden">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>详细指标与原始表格</span>
            <span className="font-normal text-slate-300">
              {metrics.length} 项指标 · {dashboard.tableReviewCoverage.totalCount} 个表格单元格 · 点击展开
            </span>
          </span>
        </summary>
        <div className="border-t border-slate-200 bg-[#0b1628] pb-4 text-slate-100">
          <section className="mx-auto mt-4 max-w-[1680px] border border-slate-700/80 bg-[#0a172a] p-3 sm:p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-slate-400">
                  路线筛选
                  <Select
                    className="border-slate-600 bg-slate-950 text-slate-100"
                    value={routeFilter}
                    onChange={(event) => setRouteFilter(event.target.value)}
                  >
                    <option value="ALL">全部路线</option>
                    {routeOptions.map((route) => (
                      <option key={route.key} value={route.key}>
                        {route.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-slate-400">
                  指标类别
                  <Select
                    className="border-slate-600 bg-slate-950 text-slate-100"
                    value={metricCategoryFilter}
                    onChange={(event) => setMetricCategoryFilter(event.target.value as typeof metricCategoryFilter)}
                  >
                    <option value="ALL">全部类别</option>
                    {metricCategories.map((category) => (
                      <option key={category} value={category}>
                        {metricCategoryLabel(category)}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-slate-400">
                  复核状态
                  <Select
                    className="border-slate-600 bg-slate-950 text-slate-100"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  >
                    <option value="ALL">全部状态</option>
                    <option value="PENDING">待复核</option>
                    <option value="CONFIRMED">已确认</option>
                    <option value="MODIFIED">已修改</option>
                    <option value="IGNORED">已忽略</option>
                  </Select>
                </label>
              </div>
              <Button
                className="border border-cyan-300/30 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                disabled={
                  Boolean(busy) || !metrics.some((metric) => metric.reviewStatus === "PENDING" && metric.bindingStatus === "TRUSTED")
                }
                onClick={() => void confirmAllMetrics()}
                type="button"
              >
                确认全部已校准指标
              </Button>
            </div>
          </section>

          {refreshAvailable ? (
            <div className="mx-auto mt-3 flex max-w-[1680px] flex-wrap items-center justify-between gap-3 border border-cyan-300/30 bg-cyan-950/30 px-4 py-3 text-sm text-cyan-100">
              <span>检测到新的采集数据。当前有未保存校准，未自动覆盖。</span>
              <button
                className="border border-cyan-300/50 px-3 py-1.5 text-xs font-medium hover:bg-cyan-300/10"
                onClick={() => void load()}
                type="button"
              >
                刷新数据
              </button>
            </div>
          ) : null}

          <section className="mx-auto mt-4 grid max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <section className="border border-slate-700/80 bg-[#0a172a]">
                <div className="flex flex-col gap-2 border-b border-slate-700 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-white">核心指标校准</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      逐项核对“后台字段标签 → 后台显示值 → 系统精确值 → 字段位置 → 周期”；只有可信数据进入正式诊断。
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">当前筛选 {visibleMetrics.length} 项</span>
                </div>
                {visibleMetrics.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-[1320px] w-full text-left text-sm">
                      <thead className="bg-slate-900 text-xs text-slate-400">
                        <tr>
                          <th className="px-3 py-2">指标</th>
                          <th className="px-3 py-2">后台字段标签</th>
                          <th className="px-3 py-2">后台显示值</th>
                          <th className="px-3 py-2">API / DOM 候选</th>
                          <th className="px-3 py-2">系统精确值 / 单位</th>
                          <th className="px-3 py-2">字段位置与校验</th>
                          <th className="px-3 py-2">校准值 / 周期</th>
                          <th className="px-3 py-2">状态</th>
                          <th className="px-3 py-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleMetrics.map((metric) => {
                          const conflict = metric.sourceStatus === "SOURCE_CONFLICT";
                          return (
                            <tr className="border-t border-slate-800/90 hover:bg-slate-900/60" key={metric.id}>
                              <td className="px-3 py-3 font-medium text-slate-100">{metric.metricName}</td>
                              <td className="px-3 py-3 text-slate-300">{metric.fieldLabel || "未记录"}</td>
                              <td className="px-3 py-3 text-slate-300">{metric.displayValue ?? metric.originalValue ?? "数据缺失"}</td>
                              <td className="px-3 py-3 text-xs text-slate-300">
                                {conflict ? (
                                  <>
                                    <p>API：{metric.apiValue || "缺失"}</p>
                                    <p className="mt-1">DOM：{metric.domValue || "缺失"}</p>
                                    <p className="mt-1 text-amber-200">{metric.selectionReason || "数值冲突，需人工选择"}</p>
                                  </>
                                ) : (
                                  <p>
                                    {metric.sourceStatus === "API_AND_DOM"
                                      ? "API 与 DOM 已对账"
                                      : metric.sourceStatus === "INTERNAL_API"
                                        ? "仅 API"
                                        : "仅 DOM"}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-3 text-slate-300">
                                {formatNormalizedMetricValue(metric)}
                                <p className="mt-1 text-[11px] text-slate-500">
                                  单位来源：{metric.unitSource || "未标注"} · 展示精度：{metric.displayPrecision ?? "--"}
                                </p>
                              </td>
                              <td className="px-3 py-3">
                                <MetricEvidenceCell metric={metric} />
                              </td>
                              <td className="px-3 py-3">
                                {conflict ? (
                                  <p className="text-xs text-amber-200">冲突字段只允许选择候选来源，不允许自由填写。</p>
                                ) : (
                                  <div className="grid gap-2">
                                    <Input
                                      aria-label={`${metric.metricName} 校准值`}
                                      className="h-8 w-36 border-slate-600 bg-slate-950 text-slate-100"
                                      value={metricDrafts[metric.id] ?? ""}
                                      onChange={(event) =>
                                        setMetricDrafts((current) => ({
                                          ...current,
                                          [metric.id]: event.target.value,
                                        }))
                                      }
                                    />
                                    <Input
                                      aria-label={`${metric.metricName} 统计周期`}
                                      className="h-8 w-36 border-slate-600 bg-slate-950 text-slate-100"
                                      placeholder="例如：今日"
                                      value={metricPeriodDrafts[metric.id] ?? ""}
                                      onChange={(event) =>
                                        setMetricPeriodDrafts((current) => ({
                                          ...current,
                                          [metric.id]: event.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <ReviewBadge status={metric.reviewStatus} />
                              </td>
                              <td className="px-3 py-3">
                                {conflict ? (
                                  <div className="flex gap-1">
                                    <MiniButton disabled={Boolean(busy)} onClick={() => void resolveMetricConflict(metric, "API")}>
                                      采用 API
                                    </MiniButton>
                                    <MiniButton disabled={Boolean(busy)} onClick={() => void resolveMetricConflict(metric, "DOM")}>
                                      采用 DOM
                                    </MiniButton>
                                    <MiniButton disabled={Boolean(busy)} onClick={() => void resolveMetricConflict(metric, "IGNORE")}>
                                      忽略
                                    </MiniButton>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <MiniButton
                                      disabled={Boolean(busy) || metric.bindingStatus === "INVALID"}
                                      onClick={() => void updateMetric(metric, "CONFIRMED")}
                                    >
                                      确认
                                    </MiniButton>
                                    <MiniButton
                                      disabled={Boolean(busy) || !(metricPeriodDrafts[metric.id] || "").trim()}
                                      onClick={() => void updateMetric(metric, "MODIFIED")}
                                    >
                                      修改
                                    </MiniButton>
                                    <MiniButton disabled={Boolean(busy)} onClick={() => void updateMetric(metric, "IGNORED")}>
                                      忽略
                                    </MiniButton>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState label="当前筛选没有可校准指标。先确认页面路线后重新采集，系统不会生成虚构数据。" />
                )}
              </section>

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
                      <div>
                        <h2 className="font-semibold">
                          {collectionRouteLabels[table.routeKey || "UNKNOWN"] || table.pageType || "结构化表格"}
                        </h2>
                        <p className="text-xs text-slate-400">
                          来源路线：
                          {collectionRouteLabels[table.routeKey || "UNKNOWN"] || table.pageType || "未知路线"} · 周期：
                          {table.timeRange || "缺失"} · 行标识：
                          {table.identityColumn || "未识别"}（第 {table.identityColumnIndex == null ? "--" : table.identityColumnIndex + 1}{" "}
                          列） · 结构状态：
                          {table.bindingStatus === "TRUSTED" ? "已校准" : "待逐格核对"} · 采集于{" "}
                          {new Date(table.capturedAt).toLocaleString("zh-CN")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">结构位置：{table.bindingLocation || "未记录"}</p>
                        {table.bindingStatus !== "TRUSTED" ? (
                          <p className="mt-1 text-xs text-amber-200">{table.bindingReasons.join("；")}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="h-8 border border-slate-600 bg-slate-800 px-3 text-xs text-slate-100"
                          disabled={Boolean(busy)}
                          onClick={() => void saveTable(table, rowOffset, pageRows.length)}
                          type="button"
                        >
                          保存当前页逐格核对
                        </Button>
                        <Button
                          className="h-8 px-3 text-xs"
                          disabled={Boolean(busy) || table.bindingStatus !== "TRUSTED"}
                          onClick={() => void saveTable(table, rowOffset, pageRows.length, true)}
                          type="button"
                        >
                          确认当前页单元格
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-max w-full text-left text-sm">
                        <tbody>
                          {pageRows.map((row, localRowIndex) => {
                            const rowIndex = rowOffset + localRowIndex;
                            return (
                              <tr className="border-t border-slate-800" key={rowIndex}>
                                {row.map((cell, columnIndex) => (
                                  <EditableCell
                                    cell={cell}
                                    draft={getCellDraft(
                                      table,
                                      rowIndex,
                                      columnIndex,
                                      cellReviewAt(table, rowIndex, columnIndex),
                                      String(cell ?? ""),
                                    )}
                                    key={columnIndex}
                                    review={cellReviewAt(table, rowIndex, columnIndex)}
                                    rowIndex={rowIndex}
                                    setDraft={(patch) => setCellDraft(table, rowIndex, columnIndex, patch)}
                                  />
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {pageCount > 1 ? (
                      <div className="flex items-center justify-end gap-2 border-t border-slate-700 px-4 py-3 text-xs">
                        <button
                          className="border border-slate-600 px-3 py-1 disabled:opacity-40"
                          disabled={page === 0 || Boolean(busy)}
                          onClick={() =>
                            setTablePages((current) => ({
                              ...current,
                              [tableKey]: page - 1,
                            }))
                          }
                          type="button"
                        >
                          上一页
                        </button>
                        <span className="text-slate-400">
                          第 {page + 1} / {pageCount} 页
                        </span>
                        <button
                          className="border border-slate-600 px-3 py-1 disabled:opacity-40"
                          disabled={page >= pageCount - 1 || Boolean(busy)}
                          onClick={() =>
                            setTablePages((current) => ({
                              ...current,
                              [tableKey]: page + 1,
                            }))
                          }
                          type="button"
                        >
                          下一页
                        </button>
                      </div>
                    ) : null}
                  </section>
                );
              })}
              {!visibleTables.length ? (
                <section className="border border-dashed border-slate-700 bg-slate-900/50">
                  <EmptyState label="当前筛选下没有真实采集表格。系统不会生成模拟趋势或虚构表格。" />
                </section>
              ) : null}
            </div>
            <aside className="space-y-4">
              <section className="border border-slate-700/80 bg-[#0a172a] p-4">
                <h2 className="font-semibold text-white">数据可用性</h2>
                <p className="mt-2 text-3xl font-semibold text-cyan-300">
                  {dashboard.summary.coverageRatio == null ? "--" : `${Math.round(dashboard.summary.coverageRatio * 100)}%`}
                </p>
                <p className="mt-1 text-sm text-slate-400">已采集路线平均覆盖率</p>
                <div className="mt-4 space-y-3 border-t border-slate-800 pt-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">任务绑定</span>
                    <strong className="text-emerald-300">服务端已验证</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">尚待采集</span>
                    <strong>{missingRouteCount} 条</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">路线待确认</span>
                    <strong className={pendingRouteConfirmationCount ? "text-amber-300" : "text-emerald-300"}>
                      {pendingRouteConfirmationCount} 条
                    </strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">趋势数据</span>
                    <strong className={hourlyRows.length ? "text-emerald-300" : "text-slate-500"}>
                      {hourlyRows.length ? `${hourlyRows.length} 条` : "未采集"}
                    </strong>
                  </div>
                </div>
              </section>
              <section className="border border-slate-700/80 bg-[#0a172a] p-4">
                <h2 className="font-semibold text-white">校准状态</h2>
                <ReviewSummary label="指标" coverage={effectiveReviewCoverage} />
                <ReviewSummary label="表格" coverage={effectiveTableReviewCoverage} />
              </section>
            </aside>
          </section>
        </div>
      </details>

      <section
        className="mx-auto mt-4 max-w-[1680px] scroll-mt-4 rounded-xl border border-white/10 bg-slate-100 p-3 text-slate-950 shadow-[0_14px_34px_rgba(2,6,23,0.18)] sm:p-4"
        id="diagnosis"
      >
        <div className="mb-4">
          <p className="mb-1 text-xs font-semibold text-primary">诊断结果</p>
          <h2 className="text-xl font-semibold">诊断与建议</h2>
          <p className="mt-1 text-sm text-muted">{aiDisclaimer}</p>
        </div>
        <DiagnosisComparison
          busy={busy}
          decisionRun={displayedDecisionRun}
          evidenceAdvisory={formalReady && evidenceAdvisories.length
            ? `${evidenceAdvisories.map((route) => `${route.label}${route.state === "STALE" ? "数据已过期" : "仅部分可见"}`).join("；")}。暂停、加预算或减预算等动作仍需满足各自证据门槛。`
            : null}
          formalContent={diagnosticOutput
            ? (
                <DiagnosisBusinessSummary
                  conservative={!displayedDecisionRun}
                  managedLiveGrowthMode={managedLiveGrowthMode}
                  output={diagnosticOutput}
                />
              )
            : <p className="rounded-md border border-border bg-white p-4 text-sm text-muted">点击上方“确认可信数据并生成诊断”后，运行进度、诊断结论和建议会直接显示在这里。</p>}
          formalReady={formalReady}
          onRunFormal={() => void runDecision()}
          token={token}
          onRefresh={() => void load()}
        />
      </section>
    </main>
  );
}

function retainCurrentCellDrafts(current: Record<string, CellDraft>, dashboard: CollectionDashboardDTO) {
  const keys = new Set(
    dashboard.summary.tables.flatMap((table) =>
      table.rows.flatMap((row, rowIndex) => row.map((_cell, columnIndex) => cellKey(table, rowIndex, columnIndex))),
    ),
  );
  return Object.fromEntries(Object.entries(current).filter(([key]) => keys.has(key)));
}

function decisionRunMessage(run: DecisionRun) {
  return run.reuseReason === "UNCHANGED_EVIDENCE"
    ? "本轮可信数据、目标和诊断版本均未变化，已直接沿用现有结果，没有再次调用模型。"
    : "诊断任务已创建，运行进度和结果将在本页下方持续更新。";
}

function cellKey(table: CollectionDashboardDTO["summary"]["tables"][number], rowIndex: number, columnIndex: number) {
  return `${table.snapshotId}:${table.tableIndex}:${rowIndex}:${columnIndex}`;
}
function cellReviewAt(table: CollectionDashboardDTO["summary"]["tables"][number], rowIndex: number, columnIndex: number) {
  return table.cellReviews.find((review) => review.rowIndex === rowIndex && review.columnIndex === columnIndex) || null;
}
function cellValueAt(table: CollectionDashboardDTO["summary"]["tables"][number], rowIndex: number, columnIndex: number) {
  return String(table.rows[rowIndex]?.[columnIndex] ?? "");
}
function getCellDraft(
  table: CollectionDashboardDTO["summary"]["tables"][number],
  rowIndex: number,
  columnIndex: number,
  review: TableCellReviewDTO | null,
  fallback: string,
): CellDraft {
  return {
    reviewedValue: review?.reviewedValue ?? review?.originalValue ?? fallback,
    reviewStatus: (review?.reviewStatus === "PENDING" ? "CONFIRMED" : review?.reviewStatus || "CONFIRMED") as CellDraft["reviewStatus"],
  };
}
function metricRouteKey(metric: ReviewedMetricDTO, dashboard: CollectionDashboardDTO | null) {
  return dashboard?.summary.routes.find((route) => route.snapshotId === metric.snapshotId)?.routeKey || metric.pageType || "UNKNOWN";
}
function snapshotVersionForMetric(metric: ReviewedMetricDTO, dashboard: CollectionDashboardDTO | null) {
  return dashboard?.summary.routes.find((route) => route.snapshotId === metric.snapshotId)?.snapshotUpdatedAt || null;
}
function snapshotVersionsForMetrics(metrics: ReviewedMetricDTO[], dashboard: CollectionDashboardDTO | null, coveredSnapshotIds = new Set<string>()) {
  const versions = new Map<string, string>();
  for (const metric of metrics) {
    if (metric.snapshotId && coveredSnapshotIds.has(metric.snapshotId)) continue;
    if (!metric.snapshotId) return null;
    const expectedSnapshotUpdatedAt = snapshotVersionForMetric(metric, dashboard);
    if (!expectedSnapshotUpdatedAt) return null;
    versions.set(metric.snapshotId, expectedSnapshotUpdatedAt);
  }
  return [...versions].map(([snapshotId, expectedSnapshotUpdatedAt]) => ({
    snapshotId,
    expectedSnapshotUpdatedAt,
  }));
}
function snapshotVersionsForTables(dashboard: CollectionDashboardDTO, coveredSnapshotIds = new Set<string>()) {
  const versions = new Map<string, string>();
  for (const table of dashboard.summary.tables) {
    if (coveredSnapshotIds.has(table.snapshotId)) continue;
    const existingVersion = versions.get(table.snapshotId);
    if (existingVersion && existingVersion !== table.snapshotUpdatedAt) return [];
    versions.set(table.snapshotId, table.snapshotUpdatedAt);
  }
  return [...versions].map(([snapshotId, expectedSnapshotUpdatedAt]) => ({
    snapshotId,
    expectedSnapshotUpdatedAt,
  }));
}

function subtractCoveredSnapshotsFromMetricCoverage(
  coverage: CollectionDashboardDTO["reviewCoverage"],
  metrics: ReviewedMetricDTO[],
  coveredSnapshotIds: Set<string>,
) {
  if (!coveredSnapshotIds.size) return coverage;
  const coveredMetrics = metrics.filter((metric) => metric.snapshotId && coveredSnapshotIds.has(metric.snapshotId));
  return subtractReviewCoverage(coverage, countMetricReviews(coveredMetrics));
}

function subtractCoveredSnapshotsFromTableCoverage(
  coverage: CollectionDashboardDTO["tableReviewCoverage"],
  dashboard: CollectionDashboardDTO,
  coveredSnapshotIds: Set<string>,
) {
  if (!coveredSnapshotIds.size) return coverage;
  const coveredTables = dashboard.summary.tables.filter((table) => coveredSnapshotIds.has(table.snapshotId));
  const covered = { confirmedCount: 0, modifiedCount: 0, ignoredCount: 0, pendingCount: 0, totalCount: 0 };

  for (const table of coveredTables) {
    const reviewByCell = new Map(table.cellReviews.map((review) => [
      `${review.rowIndex}:${review.columnIndex}`,
      review.reviewStatus,
    ]));
    for (const [rowIndex, row] of table.rows.entries()) {
      for (const [columnIndex] of row.entries()) {
        const status = reviewByCell.get(`${rowIndex}:${columnIndex}`) || "PENDING";
        covered.totalCount += 1;
        if (status === "CONFIRMED") covered.confirmedCount += 1;
        else if (status === "MODIFIED") covered.modifiedCount += 1;
        else if (status === "IGNORED") covered.ignoredCount += 1;
        else covered.pendingCount += 1;
      }
    }
  }

  return subtractReviewCoverage(coverage, covered);
}

function countMetricReviews(metrics: ReviewedMetricDTO[]) {
  const count = { confirmedCount: 0, modifiedCount: 0, ignoredCount: 0, pendingCount: 0, totalCount: metrics.length };
  for (const metric of metrics) {
    if (metric.reviewStatus === "CONFIRMED") count.confirmedCount += 1;
    else if (metric.reviewStatus === "MODIFIED") count.modifiedCount += 1;
    else if (metric.reviewStatus === "IGNORED") count.ignoredCount += 1;
    else count.pendingCount += 1;
  }
  return count;
}

function subtractReviewCoverage(
  coverage: CollectionDashboardDTO["reviewCoverage"],
  covered: CollectionDashboardDTO["reviewCoverage"],
) {
  return {
    confirmedCount: Math.max(0, coverage.confirmedCount - covered.confirmedCount),
    modifiedCount: Math.max(0, coverage.modifiedCount - covered.modifiedCount),
    ignoredCount: Math.max(0, coverage.ignoredCount - covered.ignoredCount),
    pendingCount: Math.max(0, coverage.pendingCount - covered.pendingCount),
    totalCount: Math.max(0, coverage.totalCount - covered.totalCount),
  };
}

function metricCategory(metricKey: string): MetricCategory {
  return metricKeyCategories[identifyMetricKey(metricKey)];
}
function metricCategoryLabel(category: MetricCategory) {
  const labels: Record<MetricCategory, string> = {
    ROI: "ROI",
    COST: "成本",
    CONVERSION: "转化",
    TRAFFIC: "流量",
    LIVE_ROOM: "直播间",
    FULL_DOMAIN: "全域",
    SERVICE_PROVIDER: "服务商",
    RISK: "风险",
    ACTIVITY: "活动",
    TIMING: "时段",
    UNKNOWN: "未分类",
  };
  return labels[category];
}
function formatRouteDetectionConfidence(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "缺失";
}
function tablePageSize(table: CollectionDashboardDTO["summary"]["tables"][number]) {
  const columnCount = Math.max(1, ...table.rows.map((row) => row.length));
  return Math.max(1, Math.floor(240 / columnCount));
}
function MetricSourceCell({ dashboard, metric }: { dashboard: CollectionDashboardDTO; metric: ReviewedMetricDTO }) {
  const route = dashboard.summary.routes.find((item) => item.snapshotId === metric.snapshotId);
  return (
    <div className="text-xs text-slate-400">
      <p>
        {route?.label || metric.pageType || "未知路线"} · {Math.round(metric.confidence * 100)}%
      </p>
      <p className="mt-1 text-slate-500">
        {route?.lastCapturedAt ? new Date(route.lastCapturedAt).toLocaleString("zh-CN") : "采集时间缺失"}
      </p>
    </div>
  );
}
function MetricEvidenceCell({ metric }: { metric: ReviewedMetricDTO }) {
  const trusted = metric.bindingStatus === "TRUSTED";
  const invalid = metric.bindingStatus === "INVALID";
  return (
    <div className="text-xs">
      <p className={invalid ? "text-red-300" : trusted ? "text-emerald-300" : "text-amber-200"}>
        {invalid ? "异常：不可直接确认" : trusted ? "结构已校准" : "待核对字段关系"}
      </p>
      <p className="mt-1 text-slate-500">
        周期：
        {metric.timeRange && metric.timeRange !== "UNKNOWN" ? metric.timeRange : "缺失"}
      </p>
      <p className="mt-1 text-slate-500">位置：{metric.bindingLocation || "未记录"}</p>
      {metric.bindingReasons?.length ? <p className="mt-1 max-w-56 text-red-200">{metric.bindingReasons.join("；")}</p> : null}
    </div>
  );
}
function DashboardStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "amber" | "blue" | "green";
}) {
  const toneClass = {
    slate: "text-slate-100",
    amber: "text-amber-200",
    blue: "text-cyan-200",
    green: "text-emerald-200",
  }[tone];
  return (
    <div className={`min-w-28 bg-[#0d1d43] px-3 py-2.5 ${toneClass}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <strong className="mt-1 block truncate text-sm font-semibold">{value}</strong>
    </div>
  );
}
function ReviewBadge({ status }: { status: MetricReviewStatus }) {
  const colors: Record<MetricReviewStatus, string> = {
    PENDING: "bg-amber-950 text-amber-200",
    CONFIRMED: "bg-cyan-950 text-cyan-200",
    MODIFIED: "bg-cyan-950 text-cyan-100",
    IGNORED: "bg-slate-800 text-slate-300",
  };
  return (
    <span className={`px-2 py-1 text-xs ${colors[status]}`}>
      {status === "PENDING" ? "待复核" : status === "CONFIRMED" ? "已确认" : status === "MODIFIED" ? "已修改" : "已忽略"}
    </span>
  );
}
function MiniButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:border-cyan-400 disabled:opacity-50"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
function EmptyState({ label }: { label: string }) {
  return <p className="p-5 text-sm text-slate-400">{label}</p>;
}
function ReviewSummary({
  label,
  coverage,
}: {
  label: string;
  coverage: {
    totalCount: number;
    pendingCount: number;
    confirmedCount: number;
    modifiedCount: number;
  };
}) {
  return (
    <div className="mt-3 border-t border-slate-800 pt-3 text-sm">
      <div className="flex justify-between">
        <span className="text-slate-400">{label}</span>
        <strong>{coverage.totalCount} 项</strong>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        待复核 {coverage.pendingCount} · 已确认 {coverage.confirmedCount} · 已修改 {coverage.modifiedCount}
      </p>
    </div>
  );
}
function EditableCell({
  cell,
  review,
  draft,
  setDraft,
  rowIndex,
}: {
  cell: string;
  review: TableCellReviewDTO | null;
  draft: CellDraft;
  setDraft: (patch: Partial<CellDraft>) => void;
  rowIndex: number;
}) {
  return (
    <td className={`min-w-40 border-r border-slate-800 px-2 py-2 align-top ${rowIndex === 0 ? "bg-slate-800/70 font-semibold" : ""}`}>
      <p className="mb-1 max-w-48 break-words text-xs text-slate-400">采集值：{cell || "空"}</p>
      <Input
        aria-label="校准值"
        className="h-8 min-w-32 border-slate-700 bg-slate-950 text-slate-100"
        value={draft.reviewedValue}
        onChange={(event) =>
          setDraft({
            reviewedValue: event.target.value,
            reviewStatus: "MODIFIED",
          })
        }
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <Select
          className="h-7 border-slate-700 bg-slate-950 text-xs text-slate-200"
          value={draft.reviewStatus}
          onChange={(event) =>
            setDraft({
              reviewStatus: event.target.value as CellDraft["reviewStatus"],
            })
          }
        >
          <option value="CONFIRMED">确认</option>
          <option value="MODIFIED">修改</option>
          <option value="IGNORED">忽略</option>
        </Select>
        {review ? <ReviewBadge status={review.reviewStatus} /> : <span className="text-xs text-amber-300">待复核</span>}
      </div>
    </td>
  );
}

function formatMetricValue(value: string, unit: string | null) {
  return `${value}${unit === "yuan" ? " 元" : unit || ""}`;
}
function formatNormalizedMetricValue(metric: ReviewedMetricDTO) {
  const value = metric.normalizedValue ?? metric.originalValue ?? "数据缺失";
  return metric.metricUnit === "%" ? `${value}（比例）` : formatMetricValue(value, metric.metricUnit || null);
}
function collectionRunStatusLabel(
  status: CollectionDashboardDTO["summary"]["collectionRun"] extends infer Run
    ? Run extends { status: infer Status }
      ? Status | undefined
      : undefined
    : undefined,
) {
  const labels: Record<string, string> = {
    ACTIVE: "采集中",
    DEGRADED: "采集降级",
    COMPLETED: "已完成",
    STOPPED: "已停止",
  };
  return status ? labels[String(status)] || String(status) : "未开始";
}
