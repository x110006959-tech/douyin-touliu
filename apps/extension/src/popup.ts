import type { CollectionRouteKey } from "@douyin-local-life/shared";
import { MESSAGE } from "./messages";

const allowedHostPattern = /(douyin|douyinlife|juliangengine|oceanengine|bytedance)\.com$/i;
const els = {
  status: document.getElementById("status")!,
  currentUrl: document.getElementById("currentUrl")!,
  pageType: document.getElementById("pageType")!,
  collectable: document.getElementById("collectable")!,
  hasToken: document.getElementById("hasToken")!,
  taskId: document.getElementById("taskId")!,
  patrolStatus: document.getElementById("patrolStatus")!,
  collectionRunId: document.getElementById("collectionRunId")!,
  snapshot: document.getElementById("snapshot")!,
  configBtn: document.getElementById("configBtn")!,
  sidePanelBtn: document.getElementById("sidePanelBtn")!,
  startBtn: document.getElementById("startBtn")!,
  startPatrolBtn: document.getElementById("startPatrolBtn")!,
  stopPatrolBtn: document.getElementById("stopPatrolBtn")!,
  refreshBtn: document.getElementById("refreshBtn")!,
  uploadBtn: document.getElementById("uploadBtn")!,
  clearBtn: document.getElementById("clearBtn")!
};

void render();
els.configBtn.addEventListener("click", configure);
els.sidePanelBtn.addEventListener("click", openSidePanel);
els.startBtn.addEventListener("click", startCollection);
els.startPatrolBtn.addEventListener("click", startPatrol);
els.stopPatrolBtn.addEventListener("click", stopPatrol);
els.refreshBtn.addEventListener("click", render);
els.uploadBtn.addEventListener("click", uploadSnapshot);
els.clearBtn.addEventListener("click", clearSnapshot);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function render() {
  const tab = await activeTab();
  const state = await chrome.runtime.sendMessage({ type: MESSAGE.GET_STATE });
  const url = tab?.url || "";
  els.currentUrl.textContent = url || "-";
  els.pageType.textContent = state?.latestSnapshot?.pageType || inferPageTypeFromUrl(url);
  els.collectable.textContent = isCollectable(url) ? "YES" : "NO";
  els.hasToken.textContent = state?.hasToken ? "Configured in session storage" : "Not configured";
  els.taskId.textContent = state?.config?.collectionTaskId || "-";
  els.patrolStatus.textContent = state?.patrol?.enabled ? "运行中（仅采集已打开页面）" : "未开启";
  els.collectionRunId.textContent = state?.patrol?.collectionRunId || "-";
  els.snapshot.textContent = JSON.stringify({ latestSnapshot: state?.latestSnapshot || null, routeUploadState: state?.routeUploadState || {} }, null, 2);
  els.status.textContent = "Ready";
}

async function startPatrol() {
  const requiredRoutes = selectedRoutes();
  if (!requiredRoutes.length) {
    els.status.textContent = "请至少选择一个目标页面";
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: MESSAGE.START_PATROL, payload: { requiredRoutes } });
  els.status.textContent = response?.ok ? "固定页面巡检已开启" : response?.error || "巡检启动失败";
  await render();
}

async function stopPatrol() {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE.STOP_PATROL });
  els.status.textContent = response?.ok ? "巡检已停止" : response?.error || "巡检停止失败";
  await render();
}

function selectedRoutes(): CollectionRouteKey[] {
  const choices: Array<[string, CollectionRouteKey]> = [
    ["routeDashboard", "LOCAL_PROMOTION_DASHBOARD"],
    ["routeLive", "LIVE_DATA_SCREEN"],
    ["routeTask", "TASK_TABLE"],
    ["routeMaterial", "MATERIAL_LIBRARY"],
    ["routeTrend", "HOURLY_TREND"]
  ];
  return choices
    .filter(([id]) => (document.getElementById(id) as HTMLInputElement | null)?.checked)
    .map(([, route]) => route);
}

async function configure() {
  const state = await chrome.runtime.sendMessage({ type: MESSAGE.GET_STATE });
  const apiBaseUrl = prompt("API base URL", state?.config?.apiBaseUrl || "http://localhost:4000");
  if (!apiBaseUrl) return;
  const collectionTaskId = prompt("Collection task ID", state?.config?.collectionTaskId || "");
  if (!collectionTaskId) return;
  const token = prompt("SaaS API token. Stored only in chrome.storage.session.", "");
  await chrome.runtime.sendMessage({
    type: MESSAGE.SAVE_CONFIG,
    payload: { apiBaseUrl, collectionTaskId, token: token || undefined }
  });
  await render();
}

async function openSidePanel() {
  await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  window.close();
}

async function startCollection() {
  const tab = await activeTab();
  if (!tab?.id || !isCollectable(tab.url || "")) {
    els.status.textContent = "Current page is outside the allowlist";
    return;
  }
  const response = await chrome.tabs.sendMessage(tab.id, { type: MESSAGE.START_COLLECTION });
  els.status.textContent = response?.ok ? "Local snapshot captured" : "Capture failed";
  await render();
}

async function uploadSnapshot() {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE.UPLOAD_SNAPSHOT });
  els.status.textContent = response?.ok ? "Snapshot uploaded" : response?.error || "Upload failed";
  await render();
}

async function clearSnapshot() {
  await chrome.runtime.sendMessage({ type: MESSAGE.CLEAR_SNAPSHOT });
  els.status.textContent = "Local snapshot cleared";
  await render();
}

function isCollectable(url: string) {
  try {
    return allowedHostPattern.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function inferPageTypeFromUrl(url: string) {
  if (/live|room|screen|dashboard/i.test(url)) return "LIVE_DATA_SCREEN";
  if (/task|campaign|ad|promotion|local/i.test(url)) return "LOCAL_PROMOTION_DASHBOARD";
  return "UNKNOWN";
}
