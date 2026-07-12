"use strict";
(() => {
  // src/messages.ts
  var STORAGE = {
    CONFIG: "douyinLocalLifeDiagnosisConfig",
    TOKEN: "douyinLocalLifeDiagnosisToken",
    LATEST_SNAPSHOT: "douyinLocalLifeDiagnosisLatestSnapshot",
    LOGS: "douyinLocalLifeDiagnosisLogs",
    PATROL: "douyinLocalLifeDiagnosisPatrol",
    ROUTE_UPLOAD_STATE: "douyinLocalLifeDiagnosisRouteUploadState",
    LATEST_SIGNALS: "douyinLocalLifeDiagnosisLatestSignals",
    PAGE_ACTIVITY: "douyinLocalLifeDiagnosisPageActivity"
  };

  // src/sidepanel.ts
  var elements = {
    status: document.getElementById("status"),
    version: document.getElementById("version"),
    activity: document.getElementById("activity"),
    runId: document.getElementById("runId"),
    signals: document.getElementById("signals"),
    proposals: document.getElementById("proposals")
  };
  elements.version.textContent = chrome.runtime.getManifest().version;
  void render();
  var refreshTimer = window.setInterval(() => void render(), 1e4);
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
    elements.activity.textContent = activity.tabState === "VISIBLE" ? "\u6D3B\u8DC3" : activity.tabState === "HIDDEN" ? "\u9875\u9762\u975E\u6D3B\u8DC3" : "\u672A\u77E5";
    const signals = local[STORAGE.LATEST_SIGNALS] || [];
    elements.signals.replaceChildren(...signals.length ? signals.map(renderSignal) : [textNode("\u6682\u65E0\u4FE1\u53F7", "muted")]);
  }
  async function renderProposals() {
    const { apiBaseUrl, collectionTaskId, token } = await apiContext();
    if (!apiBaseUrl || !collectionTaskId || !token) {
      elements.status.textContent = "\u8BF7\u5148\u5728\u63D2\u4EF6\u5F39\u7A97\u914D\u7F6EAPI\u3001\u4EFB\u52A1\u548CToken";
      return;
    }
    try {
      const versionResponse = await fetch(`${apiBaseUrl}/version`);
      if (versionResponse.ok) {
        const versionBody = await versionResponse.json();
        const metadata = versionBody?.data;
        if (metadata) elements.version.textContent = `${metadata.productVersion} / ${metadata.gitSha.slice(0, 8)}`;
      }
      const response = await fetch(`${apiBaseUrl}/collection-tasks/${collectionTaskId}/decision-runs/latest`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
      const proposals = body?.data?.actionProposals || [];
      elements.proposals.replaceChildren(...proposals.length ? proposals.map((proposal) => renderProposal(proposal, apiBaseUrl, token)) : [textNode("\u6682\u65E0\u6B63\u5F0F\u5EFA\u8BAE", "muted")]);
      elements.status.textContent = "\u5DF2\u8FDE\u63A5\uFF0C\u4EC5\u5C55\u793A\u548C\u8BB0\u5F55\u4EBA\u5DE5\u51B3\u7B56";
    } catch (error) {
      elements.status.textContent = error instanceof Error ? error.message : "\u8FDE\u63A5\u5931\u8D25";
    }
  }
  function renderSignal(signal) {
    const node = document.createElement("div");
    node.className = `signal ${signal.severity === "CRITICAL" ? "critical" : signal.severity === "WARNING" ? "warning" : ""}`;
    node.textContent = signal.message;
    return node;
  }
  function renderProposal(proposal, apiBaseUrl, token) {
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
      for (const [label, action] of [["\u5BA1\u6279", "approve"], ["\u89C2\u5BDF", "observe"], ["\u62D2\u7EDD", "reject"]]) {
        const button = document.createElement("button");
        button.textContent = label;
        button.addEventListener("click", () => void transitionProposal(apiBaseUrl, token, proposal.id, action));
        actions.append(button);
      }
      node.append(actions);
    }
    return node;
  }
  async function transitionProposal(apiBaseUrl, token, proposalId, action) {
    const response = await fetch(`${apiBaseUrl}/action-proposals/${proposalId}/${action}`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: "{}" });
    const body = await response.json();
    elements.status.textContent = response.ok ? "\u5BA1\u6279\u72B6\u6001\u5DF2\u8BB0\u5F55\uFF0C\u5E73\u53F0\u64CD\u4F5C\u4ECD\u9700\u4EBA\u5DE5\u5B8C\u6210" : body?.error?.message || "\u72B6\u6001\u66F4\u65B0\u5931\u8D25";
    await renderProposals();
  }
  async function apiContext() {
    const local = await chrome.storage.local.get([STORAGE.CONFIG]);
    const session = await chrome.storage.session.get([STORAGE.TOKEN]);
    const config = local[STORAGE.CONFIG] || {};
    return { apiBaseUrl: config.apiBaseUrl, collectionTaskId: config.collectionTaskId, token: session[STORAGE.TOKEN] };
  }
  function textNode(text, className) {
    const node = document.createElement("div");
    node.className = className;
    node.textContent = text;
    return node;
  }
})();
