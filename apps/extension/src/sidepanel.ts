import type { ActionProposalDTO, BuildMetadata, RealtimeSignal } from "@douyin-local-life/shared";
import { developmentLoopbackHostnames, isLocalBuild, localWebPort } from "./build-target";
import { STORAGE } from "./messages";

const elements = {
  status: document.getElementById("status")!,
  version: document.getElementById("version")!,
  activity: document.getElementById("activity")!,
  runId: document.getElementById("runId")!,
  accountName: document.getElementById("accountName")!,
  projectName: document.getElementById("projectName")!,
  taskId: document.getElementById("taskId")!,
  signals: document.getElementById("signals")!,
  proposals: document.getElementById("proposals")!
};

elements.version.textContent = chrome.runtime.getManifest().version;
void render();
const refreshTimer = window.setInterval(() => void render(), 10_000);
window.addEventListener("unload", () => window.clearInterval(refreshTimer));
chrome.storage.onChanged.addListener(() => void renderLocalState());

async function render() {
  await renderLocalState();
  await renderProposals();
}

async function renderLocalState() {
  const local = await chrome.storage.local.get([STORAGE.PATROL, STORAGE.LATEST_SIGNALS, STORAGE.PAGE_ACTIVITY, STORAGE.CONFIG]);
  const patrol = local[STORAGE.PATROL] || {};
  const activity = local[STORAGE.PAGE_ACTIVITY] || {};
  elements.runId.textContent = patrol.collectionRunId || "-";
  elements.accountName.textContent = local[STORAGE.CONFIG]?.accountName || "未绑定";
  elements.projectName.textContent = local[STORAGE.CONFIG]?.projectName || "未绑定";
  elements.taskId.textContent = local[STORAGE.CONFIG]?.collectionTaskId || "-";
  elements.activity.textContent = activity.tabState === "VISIBLE" ? "活跃" : activity.tabState === "HIDDEN" ? "页面非活跃" : "未知";
  const signals = (local[STORAGE.LATEST_SIGNALS] || []) as RealtimeSignal[];
  elements.signals.replaceChildren(...(signals.length ? signals.map(renderSignal) : [textNode("暂无信号", "muted")]));
}

async function renderProposals() {
  const { apiBaseUrl, collectionTaskId, token } = await apiContext();
  if (!apiBaseUrl || !collectionTaskId || !token) {
    elements.status.textContent = "请先在插件弹窗配对账号并选择采集任务";
    return;
  }
  try {
    const versionResponse = await fetch(`${apiBaseUrl}/version`);
    if (versionResponse.ok) {
      const versionBody = await versionResponse.json();
      const metadata = versionBody?.data as BuildMetadata | undefined;
      if (metadata) elements.version.textContent = `${metadata.productVersion} / ${metadata.gitSha.slice(0, 8)}`;
    }
    const response = await fetch(`${apiBaseUrl}/collection-tasks/${collectionTaskId}/decision-runs/latest`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
    const proposals = (body?.data?.actionProposals || []) as ActionProposalDTO[];
    elements.proposals.replaceChildren(...(proposals.length ? proposals.map((proposal) => renderProposal(proposal, apiBaseUrl)) : [textNode("暂无正式建议", "muted")]));
    elements.status.textContent = "已连接；审批请在网页工作台完成";
  } catch (error) {
    elements.status.textContent = error instanceof Error ? error.message : "连接失败";
  }
}

function renderSignal(signal: RealtimeSignal) {
  const node = document.createElement("div");
  node.className = `signal ${signal.severity === "CRITICAL" ? "critical" : signal.severity === "WARNING" ? "warning" : ""}`;
  node.textContent = signal.message;
  return node;
}

function renderProposal(proposal: ActionProposalDTO, apiBaseUrl: string) {
  const node = document.createElement("div");
  node.className = "proposal";
  const title = document.createElement("strong");
  title.textContent = proposal.title;
  const reason = document.createElement("div");
  reason.className = "muted";
  reason.textContent = proposal.reason;
  node.append(title, reason);
  if (proposal.id) {
    const link = document.createElement("a");
    link.href = `${webBaseUrl(apiBaseUrl)}/action-proposals/${proposal.id}`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = proposal.status === "PENDING_APPROVAL" ? "在网页中审核" : "查看网页详情";
    node.append(link);
  }
  return node;
}

async function apiContext() {
  const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.TOKEN]);
  const config = local[STORAGE.CONFIG] || {};
  return { apiBaseUrl: config.apiBaseUrl as string | undefined, collectionTaskId: config.collectionTaskId as string | undefined, token: local[STORAGE.TOKEN] as string | undefined };
}

function webBaseUrl(apiBaseUrl: string) {
  try {
    const url = new URL(apiBaseUrl);
    if (isLocalBuild && developmentLoopbackHostnames.includes(url.hostname)) return `${url.protocol}//${url.hostname}:${localWebPort}`;
    return "https://www.pxxis.cn";
  } catch {
    return "https://www.pxxis.cn";
  }
}

function textNode(text: string, className: string) {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  return node;
}
