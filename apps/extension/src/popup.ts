import type { CollectionRouteKey, CollectionSnapshotPayload } from "@douyin-local-life/shared";
import { collectionRouteLabels, normalizeCollectionRouteKey } from "@douyin-local-life/shared/collection-routes";
import type { ExtensionConfig, ExtensionContext, ExtensionTask } from "./extension-context";
import { MESSAGE } from "./messages";
import { isSupportedExtensionCollectionUrl } from "./safety";
import {
  livePulseButtonState,
  livePulseOutcomeMessage,
  livePulseReasonText,
  livePulseStatusText,
  livePulseMetricCoverage,
  type LivePulseDisplayState
} from "./live-pulse-status";


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
  boundPanel: document.getElementById("boundPanel")!,
  captureResult: document.getElementById("captureResult")!,
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
  sidePanelBtn: document.getElementById("sidePanelBtn") as HTMLButtonElement,
  captureBtn: document.getElementById("captureBtn") as HTMLButtonElement,
  livePulsePanel: document.getElementById("livePulsePanel")!,
  livePulseStatus: document.getElementById("livePulseStatus")!,
  livePulseData: document.getElementById("livePulseData")!,
  livePulseUpdatedAt: document.getElementById("livePulseUpdatedAt")!,
  livePulseCoverage: document.getElementById("livePulseCoverage")!,
  livePulseMissing: document.getElementById("livePulseMissing")!,
  livePulseErrorRow: document.getElementById("livePulseErrorRow")!,
  livePulseLastError: document.getElementById("livePulseLastError")!,
  livePulseBtn: document.getElementById("livePulseBtn") as HTMLButtonElement,
  nextRoute: document.getElementById("nextRoute")!,
  refreshBtn: document.getElementById("refreshBtn") as HTMLButtonElement,
  clearBtn: document.getElementById("clearBtn") as HTMLButtonElement
};
let pairingError: string | null = null;
let livePulsePairingVerified = false;
let livePulseTarget: { tabId: number; currentUrl: string } | null = null;
let livePulseActive = false;

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
  livePulse?: (LivePulseDisplayState & {
    lastSuccessAt?: string | null;
  });
  context?: ExtensionContext | null;
  hasToken?: boolean;
  pendingPairingConfirmation?: {
    apiBaseUrl?: string;
    account: { accountName: string };
    task?: { id: string; pageTitle: string | null; projectName: string } | null;
    expiresAt?: string;
  } | null;
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
};

void render();
void refreshLivePulseStatus();
els.pairBtn.addEventListener("click", pairExtension);
els.confirmPairBtn.addEventListener("click", confirmPairing);
els.cancelPairBtn.addEventListener("click", cancelPairing);
els.selectTaskBtn.addEventListener("click", selectTask);
els.clearPairingBtn.addEventListener("click", clearPairing);
els.sidePanelBtn.addEventListener("click", openSidePanel);
els.captureBtn.addEventListener("click", captureAndUpload);
els.livePulseBtn.addEventListener("click", toggleLivePulse);
els.refreshBtn.addEventListener("click", render);
els.clearBtn.addEventListener("click", clearSnapshot);
window.setInterval(() => void refreshLivePulseStatus(), 1_000);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function render() {
  setStatus("正在检查插件状态", "neutral");
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
  renderTaskOptions(state?.context, state?.config?.collectionTaskId);
  const boundTask = currentTask(state);

  const hasToken = Boolean(state?.hasToken);
  const pendingPairing = state?.pendingPairingConfirmation;
  const hasTask = Boolean(state?.config?.collectionTaskId);
  const pairingVerified = hasToken && hasTask && Boolean(verification?.ok);
  const isExactLiveScreen = /^https:\/\/eos\.douyin\.com\/dp\/liveScreen(?:[/?#]|$)/.test(url);
  const isLocalPromotionPage = /^https:\/\/localads\.chengzijianzhan\.cn\/lamp\/pc\/liveboard2(?:[/?#]|$)/.test(url);
  const internalApiEnabled = state?.context?.liveScreenInternalApi?.enabled === true;
  const livePulseRoomReady = pageContext?.livePulseEligible === true;
  const isLiveApiPage = hasToken && hasTask && isExactLiveScreen;
  const apiContinuousAvailable = isLiveApiPage && internalApiEnabled && livePulseRoomReady;
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
  toggle(els.boundPanel, hasToken && hasTask && isLocalPromotionPage);
  els.captureBtn.disabled = !isLocalPromotionPage || !hasTask || !pairingVerified;
  livePulsePairingVerified = pairingVerified;
  livePulseTarget = tab?.id && apiContinuousAvailable ? { tabId: tab.id, currentUrl: url } : null;
  livePulseActive = state?.livePulse?.active === true;
  els.captureBtn.textContent = "采集并上传数据总览";
  toggle(els.captureBtn, isLocalPromotionPage);
  toggle(els.livePulsePanel, isLiveApiPage);
  els.collectionNotice.textContent = isLiveApiPage
    ? "直播采集只调用已批准的平台内部 API，只上传白名单指标，不读取 DOM 数值补齐。"
    : "本地推采集只读取当前数据总览的可见 DOM、真实表格和白名单指标。";
  els.livePulseStatus.textContent = livePulseStatusText(state?.livePulse, internalApiEnabled);
  renderLivePulseData(state?.livePulse);
  syncLivePulseButton(state);
  els.nextRoute.textContent = nextPendingRouteLabel(state);
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
  } else if (state?.livePulse?.lastOutcome?.failure) {
    setStatus(livePulseOutcomeMessage(state.livePulse.lastOutcome), "error");
  } else {
    setStatus("插件、账号和任务均正常，可以开始采集", "ready");
  }
}

let livePulseStatusRefreshInFlight = false;

async function refreshLivePulseStatus() {
  if (document.visibilityState !== "visible" || livePulseStatusRefreshInFlight) return;
  livePulseStatusRefreshInFlight = true;
  try {
    const state = await runtimeMessage({ type: MESSAGE.GET_STATE });
    const internalApiEnabled = state?.context?.liveScreenInternalApi?.enabled === true;
    els.livePulseStatus.textContent = livePulseStatusText(state?.livePulse, internalApiEnabled);
    renderLivePulseData(state?.livePulse);
    syncLivePulseButton(state);
    if (state?.livePulse?.lastOutcome?.failure) {
      setStatus(livePulseOutcomeMessage(state.livePulse.lastOutcome), "error");
    }
  } catch {
    // The main render path provides the actionable recovery message. Polling is best-effort only.
  } finally {
    livePulseStatusRefreshInFlight = false;
  }
}

function syncLivePulseButton(state: PopupState | null) {
  const pairingVerified = livePulsePairingVerified
    && state?.hasToken === true
    && Boolean(state.config?.collectionTaskId);
  const buttonState = livePulseButtonState(
    state?.livePulse,
    pairingVerified,
    state?.context?.liveScreenInternalApi?.enabled === true
  );
  els.livePulseBtn.textContent = buttonState.text;
  // Starting also requires the exact page context to contain a trusted room ID.
  // Stopping remains available for an already active session.
  els.livePulseBtn.disabled = buttonState.disabled || (!livePulseActive && !livePulseTarget);
}

function renderLivePulseData(livePulse: PopupState["livePulse"]) {
  toggle(els.livePulseData, livePulse?.active === true || Boolean(livePulse?.lastSuccessAt || livePulse?.lastFailureReason || livePulse?.lastOutcome?.failure));
  els.livePulseUpdatedAt.textContent = livePulse?.lastSuccessAt
    ? `最近 ${new Date(livePulse.lastSuccessAt).toLocaleTimeString("zh-CN", { hour12: false })} · 累计 ${livePulse.successCount || 0} 次`
    : "等待首次上传";
  const coverage = livePulseMetricCoverage(livePulse?.lastMetricKeys);
  els.livePulseCoverage.textContent = `核心指标 ${coverage.count}/${coverage.total}`;
  els.livePulseMissing.textContent = coverage.missingLabels.length
    ? `缺少：${coverage.missingLabels.join("、")}`
    : "7 项核心指标已齐全";
  toggle(els.livePulseMissing, Boolean(livePulse?.lastSuccessAt));
  const lastError = livePulse?.lastFailureReason
    ? livePulseReasonText(livePulse.lastFailureReason)
    : livePulse?.lastOutcome?.failure
      ? livePulseOutcomeMessage(livePulse.lastOutcome)
      : "-";
  els.livePulseLastError.textContent = lastError;
  toggle(els.livePulseErrorRow, lastError !== "-");
}

async function toggleLivePulse() {
  const target = livePulseTarget;
  const active = livePulseActive;
  if (!active && !target) {
    setStatus("实时脉冲仅支持当前直播数据大屏页面", "error");
    return;
  }
  els.livePulseBtn.disabled = true;
  let actionMessage = "";
  let actionTone: "ready" | "error" = "ready";
  try {
    const response = await runtimeMessage({
      type: active ? MESSAGE.STOP_LIVE_PULSE : MESSAGE.START_LIVE_PULSE,
      payload: active ? {} : target
    });
    actionMessage = response?.ok
      ? active
          ? "API 持续采集已停止"
          : "API 持续采集已开启；插件会在后台持续上传，关闭弹窗不会停止，网页端实时数据栏会持续更新"
      : chineseError(response?.error, "API 持续采集状态更新失败");
    actionTone = response?.ok ? "ready" : "error";
  } catch {
    actionMessage = "API 持续采集通信中断，请重新加载插件";
    actionTone = "error";
  } finally {
    await render();
    setStatus(actionMessage, actionTone);
  }
}

async function captureAndUpload() {
  const tab = await activeTab().catch(() => undefined);
  if (!tab?.id || !isCollectable(tab.url || "")) {
    setStatus("当前页面不在允许采集的域名白名单中", "error");
    return;
  }
  els.captureBtn.disabled = true;
  els.captureBtn.textContent = "正在采集并上传...";
  hideCaptureResult();
  try {
    const response = await runtimeMessage({
      type: MESSAGE.CAPTURE_AND_UPLOAD,
      payload: {
        tabId: tab.id,
        currentUrl: tab.url || ""
      }
    });
    if (!response?.ok) {
      setStatus(chineseError(response?.error, "采集或上传失败，请稍后重试"), "error");
      showCaptureResult(chineseError(response?.error, "采集或上传失败，请稍后重试"), false);
      return;
    }
    const skippedMessage = response.skipped ? "数据未变化，已保留上次上传" : "快照已上传";
    const recognizedMetricCount = response.recognizedMetricCount ?? response.metricCount ?? 0;
    const missingMetricCount = response.missingMetricCount ?? Math.max(0, recognizedMetricCount - (response.metricCount || 0));
    setStatus("采集完成，网页任务页会自动更新", "ready");
    showCaptureResult(
      `${skippedMessage}；${captureSourceLabel(response.captureSource, response.apiEndpointSuccessCount)}；识别 ${recognizedMetricCount} 个字段，其中 ${response.metricCount || 0} 个有原值、${missingMetricCount} 个缺失；覆盖率 ${formatPercent(response.coverageRatio)}。`,
      true
    );
  } catch {
    setStatus("插件通信中断，请重新加载插件和目标页面", "error");
    showCaptureResult("插件通信中断，请重新加载插件和目标页面。", false);
  } finally {
    els.captureBtn.textContent = "采集并上传数据总览";
    await render();
  }
}

function captureSourceLabel(source: PopupRuntimeResponse["captureSource"], apiEndpointSuccessCount = 0) {
  if (source === "API") return `API 采集（${apiEndpointSuccessCount} 个端点成功）`;
  if (source === "API_AND_DOM") return `API 优先并保留 DOM 对账（${apiEndpointSuccessCount} 个端点成功）`;
  if (source === "API_FAILED_DOM_FALLBACK") return "API 已尝试但没有可用端点，已明确回退 DOM";
  return "DOM 采集（当前路线无可用 API 证据）";
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
  hideCaptureResult();
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
  hideCaptureResult();
  await render();
}

function setStatus(message: string, tone: "neutral" | "ready" | "warning" | "error") {
  els.status.textContent = message;
  els.statusDot.className = `status-dot${tone === "neutral" ? "" : ` ${tone}`}`;
}

function toggle(element: HTMLElement, visible: boolean) {
  element.classList.toggle("hidden", !visible);
}

function showCaptureResult(message: string, success: boolean) {
  els.captureResult.textContent = message;
  els.captureResult.className = `panel ${success ? "success" : "error-box"}`;
}

function hideCaptureResult() {
  els.captureResult.className = "panel success hidden";
  els.captureResult.textContent = "";
}

function isCollectable(url: string) {
  return isSupportedExtensionCollectionUrl(url);
}

function inferPageTypeFromUrl(url: string) {
  if (/^https:\/\/eos\.douyin\.com\/dp\/liveScreen(?:[/?#]|$)/.test(url)) return "LIVE_DATA_SCREEN";
  if (/^https:\/\/localads\.chengzijianzhan\.cn\/lamp\/pc\/liveboard2(?:[/?#]|$)/.test(url)) return "LOCAL_PROMOTION_DASHBOARD";
  return "UNKNOWN";
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

function nextPendingRouteLabel(state: PopupState | null | undefined) {
  const task = currentTask(state);
  const routes = formalSnapshotRoutes(task);
  if (!task || !routes.length) return "等待任务信息";
  const route = routes[0]!;
  return Number(state?.routeUploadState?.[route.routeKey]?.lastUploadAt || 0) > 0
    ? "已有成功记录，可重新采集"
    : "尚未采集";
}

function formalSnapshotRoutes(task: ExtensionTask | null | undefined) {
  return (task?.routeSources || []).filter((route) => {
    const routeKey = normalizeCollectionRouteKey(route.routeKey);
    return routeKey === "LOCAL_PROMOTION_DASHBOARD";
  });
}

function currentTask(state: PopupState | null | undefined) {
  const taskId = state?.config?.collectionTaskId;
  return state?.context?.account?.projects
    ?.flatMap((project) => project.tasks)
    .find((item) => item.id === taskId) || null;
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

function formatPercent(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "待确认";
}

function chineseError(value: unknown, fallback: string) {
  const message = typeof value === "string" ? value.trim() : "";
  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "无法连接诊断服务，请检查 API 是否运行";
  if (/receiving end does not exist|could not establish connection/i.test(message)) return "插件尚未注入当前页面，请刷新目标网页后重试";
  return message;
}
