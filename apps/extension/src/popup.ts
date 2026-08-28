import type { CollectionRouteKey, CollectionSnapshotPayload } from "@douyin-local-life/shared";
import { collectionRouteLabels, normalizeCollectionRouteKey } from "@douyin-local-life/shared/collection-routes";
import type { ExtensionConfig, ExtensionContext } from "./extension-context";
import { MESSAGE } from "./messages";
import { isSupportedExtensionCollectionUrl } from "./safety";
import {
  livePulseButtonState,
  livePulseOutcomeMessage,
  livePulseReasonText,
  livePulseStatusText,
  livePulseMetricCoverage,
  localPromotionPulseMetricCoverage,
  type LivePulseDisplayState
} from "./live-pulse-status";
import { localPromotionPulseCadenceMs } from "./live-pulse-schedule";


const els = {
  status: document.getElementById("status")!,
  statusDot: document.getElementById("statusDot")!,
  currentUrl: document.getElementById("currentUrl")!,
  pageType: document.getElementById("pageType")!,
  routeKey: document.getElementById("routeKey")!,
  collectionNotice: document.getElementById("collectionNotice")!,
  hasToken: document.getElementById("hasToken")!,
  taskId: document.getElementById("taskId")!,
  accountName: document.getElementById("accountName")!,
  projectName: document.getElementById("projectName")!,
  collectionRunId: document.getElementById("collectionRunId")!,
  extensionBuild: document.getElementById("extensionBuild")!,
  snapshot: document.getElementById("snapshot")!,
  pairingPanel: document.getElementById("pairingPanel")!,
  pairingConfirmationPanel: document.getElementById("pairingConfirmationPanel")!,
  taskPanel: document.getElementById("taskPanel")!,
  pairingCode: document.getElementById("pairingCode") as HTMLInputElement,
  apiBaseUrl: document.getElementById("apiBaseUrl") as HTMLInputElement,
  pairBtn: document.getElementById("pairBtn") as HTMLButtonElement,
  confirmPairBtn: document.getElementById("confirmPairBtn") as HTMLButtonElement,
  cancelPairBtn: document.getElementById("cancelPairBtn") as HTMLButtonElement,
  pendingPairServer: document.getElementById("pendingPairServer")!,
  pendingPairAccount: document.getElementById("pendingPairAccount")!,
  pendingPairTask: document.getElementById("pendingPairTask")!,
  pendingPairExpiresAt: document.getElementById("pendingPairExpiresAt")!,
  taskSelect: document.getElementById("taskSelect") as HTMLSelectElement,
  selectTaskBtn: document.getElementById("selectTaskBtn") as HTMLButtonElement,
  clearPairingBtn: document.getElementById("clearPairingBtn") as HTMLButtonElement,
  logs: document.getElementById("logs")!,
  copyLogsBtn: document.getElementById("copyLogsBtn") as HTMLButtonElement,
  sidePanelBtn: document.getElementById("sidePanelBtn") as HTMLButtonElement,
  livePulsePanel: document.getElementById("livePulsePanel")!,
  livePulseTitle: document.getElementById("livePulseTitle")!,
  livePulseStatus: document.getElementById("livePulseStatus")!,
  livePulseData: document.getElementById("livePulseData")!,
  livePulseUpdatedAt: document.getElementById("livePulseUpdatedAt")!,
  livePulseCoverage: document.getElementById("livePulseCoverage")!,
  livePulseCollected: document.getElementById("livePulseCollected")!,
  livePulseMissing: document.getElementById("livePulseMissing")!,
  livePulseErrorRow: document.getElementById("livePulseErrorRow")!,
  livePulseLastError: document.getElementById("livePulseLastError")!,
  livePulseBtn: document.getElementById("livePulseBtn") as HTMLButtonElement,
  refreshBtn: document.getElementById("refreshBtn") as HTMLButtonElement,
  clearBtn: document.getElementById("clearBtn") as HTMLButtonElement
};
let pairingError: string | null = null;
let livePulsePairingVerified = false;
let livePulseTarget: { tabId: number; currentUrl: string; routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD" } | null = null;
let livePulseActive = false;
let currentPagePulse: PopupState["livePulse"] = undefined;
let currentPagePulseRoute: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD" | null = null;
let popupRenderGeneration = 0;
let livePulseActionInFlight = false;

type PopupPulse = LivePulseDisplayState & {
  routeKey?: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD";
  tabId?: number;
  lastSuccessAt?: string | null;
};

type PopupState = {
  config?: ExtensionConfig;
  latestSnapshot?: CollectionSnapshotPayload | null;
  routeUploadState?: Record<string, { lastUploadAt?: number }>;
  pageActivity?: {
    tabId?: number;
    currentUrl?: string;
    pageType?: CollectionSnapshotPayload["pageType"];
    routeKey?: CollectionRouteKey;
  } | null;
  activeCollectionSession?: { collectionRunId?: string } | null;
  livePulse?: PopupPulse;
  livePulses?: PopupPulse[];
  context?: ExtensionContext | null;
  hasToken?: boolean;
  pendingPairingConfirmation?: {
    apiBaseUrl?: string;
    account: { accountName: string };
    task?: { id: string; pageTitle: string | null; projectName: string } | null;
    expiresAt?: string;
  } | null;
  logs?: Array<{ action?: unknown; detail?: unknown; createdAt?: unknown }>;
};

type PopupRuntimeResponse = PopupState & {
  ok?: boolean;
  error?: unknown;
  state?: PopupState;
  config?: ExtensionConfig;
  skipped?: boolean;
  metricCount?: number;
  recognizedMetricCount?: number;
  missingMetricCount?: number;
  captureSource?: "API" | "API_AND_DOM" | "API_FAILED_DOM_FALLBACK" | "DOM";
  apiEndpointSuccessCount?: number;
  coverageRatio?: number | null;
};

type PageContextResponse = {
  ok?: boolean;
  currentUrl?: string;
  pageType?: CollectionSnapshotPayload["pageType"];
  routeKey?: CollectionRouteKey;
  livePulseEligible?: boolean;
  livePulseRoomId?: string | null;
  livePulseFailureCode?: "ROOM_ID_UNAVAILABLE" | null;
  localPromotionPulseEligible?: boolean;
  localPromotionPulseFailureCode?: "IDENTITY_UNAVAILABLE" | null;
};

void render();
void refreshLivePulseStatus();
els.pairBtn.addEventListener("click", pairExtension);
els.confirmPairBtn.addEventListener("click", confirmPairing);
els.cancelPairBtn.addEventListener("click", cancelPairing);
els.selectTaskBtn.addEventListener("click", selectTask);
els.clearPairingBtn.addEventListener("click", clearPairing);
els.sidePanelBtn.addEventListener("click", openSidePanel);
els.livePulseBtn.addEventListener("click", toggleLivePulse);
els.refreshBtn.addEventListener("click", render);
els.clearBtn.addEventListener("click", clearSnapshot);
els.copyLogsBtn.addEventListener("click", copyRecentCollectionLogs);
window.setInterval(() => void refreshLivePulseStatus(), 1_000);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function render() {
  const renderGeneration = ++popupRenderGeneration;
  if (!livePulseActionInFlight) setStatus("正在检查插件状态", "neutral");
  const [tabResult, stateResult] = await Promise.allSettled([
    activeTab(),
    runtimeMessage({ type: MESSAGE.GET_STATE })
  ]);
  const tab = tabResult.status === "fulfilled" ? tabResult.value : undefined;
  const initialState = stateResult.status === "fulfilled" ? stateResult.value : null;
  const verification = initialState?.hasToken && initialState?.config?.collectionTaskId
    ? await runtimeMessage({ type: MESSAGE.VERIFY_BOUND_CONTEXT }).catch((error): PopupRuntimeResponse => ({
        ok: false,
        error: error instanceof Error ? error.message : "本机 API 配对校验失败"
      }))
    : null;
  const state = verification?.ok && verification.state ? verification.state : initialState;
  const url = tab?.url || "";
  const collectable = isCollectable(url);
  const currentActivity = state?.pageActivity?.tabId === tab?.id && state?.pageActivity?.currentUrl === url ? state.pageActivity : null;
  const pageContext = tab?.id && collectable
    ? await contentMessage(tab.id, { type: MESSAGE.GET_PAGE_CONTEXT }).catch(() => null)
    : null;
  const routeKey = normalizeCollectionRouteKey(pageContext?.routeKey || currentActivity?.routeKey);

  // Popup renders can overlap with a start/stop request. Only the newest render
  // may write controls; an older verification response must not roll the
  // button back to the state it observed before the user's click.
  if (renderGeneration !== popupRenderGeneration) return;

  els.currentUrl.textContent = url || "无法读取，请重新打开插件";
  const currentPageType = pageTypeLabel(pageContext?.pageType || currentActivity?.pageType || inferPageTypeFromUrl(url));
  const currentRouteLabel = routeLabel(routeKey);
  els.pageType.textContent = currentPageType;
  els.routeKey.textContent = currentRouteLabel;
  els.taskId.textContent = state?.config?.collectionTaskId || "尚未绑定任务";
  els.accountName.textContent = state?.config?.accountName || "未绑定";
  els.projectName.textContent = state?.config?.projectName || "未绑定";
  els.collectionRunId.textContent = state?.activeCollectionSession?.collectionRunId || "-";
  els.extensionBuild.textContent = `${chrome.runtime.getManifest().version} / ${__PXXIS_EXTENSION_BUILD__}`;
  els.snapshot.textContent = state?.latestSnapshot
    ? JSON.stringify({
        pageType: state.latestSnapshot.pageType,
        routeKey: state.latestSnapshot.routeKey,
        metricCount: state.latestSnapshot.visibleMetricsJson?.length || 0,
        capturedAt: state.latestSnapshot.localCollectedAt,
        routeUploadState: state.routeUploadState || {}
      }, null, 2)
    : "暂无本地快照";
  els.logs.textContent = formatRecentCollectionLogs(state?.logs);
  renderTaskOptions(state?.context, state?.config?.collectionTaskId);
  const hasToken = Boolean(state?.hasToken);
  const pendingPairing = state?.pendingPairingConfirmation;
  const hasTask = Boolean(state?.config?.collectionTaskId);
  const pairingVerified = hasToken && hasTask && Boolean(verification?.ok);
  const pagePulseRoute = pulseRouteForUrl(url);
  const isExactLiveScreen = pagePulseRoute === "LIVE_DATA_SCREEN";
  const isLocalPromotionPage = pagePulseRoute === "LOCAL_PROMOTION_DASHBOARD";
  const internalApiEnabled = state?.context?.liveScreenInternalApi?.enabled === true;
  const localPromotionInternalApiEnabled = state?.context?.localPromotionInternalApi?.enabled === true;
  const livePulseRoomReady = pageContext?.livePulseEligible === true;
  const localPromotionIdentityReady = pageContext?.localPromotionPulseEligible === true;
  const isLiveApiPage = hasToken && hasTask && isExactLiveScreen;
  const isLocalPromotionApiPage = hasToken && hasTask && isLocalPromotionPage;
  const pulseTargetRoute = isLiveApiPage ? "LIVE_DATA_SCREEN" : isLocalPromotionApiPage ? "LOCAL_PROMOTION_DASHBOARD" : null;
  const apiContinuousAvailable = (isLiveApiPage && internalApiEnabled && livePulseRoomReady)
    || (isLocalPromotionApiPage && localPromotionInternalApiEnabled && localPromotionIdentityReady);
  els.hasToken.textContent = !hasToken
    ? "尚未配对"
    : !hasTask
      ? "已有本机凭证，选择任务后校验"
      : pairingVerified
        ? "已向本机 API 校验"
        : "本机 API 校验失败";
  toggle(els.pairingPanel, !hasToken || (hasTask && !pairingVerified));
  // A new task pairing still requires an explicit confirmation when the account is already paired.
  toggle(els.pairingConfirmationPanel, Boolean(pendingPairing));
  toggle(els.taskPanel, hasToken && !hasTask);
  livePulsePairingVerified = pairingVerified;
  livePulseTarget = tab?.id && apiContinuousAvailable && pulseTargetRoute ? { tabId: tab.id, currentUrl: url, routeKey: pulseTargetRoute } : null;
  currentPagePulseRoute = pagePulseRoute;
  currentPagePulse = pulseForCurrentPage(state?.livePulse, tab?.id, pagePulseRoute, state?.livePulses);
  livePulseActive = currentPagePulse?.active === true;
  toggle(els.livePulsePanel, isLiveApiPage || isLocalPromotionApiPage);
  els.livePulseTitle.textContent = isLocalPromotionPage ? "巨量本地推 API 采集" : "直播 API 采集";
  els.collectionNotice.textContent = isLiveApiPage
    ? "直播采集只调用已批准的平台内部 API，只上传白名单指标，不读取 DOM 数值补齐。"
    : "本地推只调用已批准的平台内部 API 持续采集，不读取 DOM 数值，也不创建快照。";
  const currentPulseRoute = pagePulseRoute || pulseTargetRoute;
  const currentApiEnabled = currentPulseRoute === "LOCAL_PROMOTION_DASHBOARD" ? localPromotionInternalApiEnabled : internalApiEnabled;
  els.livePulseStatus.textContent = livePulseStatusText(currentPagePulse, currentApiEnabled);
  renderLivePulseData(currentPagePulse, currentPulseRoute);
  syncLivePulseButton(currentPagePulse, currentApiEnabled);
  els.pendingPairServer.textContent = pendingPairing?.apiBaseUrl || "-";
  els.pendingPairAccount.textContent = pendingPairing
    ? pendingPairing.account.accountName
    : "-";
  els.pendingPairTask.textContent = pendingPairing?.task
    ? `${pendingPairing.task.projectName} / ${pendingPairing.task.pageTitle || pendingPairing.task.id}`
    : "未绑定具体任务";
  els.pendingPairExpiresAt.textContent = pendingPairing?.expiresAt ? new Date(pendingPairing.expiresAt).toLocaleTimeString("zh-CN") : "-";

  if (!state) {
    setStatus("插件后台状态读取失败，请在扩展管理页重新加载插件", "error");
  } else if (!hasToken && pendingPairing) {
    setStatus(pairingError || "请在 Popup 核对服务器、账号和任务，再确认配对", pairingError ? "error" : "warning");
  } else if (!hasToken) {
    setStatus("插件运行正常，请输入任务页生成的配对码", "warning");
  } else if (!hasTask) {
    setStatus("账号已配对，请选择采集任务", "warning");
  } else if (!pairingVerified) {
    setStatus(chineseError(verification?.error, "本机 API 未确认当前账号与任务，请重新配对"), "error");
  } else if (!collectable) {
    setStatus("请打开巨量本地推数据页或直播数据大屏", "warning");
  } else if (isExactLiveScreen && pageContext?.livePulseFailureCode === "ROOM_ID_UNAVAILABLE") {
    setStatus("当前直播页未提供可信 room_id；未启动 API 采集，也不会改用 DOM。请确认已打开具体直播场次。", "error");
  } else if (isLocalPromotionPage && pageContext?.localPromotionPulseFailureCode === "IDENTITY_UNAVAILABLE") {
    setStatus("当前本地推页面缺少可信广告身份；API 持续采集保持关闭，也不会改用 DOM 快照。", "error");
  } else if (currentPagePulse?.lastOutcome?.failure) {
    setStatus(livePulseOutcomeMessage(currentPagePulse.lastOutcome), "error");
  } else {
    setStatus("插件、账号和任务均正常，可以开始采集", "ready");
  }
}

let livePulseStatusRefreshInFlight = false;

async function refreshLivePulseStatus() {
  if (document.visibilityState !== "visible" || livePulseStatusRefreshInFlight || livePulseActionInFlight) return;
  const refreshGeneration = popupRenderGeneration;
  livePulseStatusRefreshInFlight = true;
  try {
    const [state, tab] = await Promise.all([runtimeMessage({ type: MESSAGE.GET_STATE }), activeTab()]);
    if (livePulseActionInFlight || refreshGeneration !== popupRenderGeneration) return;
    const routeKey = pulseRouteForUrl(tab?.url || "");
    if (routeKey !== currentPagePulseRoute) {
      await render();
      return;
    }
    currentPagePulse = pulseForCurrentPage(state?.livePulse, tab?.id, routeKey, state?.livePulses);
    livePulseActive = currentPagePulse?.active === true;
    const internalApiEnabled = routeKey === "LOCAL_PROMOTION_DASHBOARD"
      ? state?.context?.localPromotionInternalApi?.enabled === true
      : state?.context?.liveScreenInternalApi?.enabled === true;
    els.livePulseStatus.textContent = livePulseStatusText(currentPagePulse, internalApiEnabled);
    renderLivePulseData(currentPagePulse, routeKey);
    syncLivePulseButton(currentPagePulse, internalApiEnabled);
    if (currentPagePulse?.lastOutcome?.failure) {
      setStatus(livePulseOutcomeMessage(currentPagePulse.lastOutcome), "error");
    }
  } catch {
    // The main render path provides the actionable recovery message. Polling is best-effort only.
  } finally {
    livePulseStatusRefreshInFlight = false;
  }
}

function syncLivePulseButton(livePulse: PopupState["livePulse"], internalApiEnabled: boolean) {
  const pairingVerified = livePulsePairingVerified
    && Boolean(livePulseTarget || livePulse?.active);
  const buttonState = livePulseButtonState(
    livePulse,
    pairingVerified,
    internalApiEnabled
  );
  els.livePulseBtn.textContent = buttonState.text;
  // Starting also requires the exact page context to contain a trusted room ID.
  // Stopping remains available for an already active session.
  els.livePulseBtn.disabled = buttonState.disabled || (!livePulseActive && !livePulseTarget);
}

function renderLivePulseData(livePulse: PopupState["livePulse"], routeKey?: string | null) {
  toggle(els.livePulseData, livePulse?.active === true || Boolean(livePulse?.lastSuccessAt || livePulse?.lastFailureReason || livePulse?.lastOutcome?.failure));
  els.livePulseUpdatedAt.textContent = livePulse?.lastSuccessAt
    ? `最近 ${new Date(livePulse.lastSuccessAt).toLocaleTimeString("zh-CN", { hour12: false })} · 累计 ${livePulse.successCount || 0} 次`
    : "等待首次上传";
  const coverage = routeKey === "LOCAL_PROMOTION_DASHBOARD"
    ? localPromotionPulseMetricCoverage(livePulse?.lastMetricKeys)
    : livePulseMetricCoverage(livePulse?.lastMetricKeys);
  els.livePulseCoverage.textContent = `核心指标 ${coverage.count}/${coverage.total}`;
  const hasObservation = Boolean(livePulse?.lastSuccessAt || livePulse?.lastFailureReason || livePulse?.lastOutcome?.failure);
  els.livePulseCollected.textContent = coverage.presentLabels.length
    ? `已采到：${coverage.presentLabels.join("、")}（平台 API）`
    : "本轮未采到可信指标";
  toggle(els.livePulseCollected, hasObservation && coverage.presentLabels.length > 0);
  els.livePulseMissing.textContent = coverage.missingLabels.length
    ? `${livePulse?.lastSuccessAt ? "缺少" : "本轮未采到"}：${coverage.missingLabels.join("、")}`
    : `${coverage.total} 项核心指标已齐全`;
  toggle(els.livePulseMissing, hasObservation);
  const lastError = livePulse?.lastFailureReason
    ? livePulseReasonText(livePulse.lastFailureReason)
    : livePulse?.lastOutcome?.failure
      ? livePulseOutcomeMessage(livePulse.lastOutcome)
      : "-";
  els.livePulseLastError.textContent = lastError;
  toggle(els.livePulseErrorRow, lastError !== "-");
}

function formatRecentCollectionLogs(logs: PopupState["logs"]) {
  const entries = (logs || [])
    .filter((entry) => typeof entry.action === "string" && /^(?:live_pulse|local_promotion_pulse)\./.test(entry.action))
    .slice(0, 10)
    .map((entry) => {
      const timestamp = typeof entry.createdAt === "string" ? new Date(entry.createdAt).toLocaleTimeString("zh-CN", { hour12: false }) : "--:--:--";
      const action = String(entry.action);
      const detail = formatSafeLogDetail(entry.detail);
      return `${timestamp} ${action}${detail ? ` · ${detail}` : ""}`;
    });
  return entries.length ? entries.join("\n") : "暂无采集日志";
}

async function copyRecentCollectionLogs() {
  const text = els.logs.textContent || "暂无采集日志";
  try {
    await navigator.clipboard.writeText(text);
    setStatus("采集日志已复制，可直接粘贴给我", "ready");
  } catch {
    setStatus("复制失败，请直接截图高级设置中的采集日志", "warning");
  }
}

function formatSafeLogDetail(detail: unknown) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return "";
  const record = detail as Record<string, unknown>;
  const allowedKeys = ["endpoint", "reason", "lastFailureReason", "consecutiveFailures", "metricCount", "status", "ok"];
  const scalarParts = allowedKeys
    .filter((key) => typeof record[key] === "string" || typeof record[key] === "number" || typeof record[key] === "boolean")
    .map((key) => {
      const value = String(record[key]);
      const display = key === "reason" || key === "lastFailureReason"
        ? formatCollectionReason(value)
        : value;
      return `${key}=${display}`;
    })
  const missing = Array.isArray(record.missingMetricKeys)
    ? record.missingMetricKeys.filter((key): key is string => typeof key === "string").slice(0, 8)
    : [];
  if (missing.length) scalarParts.push(`missing=${missing.join(",")}`);
  const fallback = record.statQueryFallback;
  if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
    const fallbackRecord = fallback as Record<string, unknown>;
    const succeeded = fallbackRecord.succeeded === true ? "success" : "failed";
    const failureReason = typeof fallbackRecord.failureReason === "string"
      ? `/${formatCollectionReason(fallbackRecord.failureReason)}`
      : "";
    scalarParts.push(`v3=${succeeded}${failureReason}`);
  }
  const groups = Array.isArray(record.metadataGroups)
    ? record.metadataGroups
      .filter((group): group is { groupKey?: unknown; labels?: unknown } => Boolean(group) && typeof group === "object")
      .slice(0, 6)
      .map((group) => {
        const groupKey = typeof group.groupKey === "string" ? group.groupKey : "?";
        const labels = Array.isArray(group.labels)
          ? group.labels.filter((label): label is string => typeof label === "string").slice(0, 12)
          : [];
        return `${groupKey}[${labels.join("|")}]`;
      })
    : [];
  if (groups.length) scalarParts.push(`labels=${groups.join(" ")}`);
  const endpoints = Array.isArray(record.endpointStatuses)
    ? record.endpointStatuses
      .filter((item): item is { endpoint?: unknown; status?: unknown; reason?: unknown } => Boolean(item) && typeof item === "object")
      .slice(0, 3)
      .map((item) => {
        const endpoint = typeof item.endpoint === "string" ? item.endpoint : "?";
        const status = typeof item.status === "string" ? item.status : "?";
        const reason = typeof item.reason === "string" ? `/${formatCollectionReason(item.reason)}` : "";
        return `${endpoint}=${status}${reason}`;
      })
    : [];
  if (endpoints.length) scalarParts.push(`endpoints=${endpoints.join(",")}`);
  return scalarParts.join(" ");
}

function formatCollectionReason(reason: string) {
  if (reason === "V3_FALLBACK") return "已切换备用 v3 接口（V3_FALLBACK）";
  if (reason === "PARTIAL_METRICS") return "部分可信指标成功（PARTIAL_METRICS）";
  return livePulseReasonText(reason);
}

async function toggleLivePulse() {
  if (livePulseActionInFlight) return;
  const target = livePulseTarget;
  const active = livePulseActive;
  if (!active && !target) {
    setStatus("实时脉冲仅支持当前直播数据大屏或本地推数据总览精确页面", "error");
    return;
  }
  livePulseActionInFlight = true;
  // Invalidate any render that started before this click. Its eventual
  // response is stale even if it finishes after the start/stop request.
  popupRenderGeneration += 1;
  els.livePulseBtn.disabled = true;
  let actionMessage = "";
  let actionTone: "ready" | "error" = "ready";
  try {
    const routeKey = target?.routeKey || currentPagePulseRoute;
    if (!routeKey) {
      actionMessage = "当前页面不是可持续采集的路线";
      actionTone = "error";
      return;
    }
    const localPromotion = routeKey === "LOCAL_PROMOTION_DASHBOARD";
    const response = await runtimeMessage({
      type: active
        ? localPromotion ? MESSAGE.STOP_LOCAL_PROMOTION_PULSE : MESSAGE.STOP_LIVE_PULSE
        : localPromotion ? MESSAGE.START_LOCAL_PROMOTION_PULSE : MESSAGE.START_LIVE_PULSE,
      payload: active ? { tabId: currentPagePulse?.tabId || target?.tabId } : target
    });
    actionMessage = response?.ok
      ? active
          ? "API 持续采集已停止"
          : localPromotion
            ? `本地推 API 持续采集已开启；为避免平台限流，每 ${localPromotionPulseCadenceMs / 1_000} 秒采集一次，关闭弹窗不会停止。`
            : "API 持续采集已开启；插件会在后台持续上传，关闭弹窗不会停止，网页端实时数据栏会持续更新"
      : chineseError(response?.error, "API 持续采集状态更新失败");
    actionTone = response?.ok ? "ready" : "error";
  } catch {
    actionMessage = "API 持续采集通信中断，请重新加载插件";
    actionTone = "error";
  } finally {
    try {
      await render();
      // A start request returns before the content script finishes its first
      // pulse. If that first pulse has already stopped the session, retain its
      // fixed endpoint/reason instead of overwriting it with a success toast.
      if (currentPagePulse?.lastOutcome?.failure) {
        setStatus(livePulseOutcomeMessage(currentPagePulse.lastOutcome), "error");
      } else if (actionMessage) {
        setStatus(actionMessage, actionTone);
      }
    } finally {
      livePulseActionInFlight = false;
    }
  }
}

async function pairExtension() {
  const code = els.pairingCode.value.trim();
  if (!/^\d{6}$/.test(code)) {
    setStatus("请输入任务页生成的六位配对码", "error");
    return;
  }
  els.pairBtn.disabled = true;
  pairingError = null;
  try {
    const response = await runtimeMessage({
      type: MESSAGE.REQUEST_PAIRING_CONFIRMATION,
      payload: { apiBaseUrl: els.apiBaseUrl.value.trim(), code }
    });
    if (!response?.ok) {
      setStatus(chineseError(response?.error, "配对失败，请在任务页重新生成配对码"), "error");
      return;
    }
    els.pairingCode.value = "";
    setStatus("请核对下方的服务器、账号和任务，再确认配对", "warning");
  } catch (error) {
    const message = error instanceof Error && /超时/.test(error.message)
      ? "插件后台响应超时，请在扩展管理页重新加载插件"
      : "无法连接诊断服务，请确认 API 正常运行";
    setStatus(message, "error");
  } finally {
    els.pairBtn.disabled = false;
    await render();
  }
}

async function confirmPairing() {
  els.confirmPairBtn.disabled = true;
  try {
    const response = await runtimeMessage({ type: MESSAGE.CONFIRM_PAIRING });
    if (!response?.ok) {
      pairingError = chineseError(response?.error, "配对失败，请在任务页重新生成配对码");
      setStatus(pairingError, "error");
      return;
    }
    pairingError = null;
    setStatus(response.config?.collectionTaskId ? "账号和当前任务已安全绑定" : "账号已配对，请选择采集任务", response.config?.collectionTaskId ? "ready" : "warning");
  } catch {
    pairingError = "插件后台响应超时，请在扩展管理页重新加载插件";
    setStatus(pairingError, "error");
  } finally {
    els.confirmPairBtn.disabled = false;
    await render();
  }
}

async function cancelPairing() {
  const response = await runtimeMessage({ type: MESSAGE.CANCEL_PAIRING });
  pairingError = null;
  setStatus(response?.ok ? "已取消待确认配对" : chineseError(response?.error, "取消待确认配对失败"), response?.ok ? "warning" : "error");
  await render();
}

async function selectTask() {
  if (!els.taskSelect.value) {
    setStatus("当前账号暂无可用任务，请先在网页创建采集任务", "error");
    return;
  }
  const response = await runtimeMessage({ type: MESSAGE.SELECT_TASK, payload: { collectionTaskId: els.taskSelect.value } });
  setStatus(response?.ok ? `已绑定项目：${response.config?.projectName || "未命名项目"}` : chineseError(response?.error, "任务切换失败"), response?.ok ? "ready" : "error");
  await render();
}

async function clearPairing() {
  const response = await runtimeMessage({ type: MESSAGE.CLEAR_PAIRING });
  setStatus(response?.ok ? "已解除本地绑定；服务端授权可在账号档案中撤销" : chineseError(response?.error, "解除绑定失败"), response?.ok ? "warning" : "error");
  await render();
}

function renderTaskOptions(context: ExtensionContext | null | undefined, selectedTaskId?: string) {
  const options: HTMLOptionElement[] = [];
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = context?.account ? "请选择该账号下的采集任务" : "请先配对账号";
  options.push(placeholder);
  for (const project of context?.account?.projects || []) {
    for (const task of project.tasks || []) {
      const option = document.createElement("option");
      option.value = task.id;
      option.textContent = `${project.name} / ${task.pageTitle || "未命名任务"}`;
      option.selected = task.id === selectedTaskId;
      options.push(option);
    }
  }
  els.taskSelect.replaceChildren(...options);
}

async function openSidePanel() {
  await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  window.close();
}

async function clearSnapshot() {
  await runtimeMessage({ type: MESSAGE.CLEAR_SNAPSHOT });
  setStatus("本地快照已清空", "warning");
  await render();
}

function setStatus(message: string, tone: "neutral" | "ready" | "warning" | "error") {
  els.status.textContent = message;
  els.statusDot.className = `status-dot${tone === "neutral" ? "" : ` ${tone}`}`;
}

function toggle(element: HTMLElement, visible: boolean) {
  element.classList.toggle("hidden", !visible);
}

function isCollectable(url: string) {
  return isSupportedExtensionCollectionUrl(url);
}

function pulseRouteForUrl(url: string): "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD" | null {
  if (/^https:\/\/eos\.douyin\.com\/dp\/liveScreen(?:[/?#]|$)/.test(url)) return "LIVE_DATA_SCREEN";
  if (/^https:\/\/localads\.chengzijianzhan\.cn\/lamp\/pc\/liveboard2(?:[/?#]|$)/.test(url)) return "LOCAL_PROMOTION_DASHBOARD";
  return null;
}

function pulseForCurrentPage(
  livePulse: PopupState["livePulse"],
  tabId: number | undefined,
  routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD" | null,
  livePulses: PopupState["livePulses"] = []
) {
  if (!routeKey || !Number.isInteger(tabId)) return { active: false };
  const pagePulse = livePulses.find((candidate) => (
    candidate?.routeKey === routeKey
    && candidate.tabId === tabId
  ));
  if (pagePulse) return pagePulse;
  const belongsToCurrentPage = livePulse?.routeKey === routeKey && livePulse.tabId === tabId;
  const outcomeBelongsToCurrentPage = livePulse?.lastOutcome?.routeKey === routeKey && livePulse.lastOutcome.tabId === tabId;
  return belongsToCurrentPage || outcomeBelongsToCurrentPage
    ? livePulse
    : { active: false };
}

function inferPageTypeFromUrl(url: string) {
  return pulseRouteForUrl(url) || "UNKNOWN";
}

function pageTypeLabel(value: string) {
  const labels: Record<string, string> = {
    LIVE_DATA_SCREEN: "直播数据大屏",
    LOCAL_PROMOTION_DASHBOARD: "巨量本地推数据页",
    TASK_TABLE: "当前页面不采集",
    UNKNOWN: "尚未识别"
  };
  return labels[value] || value;
}

function routeLabel(routeKey: CollectionRouteKey) {
  return collectionRouteLabels[routeKey] || (routeKey === "UNKNOWN" ? "尚未识别" : routeKey);
}

function runtimeMessage(message: unknown, timeoutMs = 5_000): Promise<PopupRuntimeResponse> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("插件后台响应超时")), timeoutMs);
    chrome.runtime.sendMessage(message).then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });
}

function contentMessage(tabId: number, message: unknown, timeoutMs = 5_000): Promise<PageContextResponse> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("页面探测超时")), timeoutMs);
    chrome.tabs.sendMessage(tabId, message).then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });
}

function chineseError(value: unknown, fallback: string) {
  const message = typeof value === "string" ? value.trim() : "";
  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "无法连接诊断服务，请检查 API 是否运行";
  if (/receiving end does not exist|could not establish connection/i.test(message)) return "插件尚未注入当前页面，请刷新目标网页后重试";
  return message;
}
