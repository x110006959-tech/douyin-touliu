import { MESSAGE } from "./messages";

const allowedHostPattern = /(douyin|douyinlife|juliangengine|oceanengine|bytedance)\.com$/i;
const els = {
  status: document.getElementById("status")!,
  currentUrl: document.getElementById("currentUrl")!,
  pageType: document.getElementById("pageType")!,
  collectable: document.getElementById("collectable")!,
  hasToken: document.getElementById("hasToken")!,
  taskId: document.getElementById("taskId")!,
  snapshot: document.getElementById("snapshot")!,
  configBtn: document.getElementById("configBtn")!,
  startBtn: document.getElementById("startBtn")!,
  refreshBtn: document.getElementById("refreshBtn")!,
  uploadBtn: document.getElementById("uploadBtn")!,
  clearBtn: document.getElementById("clearBtn")!
};

void render();
els.configBtn.addEventListener("click", configure);
els.startBtn.addEventListener("click", startCollection);
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
  els.snapshot.textContent = JSON.stringify(state?.latestSnapshot || {}, null, 2);
  els.status.textContent = "Ready";
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
