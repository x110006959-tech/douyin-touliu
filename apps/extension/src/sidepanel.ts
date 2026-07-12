import type { ActionProposalDTO, BuildMetadata, RealtimeSignal } from "@douyin-local-life/shared";
import { STORAGE } from "./messages";

const elements = {
  status: document.getElementById("status")!,
  version: document.getElementById("version")!,
  activity: document.getElementById("activity")!,
  runId: document.getElementById("runId")!,
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
  const local = await chrome.storage.local.get([STORAGE.PATROL, STORAGE.LATEST_SIGNALS, STORAGE.PAGE_ACTIVITY]);
  const patrol = local[STORAGE.PATROL] || {};
  const activity = local[STORAGE.PAGE_ACTIVITY] || {};
  elements.runId.textContent = patrol.collectionRunId || "-";
  elements.activity.textContent = activity.tabState === "VISIBLE" ? "活跃" : activity.tabState === "HIDDEN" ? "页面非活跃" : "未知";
  const signals = (local[STORAGE.LATEST_SIGNALS] || []) as RealtimeSignal[];
  elements.signals.replaceChildren(...(signals.length ? signals.map(renderSignal) : [textNode("暂无信号", "muted")]));
}

async function renderProposals() {
  const { apiBaseUrl, collectionTaskId, token } = await apiContext();
  if (!apiBaseUrl || !collectionTaskId || !token) {
    elements.status.textContent = "请先在插件弹窗配置API、任务和Token";
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
    elements.proposals.replaceChildren(...(proposals.length ? proposals.map((proposal) => renderProposal(proposal, apiBaseUrl, token)) : [textNode("暂无正式建议", "muted")]));
    elements.status.textContent = "已连接，仅展示和记录人工决策";
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

function renderProposal(proposal: ActionProposalDTO, apiBaseUrl: string, token: string) {
  const node = document.createElement("div");
  node.className = "proposal";
  const title = document.createElement("strong");
  title.textContent = proposal.title;
  const reason = document.createElement("div");
  reason.className = "muted";
  reason.textContent = proposal.reason;
  node.append(title, reason);
  if (proposal.status === "PENDING_APPROVAL" && proposal.id) {
    const actions = document.createElement("div");
    actions.className = "actions";
    for (const [label, action] of [["审批", "approve"], ["观察", "observe"], ["拒绝", "reject"]] as const) {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => void transitionProposal(apiBaseUrl, token, proposal.id!, action));
      actions.append(button);
    }
    node.append(actions);
  }
  return node;
}

async function transitionProposal(apiBaseUrl: string, token: string, proposalId: string, action: "approve" | "observe" | "reject") {
  const response = await fetch(`${apiBaseUrl}/action-proposals/${proposalId}/${action}`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: "{}" });
  const body = await response.json();
  elements.status.textContent = response.ok ? "审批状态已记录，平台操作仍需人工完成" : body?.error?.message || "状态更新失败";
  await renderProposals();
}

async function apiContext() {
  const local = await chrome.storage.local.get([STORAGE.CONFIG]);
  const session = await chrome.storage.session.get([STORAGE.TOKEN]);
  const config = local[STORAGE.CONFIG] || {};
  return { apiBaseUrl: config.apiBaseUrl as string | undefined, collectionTaskId: config.collectionTaskId as string | undefined, token: session[STORAGE.TOKEN] as string | undefined };
}

function textNode(text: string, className: string) {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  return node;
}
