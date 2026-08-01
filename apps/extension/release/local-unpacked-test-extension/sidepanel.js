"use strict";
(() => {
  // <define:__PXXIS_EXTENSION_LOCAL_DEVELOPMENT_HOSTS__>
  var define_PXXIS_EXTENSION_LOCAL_DEVELOPMENT_HOSTS_default = ["localhost", "127.0.0.1"];

  // src/build-target.ts
  var isLocalBuild = true;
  var developmentLoopbackHostnames = typeof define_PXXIS_EXTENSION_LOCAL_DEVELOPMENT_HOSTS_default === "undefined" ? [] : define_PXXIS_EXTENSION_LOCAL_DEVELOPMENT_HOSTS_default;
  var localWebPort = false ? 0 : 3300;

  // src/messages.ts
  var STORAGE = {
    CONFIG: "douyinLocalLifeDiagnosisConfig",
    TOKEN: "douyinLocalLifeDiagnosisToken",
    LATEST_SNAPSHOT: "douyinLocalLifeDiagnosisLatestSnapshot",
    LOGS: "douyinLocalLifeDiagnosisLogs",
    ROUTE_UPLOAD_STATE: "douyinLocalLifeDiagnosisRouteUploadState",
    PAGE_ACTIVITY: "douyinLocalLifeDiagnosisPageActivity",
    CONTEXT: "douyinLocalLifeDiagnosisContext",
    ACTIVE_COLLECTION_SESSION: "douyinLocalLifeDiagnosisActiveCollectionSession",
    PENDING_PAIRING_CONFIRMATION: "douyinLocalLifeDiagnosisPendingPairingConfirmation"
  };

  // src/sidepanel.ts
  var elements = {
    status: document.getElementById("status"),
    version: document.getElementById("version"),
    activity: document.getElementById("activity"),
    runId: document.getElementById("runId"),
    accountName: document.getElementById("accountName"),
    projectName: document.getElementById("projectName"),
    taskId: document.getElementById("taskId"),
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
    const local = await chrome.storage.local.get([STORAGE.PAGE_ACTIVITY, STORAGE.CONFIG, STORAGE.ACTIVE_COLLECTION_SESSION]);
    const activity = local[STORAGE.PAGE_ACTIVITY] || {};
    elements.runId.textContent = local[STORAGE.ACTIVE_COLLECTION_SESSION]?.collectionRunId || "-";
    elements.accountName.textContent = local[STORAGE.CONFIG]?.accountName || "\u672A\u7ED1\u5B9A";
    elements.projectName.textContent = local[STORAGE.CONFIG]?.projectName || "\u672A\u7ED1\u5B9A";
    elements.taskId.textContent = local[STORAGE.CONFIG]?.collectionTaskId || "-";
    elements.activity.textContent = activity.tabState === "VISIBLE" ? "\u6D3B\u8DC3" : activity.tabState === "HIDDEN" ? "\u9875\u9762\u975E\u6D3B\u8DC3" : "\u672A\u77E5";
  }
  async function renderProposals() {
    const { apiBaseUrl, collectionTaskId, token } = await apiContext();
    if (!apiBaseUrl || !collectionTaskId || !token) {
      elements.status.textContent = "\u8BF7\u5148\u5728\u63D2\u4EF6\u5F39\u7A97\u914D\u5BF9\u8D26\u53F7\u5E76\u9009\u62E9\u91C7\u96C6\u4EFB\u52A1";
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
      elements.proposals.replaceChildren(...proposals.length ? proposals.map((proposal) => renderProposal(proposal, apiBaseUrl)) : [textNode("\u6682\u65E0\u6B63\u5F0F\u5EFA\u8BAE", "muted")]);
      elements.status.textContent = "\u5DF2\u8FDE\u63A5\uFF1B\u5BA1\u6279\u8BF7\u5728\u7F51\u9875\u5DE5\u4F5C\u53F0\u5B8C\u6210";
    } catch (error) {
      elements.status.textContent = error instanceof Error ? error.message : "\u8FDE\u63A5\u5931\u8D25";
    }
  }
  function renderProposal(proposal, apiBaseUrl) {
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
      link.textContent = proposal.status === "PENDING_APPROVAL" ? "\u5728\u7F51\u9875\u4E2D\u5BA1\u6838" : "\u67E5\u770B\u7F51\u9875\u8BE6\u60C5";
      node.append(link);
    }
    return node;
  }
  async function apiContext() {
    const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.TOKEN]);
    const config = local[STORAGE.CONFIG] || {};
    return { apiBaseUrl: config.apiBaseUrl, collectionTaskId: config.collectionTaskId, token: local[STORAGE.TOKEN] };
  }
  function webBaseUrl(apiBaseUrl) {
    try {
      const url = new URL(apiBaseUrl);
      if (isLocalBuild && developmentLoopbackHostnames.includes(url.hostname)) return `${url.protocol}//${url.hostname}:${localWebPort}`;
      return "https://www.pxxis.cn";
    } catch {
      return "https://www.pxxis.cn";
    }
  }
  function textNode(text, className) {
    const node = document.createElement("div");
    node.className = className;
    node.textContent = text;
    return node;
  }
})();
