import { MESSAGE, STORAGE } from "./messages";
import { livePulseMetricCoverage, livePulseOutcomeMessage, livePulseReasonText, livePulseStatusText, type LivePulseDisplayState } from "./live-pulse-status";

const elements = {
  status: document.getElementById("status")!,
  version: document.getElementById("version")!,
  activity: document.getElementById("activity")!,
  runId: document.getElementById("runId")!,
  accountName: document.getElementById("accountName")!,
  projectName: document.getElementById("projectName")!,
  taskId: document.getElementById("taskId")!,
  liveStatus: document.getElementById("liveStatus")!,
  liveUpdatedAt: document.getElementById("liveUpdatedAt")!,
  liveSuccessCount: document.getElementById("liveSuccessCount")!,
  liveMetricCount: document.getElementById("liveMetricCount")!,
  liveLastError: document.getElementById("liveLastError")!
};

elements.version.textContent = chrome.runtime.getManifest().version;
void render();
const liveRefreshTimer = window.setInterval(() => void render(), 1_000);
window.addEventListener("unload", () => {
  window.clearInterval(liveRefreshTimer);
});
chrome.storage.onChanged.addListener(() => void renderLocalState());

async function render() {
  await renderLocalState();
  await renderLivePulse();
}

async function renderLivePulse() {
  const state = await runtimeMessage({ type: MESSAGE.GET_STATE }).catch(() => null) as {
    livePulse?: LivePulseDisplayState & { lastSuccessAt?: string | null };
    context?: { liveScreenInternalApi?: { enabled?: boolean } };
  } | null;
  const livePulse = state?.livePulse;
  elements.liveStatus.textContent = livePulseStatusText(
    livePulse,
    state?.context?.liveScreenInternalApi?.enabled === true
  );
  elements.liveUpdatedAt.textContent = livePulse?.lastSuccessAt
    ? new Date(livePulse.lastSuccessAt).toLocaleTimeString("zh-CN", { hour12: false })
    : livePulse?.active ? "等待第一轮" : "尚未启动";
  elements.liveSuccessCount.textContent = String(livePulse?.successCount || 0);
  const coverage = livePulseMetricCoverage(livePulse?.lastMetricKeys);
  elements.liveMetricCount.textContent = `${coverage.count}/${coverage.total}`;
  elements.liveLastError.textContent = livePulse?.lastFailureReason
    ? livePulseReasonText(livePulse.lastFailureReason)
    : livePulse?.lastOutcome?.failure
      ? livePulseOutcomeMessage(livePulse.lastOutcome)
      : "-";
  elements.status.textContent = livePulse?.active
    ? "采集中；切到网页端查看实时栏不会停止"
    : "在直播数据大屏点击一次“开始 API 持续采集”";
}

async function renderLocalState() {
  const local = await chrome.storage.local.get([STORAGE.PAGE_ACTIVITY, STORAGE.CONFIG, STORAGE.ACTIVE_COLLECTION_SESSION]);
  const activity = local[STORAGE.PAGE_ACTIVITY] || {};
  elements.runId.textContent = local[STORAGE.ACTIVE_COLLECTION_SESSION]?.collectionRunId || "-";
  elements.accountName.textContent = local[STORAGE.CONFIG]?.accountName || "未绑定";
  elements.projectName.textContent = local[STORAGE.CONFIG]?.projectName || "未绑定";
  elements.taskId.textContent = local[STORAGE.CONFIG]?.collectionTaskId || "-";
  elements.activity.textContent = activity.tabState === "VISIBLE" ? "活跃" : activity.tabState === "HIDDEN" ? "后台采集中" : "未知";
}

function runtimeMessage(message: unknown) {
  return new Promise<unknown>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
