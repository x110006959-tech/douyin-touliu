"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import {
  aiDisclaimer,
  collectionRouteLabels,
  collectionRouteTemplates,
  cooperationTypeLabels,
  isPrimaryCollectionRouteKey,
  operatorTypeLabels,
  subjectTypeLabels,
  type ActionProposalStatus,
  type ActionType,
  type CooperationType,
  type DecisionBusinessAnalysis,
  type ExtensionStatusDTO,
  type OperatorType,
  type ReviewedMetricDTO,
  type RiskLevel,
  type SubjectType
} from "@douyin-local-life/shared";
import { evaluateFormalDecisionReadiness } from "@douyin-local-life/shared/formal-decision-readiness";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { apiBaseUrl, apiFetch, createIdempotencyKey } from "@/lib/api";
import { pairExtensionTask } from "@/lib/extension-bridge";
import { useAuth } from "@/lib/AuthContext";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";
import { getTaskWizardProgress } from "@/lib/task-progress";
import { DiagnosisComparison } from "./diagnosis-comparison";
import type { DecisionPreview, DecisionRun } from "./task-types";
import { useExtensionTaskStatus, type WebBridgeUiState } from "./use-extension-task-status";
import { useTaskData } from "./use-task-data";

type PairingCodeResponse = {
  code: string;
  expiresAt: string;
  task: { id: string; pageTitle: string | null; projectId: string; projectName: string } | null;
};


export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, hydrated } = useAuth();
  const openCollectionDashboardAfterCapture = useCallback(() => {
    router.push(`/tasks/${params.id}/collection-dashboard`);
  }, [params.id, router]);
  const {
    task,
    decisionRun,
    setDecisionRun,
    collectionRun,
    reviewMetrics,
    load,
    error,
    setError
  } = useTaskData(params.id, token);
  const {
    captureSummary,
    extensionDetected,
    extensionStatus,
    refreshConnectionStatus,
    setExtensionDetected,
    setWebBridge,
    webBridge
  } = useExtensionTaskStatus({
    taskId: params.id,
    token,
    reloadTask: load,
    onCaptureCompleted: openCollectionDashboardAfterCapture
  });
  const [pairingCode, setPairingCode] = useState<PairingCodeResponse | null>(null);
  const [pairingMessage, setPairingMessage] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [decisionPreview, setDecisionPreview] = useState<DecisionPreview | null>(null);
  const [busy, setBusy] = useState("");
  const [manualCsv, setManualCsv] = useState("指标名称,值,单位\n核销 ROI,,\n消耗,,元\n成交订单数,,单");
  const [manualAccountConfirmed, setManualAccountConfirmed] = useState(false);
  const decisionIdempotencyKey = useRef<string | null>(null);
  const manualIdempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (!token || searchParams.get("preview") !== "1") return;
    let active = true;
    setBusy("decision-preview");
    setError("");
    void apiFetch<DecisionPreview>(`/collection-tasks/${params.id}/decision-preview`, token, {
      method: "POST",
      body: "{}"
    }).then((preview) => {
      if (active) setDecisionPreview(preview);
    }).catch((previewError) => {
      if (active) setError(previewError instanceof Error ? previewError.message : "生成保守诊断失败");
    }).finally(() => {
      if (active) setBusy("");
    });
    return () => {
      active = false;
    };
  }, [params.id, searchParams, setError, token]);

  async function createTaskPairingCode(manualOnly = false) {
    if (!token || !task) return;
    setBusy("pairing-code"); setError(""); setPairingMessage("");
    try {
      if (webBridge.state === "VERSION_OUTDATED" || extensionStatus?.state === "VERSION_OUTDATED") {
        throw new Error("当前插件协议不兼容。请先在扩展管理页重新加载当前本地插件，再生成或输入配对码。");
      }
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

  async function refreshExtensionConnection() {
    setBusy("extension-status");
    setError("");
    try {
      await refreshConnectionStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "暂时无法读取插件状态，请检查本地服务后重试");
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

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState returnTo={`/tasks/${encodeURIComponent(params.id)}`} />;

  if (!task) {
    if (!error) return <main className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted">加载中...</main>;
    const taskNotFound = error.includes("采集任务不存在");
    return (
      <main className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-xl items-center px-6 py-8">
        <Card className="w-full">
          <p className="text-xs font-semibold text-primary">采集任务</p>
          <CardTitle>{taskNotFound ? "采集任务不存在" : "暂时无法打开采集任务"}</CardTitle>
          <p className="mb-5 text-sm text-muted">{taskNotFound ? "该链接对应的采集任务不存在，或已不属于当前工作台。" : error}</p>
          <Link className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90" href="/login">返回登录</Link>
        </Card>
      </main>
    );
  }

  const latestSnapshot = task.snapshots[0];
  const reviewState = summarizeReviewState(reviewMetrics);
  const hasCapture = Boolean(captureSummary?.snapshotCount || latestSnapshot);
  const requiredRoutesCaptured = captureSummary
    ? captureSummary.requiredRoutesCaptured
    : collectionRun
      ? collectionRun.quality.missingRoutes.length === 0
      : task.routeSources.filter((route) => route.required && isPrimaryCollectionRouteKey(route.routeKey)).every((route) => route.status === "CAPTURED");
  const extensionBoundToTask = Boolean(extensionStatus?.paired && extensionStatus.boundTaskId === task.id);
  const extensionServerVerified = Boolean(extensionBoundToTask && extensionStatus?.lastHeartbeatAt);
  const extensionConnectionBlocked = ["UNPAIRED", "PAIRED_NOT_CONNECTED", "BOUND_OTHER_TASK", "OFFLINE", "VERSION_OUTDATED", "ERROR"]
    .includes(extensionStatus?.state || "UNPAIRED");
  const pluginUpdateRequired = webBridge.state === "VERSION_OUTDATED" || extensionStatus?.state === "VERSION_OUTDATED";
  const extensionConnected = Boolean(
    webBridge.state === "READY"
    && extensionServerVerified
    && !extensionConnectionBlocked
  );
  const reviewComplete = reviewMetrics.length > 0 && reviewMetrics.every((metric) => metric.reviewStatus !== "PENDING");
  const missingRequiredRoutes = captureSummary?.routes.filter((route) => route.required && !route.snapshotId) || [];
  const staleRequiredRoutes = captureSummary?.routes.filter((route) => route.required && route.state === "STALE") || [];
  const pendingReviewCount = reviewMetrics.filter((metric) => metric.reviewStatus === "PENDING").length;
  const formalReadiness = evaluateFormalDecisionReadiness({
    missingRequiredRouteLabels: missingRequiredRoutes.map((route) => route.label),
    unverifiedRequiredRouteLabels: [],
    staleRequiredRouteLabels: staleRequiredRoutes.map((route) => route.label),
    subjectReady: task.project.subjectType !== "SUBJECT_PENDING" && task.project.operatorType !== "OPERATOR_PENDING",
    reviewTotalCount: reviewMetrics.length,
    reviewPendingCount: pendingReviewCount
  });
  const formalReady = formalReadiness.ready;
  const wizardProgress = getTaskWizardProgress({
    extensionConnected,
    hasCapture,
    requiredRoutesCaptured,
    reviewComplete,
    decisionCreated: Boolean(decisionRun)
  });
  const evidenceAdvisories = captureSummary?.routes.filter((route) => route.required && (route.state === "PARTIAL" || route.state === "STALE")) || [];
  const diagnosticOutput = decisionRun?.mode === "LEGACY_RULE"
    ? {
        ...decisionRun.finalResultJson,
        diagnosis: decisionRun.diagnosis || "旧版规则诊断",
        riskLevel: decisionRun.riskLevel || "MEDIUM",
        confidence: decisionRun.confidence ?? 0
      }
    : decisionPreview?.finalOutput || null;
  const businessAnalysis = diagnosticOutput?.businessAnalysis || null;
  const managedLiveGrowthMode = businessAnalysis?.mode === "MANAGED_LIVE_GROWTH" || task.project.operatorType === "SERVICE_PROVIDER_LIVE";
  const displayedFindings = managedLiveGrowthMode ? businessAnalysis?.findings.filter((finding) => finding.dimension !== "PROFITABILITY") : businessAnalysis?.findings;
  const displayedRecommendations = managedLiveGrowthMode ? businessAnalysis?.recommendations.filter((recommendation) => recommendation.dimension !== "PROFITABILITY") : businessAnalysis?.recommendations;
  const displayedMetricExplanations = managedLiveGrowthMode
    ? businessAnalysis?.metricExplanations.filter((metric) => !["服务商后毛利 ROI", "本次真实投入（服务费后）", "已核验平台补贴抵扣"].includes(metric.title))
    : businessAnalysis?.metricExplanations;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <Link
          aria-label="返回上一级：项目详情"
          className="mb-3 inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
          href={`/projects/${task.project.id}`}
        >
          ← 返回上一级
        </Link>
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

      {!extensionConnected ? (
        <Card className="mb-4 border-primary/40">
          <p className="mb-1 text-xs font-semibold text-primary">{hasCapture ? "连接状态" : "第 1 步"}</p>
          <CardTitle>{hasCapture ? "恢复采集插件连接" : "连接采集插件"}</CardTitle>
          <p className="mb-4 text-sm text-muted">{hasCapture ? "历史采集数据已保留，但当前浏览器尚未确认连接。重新采集前必须恢复当前任务的插件连接。" : "网页会先确认插件与后台版本，再一键生成配对码并绑定当前任务。"} 服务器的历史授权不等于当前浏览器已经配对；只有网页桥接确认本地凭证且本机 API 收到当前任务心跳后才会进入采集步骤。配对不会读取平台密码或 Cookie。</p>
          <div className="grid gap-3 md:grid-cols-3">
            <Info label="网页桥接" value={webBridgeStateLabel(webBridge.state)} />
            <Info label="配对状态" value={webBridge.response?.paired ? "当前插件本地凭证已验证" : extensionStatus?.paired ? "服务器有历史授权，当前插件未验证" : "当前插件尚未配对"} />
            <Info label="任务绑定" value={extensionServerVerified ? "本机 API 已确认当前任务" : extensionStatusLabel(extensionStatus?.state)} />
          </div>
          <div className={`mt-3 rounded-md border p-3 text-sm ${webBridge.state === "READY" ? "border-primary/30 bg-blue-50" : "border-amber-300 bg-amber-50"}`}>
            <strong>{webBridge.message}</strong>
            {webBridge.response ? <p className="mt-1 text-xs text-muted">插件 {webBridge.response.extensionVersion} · 协议 {webBridge.response.protocolVersion} · 构建 {webBridge.response.buildFingerprint}</p> : null}
            {extensionStatus ? <p className="mt-2 text-xs text-muted"><strong>本机 API：</strong>{extensionStatus.message}</p> : null}
            {webBridge.state !== "READY" ? <p className="mt-2 text-xs text-muted">本地插件代码更新后，请在 chrome://extensions 中点击一次“重新加载”，然后刷新本任务页和目标后台页面。</p> : null}
          </div>
          {hasCapture ? <p className="mt-3 text-sm text-muted">历史快照不会代替当前配对。请先在已登录的目标后台打开下方任一页面并刷新，再重新检测；只有任务绑定丢失或 API 校验失败时才需要重新配对。</p> : null}
          {pairingMessage ? <p className="mt-3 rounded-md border border-primary/30 bg-blue-50 p-3 text-sm text-primary">{pairingMessage}</p> : null}
          {pairingCode ? (
            <div className="mt-4 rounded-md border border-primary bg-blue-50 p-4 text-center">
              <p className="text-sm">一键连接未完成时，请在插件中输入本任务配对码</p>
              <p className="my-2 text-3xl font-bold tracking-[0.3em]">{pairingCode.code}</p>
              <p className="text-xs text-muted">{new Date(pairingCode.expiresAt).toLocaleTimeString("zh-CN")} 前有效，成功后会自动绑定本任务。</p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="border border-border bg-white text-foreground" disabled={busy === "extension-status"} onClick={() => void refreshExtensionConnection()} type="button">{busy === "extension-status" ? "正在检测..." : "重新检测插件"}</Button>
            <Button disabled={busy === "pairing-code" || webBridge.state !== "READY"} onClick={() => createTaskPairingCode(false)} type="button">{busy === "pairing-code" ? "正在连接..." : hasCapture ? "重新绑定当前任务" : "一键连接采集插件"}</Button>
            <Button className="border border-border bg-white text-foreground" disabled={busy === "pairing-code" || pluginUpdateRequired} onClick={() => createTaskPairingCode(true)} type="button">{pluginUpdateRequired ? "请先重新加载插件" : "生成手动配对码"}</Button>
            <Link className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-medium" href="/extension">查看插件安装说明</Link>
          </div>
        </Card>
      ) : null}

      {extensionConnected || hasCapture ? (
        <Card className="mb-4 border-primary/40">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold text-primary">{extensionConnected ? "第 2 步" : "历史采集记录"}</p>
              <CardTitle>采集指定页面</CardTitle>
              <p className="text-sm text-muted">{extensionConnected ? "巨量本地推数据页采集一次；直播数据大屏点击一次开启 API 持续采集。任务或计划列表不再采集。" : "以下内容仅用于查看历史数据。完成上方插件连接后，才可以再次采集当前页面。"}</p>
            </div>
            <span className={`rounded-md border px-3 py-2 text-sm ${extensionConnected ? "border-primary bg-blue-50 text-primary" : "border-amber-300 bg-amber-50"}`}>
              {extensionConnected ? `插件已连接 · ${extensionStatus?.extensionVersion || "版本未知"}` : "当前插件未连接，历史数据仅供复核"}
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
            {(captureSummary?.routes || task.routeSources).filter((route) => isPrimaryCollectionRouteKey(route.routeKey)).map((route) => {
              const template = collectionRouteTemplates.find((item) => item.routeKey === route.routeKey);
              const diagnostic = "diagnostic" in route ? route.diagnostic : null;
              const state = diagnostic?.summaryStatus
                || ("state" in route ? route.state : route.status === "CAPTURED" ? "UPLOADED" : route.sourceUrl ? "READY" : "PENDING");
              const isCurrentPage = extensionStatus?.routeKey === route.routeKey && extensionStatus.collectable;
              return (
                <div className={`grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_auto] ${isCurrentPage ? "border-primary bg-blue-50" : "border-border"}`} key={route.routeKey}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><strong>{route.label}</strong>{route.required ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">基础页面</span> : <span className="text-xs text-muted">补充页面</span>}</div>
                    <p className="mt-1 text-sm text-muted">{template?.purpose || "补充当前诊断所需数据"}</p>
                    <p className="mt-2 text-xs text-muted">{template?.urlHint || "请先在已登录的平台后台打开对应页面"}</p>
                    {route.sourceUrl ? <p className="mt-1 break-all text-xs text-muted">旧任务保存网址：{route.sourceUrl}</p> : null}
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
                    {route.sourceUrl ? <a className="text-sm text-primary hover:underline" href={route.sourceUrl} rel="noreferrer" target="_blank">打开已保存页面</a> : null}
                    {isCurrentPage ? <span className="text-xs font-medium text-primary">当前页面可采集</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
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
              <div><p className="mb-1 text-xs font-semibold text-primary">第 3 步</p><CardTitle>数据汇总</CardTitle><p className="text-sm text-muted">查看各路线合并结果；每项指标仍保留来源与采集时间。</p></div>
              <div className="flex flex-col gap-2 md:items-end">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Info label="快照" value={`${captureSummary.snapshotCount} 份`} />
                <Info label="指标" value={`${captureSummary.metrics.length} 项`} />
                <Info label="覆盖率" value={captureSummary.coverageRatio == null ? "数据缺失" : `${Math.round(captureSummary.coverageRatio * 100)}%`} />
                <Info label="任务绑定" value="服务端已验证" />
              </div>
              <Link className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white" href={`/tasks/${task.id}/collection-dashboard`}>打开校准大屏</Link>
              </div>
            </div>
            <p className="mb-4 text-xs text-muted">最近采集：{captureSummary.latestCapturedAt ? new Date(captureSummary.latestCapturedAt).toLocaleString("zh-CN") : "数据缺失"}。所有指标、表格单元格的确认和修改请在校准大屏完成。</p>
            {!captureSummary.metrics.length ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">已收到快照，但未识别到标准指标。请确认页面已完整加载；该问题会阻断依赖相关字段的诊断。</p> : null}
            <p className="rounded-md border border-border bg-slate-50 p-3 text-sm text-muted">采集值、来源路线、置信度、表格原值和校准记录统一在任务专属大屏中查看。</p>
          </Card>
        </section>
      ) : null}

      {hasCapture ? (
        <section className="mb-4">
          <Card>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div><p className="mb-1 text-xs font-semibold text-primary">第 4 步</p><CardTitle>人工核对</CardTitle><p className="text-sm text-muted">确认、修改或忽略采集值。完成必要复核后才能运行完整诊断。</p></div>
              <span className={`rounded-md border px-3 py-2 text-sm ${reviewComplete ? "border-primary bg-blue-50 text-primary" : "border-amber-300 bg-amber-50"}`}>{reviewState.label}</span>
            </div>
            {reviewMessage ? <p className="mb-3 rounded-md border border-border bg-slate-50 px-3 py-2 text-sm">{reviewMessage}</p> : null}
            <div className="grid gap-2 sm:grid-cols-3"><Info label="复核指标" value={`${reviewMetrics.length} 项`} /><Info label="待复核" value={`${pendingReviewCount} 项`} /><Info label="任务绑定" value="服务端已验证" /></div>
            <div className="mt-4 flex justify-end"><Link className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white" href={`/tasks/${task.id}/collection-dashboard`}>进入校准大屏</Link></div>
          </Card>
        </section>
      ) : null}

      {hasCapture && (reviewComplete || decisionRun || decisionPreview) ? (
        <section className="mb-4 scroll-mt-4" id="diagnosis">
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
              formalBlockingReasons={formalReadiness.blockingReasons}
              formalContent={diagnosticOutput ? (
                <div className="grid gap-4">
                {!decisionRun ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm lg:col-span-2"><strong>当前展示保守诊断：</strong>数据不满足正式决策时效或证据门槛，本次只展示事实、缺失项和补采建议，不创建动作建议。重新采集过期路线后可运行正式诊断。</div> : null}
                <div className="rounded-md border border-border p-4 lg:col-span-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div><h3 className="font-semibold">本轮结论</h3><p className="mt-2 text-base font-medium">{businessAnalysis?.headline || diagnosticOutput.diagnosis}</p></div>
                    <div className="flex shrink-0 gap-2 text-xs">
                      <span className={`rounded-full px-3 py-1 font-semibold ${riskTone(diagnosticOutput.riskLevel)}`}>风险 {riskLabel(diagnosticOutput.riskLevel)}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">置信度 {Math.round(diagnosticOutput.confidence * 100)}%</span>
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
              onRunFormal={() => void runDecision()}
              token={token}
              onRefresh={() => void load()}
            />
          </Card>
        </section>
      ) : null}

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
    PAIRED_NOT_CONNECTED: "服务器有历史授权，等待当前插件验证",
    BOUND_OTHER_TASK: "已绑定其他任务",
    READY: "连接正常",
    PAGE_UNSUPPORTED: "当前页面不支持",
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
