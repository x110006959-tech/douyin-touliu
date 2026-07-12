"use strict";
(() => {
  // src/messages.ts
  var MESSAGE = {
    START_COLLECTION: "AI_DIAGNOSIS_START_COLLECTION",
    SNAPSHOT_CAPTURED: "AI_DIAGNOSIS_SNAPSHOT_CAPTURED",
    METRIC_PULSE_CAPTURED: "AI_DIAGNOSIS_METRIC_PULSE_CAPTURED",
    PAGE_ACTIVITY: "AI_DIAGNOSIS_PAGE_ACTIVITY",
    GET_STATE: "AI_DIAGNOSIS_GET_STATE",
    SAVE_CONFIG: "AI_DIAGNOSIS_SAVE_CONFIG",
    UPLOAD_SNAPSHOT: "AI_DIAGNOSIS_UPLOAD_SNAPSHOT",
    CLEAR_SNAPSHOT: "AI_DIAGNOSIS_CLEAR_SNAPSHOT",
    START_PATROL: "AI_DIAGNOSIS_START_PATROL",
    STOP_PATROL: "AI_DIAGNOSIS_STOP_PATROL",
    OPEN_SIDE_PANEL: "AI_DIAGNOSIS_OPEN_SIDE_PANEL"
  };

  // src/popup.ts
  var allowedHostPattern = /(douyin|douyinlife|juliangengine|oceanengine|bytedance)\.com$/i;
  var els = {
    status: document.getElementById("status"),
    currentUrl: document.getElementById("currentUrl"),
    pageType: document.getElementById("pageType"),
    collectable: document.getElementById("collectable"),
    hasToken: document.getElementById("hasToken"),
    taskId: document.getElementById("taskId"),
    patrolStatus: document.getElementById("patrolStatus"),
    collectionRunId: document.getElementById("collectionRunId"),
    snapshot: document.getElementById("snapshot"),
    configBtn: document.getElementById("configBtn"),
    sidePanelBtn: document.getElementById("sidePanelBtn"),
    startBtn: document.getElementById("startBtn"),
    startPatrolBtn: document.getElementById("startPatrolBtn"),
    stopPatrolBtn: document.getElementById("stopPatrolBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    uploadBtn: document.getElementById("uploadBtn"),
    clearBtn: document.getElementById("clearBtn")
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
    els.patrolStatus.textContent = state?.patrol?.enabled ? "\u8FD0\u884C\u4E2D\uFF08\u4EC5\u91C7\u96C6\u5DF2\u6253\u5F00\u9875\u9762\uFF09" : "\u672A\u5F00\u542F";
    els.collectionRunId.textContent = state?.patrol?.collectionRunId || "-";
    els.snapshot.textContent = JSON.stringify({ latestSnapshot: state?.latestSnapshot || null, routeUploadState: state?.routeUploadState || {} }, null, 2);
    els.status.textContent = "Ready";
  }
  async function startPatrol() {
    const requiredRoutes = selectedRoutes();
    if (!requiredRoutes.length) {
      els.status.textContent = "\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u76EE\u6807\u9875\u9762";
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: MESSAGE.START_PATROL, payload: { requiredRoutes } });
    els.status.textContent = response?.ok ? "\u56FA\u5B9A\u9875\u9762\u5DE1\u68C0\u5DF2\u5F00\u542F" : response?.error || "\u5DE1\u68C0\u542F\u52A8\u5931\u8D25";
    await render();
  }
  async function stopPatrol() {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE.STOP_PATROL });
    els.status.textContent = response?.ok ? "\u5DE1\u68C0\u5DF2\u505C\u6B62" : response?.error || "\u5DE1\u68C0\u505C\u6B62\u5931\u8D25";
    await render();
  }
  function selectedRoutes() {
    const choices = [
      ["routeDashboard", "LOCAL_PROMOTION_DASHBOARD"],
      ["routeLive", "LIVE_DATA_SCREEN"],
      ["routeTask", "TASK_TABLE"],
      ["routeMaterial", "MATERIAL_LIBRARY"],
      ["routeTrend", "HOURLY_TREND"]
    ];
    return choices.filter(([id]) => document.getElementById(id)?.checked).map(([, route]) => route);
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
      payload: { apiBaseUrl, collectionTaskId, token: token || void 0 }
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
  function isCollectable(url) {
    try {
      return allowedHostPattern.test(new URL(url).hostname);
    } catch {
      return false;
    }
  }
  function inferPageTypeFromUrl(url) {
    if (/live|room|screen|dashboard/i.test(url)) return "LIVE_DATA_SCREEN";
    if (/task|campaign|ad|promotion|local/i.test(url)) return "LOCAL_PROMOTION_DASHBOARD";
    return "UNKNOWN";
  }
})();
