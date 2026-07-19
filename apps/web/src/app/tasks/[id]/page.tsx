"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import {
  aiDisclaimer,
  collectionRouteLabels,
  collectionRouteTemplates,
  cooperationTypeLabels,
  evaluateFormalDecisionReadiness,
  operatorTypeLabels,
  subjectTypeLabels,
  type ActionProposalStatus,
  type ActionType,
  type AccountMatchStatus,
  type CaptureSummaryDTO,
  type CooperationType,
  type DecisionBusinessAnalysis,
  type ExtensionStatusDTO,
  type MetricReviewStatus,
  type MetricSource,
  type OperatorType,
  type ReviewedMetricDTO,
  type RiskLevel,
  type SubjectType
} from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Textarea } from "@/components/ui/input";
import { apiBaseUrl, apiFetch, createIdempotencyKey } from "@/lib/api";
import { pairExtensionTask } from "@/lib/extension-bridge";
import { useAuth } from "@/lib/AuthContext";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";
import { getTaskWizardProgress } from "@/lib/task-progress";
import { DiagnosisComparison } from "./diagnosis-comparison";
import type { DecisionRun, ExpertAnalysis } from "./task-types";
import { useExtensionTaskStatus, type WebBridgeUiState } from "./use-extension-task-status";
import { useTaskData } from "./use-task-data";

type PairingCodeResponse = {
  code: string;
  expiresAt: string;
  task: { id: string; pageTitle: string | null; projectId: string; projectName: string } | null;
};


export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const { token, hydrated } = useAuth();
  const {
    task,
    decisionRun,
    setDecisionRun,
    expertAnalysis,
    setExpertAnalysis,
    collectionRun,
    reviewMetrics,
    reviewDrafts,
    setReviewDrafts,
    applyReviewMetrics,
    load,
    error,
    setError
  } = useTaskData(params.id, token);
  const {
    captureSummary,
    extensionDetected,
    extensionStatus,
    refreshCaptureStatus,
    setExtensionDetected,
    setWebBridge,
    webBridge
  } = useExtensionTaskStatus({ taskId: params.id, token, reloadTask: load });
  const [pairingCode, setPairingCode] = useState<PairingCodeResponse | null>(null);
  const [pairingMessage, setPairingMessage] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [editingRouteKey, setEditingRouteKey] = useState<string | null>(null);
  const [routeUrlDraft, setRouteUrlDraft] = useState("");
  const [manualCsv, setManualCsv] = useState("指标名称,值,单位\n核销 ROI,,\n消耗,,元\n成交订单数,,单");
  const [manualAccountConfirmed, setManualAccountConfirmed] = useState(false);
  const [snapshotToConfirm, setSnapshotToConfirm] = useState<string | null>(null);
  const [confirmAllAccountsOpen, setConfirmAllAccountsOpen] = useState(false);
  const decisionIdempotencyKey = useRef<string | null>(null);
  const manualIdempotencyKey = useRef<string | null>(null);

  async function createTaskPairingCode(manualOnly = false) {
    if (!token || !task) return;
    setBusy("pairing-code"); setError(""); setPairingMessage("");
    try {
      const created = await apiFetch<PairingCodeResponse>("/extension/pairing-codes", token, {
        method: "POST",
        body: JSON.stringify({ accountProfileId: task.project.accountProfile.id, collectionTaskId: task.id })
      });
      setPairingCode(created);
      if (!manualOnly && webBridge.state === "READY") {
        const paired = await pairExtensionTask(created.code, apiBaseUrl);
        if (!paired.ok) throw new Error(paired.message || "插件一键配对失败");
        setWebBridge({ state: "READY", response: paired, message: paired.message });
        setExtensionDetected(true);
        setPairingCode(null);
        setPairingMessage(paired.pendingConfirmation
          ? "待确认配对请求已发送。请打开插件 Popup，核对目标服务器、账号和任务后点击“确认并配对”。"
          : "插件已响应，请在插件 Popup 中确认当前配对状态。");
      } else {
        setPairingMessage("已生成手动配对码，请在插件 Popup 中输入。成功后会自动绑定当前任务。");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成插件配对码失败");
    } finally {
      setBusy("");
    }
  }

  function startRouteUrlEdit(routeKey: string, sourceUrl: string | null | undefined) {
    setEditingRouteKey(routeKey);
    setRouteUrlDraft(sourceUrl || "");
    setError("");
  }

  async function saveRouteUrl(routeKey: string) {
    if (!token || !task) return;
    setBusy(`route-url:${routeKey}`);
    setError("");
    try {
      await apiFetch(`/collection-tasks/${task.id}/routes/${encodeURIComponent(routeKey)}`, token, {
        method: "PUT",
        body: JSON.stringify({ sourceUrl: routeUrlDraft.trim() || null })
      });
      setEditingRouteKey(null);
      setRouteUrlDraft("");
      load();
      await refreshCaptureStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存路线网址失败");
    } finally {
      setBusy("");
    }
  }

  async function runDecision() {
    if (!token) return;
    setBusy("decision");
    setError("");
    try {
      decisionIdempotencyKey.current ||= createIdempotencyKey(`decision:${params.id}`);
      const nextDecisionRun = await apiFetch<DecisionRun>(`/collection-tasks/${params.id}/decision-runs`, token, {
        method: "POST",
        headers: { "idempotency-key": decisionIdempotencyKey.current },
        body: "{}"
      });
      setDecisionRun(nextDecisionRun);
      decisionIdempotencyKey.current = null;
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "决策运行失败");
    } finally {
      setBusy("");
    }
  }

  async function runExpertAnalysis() {
    if (!token) return;
    setBusy("expert-analysis");
    setError("");
    try {
      const nextExpertAnalysis = await apiFetch<ExpertAnalysis>(`/collection-tasks/${params.id}/explain`, token, {
        method: "POST",
        body: "{}"
      });
      setExpertAnalysis(nextExpertAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "专家参考分析失败");
    } finally {
      setBusy("");
    }
  }

  async function loadCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) { setError("CSV 文件不能超过 512KB"); return; }
    setManualCsv(await file.text());
  }

  async function importManualMetrics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !task || busy) return;
    if (!manualAccountConfirmed) { setError("请先确认这些数据属于当前账号"); return; }
    const parsed = Papa.parse<string[]>(manualCsv, { skipEmptyLines: "greedy" });
    if (parsed.errors.length) { setError(`CSV 解析失败：${parsed.errors[0]?.message || "格式不正确"}`); return; }
    const rows = parsed.data.map((row) => row.map((cell) => String(cell || "").trim()));
    const first = rows[0] || [];
    const hasHeader = first.some((cell) => /指标|名称|metric|value|数值|单位/i.test(cell));
    const metrics = rows.slice(hasHeader ? 1 : 0).filter((row) => row[0] && row[1] !== undefined && row[1] !== "").map((row) => ({ name: row[0], value: row[1], unit: row[2] || null }));
    if (!metrics.length) { setError("CSV 中没有可导入的指标，请至少填写指标名称和值"); return; }
    setBusy("manual-import"); setError("");
    try {
      manualIdempotencyKey.current ||= createIdempotencyKey(`manual:${params.id}`);
      const imported = await apiFetch<{ reviewedMetrics: Array<{ metricKey: string }> }>(`/collection-tasks/${params.id}/manual-metrics`, token, {
        method: "POST",
        headers: { "idempotency-key": manualIdempotencyKey.current },
        body: JSON.stringify({ accountConfirmed: true, pageType: "LOCAL_PROMOTION_DASHBOARD", routeKey: "LOCAL_PROMOTION_DASHBOARD", sourceLabel: "网页手工录入/CSV", metrics })
      });
      const unknownCount = imported.reviewedMetrics.filter((metric) => metric.metricKey === "unknown").length;
      manualIdempotencyKey.current = null;
      setManualAccountConfirmed(false);
      setReviewMessage(unknownCount > 0 ? `已导入 ${metrics.length} 个指标，其中 ${unknownCount} 个未知字段已进入待校准队列` : `已导入 ${metrics.length} 个指标，全部识别并完成复核`);
      load();
    } catch (err) { setError(err instanceof Error ? err.message : "手工指标导入失败"); } finally { setBusy(""); }
  }

  async function refreshReviewMetrics() {
    if (!token) return;
    setBusy("review-refresh");
    setReviewMessage("");
    try {
      const nextReviewMetrics = await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics/initialize`, token, { method: "POST", body: "{}" });
      applyReviewMetrics(nextReviewMetrics);
      setReviewMessage("复核指标已刷新");
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新复核指标失败");
    } finally {
      setBusy("");
    }
  }

  async function updateReviewMetric(metric: ReviewedMetricDTO, reviewStatus: Exclude<MetricReviewStatus, "PENDING">) {
    if (!token) return;
    setBusy(`review-${metric.id}`);
    setReviewMessage("");
    try {
      const reviewedValue = reviewStatus === "MODIFIED" ? reviewDrafts[metric.id] || "" : undefined;
      const updated = await apiFetch<ReviewedMetricDTO>(`/review-metrics/${metric.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus, reviewedValue })
      });
      applyReviewMetrics(reviewMetrics.map((item) => (item.id === updated.id ? updated : item)));
      setReviewMessage(reviewStatusLabel(reviewStatus));
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存复核指标失败");
    } finally {
      setBusy("");
    }
  }

  async function saveModifiedDrafts() {
    if (!token) return;
    const items = reviewMetrics
      .filter((metric) => (reviewDrafts[metric.id] || "") !== (metric.reviewedValue ?? metric.originalValue ?? ""))
      .map((metric) => ({ metricId: metric.id, reviewedValue: reviewDrafts[metric.id] || "", reviewStatus: "MODIFIED" as const }));
    if (!items.length) {
      setReviewMessage("没有需要保存的修改");
      return;
    }
    setBusy("review-save-all");
    setReviewMessage("");
    try {
      const updated = await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics/bulk`, token, {
        method: "POST",
        body: JSON.stringify({ items })
      });
      const byId = new Map(updated.map((metric) => [metric.id, metric]));
      applyReviewMetrics(reviewMetrics.map((metric) => byId.get(metric.id) || metric));
      setReviewMessage("修改已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量保存复核指标失败");
    } finally {
      setBusy("");
    }
  }

  async function confirmAllPending() {
    if (!token) return;
    setBusy("review-confirm-all");
    setReviewMessage("");
    try {
      const updated = await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics/confirm-all`, token, {
        method: "POST",
        body: "{}"
      });
      applyReviewMetrics(updated);
      setReviewMessage("已确认全部待复核指标");
    } catch (err) {
      setError(err instanceof Error ? err.message : "一键确认失败");
    } finally {
      setBusy("");
    }
  }

  async function confirmSnapshotAccount(snapshotId: string) {
    if (!token) return;
    setBusy("confirm-account"); setError("");
    try {
      const expectedUpdatedAt = captureSummary?.routes.find((route) => route.snapshotId === snapshotId)?.snapshotUpdatedAt;
      if (!expectedUpdatedAt) throw new Error("当前快照已更新，请刷新后重新确认");
      await apiFetch(`/snapshots/${snapshotId}/confirm-account`, token, { method: "POST", body: JSON.stringify({ confirmed: true, expectedUpdatedAt, note: "用户核对当前账号档案与页面证据后确认" }) });
      setSnapshotToConfirm(null);
      await refreshAccountConfirmationState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认账号失败");
    } finally {
      setBusy("");
    }
  }

  async function confirmAllSnapshotAccounts() {
    if (!token || !task) return;
    const snapshots = unverifiedRoutes.flatMap((route) => route.snapshotId && route.snapshotUpdatedAt
      ? [{ snapshotId: route.snapshotId, expectedUpdatedAt: route.snapshotUpdatedAt }]
      : []);
    if (!snapshots.length) {
      setError("当前快照已更新，请刷新后重新确认");
      return;
    }
    setBusy("confirm-accounts"); setError("");
    try {
      const result = await apiFetch<{ confirmedCount: number; skippedCount: number; reviewMetricCount: number }>(`/collection-tasks/${task.id}/snapshots/confirm-accounts`, token, {
        method: "POST",
        body: JSON.stringify({ confirmed: true, snapshots, note: "用户在任务页核对全部当前路线后一次确认" })
      });
      setConfirmAllAccountsOpen(false);
      setReviewMessage(`已确认 ${result.confirmedCount} 条路线，跳过 ${result.skippedCount} 条已确认路线，生成 ${result.reviewMetricCount} 项复核指标`);
      await refreshAccountConfirmationState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量确认账号失败");
    } finally {
      setBusy("");
    }
  }

  async function refreshAccountConfirmationState() {
    if (!token) return;
    const [, nextReviewMetrics] = await Promise.all([
      refreshCaptureStatus(),
      apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics`, token)
    ]);
    applyReviewMetrics(nextReviewMetrics);
    load();
  }

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState />;

  if (!task) {
    return <main className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted">{error || "加载中..."}</main>;
  }

  const latestSnapshot = task.snapshots[0];
  const reviewState = summarizeReviewState(reviewMetrics);
  const hasCapture = Boolean(captureSummary?.snapshotCount || latestSnapshot);
  const requiredRoutesCaptured = captureSummary
    ? captureSummary.requiredRoutesCaptured
    : collectionRun
      ? collectionRun.quality.missingRoutes.length === 0
      : task.routeSources.filter((route) => route.required).every((route) => route.status === "CAPTURED");
  const extensionBoundToTask = Boolean(
    (extensionStatus?.paired && extensionStatus.boundTaskId === task.id)
    || (webBridge.response?.paired && webBridge.response.boundTaskId === task.id)
  );
  const extensionConnected = Boolean(
    webBridge.state === "READY"
    && extensionBoundToTask
    && extensionStatus?.state !== "VERSION_OUTDATED"
  );
  const reviewComplete = reviewMetrics.length > 0 && reviewMetrics.every((metric) => metric.reviewStatus !== "PENDING");
  const accountConfirmed = captureSummary?.requiredRoutesAccountMatched ?? latestSnapshot?.accountMatchStatus === "MATCHED";
  const missingRequiredRoutes = captureSummary?.routes.filter((route) => route.required && !route.snapshotId) || [];
  const unverifiedRequiredRoutes = captureSummary?.routes.filter((route) => route.required && route.snapshotId && route.accountMatchStatus !== "MATCHED") || [];
  const unverifiedRoutes = captureSummary?.routes.filter((route) => route.snapshotId && route.accountMatchStatus === "UNVERIFIED") || [];
  const selectedRouteToConfirm = captureSummary?.routes.find((route) => route.snapshotId === snapshotToConfirm) || null;
  const pendingReviewCount = reviewMetrics.filter((metric) => metric.reviewStatus === "PENDING").length;
  const formalReadiness = evaluateFormalDecisionReadiness({
    missingRequiredRouteLabels: missingRequiredRoutes.map((route) => route.label),
    unverifiedRequiredRouteLabels: unverifiedRequiredRoutes.map((route) => route.label),
    subjectReady: task.project.subjectType !== "SUBJECT_PENDING" && task.project.operatorType !== "OPERATOR_PENDING",
    reviewTotalCount: reviewMetrics.length,
    reviewPendingCount: pendingReviewCount
  });
  const formalReady = formalReadiness.ready;
  const wizardProgress = getTaskWizardProgress({
    extensionConnected,
    hasCapture,
    requiredRoutesCaptured,
    requiredRoutesAccountMatched: Boolean(accountConfirmed),
    reviewComplete,
    decisionCreated: Boolean(decisionRun)
  });
  const evidenceAdvisories = captureSummary?.routes.filter((route) => route.required && (route.state === "PARTIAL" || route.state === "STALE")) || [];
  const metricGroups = groupCaptureMetrics(captureSummary?.metrics || []);
  const businessAnalysis = decisionRun?.finalResultJson?.businessAnalysis || null;
  const managedLiveGrowthMode = businessAnalysis?.mode === "MANAGED_LIVE_GROWTH" || task.project.operatorType === "SERVICE_PROVIDER_LIVE";
  const displayedFindings = managedLiveGrowthMode ? businessAnalysis?.findings.filter((finding) => finding.dimension !== "PROFITABILITY") : businessAnalysis?.findings;
  const displayedRecommendations = managedLiveGrowthMode ? businessAnalysis?.recommendations.filter((recommendation) => recommendation.dimension !== "PROFITABILITY") : businessAnalysis?.recommendations;
  const displayedMetricExplanations = managedLiveGrowthMode
    ? businessAnalysis?.metricExplanations.filter((metric) => !["服务商后毛利 ROI", "本次真实投入（服务费后）", "已核验平台补贴抵扣"].includes(metric.title))
    : businessAnalysis?.metricExplanations;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <Link className="mb-3 inline-block text-sm text-primary hover:underline" href={`/projects/${task.project.id}`}>返回项目</Link>
        <div>
          <p className="text-sm font-semibold text-primary">当前账号 / 项目 / 任务</p>
          <h1 className="mt-1 text-3xl font-bold">{task.project.accountProfile.accountName}</h1>
          <p className="mt-1 text-sm text-muted">{task.project.name} / {task.pageTitle || "采集任务"}</p>
          <p className="mt-1 text-xs text-muted">任务 ID：{task.id}</p>
        </div>
      </header>

      <Card className="mb-4">
        <div className="grid gap-2 text-sm sm:grid-cols-5">
          {wizardProgress.steps.map(({ number, label, complete }) => (
            <div className={`rounded-md border p-3 ${complete ? "border-primary bg-blue-50" : wizardProgress.currentStep === number ? "border-primary bg-white" : "border-border bg-slate-50"}`} key={number}>
              <p className="text-xs text-muted">第 {number} 步</p>
              <strong>{label}</strong>
              <p className="mt-1 text-xs text-muted">{complete ? "已完成" : wizardProgress.currentStep === number ? "正在进行" : "待完成"}</p>
            </div>
          ))}
        </div>
      </Card>

      {error ? <div className="mb-4 rounded-md border border-danger bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}

      {!extensionConnected && !hasCapture ? (
        <Card className="mb-4 border-primary/40">
          <p className="mb-1 text-xs font-semibold text-primary">第 1 步</p>
          <CardTitle>连接采集插件</CardTitle>
          <p className="mb-4 text-sm text-muted">网页会先确认插件与后台版本，再一键生成配对码并绑定当前任务。配对不会读取平台密码或 Cookie。</p>
          <div className="grid gap-3 md:grid-cols-3">
            <Info label="网页桥接" value={webBridgeStateLabel(webBridge.state)} />
            <Info label="配对状态" value={webBridge.response?.paired || extensionStatus?.paired ? "已安全配对" : "尚未配对"} />
            <Info label="任务绑定" value={extensionBoundToTask ? "已绑定当前任务" : "尚未绑定"} />
          </div>
          <div className={`mt-3 rounded-md border p-3 text-sm ${webBridge.state === "READY" ? "border-primary/30 bg-blue-50" : "border-amber-300 bg-amber-50"}`}>
            <strong>{webBridge.message}</strong>
            {webBridge.response ? <p className="mt-1 text-xs text-muted">插件 {webBridge.response.extensionVersion} · 协议 {webBridge.response.protocolVersion} · 构建 {webBridge.response.buildFingerprint}</p> : null}
            {webBridge.state !== "READY" ? <p className="mt-2 text-xs text-muted">本地插件代码更新后，请在 chrome://extensions 中点击一次“重新加载”，然后刷新本任务页和目标后台页面。</p> : null}
          </div>
          {pairingMessage ? <p className="mt-3 rounded-md border border-primary/30 bg-blue-50 p-3 text-sm text-primary">{pairingMessage}</p> : null}
          {pairingCode ? (
            <div className="mt-4 rounded-md border border-primary bg-blue-50 p-4 text-center">
              <p className="text-sm">一键连接未完成时，请在插件中输入本任务配对码</p>
              <p className="my-2 text-3xl font-bold tracking-[0.3em]">{pairingCode.code}</p>
              <p className="text-xs text-muted">{new Date(pairingCode.expiresAt).toLocaleTimeString("zh-CN")} 前有效，成功后会自动绑定本任务。</p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy === "pairing-code" || webBridge.state !== "READY"} onClick={() => createTaskPairingCode(false)} type="button">{busy === "pairing-code" ? "正在连接..." : "一键连接采集插件"}</Button>
            <Button className="border border-border bg-white text-foreground" disabled={busy === "pairing-code"} onClick={() => createTaskPairingCode(true)} type="button">生成手动配对码</Button>
            <Link className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-medium" href="/extension">查看插件安装说明</Link>
          </div>
        </Card>
      ) : null}

      {extensionConnected || hasCapture ? (
        <Card className="mb-4 border-primary/40">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold text-primary">第 2 步</p>
              <CardTitle>采集指定页面</CardTitle>
              <p className="text-sm text-muted">打开下方页面；直播大屏需由你手动切换概览、商品或流量，再在插件中点击“采集并上传当前路线”。</p>
            </div>
            <span className={`rounded-md border px-3 py-2 text-sm ${extensionConnected ? "border-primary bg-blue-50 text-primary" : "border-amber-300 bg-amber-50"}`}>
              {extensionConnected ? `插件已连接 · ${extensionStatus?.extensionVersion || "版本未知"}` : "插件当前离线，旧数据仍可复核"}
            </span>
          </div>
          {extensionStatus?.currentUrl ? (
            <div className="mb-4 rounded-md border border-border bg-slate-50 p-3 text-sm">
              <strong>插件当前页面：</strong>{extensionStatus.currentUrl}
              <p className="mt-1 text-muted">当前分栏：{collectionRouteLabels[extensionStatus.routeKey || "UNKNOWN"] || "待确认"} · {extensionStatus.message}</p>
              {extensionStatus.buildFingerprint ? <p className="mt-1 text-xs text-muted">构建 {extensionStatus.buildFingerprint} · 协议 {extensionStatus.bridgeProtocolVersion ?? "未知"}</p> : null}
            </div>
          ) : null}
          <div className="grid gap-3">
            {(captureSummary?.routes || task.routeSources).map((route) => {
              const template = collectionRouteTemplates.find((item) => item.routeKey === route.routeKey);
              const diagnostic = "diagnostic" in route ? route.diagnostic : null;
              const state = diagnostic?.summaryStatus
                || ("state" in route ? route.state : route.status === "CAPTURED" ? "UPLOADED" : route.sourceUrl ? "READY" : "PENDING");
              const isCurrentPage = extensionStatus?.routeKey === route.routeKey && extensionStatus.collectable;
              const isEditingUrl = editingRouteKey === route.routeKey;
              const routeUrlBusy = busy === `route-url:${route.routeKey}`;
              return (
                <div className={`grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_auto] ${isCurrentPage ? "border-primary bg-blue-50" : "border-border"}`} key={route.routeKey}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><strong>{route.label}</strong>{route.required ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">基础页面</span> : <span className="text-xs text-muted">补充页面</span>}</div>
                    <p className="mt-1 text-sm text-muted">{template?.purpose || "补充当前诊断所需数据"}</p>
                    {isEditingUrl ? (
                      <form className="mt-2 grid gap-2" onSubmit={(event) => { event.preventDefault(); void saveRouteUrl(route.routeKey); }}>
                        <Input
                          disabled={routeUrlBusy}
                          onChange={(event) => setRouteUrlDraft(event.target.value)}
                          placeholder={template?.urlHint || "请输入当前路线的网址"}
                          type="url"
                          value={routeUrlDraft}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button disabled={routeUrlBusy} type="submit">{routeUrlBusy ? "保存中..." : "保存网址"}</Button>
                          <Button
                            className="border border-border bg-white text-foreground"
                            disabled={routeUrlBusy}
                            onClick={() => { setEditingRouteKey(null); setRouteUrlDraft(""); }}
                            type="button"
                          >
                            取消
                          </Button>
                        </div>
                        <p className="text-xs text-muted">网址只用于当前采集任务路线识别，不会自动打开或操作平台页面。</p>
                      </form>
                    ) : (
                      <p className="mt-2 break-all text-xs text-muted">{route.sourceUrl || template?.urlHint || "请先在平台后台打开对应页面"}</p>
                    )}
                    {diagnostic ? (
                      <div className="mt-3 grid gap-1 text-xs text-muted">
                        <p>
                          最近成功：{diagnostic.lastSuccessAt ? formatDiagnosticAge(diagnostic.lastSuccessAt) : "暂无"}
                          {" · "}覆盖率：{diagnostic.coverageRatio == null ? "未知" : `${Math.round(diagnostic.coverageRatio * 100)}%`}
                          {" · "}连续失败：{diagnostic.consecutiveFailures}
                        </p>
                        {diagnostic.missingFields.length ? <p>缺失字段：{diagnostic.missingFields.join("、")}</p> : null}
                        {diagnostic.truncationReasons.length ? <p>截断原因：{diagnostic.truncationReasons.join("、")}</p> : null}
                        {diagnostic.issues.length ? (
                          <details className="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-amber-950">
                            <summary className="cursor-pointer font-medium">查看采集诊断（{diagnostic.issues.length}）</summary>
                            <div className="mt-2 grid gap-2">
                              {diagnostic.issues.map((issue) => (
                                <div key={issue.code}>
                                  <p>{issue.message}</p>
                                  <p className="text-amber-800">人工处理：{issue.recoveryAction}</p>
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex min-w-32 flex-col items-end justify-center gap-2">
                    <strong className={state === "UPLOADED" ? "text-primary" : state === "FAILED" ? "text-danger" : ["AGING", "STALE", "UNVERIFIED", "MANUAL_PENDING", "PARTIAL"].includes(state) ? "text-amber-700" : ""}>{captureRouteStateLabel(state)}</strong>
                    {"metricCount" in route && route.metricCount > 0 ? <span className="text-xs text-muted">{route.metricCount} 项指标</span> : null}
                    {"snapshotId" in route && route.state === "UNVERIFIED" && route.snapshotId ? <Button className="h-8 border border-amber-400 bg-amber-50 px-3 text-xs text-amber-900" disabled={busy === "confirm-account"} onClick={() => { if (route.snapshotId) setSnapshotToConfirm(route.snapshotId); }} type="button">确认当前账号</Button> : null}
                    {!isEditingUrl ? <Button className="h-8 border border-border bg-white px-3 text-xs text-foreground" onClick={() => startRouteUrlEdit(route.routeKey, route.sourceUrl)} type="button">编辑网址</Button> : null}
                    {route.sourceUrl ? <a className="text-sm text-primary hover:underline" href={route.sourceUrl} rel="noreferrer" target="_blank">打开目标页面</a> : null}
                    {isCurrentPage ? <span className="text-xs font-medium text-primary">当前页面可采集</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {unverifiedRoutes.length ? <div className="mt-4 flex justify-end"><Button className="border border-amber-400 bg-amber-50 text-amber-900" disabled={busy === "confirm-account" || busy === "confirm-accounts"} onClick={() => setConfirmAllAccountsOpen(true)} type="button">一键确认全部待确认账号（{unverifiedRoutes.length}）</Button></div> : null}
          <p className="mt-4 text-sm text-muted">插件只会在您主动点击后读取当前可见指标和表格，不会点击或修改平台内容。上传成功后本页会自动更新。</p>
          <details className="mt-4 rounded-md border border-border bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium">插件采集失败？改用 CSV 手工补充</summary>
            <form className="mt-3 grid gap-3" onSubmit={importManualMetrics}>
              <p className="text-sm text-muted">列顺序为“指标名称、值、单位”。未知字段只进入待校准，不参与强动作。</p>
              <input accept=".csv,text/csv" className="text-sm" type="file" onChange={loadCsvFile} />
              <Textarea className="min-h-32 font-mono text-xs" value={manualCsv} onChange={(event) => setManualCsv(event.target.value)} />
              <label className="flex items-start gap-2 text-sm"><input checked={manualAccountConfirmed} className="mt-1" type="checkbox" onChange={(event) => setManualAccountConfirmed(event.target.checked)} /><span>我确认以上数据属于当前账号“{task.project.accountProfile.accountName}”。</span></label>
              <Button disabled={busy === "manual-import" || !manualAccountConfirmed} type="submit">{busy === "manual-import" ? "正在导入..." : "导入并进入复核"}</Button>
            </form>
          </details>
        </Card>
      ) : null}

      {hasCapture && captureSummary ? (
        <section className="mb-4">
          <Card>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div><p className="mb-1 text-xs font-semibold text-primary">第 3 步</p><CardTitle>账号与数据汇总</CardTitle><p className="text-sm text-muted">核对每条路线的账号归属和合并结果；每项指标仍保留来源。</p></div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Info label="快照" value={`${captureSummary.snapshotCount} 份`} />
                <Info label="指标" value={`${captureSummary.metrics.length} 项`} />
                <Info label="覆盖率" value={captureSummary.coverageRatio == null ? "数据缺失" : `${Math.round(captureSummary.coverageRatio * 100)}%`} />
                <Info label="账号匹配" value={accountMatchLabel(captureSummary.accountMatchStatus)} />
              </div>
            </div>
            <p className="mb-4 text-xs text-muted">最近采集：{captureSummary.latestCapturedAt ? new Date(captureSummary.latestCapturedAt).toLocaleString("zh-CN") : "数据缺失"}</p>
            {captureSummary.pendingAccountConfirmationCount > 0 ? <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">已有原始快照，但其中 {captureSummary.pendingAccountConfirmationCount} 条路线尚未确认账号。确认前，这些数据不会进入正式指标和诊断。</p> : null}
            {!captureSummary.metrics.length ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">已收到快照，但未识别到标准指标。请确认页面已完整加载；该问题会阻断依赖相关字段的诊断。</p> : null}
            {captureSummary.metrics.length || captureSummary.tables.length ? <details className="rounded-md border border-border p-3"><summary className="cursor-pointer font-medium">查看完整数据（{captureSummary.metrics.length} 项指标 / {captureSummary.tables.length} 张表）</summary><div className="mt-4 grid gap-4">
              {captureSummary.metrics.length ? <div className="grid gap-4 lg:grid-cols-2">{Object.entries(metricGroups).map(([category, metrics]) => <div className="rounded-md border border-border p-4" key={category}><h3 className="mb-3 font-semibold">{metricCategoryLabel(category)}</h3><div className="grid gap-2 sm:grid-cols-2">{metrics.map((metric) => <div className="rounded-md bg-slate-50 p-3" key={`${metric.metricKey}-${metric.routeKey}`}><p className="text-xs text-muted">{metric.metricName}</p><p className="mt-1 text-xl font-semibold">{metric.metricValue}{metric.metricUnit || ""}</p><p className="mt-1 text-xs text-muted">{collectionRouteLabels[metric.routeKey || "UNKNOWN"] || metric.pageType || "未知页面"} · {Math.round(metric.confidence * 100)}%</p></div>)}</div></div>)}</div> : null}
              {captureSummary.tables.map((table, tableIndex) => <div className="overflow-x-auto" key={`${table.routeKey}-${table.capturedAt}-${tableIndex}`}><p className="mb-2 text-xs text-muted">{collectionRouteLabels[table.routeKey || "UNKNOWN"] || table.pageType || "未知页面"}</p><table className="min-w-full text-left text-sm"><tbody>{table.rows.map((row, rowIndex) => <tr className="border-b border-border" key={rowIndex}>{row.map((cell, cellIndex) => <td className={`px-3 py-2 ${rowIndex === 0 ? "font-semibold" : ""}`} key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>)}
            </div></details> : null}
          </Card>
        </section>
      ) : null}

      {hasCapture ? (
        <section className="mb-4">
          <Card>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div><p className="mb-1 text-xs font-semibold text-primary">第 4 步</p><CardTitle>人工核对</CardTitle><p className="text-sm text-muted">确认、修改或忽略采集值。完成必要复核后才能运行完整诊断。</p></div>
              <span className={`rounded-md border px-3 py-2 text-sm ${reviewComplete && accountConfirmed ? "border-primary bg-blue-50 text-primary" : "border-amber-300 bg-amber-50"}`}>{reviewState.label}</span>
            </div>
            {unverifiedRoutes.length ? <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"><strong>账号待确认：</strong>请逐页核对，避免把其他账号的数据并入当前任务。<div className="mt-3 grid gap-2">{unverifiedRoutes.map((route) => <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between" key={route.routeKey}><div><strong>{route.label}</strong><p className="text-xs text-muted">页面识别：{route.detectedAccountId || route.detectedAccountName || "未识别"}</p></div><Button className="shrink-0" disabled={busy === "confirm-account"} onClick={() => route.snapshotId && setSnapshotToConfirm(route.snapshotId)} type="button">核对并确认</Button></div>)}</div></div> : null}
            <div className="mb-3 flex flex-wrap gap-2"><Button className="border border-border bg-white text-foreground" type="button" onClick={refreshReviewMetrics} disabled={busy === "review-refresh"}>刷新复核指标</Button><Button className="border border-border bg-white text-foreground" type="button" onClick={saveModifiedDrafts} disabled={!reviewMetrics.length || busy === "review-save-all"}>保存修改</Button><Button type="button" onClick={confirmAllPending} disabled={!reviewMetrics.some((metric) => metric.reviewStatus === "PENDING") || busy === "review-confirm-all"}>一键确认可信字段</Button></div>
            {reviewMessage ? <p className="mb-3 rounded-md border border-border bg-slate-50 px-3 py-2 text-sm">{reviewMessage}</p> : null}
            {reviewMetrics.length ? <details className="rounded-md border border-border p-3"><summary className="cursor-pointer font-medium">查看完整指标明细（待复核 {pendingReviewCount} / 总数 {reviewMetrics.length}）</summary><div className="mt-3 overflow-x-auto"><table className="min-w-[900px] text-left text-sm"><thead className="border-b border-border text-xs text-muted"><tr><th className="px-3 py-2">指标</th><th className="px-3 py-2">采集值</th><th className="px-3 py-2">确认值</th><th className="px-3 py-2">来源</th><th className="px-3 py-2">置信度</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">操作</th></tr></thead><tbody>{reviewMetrics.map((metric) => <tr className="border-b border-border" key={metric.id}><td className="px-3 py-3 font-medium">{metric.metricName}</td><td className="px-3 py-3">{metric.originalValue || "数据缺失"}{metric.metricUnit || ""}</td><td className="px-3 py-3"><Input className="w-32" value={reviewDrafts[metric.id] ?? ""} onChange={(event) => setReviewDrafts((drafts) => ({ ...drafts, [metric.id]: event.target.value }))} /></td><td className="px-3 py-3">{metricSourceLabel(metric.metricSource)}<p className="text-xs text-muted">{metric.pageType}</p></td><td className="px-3 py-3">{Math.round(metric.confidence * 100)}%</td><td className="px-3 py-3">{reviewStatusLabel(metric.reviewStatus)}</td><td className="px-3 py-3"><div className="flex gap-1"><Button className="h-8 border border-border bg-white px-2 text-xs text-foreground" onClick={() => updateReviewMetric(metric, "CONFIRMED")} type="button">确认</Button><Button className="h-8 border border-border bg-white px-2 text-xs text-foreground" onClick={() => updateReviewMetric(metric, "MODIFIED")} type="button">修改</Button><Button className="h-8 border border-border bg-white px-2 text-xs text-foreground" onClick={() => updateReviewMetric(metric, "IGNORED")} type="button">忽略</Button></div></td></tr>)}</tbody></table></div></details> : <p className="rounded-md border border-border bg-slate-50 p-3 text-sm text-muted">快照已上传，正在等待可复核指标。</p>}
          </Card>
        </section>
      ) : null}

      {hasCapture && (reviewComplete || decisionRun) ? (
        <section className="mb-4">
          <Card>
            <div className="mb-4"><p className="mb-1 text-xs font-semibold text-primary">第 5 步</p><CardTitle>诊断与建议</CardTitle><p className="text-sm text-muted">{aiDisclaimer}</p></div>
            <div className="mb-4 grid gap-3 sm:grid-cols-4"><Info label="主体类型" value={subjectTypeLabels[task.project.subjectType]} /><Info label="操盘主体" value={operatorTypeLabels[task.project.operatorType]} /><Info label="合作关系" value={cooperationTypeLabels[task.project.cooperationType]} /><Info label="当前模式" value={managedLiveGrowthMode ? "代直播增长诊断" : task.project.subjectType === "SERVICE_PROVIDER" ? "服务商经营诊断" : "主体框架诊断"} /></div>
            {managedLiveGrowthMode ? <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm"><strong>当前只做代直播增长目标：</strong>诊断流量进入、直播间承接、商品成交、平台活动权益和履约合规；不计算服务商毛利、服务费后 ROI 或平台收益。</div> : null}
            <DiagnosisComparison
              busy={busy}
              decisionRun={decisionRun}
              evidenceAdvisory={formalReady && evidenceAdvisories.length
                ? `${evidenceAdvisories.map((route) => `${route.label}${route.state === "STALE" ? "数据已过期" : "仅部分可见"}`).join("；")}。暂停、加预算或减预算等动作仍需满足各自证据门槛。`
                : null}
              expertAnalysis={expertAnalysis}
              formalBlockingReasons={formalReadiness.blockingReasons}
              formalContent={decisionRun ? (
                <div className="grid gap-4">
                <div className="rounded-md border border-border p-4 lg:col-span-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div><h3 className="font-semibold">本轮结论</h3><p className="mt-2 text-base font-medium">{businessAnalysis?.headline || decisionRun.diagnosis}</p></div>
                    <div className="flex shrink-0 gap-2 text-xs">
                      <span className={`rounded-full px-3 py-1 font-semibold ${riskTone(decisionRun.riskLevel)}`}>风险 {riskLabel(decisionRun.riskLevel)}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">置信度 {Math.round(decisionRun.confidence * 100)}%</span>
                    </div>
                  </div>
                  {businessAnalysis?.performanceSnapshot.length ? <div className="mt-4 flex flex-wrap gap-2">{businessAnalysis.performanceSnapshot.map((fact) => <span className="rounded-md border border-border bg-slate-50 px-2 py-1 text-xs" key={fact}>{fact}</span>)}</div> : null}
                </div>

                <div className="rounded-md border border-border p-4">
                  <h3 className="mb-3 font-semibold">问题与风险在哪里</h3>
                  {displayedFindings?.length ? <div className="grid gap-3">{displayedFindings.map((finding) => <div className="rounded-md border border-border p-3" key={`${finding.dimension}-${finding.title}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-primary">{dimensionLabel(finding.dimension)}</span><span className={`rounded-full px-2 py-0.5 text-xs ${riskTone(finding.riskLevel)}`}>{riskLabel(finding.riskLevel)}</span></div><strong className="mt-1 block text-sm">{finding.title}</strong><p className="mt-1 text-sm text-muted">{finding.conclusion}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">{finding.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div> : <p className="text-sm text-muted">当前输出缺少结构化风险明细，请重新运行诊断。</p>}
                </div>

                <div className="rounded-md border border-border p-4">
                  <h3 className="mb-3 font-semibold">怎么调整直播、商品和投流</h3>
                  {displayedRecommendations?.length ? <div className="grid gap-3">{displayedRecommendations.map((recommendation) => <div className="rounded-md border border-border p-3" key={`${recommendation.priority}-${recommendation.title}`}><div className="flex items-center gap-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${priorityTone(recommendation.priority)}`}>{recommendation.priority}</span><span className="text-xs text-muted">{dimensionLabel(recommendation.dimension)}</span></div><strong className="mt-2 block text-sm">{recommendation.title}</strong><p className="mt-1 text-sm text-muted">{recommendation.reason}</p>{recommendation.evidence?.length ? <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs"><strong>数据依据：</strong><ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{recommendation.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}<ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{recommendation.steps.map((step) => <li key={step}>{step}</li>)}</ol><p className="mt-2 text-xs"><strong>验证：</strong>{recommendation.verifyMetrics.join("、")}</p><p className="mt-1 text-xs text-muted"><strong>规则边界：</strong>{recommendation.ruleBoundary}</p></div>)}</div> : <p className="text-sm text-muted">当前数据没有形成可执行的证据驱动方案；请按上方缺失项补采或积累样本后重新诊断。</p>}
                </div>

                {displayedMetricExplanations?.length ? <div className="rounded-md border border-border p-4 lg:col-span-2"><h3 className="mb-1 font-semibold">{managedLiveGrowthMode ? "这些直播增长指标有什么用" : "这些经营指标到底有什么用"}</h3><p className="mb-3 text-xs text-muted">{managedLiveGrowthMode ? "用于定位流量、进房、商品点击和成交承接；平台代金券等权益作为真实转化助力单独核验。" : "财务口径用于守住盈利底线，不替代直播流量、商品和内容诊断。"}</p><div className="grid gap-3 md:grid-cols-2">{displayedMetricExplanations.map((metric) => <div className="rounded-md bg-slate-50 p-3" key={metric.title}><div className="flex items-baseline justify-between gap-2"><strong>{metric.title}</strong><span className="text-lg font-semibold">{formatOptionalNumber(metric.value)}</span></div><p className="mt-2 text-sm">{metric.meaning}</p><p className="mt-1 text-xs text-muted"><strong>用途：</strong>{metric.use}</p><p className="mt-1 text-xs text-muted"><strong>注意：</strong>{metric.caveat}</p></div>)}</div></div> : null}

                </div>
              ) : <p className="rounded-md border border-border bg-white p-4 text-sm text-muted">尚未生成正式诊断。完成指标复核后运行正式诊断，系统会输出问题、证据、经营方案和验证指标。</p>}
              formalReady={formalReady}
              onRunExpert={() => void runExpertAnalysis()}
              onRunFormal={() => void runDecision()}
            />
          </Card>
        </section>
      ) : null}

      <ConfirmDialog open={Boolean(snapshotToConfirm)} title="确认页面所属账号" description={`请核对“${selectedRouteToConfirm?.label || "当前页面"}”确实属于账号“${task.project.accountProfile.accountName}”。确认后，这条路线的数据才会生成正式指标并参与诊断。`} confirmLabel="确认属于当前账号" isLoading={busy === "confirm-account"} onCancel={() => setSnapshotToConfirm(null)} onConfirm={() => { if (snapshotToConfirm) void confirmSnapshotAccount(snapshotToConfirm); }}><div className="mt-4 rounded-md border border-border bg-slate-50 p-3 text-sm"><p>任务绑定账号 ID：{task.project.accountProfile.platformAccountId || "待补"}</p><p>页面识别结果：{selectedRouteToConfirm?.detectedAccountId || selectedRouteToConfirm?.detectedAccountName || "未识别"}</p><p>采集路线：{selectedRouteToConfirm?.label || "待读取"}</p></div></ConfirmDialog>
      <ConfirmDialog open={confirmAllAccountsOpen} title={`一键确认全部待确认账号（${unverifiedRoutes.length}）`} description={`请一次核对以下路线均属于账号“${task.project.accountProfile.accountName}”。本次只确认列表中的当前最新快照，不会自动确认以后新采集的数据。`} confirmLabel="确认全部当前路线" isLoading={busy === "confirm-accounts"} onCancel={() => setConfirmAllAccountsOpen(false)} onConfirm={() => void confirmAllSnapshotAccounts()}><div className="mt-4 grid gap-3 text-sm"><div className="rounded-md border border-border bg-slate-50 p-3"><p>任务绑定账号：{task.project.accountProfile.accountName}</p><p>账号 ID：{task.project.accountProfile.platformAccountId || "待补"}</p><p>本轮快照数量：{captureSummary?.snapshotCount || 0}</p></div>{unverifiedRoutes.map((route) => <div className="rounded-md border border-amber-200 bg-amber-50 p-3" key={route.routeKey}><strong>{route.label}</strong><p className="mt-1">页面识别：{route.detectedAccountId || route.detectedAccountName || "未识别"}</p><p className="mt-1 text-xs text-muted">待确认快照：{route.snapshotId}</p></div>)}</div></ConfirmDialog>
    </main>
  );
}

function summarizeReviewState(metrics: ReviewedMetricDTO[]) {
  if (!metrics.length) {
    return { label: "无指标：不建议运行", tone: "text-danger" };
  }
  const pendingCount = metrics.filter((metric) => metric.reviewStatus === "PENDING").length;
  const reviewedCount = metrics.filter((metric) => metric.reviewStatus === "CONFIRMED" || metric.reviewStatus === "MODIFIED").length;
  if (pendingCount === 0 && reviewedCount > 0) {
    return { label: "已复核：可以正常运行", tone: "text-primary" };
  }
  return { label: "未完全复核：暂不能运行完整诊断，预算和暂停类动作会被阻断", tone: "text-danger" };
}

function metricSourceLabel(source: MetricSource) {
  const labels: Record<MetricSource, string> = {
    XHR_JSON: "XHR JSON",
    TABLE: "表格",
    DOM_TEXT: "页面文本",
    SCREENSHOT: "截图",
    MANUAL_INPUT: "人工输入",
    UNKNOWN: "未知"
  };
  return labels[source] || source;
}

function reviewStatusLabel(status: MetricReviewStatus) {
  const labels: Record<MetricReviewStatus, string> = {
    PENDING: "待复核",
    CONFIRMED: "已确认",
    MODIFIED: "已修改",
    IGNORED: "已忽略"
  };
  return labels[status] || status;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function formatOptionalNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "数据缺失";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function riskLabel(riskLevel: RiskLevel) {
  return riskLevel === "HIGH" ? "高" : riskLevel === "MEDIUM" ? "中" : "低";
}

function riskTone(riskLevel: RiskLevel) {
  if (riskLevel === "HIGH") return "bg-red-100 text-red-700";
  if (riskLevel === "MEDIUM") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-700";
}

function priorityTone(priority: DecisionBusinessAnalysis["recommendations"][number]["priority"]) {
  if (priority === "P0") return "bg-red-100 text-red-700";
  if (priority === "P1") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-700";
}

function dimensionLabel(dimension: DecisionBusinessAnalysis["findings"][number]["dimension"]) {
  const labels: Record<typeof dimension, string> = {
    DATA_QUALITY: "数据可信度",
    PROFITABILITY: "真实盈利",
    TRAFFIC: "流量获取",
    LIVE_ROOM: "直播承接",
    PRODUCT: "商品结构",
    COMPLIANCE: "规则与履约"
  };
  return labels[dimension];
}

function extensionStatusLabel(state: ExtensionStatusDTO["state"] | undefined) {
  const labels: Record<ExtensionStatusDTO["state"], string> = {
    UNPAIRED: "未配对",
    PAIRED_NOT_CONNECTED: "已配对，等待连接",
    BOUND_OTHER_TASK: "已绑定其他任务",
    READY: "连接正常",
    PAGE_UNSUPPORTED: "当前页面不支持",
    ACCOUNT_UNVERIFIED: "账号待确认",
    ACCOUNT_MISMATCH: "账号不一致",
    PAGE_INACTIVE: "页面未激活",
    ROUTE_UNVERIFIED: "当前分栏待确认",
    VERSION_OUTDATED: "插件版本过旧",
    OFFLINE: "插件离线",
    ERROR: "插件异常"
  };
  return state ? labels[state] : "检测中";
}

function webBridgeStateLabel(state: WebBridgeUiState["state"]) {
  const labels: Record<WebBridgeUiState["state"], string> = {
    CHECKING: "正在检测",
    NOT_ACTIVE: "插件未激活",
    BACKGROUND_UNRESPONSIVE: "插件后台未响应",
    VERSION_OUTDATED: "本地版本需要重新加载",
    READY: "连接正常"
  };
  return labels[state];
}

function captureRouteStateLabel(state: string) {
  const labels: Record<string, string> = {
    PENDING: "待打开",
    READY: "待采集",
    MISSING: "尚未采集",
    UPLOADED: "已采集",
    AGING: "数据即将过期",
    PARTIAL: "已采集，部分可见",
    UNVERIFIED: "已采集，账号待确认",
    MANUAL_PENDING: "已采集，路线待确认",
    STALE: "数据已过期",
    FAILED: "采集失败"
  };
  return labels[state] || state;
}

function formatDiagnosticAge(value: string) {
  const ageMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return new Date(value).toLocaleString("zh-CN");
  if (ageMs < 60_000) return "刚刚";
  if (ageMs < 60 * 60_000) return `${Math.floor(ageMs / 60_000)} 分钟前`;
  return new Date(value).toLocaleString("zh-CN");
}

function accountMatchLabel(status: AccountMatchStatus | null) {
  if (status === "MATCHED") return "已匹配";
  if (status === "MISMATCHED") return "不一致";
  if (status === "UNVERIFIED") return "待确认";
  return "数据缺失";
}

function groupCaptureMetrics(metrics: CaptureSummaryDTO["metrics"]) {
  return metrics.reduce<Record<string, CaptureSummaryDTO["metrics"]>>((groups, metric) => {
    const category = metric.category || "UNKNOWN";
    (groups[category] ||= []).push(metric);
    return groups;
  }, {});
}

function metricCategoryLabel(category: string) {
  const labels: Record<string, string> = { ROI: "ROI 与目标", COST: "预算与成本", CONVERSION: "转化", TRAFFIC: "流量", LIVE_ROOM: "直播承接", FULL_DOMAIN: "全域溢出", SERVICE_PROVIDER: "服务商成本", RISK: "口碑与履约风险", ACTIVITY: "活动与补贴", TIMING: "时间窗口", UNKNOWN: "待校准指标" };
  return labels[category] || category;
}
