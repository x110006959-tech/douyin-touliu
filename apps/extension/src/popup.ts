import type { CollectionRouteKey } from "@douyin-local-life/shared";
import { collectionRouteLabels, normalizeCollectionRouteKey } from "@douyin-local-life/shared/collection-routes";
import { MESSAGE } from "./messages";
import { isSupportedExtensionCollectionUrl } from "./safety";


const els = {
  status: document.getElementById("status")!,
  statusDot: document.getElementById("statusDot")!,
  currentUrl: document.getElementById("currentUrl")!,
  pageType: document.getElementById("pageType")!,
  routeKey: document.getElementById("routeKey")!,
  collectable: document.getElementById("collectable")!,
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
  routeOverridePanel: document.getElementById("routeOverridePanel")!,
  routeOverride: document.getElementById("routeOverride") as HTMLSelectElement,
  routeRecognitionHint: document.getElementById("routeRecognitionHint")!,
  nextRoute: document.getElementById("nextRoute")!,
  refreshBtn: document.getElementById("refreshBtn") as HTMLButtonElement,
  clearBtn: document.getElementById("clearBtn") as HTMLButtonElement
};

void render();
els.pairBtn.addEventListener("click", pairExtension);
els.confirmPairBtn.addEventListener("click", confirmPairing);
els.cancelPairBtn.addEventListener("click", cancelPairing);
els.selectTaskBtn.addEventListener("click", selectTask);
els.clearPairingBtn.addEventListener("click", clearPairing);
els.sidePanelBtn.addEventListener("click", openSidePanel);
els.captureBtn.addEventListener("click", captureAndUpload);
els.routeOverride.addEventListener("change", () => {
  els.captureBtn.disabled = !els.routeOverride.value;
});
els.refreshBtn.addEventListener("click", render);
els.clearBtn.addEventListener("click", clearSnapshot);

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
  const state = stateResult.status === "fulfilled" ? stateResult.value : null;
  const url = tab?.url || "";
  const collectable = isCollectable(url);
  const currentActivity = state?.pageActivity?.tabId === tab?.id && state?.pageActivity?.currentUrl === url ? state.pageActivity : null;
  const pageContext = tab?.id && collectable
    ? await contentMessage(tab.id, { type: MESSAGE.GET_PAGE_CONTEXT }).catch(() => null)
    : null;
  const routeKey = normalizeCollectionRouteKey(pageContext?.routeKey || currentActivity?.routeKey);

  els.currentUrl.textContent = url || "无法读取，请重新打开插件";
  els.pageType.textContent = pageTypeLabel(pageContext?.pageType || currentActivity?.pageType || inferPageTypeFromUrl(url));
  els.routeKey.textContent = routeLabel(routeKey);
  els.collectable.textContent = collectable ? "当前页面可以采集" : "当前页面不支持采集";
  els.hasToken.textContent = state?.hasToken ? "已安全配对" : "尚未配对";
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
  const needsRouteOverride = collectable && routeKey === "UNKNOWN";
  renderRouteOverrideOptions(boundTask, needsRouteOverride ? els.routeOverride.value : "");
  toggle(els.pairingPanel, !hasToken);
  // A new task pairing still requires an explicit confirmation when the account is already paired.
  toggle(els.pairingConfirmationPanel, Boolean(pendingPairing));
  toggle(els.taskPanel, hasToken && !hasTask);
  toggle(els.boundPanel, hasToken && hasTask);
  toggle(els.routeOverridePanel, hasToken && hasTask && needsRouteOverride);
  toggle(els.routeRecognitionHint, hasToken && hasTask && collectable && !needsRouteOverride);
  els.routeRecognitionHint.textContent = routeKey === "UNKNOWN"
    ? "当前页面尚未识别，需要手动选择本次采集路线。"
    : `当前页面已自动识别为“${routeLabel(routeKey)}”，无需选择下拉路线。`;
  if (!needsRouteOverride) els.routeOverride.value = "";
  els.captureBtn.disabled = !collectable || !hasTask || (needsRouteOverride && !els.routeOverride.value);
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
    setStatus("请在 Popup 核对服务器、账号和任务，再确认配对", "warning");
  } else if (!hasToken) {
    setStatus("插件运行正常，请输入任务页生成的配对码", "warning");
  } else if (!hasTask) {
    setStatus("账号已配对，请选择采集任务", "warning");
  } else if (!collectable) {
    setStatus("任务已绑定，请打开任务页列出的目标后台页面", "warning");
  } else if (needsRouteOverride && !els.routeOverride.value) {
    setStatus("当前路线无法自动确认，请为本次采集选择当前可见页面路线", "warning");
  } else {
    setStatus("插件、账号和任务均正常，可以开始采集", "ready");
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
        currentUrl: tab.url || "",
        routeOverride: els.routeOverride.value || undefined
      }
    });
    if (!response?.ok) {
      setStatus(chineseError(response?.error, "采集或上传失败，请稍后重试"), "error");
      showCaptureResult(chineseError(response?.error, "采集或上传失败，请稍后重试"), false);
      return;
    }
    const skippedMessage = response.skipped ? "数据未变化，已保留上次上传" : "快照已上传";
    setStatus("采集完成，网页任务页会自动更新", "ready");
    showCaptureResult(
      `${skippedMessage}；识别 ${response.metricCount || 0} 个指标；覆盖率 ${formatPercent(response.coverageRatio)}。`,
      true
    );
  } catch {
    setStatus("插件通信中断，请重新加载插件和目标页面", "error");
    showCaptureResult("插件通信中断，请重新加载插件和目标页面。", false);
  } finally {
    els.captureBtn.textContent = "采集并上传当前路线";
    await render();
  }
}

async function pairExtension() {
  const code = els.pairingCode.value.trim();
  if (!/^\d{6}$/.test(code)) {
    setStatus("请输入任务页生成的六位配对码", "error");
    return;
  }
  els.pairBtn.disabled = true;
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
      setStatus(chineseError(response?.error, "配对失败，请在任务页重新生成配对码"), "error");
      return;
    }
    setStatus(response.config?.collectionTaskId ? "账号和当前任务已安全绑定" : "账号已配对，请选择采集任务", response.config?.collectionTaskId ? "ready" : "warning");
  } catch {
    setStatus("插件后台响应超时，请在扩展管理页重新加载插件", "error");
  } finally {
    els.confirmPairBtn.disabled = false;
    await render();
  }
}

async function cancelPairing() {
  const response = await runtimeMessage({ type: MESSAGE.CANCEL_PAIRING });
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

function renderTaskOptions(context: any, selectedTaskId?: string) {
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

function renderRouteOverrideOptions(task: any, selectedRouteKey?: string) {
  const selected = normalizeCollectionRouteKey(selectedRouteKey);
  const options: HTMLOptionElement[] = [];
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = task ? "请选择当前可见路线" : "等待任务路线信息";
  options.push(placeholder);
  const seen = new Set<string>();
  for (const route of task?.routeSources || []) {
    const routeKey = normalizeCollectionRouteKey(route.routeKey);
    if (routeKey === "UNKNOWN" || seen.has(routeKey)) continue;
    seen.add(routeKey);
    const option = document.createElement("option");
    option.value = routeKey;
    option.textContent = routeLabel(routeKey);
    option.selected = selected === routeKey;
    options.push(option);
  }
  els.routeOverride.replaceChildren(...options);
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
  if (/liveboard|liveScreen|room|screen/i.test(url)) return "LIVE_DATA_SCREEN";
  if (/task|campaign|ad|promotion|local|cockpit/i.test(url)) return "LOCAL_PROMOTION_DASHBOARD";
  return "UNKNOWN";
}

function pageTypeLabel(value: string) {
  const labels: Record<string, string> = {
    LIVE_DATA_SCREEN: "直播数据大屏",
    LOCAL_PROMOTION_DASHBOARD: "巨量本地推数据页",
    TASK_TABLE: "任务或计划列表",
    UNKNOWN: "尚未识别"
  };
  return labels[value] || value;
}

function routeLabel(routeKey: CollectionRouteKey) {
  return collectionRouteLabels[routeKey] || (routeKey === "UNKNOWN" ? "尚未识别" : routeKey);
}

function nextPendingRouteLabel(state: any) {
  const task = currentTask(state);
  const next = task?.routeSources?.find((route: any) => !state?.routeUploadState?.[route.routeKey]);
  return next ? routeLabel(normalizeCollectionRouteKey(next.routeKey)) : task ? "本轮路线已完成" : "等待任务信息";
}

function currentTask(state: any) {
  const taskId = state?.config?.collectionTaskId;
  return state?.context?.account?.projects
    ?.flatMap((project: any) => project.tasks || [])
    .find((item: any) => item.id === taskId) || null;
}

function runtimeMessage(message: unknown, timeoutMs = 5_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("插件后台响应超时")), timeoutMs);
    chrome.runtime.sendMessage(message).then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });
}

function contentMessage(tabId: number, message: unknown, timeoutMs = 5_000): Promise<any> {
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
