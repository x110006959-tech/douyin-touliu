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
  liveScreenPulseCoreMetricKeys,
  localPromotionApiMetricKeys,
  operatorTypeLabels,
  primaryCollectionRouteKeys,
  subjectTypeLabels,
  type ActionProposalStatus,
  type ActionType,
  type CooperationType,
  type ExtensionStatusDTO,
  type OperatorType,
  type RealtimeMetricFrame,
  type ReviewedMetricDTO,
  type SubjectType
} from "@douyin-local-life/shared";
import { evaluateFormalDecisionReadiness } from "@douyin-local-life/shared/formal-decision-readiness";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { apiBaseUrl, apiFetch, cookieSessionMarker, createIdempotencyKey } from "@/lib/api";
import { ExtensionBridgeError, pairExtensionTask } from "@/lib/extension-bridge";
import { useAuth } from "@/lib/AuthContext";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";
import { getTaskWizardProgress } from "@/lib/task-progress";
import { subscribeRealtimeMetricStream, usableRealtimeMetrics, type RealtimeMetricStreamStatus } from "@/lib/realtime-metric-stream";
import { DiagnosisComparison } from "./diagnosis-comparison";
import { DiagnosisBusinessSummary } from "./diagnosis-business-summary";
import type { DecisionPreview, DecisionRun } from "./task-types";
import { useExtensionTaskStatus, type WebBridgeUiState } from "./use-extension-task-status";
import { useTaskData } from "./use-task-data";

type PairingCodeResponse = {
  code: string;
  expiresAt: string;
  task: { id: string; pageTitle: string | null; projectId: string; projectName: string } | null;
};

const pairingRetryErrorCodes = new Set([
  "BRIDGE_REQUEST_FAILED",
  "INVALID_PAIRING_REQUEST",
  "TASK_PAGE_REQUIRED",
  "PAIRING_CODE_INVALID",
  "PAIRING_RATE_LIMITED",
  "PAIRING_API_TIMEOUT",
  "PAIRING_SERVICE_UNAVAILABLE",
  "PAIRING_SERVICE_ERROR",
  "PAIRING_REQUEST_FAILED",
  "PAIRING_RESPONSE_INVALID",
  "PAIRING_CREDENTIAL_REJECTED",
  "TASK_PAGE_MISMATCH",
  "TASK_ACCOUNT_MISMATCH",
  "PAIRING_REQUIRED"
]);


export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, hydrated } = useAuth();
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
    acceptPairingResponse,
    beginPairingAttempt,
    captureSummary,
    connectionStatusLoading,
    extensionDetected,
    extensionStatus,
    refreshConnectionStatus,
    webBridge
  } = useExtensionTaskStatus({
    taskId: params.id,
    token,
    reloadTask: load
  });
  const [pairingCode, setPairingCode] = useState<PairingCodeResponse | null>(null);
  const [pairingMessage, setPairingMessage] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [decisionPreview, setDecisionPreview] = useState<DecisionPreview | null>(null);
  const [busy, setBusy] = useState("");
  const [manualCsv, setManualCsv] = useState("指标名称,值,单位\n核销 ROI,,\n消耗,,元\n成交订单数,,单");
  const [manualAccountConfirmed, setManualAccountConfirmed] = useState(false);
  const [realtimeFrames, setRealtimeFrames] = useState<Record<string, RealtimeMetricFrame>>({});
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeMetricStreamStatus>("CONNECTING");
  const decisionIdempotencyKey = useRef<string | null>(null);
  const manualIdempotencyKey = useRef<string | null>(null);
  const pairingRecoveryPending = useRef(false);
  const previousCollectionDashboardReady = useRef<boolean | null>(null);

  const liveRealtimeFrame = realtimeFrames.LIVE_DATA_SCREEN;
  const localPromotionRealtimeFrame = realtimeFrames.LOCAL_PROMOTION_DASHBOARD;
  const liveRealtimeMetrics = realtimeStatus === "CONNECTED" ? usableRealtimeMetrics(liveRealtimeFrame, "LIVE_DATA_SCREEN") : [];
  const localPromotionRealtimeMetrics = realtimeStatus === "CONNECTED" ? usableRealtimeMetrics(localPromotionRealtimeFrame, "LOCAL_PROMOTION_DASHBOARD") : [];
  const hasUsableRealtimeOverview = Boolean(liveRealtimeFrame?.pageType === "LIVE_DATA_SCREEN" && liveRealtimeMetrics.length);
  const hasUsableLocalPromotionRealtime = Boolean(localPromotionRealtimeFrame?.pageType === "LOCAL_PROMOTION_DASHBOARD" && localPromotionRealtimeMetrics.length);
  const completedPrimaryRouteKeys = new Set(
    (captureSummary?.routes ?? task?.routeSources ?? [])
      .filter((route) => isPrimaryCollectionRouteKey(route.routeKey))
      .filter((route) => ("state" in route ? route.state === "UPLOADED" : route.status === "CAPTURED"))
      .map((route) => route.routeKey)
  );
  // A running stream alone is not enough to unlock the dashboard: each route
  // needs its complete approved metric set, or an accepted formal snapshot.
  if (hasRequiredRealtimeMetricKeys(liveRealtimeMetrics, liveScreenPulseCoreMetricKeys)) {
    completedPrimaryRouteKeys.add("LIVE_DATA_SCREEN");
  }
  if (hasRequiredRealtimeMetricKeys(localPromotionRealtimeMetrics, localPromotionApiMetricKeys)) {
    completedPrimaryRouteKeys.add("LOCAL_PROMOTION_DASHBOARD");
  }
  const collectionDashboardPendingRouteKeys = primaryCollectionRouteKeys.filter((routeKey) => !completedPrimaryRouteKeys.has(routeKey));
  const collectionDashboardPendingRouteLabels = collectionDashboardPendingRouteKeys.map((routeKey) => collectionRouteLabels[routeKey] || routeKey);
  const collectionDashboardReady = Boolean(task) && collectionDashboardPendingRouteKeys.length === 0;

  const connectionReadyForTask = Boolean(
    task
    && webBridge.state === "READY"
    && webBridge.response?.ok
    && webBridge.response.boundTaskId === task.id
    && extensionStatus?.paired
    && extensionStatus.boundTaskId === task.id
    && extensionStatus.lastHeartbeatAt
    && !["OFFLINE", "VERSION_OUTDATED", "ERROR"].includes(extensionStatus.state)
  );

  useEffect(() => {
    if (!pairingRecoveryPending.current || !task || connectionStatusLoading || !connectionReadyForTask) return;
    pairingRecoveryPending.current = false;
    router.push(`/tasks/${task.id}/collection-dashboard`);
  }, [connectionReadyForTask, connectionStatusLoading, router, task]);

  useEffect(() => {
    if (!task || connectionStatusLoading) return;
    const previousReadiness = previousCollectionDashboardReady.current;
    previousCollectionDashboardReady.current = collectionDashboardReady;
    if (previousReadiness === false && collectionDashboardReady) {
      router.push(`/tasks/${task.id}/collection-dashboard`);
    }
  }, [collectionDashboardReady, connectionStatusLoading, router, task]);

  useEffect(() => {
    if (!token) return;
    return subscribeRealtimeMetricStream({
      url: `${apiBaseUrl}/collection-tasks/${params.id}/signals/stream`,
      authorizationToken: token === cookieSessionMarker ? null : token,
      onFrame: (frame) => setRealtimeFrames((current) => ({ ...current, [frame.routeKey]: frame })),
      onStatus: setRealtimeStatus
    });
  }, [params.id, token]);

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
    pairingRecoveryPending.current = false;
    beginPairingAttempt();
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
      if (!manualOnly && webBridgeSupportsPairing) {
        const paired = await pairExtensionTask(created.code, apiBaseUrl);
        if (!paired.ok) throw new Error(paired.message || "插件一键配对失败");
        acceptPairingResponse(paired);
        setPairingCode(null);
        if (paired.boundTaskId !== task.id) {
          throw new Error("插件已响应，但未绑定当前任务，已停止自动跳转。");
        }
        pairingRecoveryPending.current = true;
        await refreshConnectionStatus({ syncCurrentTask: false, forceTaskSync: false });
        setPairingMessage("插件已自动连接当前任务，正在打开采集看板。");
      } else {
        setPairingMessage("已生成手动配对码，请在插件 Popup 中输入。成功后会自动绑定当前任务。");
      }
    } catch (err) {
      if (err instanceof ExtensionBridgeError && err.code === "BACKGROUND_UNRESPONSIVE") {
        // The exchange may have completed after the page-side response timed
        // out. Read-only polling may redirect only after all three connection
        // conditions are observed, and never masks an explicit bridge error.
        pairingRecoveryPending.current = true;
      }
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
      if (nextDecisionRun.reuseReason === "UNCHANGED_EVIDENCE") {
        setReviewMessage("本轮可信数据、目标和诊断版本均未变化，已直接沿用现有结果，没有再次调用模型。");
      }
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
    && webBridge.response?.ok
    && extensionServerVerified
    && !extensionConnectionBlocked
  );
  const extensionConnectionNeedsAttention = !extensionConnected && !connectionStatusLoading;
  const webBridgeSupportsPairing = webBridge.state === "READY" || webBridge.state === "SYNC_FAILED";
  const needsPairingAction = webBridgeSupportsPairing && (
    pairingRetryErrorCodes.has(webBridge.response?.errorCode || "")
    || (webBridge.state === "READY" && webBridge.response?.paired === false)
  );
  const bridgeNeedsReload = ["NOT_ACTIVE", "BACKGROUND_UNRESPONSIVE", "VERSION_OUTDATED"].includes(webBridge.state);
  const bridgePageRefreshRequired = webBridge.state === "BACKGROUND_UNRESPONSIVE";
  const showPluginInstallInstructions = webBridge.state === "NOT_ACTIVE" || webBridge.state === "VERSION_OUTDATED";
  const bridgeRecoveryHint = webBridge.response?.errorCode === "ACTIVE_PULSE_STOP_REQUIRED"
    ? "安全保护已生效：系统不会自动中断持续采集。请先在插件 Popup 手动停止，再重新检测。"
    : webBridge.response?.errorCode === "TASK_ACCOUNT_MISMATCH"
      ? "当前任务属于另一账号。点击“切换采集账号”完成一次明确配对后再继续。"
      : webBridge.response?.errorCode === "PAIRING_REQUIRED"
        ? "当前插件未配对或凭证已失效，请重新连接当前任务所属账号。"
        : webBridge.response?.errorCode === "HEARTBEAT_FAILED"
          ? "任务绑定已完成，但本机 API 尚未确认心跳；请检查本地服务后重新检测。"
          : ["CONTEXT_TIMEOUT", "CONTEXT_REFRESH_FAILED"].includes(webBridge.response?.errorCode || "")
            ? "本机 API 暂时无法完成账号校验；请确认服务运行正常后重新检测。"
            : null;
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
        <div className="grid gap-2 text-sm sm:grid-cols-4">
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

      {extensionConnectionNeedsAttention ? (
        <Card className="mb-4 border-primary/40">
          <p className="mb-1 text-xs font-semibold text-primary">{hasCapture ? "连接状态" : "第 1 步"}</p>
          <CardTitle>{hasCapture ? "恢复采集插件连接" : "连接采集插件"}</CardTitle>
          <p className="mb-4 text-sm text-muted">进入任务页会自动检测插件；已配对的同账号任务会自动切换。当前仅在未配对、账号不一致、插件异常或持续采集占用时需要处理。服务器的历史授权不等于当前浏览器已经配对；只有网页桥接确认本地凭证且本机 API 收到当前任务心跳后才会进入采集步骤。配对不会读取平台密码或 Cookie。</p>
          <div className="grid gap-3 md:grid-cols-3">
            <Info label="网页桥接" value={webBridgeStateLabel(webBridge.state)} />
            <Info label="配对状态" value={webBridge.response?.paired ? "当前插件本地凭证已验证" : extensionStatus?.paired ? "服务器有历史授权，当前插件未验证" : "当前插件尚未配对"} />
            <Info label="任务绑定" value={extensionServerVerified ? "本机 API 已确认当前任务" : extensionStatusLabel(extensionStatus?.state)} />
          </div>
          <div className={`mt-3 rounded-md border p-3 text-sm ${webBridge.state === "READY" ? "border-primary/30 bg-blue-50" : "border-amber-300 bg-amber-50"}`}>
            <strong>{webBridge.message}</strong>
            {webBridge.response ? <p className="mt-1 text-xs text-muted">插件 {webBridge.response.extensionVersion} · 协议 {webBridge.response.protocolVersion} · 构建 {webBridge.response.buildFingerprint}</p> : null}
            {extensionStatus ? <p className="mt-2 text-xs text-muted"><strong>本机 API：</strong>{extensionStatus.message}</p> : null}
            {bridgeRecoveryHint ? <p className="mt-2 text-xs text-muted">{bridgeRecoveryHint}</p> : null}
            {bridgeNeedsReload ? <p className="mt-2 text-xs text-muted">{bridgePageRefreshRequired ? "插件更新后，当前页面里的旧脚本不会自动替换。请刷新本任务页；开始采集前也请刷新目标后台页面。" : "本地插件代码更新后，请在 chrome://extensions 中点击一次“重新加载”，然后刷新本任务页和目标后台页面。"}</p> : null}
          </div>
          {hasCapture ? <p className="mt-3 text-sm text-muted">历史快照不会代替当前连接。请先处理上方异常；同账号任务不需要重新配对。</p> : null}
          {pairingMessage ? <p className="mt-3 rounded-md border border-primary/30 bg-blue-50 p-3 text-sm text-primary">{pairingMessage}</p> : null}
          {pairingCode ? (
            <div className="mt-4 rounded-md border border-primary bg-blue-50 p-4 text-center">
              <p className="text-sm">一键连接未完成时，请在插件中输入本任务配对码</p>
              <p className="my-2 text-3xl font-bold tracking-[0.3em]">{pairingCode.code}</p>
              <p className="text-xs text-muted">{new Date(pairingCode.expiresAt).toLocaleTimeString("zh-CN")} 前有效，成功后会自动绑定本任务。</p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {bridgePageRefreshRequired
              ? <Button className="border border-border bg-white text-foreground" onClick={() => window.location.reload()} type="button">刷新当前页面</Button>
              : <Button className="border border-border bg-white text-foreground" disabled={busy === "extension-status"} onClick={() => void refreshExtensionConnection()} type="button">{busy === "extension-status" ? "正在检测..." : "重新检测插件"}</Button>}
            {needsPairingAction ? <Button disabled={busy === "pairing-code" || !webBridgeSupportsPairing} onClick={() => createTaskPairingCode(false)} type="button">{busy === "pairing-code" ? "正在连接..." : webBridge.response?.errorCode === "TASK_ACCOUNT_MISMATCH" ? "切换采集账号" : "连接采集插件"}</Button> : null}
            {needsPairingAction ? <Button className="border border-border bg-white text-foreground" disabled={busy === "pairing-code" || pluginUpdateRequired} onClick={() => createTaskPairingCode(true)} type="button">{pluginUpdateRequired ? "请先重新加载插件" : "生成手动配对码"}</Button> : null}
            {showPluginInstallInstructions ? <Link className="inline-flex h-10 items-center rounded-md border border-border bg-white px-4 text-sm font-medium" href="/extension">查看插件安装说明</Link> : null}
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
            <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
              <span className={`rounded-md border px-3 py-2 text-sm ${extensionConnected ? "border-primary bg-blue-50 text-primary" : "border-amber-300 bg-amber-50"}`}>
                {extensionConnected ? `插件已连接 · ${extensionStatus?.extensionVersion || "版本未知"}` : "当前插件未连接，历史数据仅供复核"}
              </span>
              {collectionDashboardReady ? (
                <Link className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" href={`/tasks/${task.id}/collection-dashboard`}>
                  下一步：进入经营数据大屏 →
                </Link>
              ) : (
                <Button className="h-10 bg-slate-200 text-slate-500 hover:bg-slate-200" disabled type="button">
                  下一步：进入经营数据大屏 →
                </Button>
              )}
              <p className={`max-w-xs text-xs ${collectionDashboardReady ? "text-emerald-700" : "text-amber-700"}`} role="status">
                {collectionDashboardReady
                  ? "两条采集路线已就绪，可进入经营数据大屏；正式采集完成时也会自动跳转。"
                  : `请先完成：${collectionDashboardPendingRouteLabels.join("、")}。两条路线均有完整实时指标或正式采集结果后，按钮将可用。`}
              </p>
            </div>
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
              const routeRealtimeFrame = route.routeKey === "LIVE_DATA_SCREEN" ? liveRealtimeFrame : route.routeKey === "LOCAL_PROMOTION_DASHBOARD" ? localPromotionRealtimeFrame : undefined;
              const routeRealtimeMetrics = route.routeKey === "LIVE_DATA_SCREEN" ? liveRealtimeMetrics : localPromotionRealtimeMetrics;
              const isRouteRealtime = (route.routeKey === "LIVE_DATA_SCREEN" && hasUsableRealtimeOverview) || (route.routeKey === "LOCAL_PROMOTION_DASHBOARD" && hasUsableLocalPromotionRealtime);
              const diagnostic = !isRouteRealtime && "diagnostic" in route ? route.diagnostic : null;
              const state = isRouteRealtime
                ? "UPLOADED"
                : diagnostic?.summaryStatus
                || ("state" in route ? route.state : route.status === "CAPTURED" ? "UPLOADED" : route.sourceUrl ? "READY" : "PENDING");
              const routeMetricCount = isRouteRealtime
                ? routeRealtimeMetrics.length
                : "metricCount" in route ? route.metricCount : 0;
              const routeStateLabel = isRouteRealtime ? "API 持续采集中" : captureRouteStateLabel(state);
              const isCurrentPage = extensionStatus?.routeKey === route.routeKey && extensionStatus.collectable;
              return (
                <div className={`grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_auto] ${isCurrentPage ? "border-primary bg-blue-50" : "border-border"}`} key={route.routeKey}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><strong>{route.label}</strong>{route.required ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">基础页面</span> : <span className="text-xs text-muted">补充页面</span>}</div>
                    <p className="mt-1 text-sm text-muted">{template?.purpose || "补充当前诊断所需数据"}</p>
                    <p className="mt-2 text-xs text-muted">{template?.urlHint || "请先在已登录的平台后台打开对应页面"}</p>
                    {route.sourceUrl ? <p className="mt-1 break-all text-xs text-muted">旧任务保存网址：{route.sourceUrl}</p> : null}
                    {isRouteRealtime ? (
                      <div className="mt-3 grid gap-1 text-xs text-emerald-700">
                        <p>最近成功：{routeRealtimeFrame?.receivedAt || routeRealtimeFrame?.observedAt ? formatDiagnosticAge(routeRealtimeFrame.receivedAt || routeRealtimeFrame.observedAt) : "刚刚"} · API 持续采集 · {routeRealtimeMetrics.length} 项指标</p>
                        <p>该路线已通过实时接口接入，无需在任务页补齐正式快照。</p>
                      </div>
                    ) : diagnostic ? (
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
                    <strong className={isRouteRealtime ? "text-emerald-700" : state === "UPLOADED" ? "text-primary" : state === "FAILED" ? "text-danger" : ["AGING", "STALE", "UNVERIFIED", "MANUAL_PENDING", "PARTIAL"].includes(state) ? "text-amber-700" : ""}>{routeStateLabel}</strong>
                    {routeMetricCount > 0 ? <span className="text-xs text-muted">{routeMetricCount} 项指标</span> : null}
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
            {reviewMessage ? <p className="mb-3 rounded-md border border-border bg-slate-50 px-3 py-2 text-sm">{reviewMessage}</p> : null}
            {!captureSummary.metrics.length ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">已收到快照，但未识别到标准指标。请确认页面已完整加载；该问题会阻断依赖相关字段的诊断。</p> : null}
            <p className="rounded-md border border-border bg-slate-50 p-3 text-sm text-muted">采集值、来源路线、置信度、表格原值和校准记录统一在任务专属大屏中查看。</p>
          </Card>
        </section>
      ) : null}

      {hasCapture && (reviewComplete || decisionRun || decisionPreview) ? (
        <section className="mb-4 scroll-mt-4" id="diagnosis">
          <Card>
            <div className="mb-4"><p className="mb-1 text-xs font-semibold text-primary">第 4 步</p><CardTitle>诊断与建议</CardTitle><p className="text-sm text-muted">{aiDisclaimer}</p></div>
            <div className="mb-4 grid gap-3 sm:grid-cols-4"><Info label="主体类型" value={subjectTypeLabels[task.project.subjectType]} /><Info label="操盘主体" value={operatorTypeLabels[task.project.operatorType]} /><Info label="合作关系" value={cooperationTypeLabels[task.project.cooperationType]} /><Info label="当前模式" value={managedLiveGrowthMode ? "代直播增长诊断" : task.project.subjectType === "SERVICE_PROVIDER" ? "服务商经营诊断" : "主体框架诊断"} /></div>
            {managedLiveGrowthMode ? <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm"><strong>当前只做代直播增长目标：</strong>诊断流量进入、直播间承接、商品成交、平台活动权益和履约合规；不计算服务商毛利、服务费后 ROI 或平台收益。</div> : null}
            <DiagnosisComparison
              busy={busy}
              decisionRun={decisionRun}
              evidenceAdvisory={formalReady && evidenceAdvisories.length
                ? `${evidenceAdvisories.map((route) => `${route.label}${route.state === "STALE" ? "数据已过期" : "仅部分可见"}`).join("；")}。暂停、加预算或减预算等动作仍需满足各自证据门槛。`
                : null}
              formalContent={diagnosticOutput
                ? <DiagnosisBusinessSummary conservative={!decisionRun} managedLiveGrowthMode={managedLiveGrowthMode} output={diagnosticOutput} />
                : <p className="rounded-md border border-border bg-white p-4 text-sm text-muted">尚未生成正式诊断。完成指标确认后运行正式诊断，系统会输出问题、证据、经营方案和验证指标。</p>}
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

function hasRequiredRealtimeMetricKeys(metrics: Array<{ key: string }>, requiredMetricKeys: readonly string[]) {
  const availableMetricKeys = new Set(metrics.map((metric) => metric.key));
  return requiredMetricKeys.every((metricKey) => availableMetricKeys.has(metricKey));
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <strong>{value}</strong>
    </div>
  );
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
    SYNC_FAILED: "自动连接失败",
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
