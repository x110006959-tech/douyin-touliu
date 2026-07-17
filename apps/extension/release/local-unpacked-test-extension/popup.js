"use strict";
(() => {
  // ../../packages/shared/dist/collection-routes.js
  var collectionRouteKeys = [
    "LOCAL_PROMOTION_DASHBOARD",
    "LIVE_DATA_SCREEN",
    "LIVE_PRODUCT_TAB",
    "LIVE_TRAFFIC_TAB",
    "TASK_TABLE",
    "MATERIAL_LIBRARY",
    "HOURLY_TREND",
    "UNKNOWN"
  ];
  var collectionRouteTemplates = [
    {
      routeKey: "LIVE_DATA_SCREEN",
      label: "\u76F4\u64AD\u6570\u636E\u5927\u5C4F\u6982\u89C8",
      website: "\u6296\u97F3\u751F\u6D3B\u670D\u52A1\u76F4\u64AD\u6570\u636E\u5927\u5C4F",
      purpose: "\u91C7\u96C6\u6210\u4EA4\u3001\u89C2\u770B\u3001\u66DD\u5149\u548C\u76F4\u64AD\u95F4\u627F\u63A5\u6307\u6807",
      required: true,
      urlHint: "\u4F8B\u5982 localads.chengzijianzhan.cn/lamp/pc/liveboard2"
    },
    {
      routeKey: "LIVE_PRODUCT_TAB",
      label: "\u76F4\u64AD\u5927\u5C4F\u5546\u54C1\u9875",
      website: "\u6296\u97F3\u751F\u6D3B\u670D\u52A1\u76F4\u64AD\u6570\u636E\u5927\u5C4F",
      purpose: "\u91C7\u96C6\u5546\u54C1\u652F\u4ED8\u3001\u8BA2\u5355\u3001\u66DD\u5149\u548C\u5546\u54C1\u8F6C\u5316\u6570\u636E",
      required: false,
      urlHint: "\u5728\u76F4\u64AD\u5927\u5C4F\u4E2D\u5207\u6362\u5230\u201C\u5546\u54C1\u201D\u540E\u91C7\u96C6"
    },
    {
      routeKey: "LIVE_TRAFFIC_TAB",
      label: "\u76F4\u64AD\u5927\u5C4F\u6D41\u91CF\u9875",
      website: "\u6296\u97F3\u751F\u6D3B\u670D\u52A1\u76F4\u64AD\u6570\u636E\u5927\u5C4F",
      purpose: "\u91C7\u96C6\u81EA\u7136\u6D41\u91CF\u3001\u5546\u4E1A\u6D41\u91CF\u548C\u6D41\u91CF\u8D8B\u52BF",
      required: false,
      urlHint: "\u5728\u76F4\u64AD\u5927\u5C4F\u4E2D\u5207\u6362\u5230\u201C\u6D41\u91CF\u201D\u540E\u91C7\u96C6"
    },
    {
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      label: "\u5DE8\u91CF\u672C\u5730\u63A8\u6570\u636E\u603B\u89C8",
      website: "\u5DE8\u91CF\u672C\u5730\u63A8",
      purpose: "\u91C7\u96C6\u6D88\u8017\u3001\u9884\u7B97\u3001ROI\u3001\u8BA2\u5355\u548C\u6210\u672C\u6307\u6807",
      required: true,
      urlHint: "\u8BF7\u7C98\u8D34\u5F53\u524D\u5DF2\u767B\u5F55\u7684\u5DE8\u91CF\u672C\u5730\u63A8\u6570\u636E\u9875\u9762\u5730\u5740"
    },
    {
      routeKey: "TASK_TABLE",
      label: "\u5DE8\u91CF\u672C\u5730\u63A8\u4EFB\u52A1\u5217\u8868",
      website: "\u5DE8\u91CF\u672C\u5730\u63A8",
      purpose: "\u91C7\u96C6\u8BA1\u5212\u72B6\u6001\u3001\u9884\u7B97\u3001\u51FA\u4EF7\u548C\u4EFB\u52A1\u5C42\u7EA7\u6570\u636E",
      required: true,
      urlHint: "\u8BF7\u6253\u5F00\u5DE8\u91CF\u672C\u5730\u63A8\u7684\u4EFB\u52A1\u6216\u8BA1\u5212\u5217\u8868"
    }
  ];
  var collectionRouteLabels = Object.fromEntries(collectionRouteTemplates.map((route) => [route.routeKey, route.label]));
  var collectionFreshnessPolicy = {
    agingAfterMs: 5 * 60 * 1e3,
    staleAfterMs: 10 * 60 * 1e3,
    patrolIntervalMs: 60 * 1e3,
    heartbeatUploadMs: 5 * 60 * 1e3,
    routeFailureThreshold: 3
  };
  function normalizeCollectionRouteKey(value) {
    return collectionRouteKeys.includes(value) ? value : "UNKNOWN";
  }

  // src/messages.ts
  var MESSAGE = {
    START_COLLECTION: "AI_DIAGNOSIS_START_COLLECTION",
    GET_PAGE_CONTEXT: "AI_DIAGNOSIS_GET_PAGE_CONTEXT",
    SNAPSHOT_CAPTURED: "AI_DIAGNOSIS_SNAPSHOT_CAPTURED",
    METRIC_PULSE_CAPTURED: "AI_DIAGNOSIS_METRIC_PULSE_CAPTURED",
    PAGE_ACTIVITY: "AI_DIAGNOSIS_PAGE_ACTIVITY",
    GET_PATROL_STATE: "AI_DIAGNOSIS_GET_PATROL_STATE",
    SYNC_PATROL_STATE: "AI_DIAGNOSIS_SYNC_PATROL_STATE",
    CAPTURE_AND_UPLOAD: "AI_DIAGNOSIS_CAPTURE_AND_UPLOAD",
    GET_STATE: "AI_DIAGNOSIS_GET_STATE",
    GET_BRIDGE_STATUS: "AI_DIAGNOSIS_GET_BRIDGE_STATUS",
    REQUEST_PAIRING_CONFIRMATION: "AI_DIAGNOSIS_REQUEST_PAIRING_CONFIRMATION",
    CONFIRM_PAIRING: "AI_DIAGNOSIS_CONFIRM_PAIRING",
    CANCEL_PAIRING: "AI_DIAGNOSIS_CANCEL_PAIRING",
    SELECT_TASK: "AI_DIAGNOSIS_SELECT_TASK",
    CLEAR_PAIRING: "AI_DIAGNOSIS_CLEAR_PAIRING",
    UPLOAD_SNAPSHOT: "AI_DIAGNOSIS_UPLOAD_SNAPSHOT",
    CLEAR_SNAPSHOT: "AI_DIAGNOSIS_CLEAR_SNAPSHOT",
    START_PATROL: "AI_DIAGNOSIS_START_PATROL",
    STOP_PATROL: "AI_DIAGNOSIS_STOP_PATROL",
    OPEN_SIDE_PANEL: "AI_DIAGNOSIS_OPEN_SIDE_PANEL"
  };

  // src/safety.ts
  function isSupportedExtensionCollectionUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      if (url.hostname === "eos.douyin.com") return url.pathname === "/dp/liveScreen";
      if (url.hostname !== "localads.chengzijianzhan.cn") return false;
      return url.pathname === "/lamp/pc/liveboard2" || url.pathname === "/lamp/pc/promotion/roi2";
    } catch {
      return false;
    }
  }

  // src/popup.ts
  var els = {
    status: document.getElementById("status"),
    statusDot: document.getElementById("statusDot"),
    currentUrl: document.getElementById("currentUrl"),
    pageType: document.getElementById("pageType"),
    routeKey: document.getElementById("routeKey"),
    collectable: document.getElementById("collectable"),
    hasToken: document.getElementById("hasToken"),
    taskId: document.getElementById("taskId"),
    accountName: document.getElementById("accountName"),
    projectName: document.getElementById("projectName"),
    patrolStatus: document.getElementById("patrolStatus"),
    collectionRunId: document.getElementById("collectionRunId"),
    extensionBuild: document.getElementById("extensionBuild"),
    snapshot: document.getElementById("snapshot"),
    pairingPanel: document.getElementById("pairingPanel"),
    pairingConfirmationPanel: document.getElementById("pairingConfirmationPanel"),
    taskPanel: document.getElementById("taskPanel"),
    boundPanel: document.getElementById("boundPanel"),
    captureResult: document.getElementById("captureResult"),
    pairingCode: document.getElementById("pairingCode"),
    apiBaseUrl: document.getElementById("apiBaseUrl"),
    pairBtn: document.getElementById("pairBtn"),
    confirmPairBtn: document.getElementById("confirmPairBtn"),
    cancelPairBtn: document.getElementById("cancelPairBtn"),
    pendingPairServer: document.getElementById("pendingPairServer"),
    pendingPairAccount: document.getElementById("pendingPairAccount"),
    pendingPairTask: document.getElementById("pendingPairTask"),
    pendingPairExpiresAt: document.getElementById("pendingPairExpiresAt"),
    taskSelect: document.getElementById("taskSelect"),
    selectTaskBtn: document.getElementById("selectTaskBtn"),
    clearPairingBtn: document.getElementById("clearPairingBtn"),
    sidePanelBtn: document.getElementById("sidePanelBtn"),
    captureBtn: document.getElementById("captureBtn"),
    routeOverridePanel: document.getElementById("routeOverridePanel"),
    routeOverride: document.getElementById("routeOverride"),
    nextRoute: document.getElementById("nextRoute"),
    startPatrolBtn: document.getElementById("startPatrolBtn"),
    stopPatrolBtn: document.getElementById("stopPatrolBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    uploadBtn: document.getElementById("uploadBtn"),
    clearBtn: document.getElementById("clearBtn")
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
    setStatus("\u6B63\u5728\u68C0\u67E5\u63D2\u4EF6\u72B6\u6001", "neutral");
    const [tabResult, stateResult] = await Promise.allSettled([
      activeTab(),
      runtimeMessage({ type: MESSAGE.GET_STATE })
    ]);
    const tab = tabResult.status === "fulfilled" ? tabResult.value : void 0;
    const state = stateResult.status === "fulfilled" ? stateResult.value : null;
    const url = tab?.url || "";
    const collectable = isCollectable(url);
    const currentActivity = state?.pageActivity?.tabId === tab?.id && state?.pageActivity?.currentUrl === url ? state.pageActivity : null;
    const pageContext = tab?.id && collectable ? await contentMessage(tab.id, { type: MESSAGE.GET_PAGE_CONTEXT }).catch(() => null) : null;
    const routeKey = normalizeCollectionRouteKey(pageContext?.routeKey || currentActivity?.routeKey);
    els.currentUrl.textContent = url || "\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u63D2\u4EF6";
    els.pageType.textContent = pageTypeLabel(pageContext?.pageType || currentActivity?.pageType || inferPageTypeFromUrl(url));
    els.routeKey.textContent = routeLabel(routeKey);
    els.collectable.textContent = collectable ? "\u5F53\u524D\u9875\u9762\u53EF\u4EE5\u91C7\u96C6" : "\u5F53\u524D\u9875\u9762\u4E0D\u652F\u6301\u91C7\u96C6";
    els.hasToken.textContent = state?.hasToken ? "\u5DF2\u5B89\u5168\u914D\u5BF9" : "\u5C1A\u672A\u914D\u5BF9";
    els.taskId.textContent = state?.config?.collectionTaskId || "\u5C1A\u672A\u7ED1\u5B9A\u4EFB\u52A1";
    els.accountName.textContent = state?.config?.accountName || "\u672A\u7ED1\u5B9A";
    els.projectName.textContent = state?.config?.projectName || "\u672A\u7ED1\u5B9A";
    els.patrolStatus.textContent = state?.patrol?.enabled ? "\u8FD0\u884C\u4E2D\uFF0C\u4EC5\u91C7\u96C6\u5DF2\u6253\u5F00\u9875\u9762" : "\u672A\u5F00\u542F";
    els.collectionRunId.textContent = state?.patrol?.collectionRunId || state?.activeCollectionSession?.collectionRunId || "-";
    els.extensionBuild.textContent = `${chrome.runtime.getManifest().version} / ${"14f5cd868c56"}`;
    els.snapshot.textContent = state?.latestSnapshot ? JSON.stringify({
      pageType: state.latestSnapshot.pageType,
      routeKey: state.latestSnapshot.routeKey,
      metricCount: state.latestSnapshot.visibleMetricsJson?.length || 0,
      capturedAt: state.latestSnapshot.localCollectedAt,
      routeUploadState: state.routeUploadState || {}
    }, null, 2) : "\u6682\u65E0\u672C\u5730\u5FEB\u7167";
    renderTaskOptions(state?.context, state?.config?.collectionTaskId);
    const boundTask = currentTask(state);
    const hasToken = Boolean(state?.hasToken);
    const pendingPairing = state?.pendingPairingConfirmation;
    const hasTask = Boolean(state?.config?.collectionTaskId);
    const needsRouteOverride = collectable && routeKey === "UNKNOWN";
    renderRouteOverrideOptions(boundTask, needsRouteOverride ? els.routeOverride.value : "");
    toggle(els.pairingPanel, !hasToken);
    toggle(els.pairingConfirmationPanel, !hasToken && Boolean(pendingPairing));
    toggle(els.taskPanel, hasToken && !hasTask);
    toggle(els.boundPanel, hasToken && hasTask);
    toggle(els.routeOverridePanel, hasToken && hasTask && needsRouteOverride);
    if (!needsRouteOverride) els.routeOverride.value = "";
    els.captureBtn.disabled = !collectable || !hasTask || needsRouteOverride && !els.routeOverride.value;
    els.nextRoute.textContent = nextPendingRouteLabel(state);
    els.pendingPairServer.textContent = pendingPairing?.apiBaseUrl || "-";
    els.pendingPairAccount.textContent = pendingPairing ? `${pendingPairing.account.accountName}${pendingPairing.account.platformAccountId ? ` / ${pendingPairing.account.platformAccountId}` : ""}` : "-";
    els.pendingPairTask.textContent = pendingPairing?.task ? `${pendingPairing.task.projectName} / ${pendingPairing.task.pageTitle || pendingPairing.task.id}` : "\u672A\u7ED1\u5B9A\u5177\u4F53\u4EFB\u52A1";
    els.pendingPairExpiresAt.textContent = pendingPairing?.expiresAt ? new Date(pendingPairing.expiresAt).toLocaleTimeString("zh-CN") : "-";
    if (!state) {
      setStatus("\u63D2\u4EF6\u540E\u53F0\u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u5728\u6269\u5C55\u7BA1\u7406\u9875\u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6", "error");
    } else if (!hasToken && pendingPairing) {
      setStatus("\u8BF7\u5728 Popup \u6838\u5BF9\u670D\u52A1\u5668\u3001\u8D26\u53F7\u548C\u4EFB\u52A1\uFF0C\u518D\u786E\u8BA4\u914D\u5BF9", "warning");
    } else if (!hasToken) {
      setStatus("\u63D2\u4EF6\u8FD0\u884C\u6B63\u5E38\uFF0C\u8BF7\u8F93\u5165\u4EFB\u52A1\u9875\u751F\u6210\u7684\u914D\u5BF9\u7801", "warning");
    } else if (!hasTask) {
      setStatus("\u8D26\u53F7\u5DF2\u914D\u5BF9\uFF0C\u8BF7\u9009\u62E9\u91C7\u96C6\u4EFB\u52A1", "warning");
    } else if (!collectable) {
      setStatus("\u4EFB\u52A1\u5DF2\u7ED1\u5B9A\uFF0C\u8BF7\u6253\u5F00\u4EFB\u52A1\u9875\u5217\u51FA\u7684\u76EE\u6807\u540E\u53F0\u9875\u9762", "warning");
    } else if (needsRouteOverride && !els.routeOverride.value) {
      setStatus("\u5F53\u524D\u8DEF\u7EBF\u65E0\u6CD5\u81EA\u52A8\u786E\u8BA4\uFF0C\u8BF7\u4E3A\u672C\u6B21\u91C7\u96C6\u9009\u62E9\u5F53\u524D\u53EF\u89C1\u9875\u9762\u8DEF\u7EBF", "warning");
    } else {
      setStatus("\u63D2\u4EF6\u3001\u8D26\u53F7\u548C\u4EFB\u52A1\u5747\u6B63\u5E38\uFF0C\u53EF\u4EE5\u5F00\u59CB\u91C7\u96C6", "ready");
    }
  }
  async function captureAndUpload() {
    const tab = await activeTab().catch(() => void 0);
    if (!tab?.id || !isCollectable(tab.url || "")) {
      setStatus("\u5F53\u524D\u9875\u9762\u4E0D\u5728\u5141\u8BB8\u91C7\u96C6\u7684\u57DF\u540D\u767D\u540D\u5355\u4E2D", "error");
      return;
    }
    els.captureBtn.disabled = true;
    els.captureBtn.textContent = "\u6B63\u5728\u91C7\u96C6\u5E76\u4E0A\u4F20...";
    hideCaptureResult();
    try {
      const response = await runtimeMessage({
        type: MESSAGE.CAPTURE_AND_UPLOAD,
        payload: {
          tabId: tab.id,
          currentUrl: tab.url || "",
          routeOverride: els.routeOverride.value || void 0
        }
      });
      if (!response?.ok) {
        setStatus(chineseError(response?.error, "\u91C7\u96C6\u6216\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"), "error");
        showCaptureResult(chineseError(response?.error, "\u91C7\u96C6\u6216\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"), false);
        return;
      }
      const accountMessage = response.accountMatchStatus === "MATCHED" ? "\u8D26\u53F7\u5DF2\u5339\u914D" : "\u8D26\u53F7\u5F85\u4EBA\u5DE5\u786E\u8BA4";
      const skippedMessage = response.skipped ? "\u6570\u636E\u672A\u53D8\u5316\uFF0C\u5DF2\u4FDD\u7559\u4E0A\u6B21\u4E0A\u4F20" : "\u5FEB\u7167\u5DF2\u4E0A\u4F20";
      setStatus("\u91C7\u96C6\u5B8C\u6210\uFF0C\u7F51\u9875\u4EFB\u52A1\u9875\u4F1A\u81EA\u52A8\u66F4\u65B0", "ready");
      showCaptureResult(
        `${skippedMessage}\uFF1B\u8BC6\u522B ${response.metricCount || 0} \u4E2A\u6307\u6807\uFF1B\u8986\u76D6\u7387 ${formatPercent(response.coverageRatio)}\uFF1B${accountMessage}\u3002`,
        true
      );
    } catch {
      setStatus("\u63D2\u4EF6\u901A\u4FE1\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6\u548C\u76EE\u6807\u9875\u9762", "error");
      showCaptureResult("\u63D2\u4EF6\u901A\u4FE1\u4E2D\u65AD\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6\u548C\u76EE\u6807\u9875\u9762\u3002", false);
    } finally {
      els.captureBtn.textContent = "\u91C7\u96C6\u5E76\u4E0A\u4F20\u5F53\u524D\u8DEF\u7EBF";
      await render();
    }
  }
  async function pairExtension() {
    const code = els.pairingCode.value.trim();
    if (!/^\d{6}$/.test(code)) {
      setStatus("\u8BF7\u8F93\u5165\u4EFB\u52A1\u9875\u751F\u6210\u7684\u516D\u4F4D\u914D\u5BF9\u7801", "error");
      return;
    }
    els.pairBtn.disabled = true;
    try {
      const response = await runtimeMessage({
        type: MESSAGE.REQUEST_PAIRING_CONFIRMATION,
        payload: { apiBaseUrl: els.apiBaseUrl.value.trim(), code }
      });
      if (!response?.ok) {
        setStatus(chineseError(response?.error, "\u914D\u5BF9\u5931\u8D25\uFF0C\u8BF7\u5728\u4EFB\u52A1\u9875\u91CD\u65B0\u751F\u6210\u914D\u5BF9\u7801"), "error");
        return;
      }
      els.pairingCode.value = "";
      setStatus("\u8BF7\u6838\u5BF9\u4E0B\u65B9\u7684\u670D\u52A1\u5668\u3001\u8D26\u53F7\u548C\u4EFB\u52A1\uFF0C\u518D\u786E\u8BA4\u914D\u5BF9", "warning");
    } catch (error) {
      const message = error instanceof Error && /超时/.test(error.message) ? "\u63D2\u4EF6\u540E\u53F0\u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u5728\u6269\u5C55\u7BA1\u7406\u9875\u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6" : "\u65E0\u6CD5\u8FDE\u63A5\u8BCA\u65AD\u670D\u52A1\uFF0C\u8BF7\u786E\u8BA4 API \u6B63\u5E38\u8FD0\u884C";
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
        setStatus(chineseError(response?.error, "\u914D\u5BF9\u5931\u8D25\uFF0C\u8BF7\u5728\u4EFB\u52A1\u9875\u91CD\u65B0\u751F\u6210\u914D\u5BF9\u7801"), "error");
        return;
      }
      setStatus(response.config?.collectionTaskId ? "\u8D26\u53F7\u548C\u5F53\u524D\u4EFB\u52A1\u5DF2\u5B89\u5168\u7ED1\u5B9A" : "\u8D26\u53F7\u5DF2\u914D\u5BF9\uFF0C\u8BF7\u9009\u62E9\u91C7\u96C6\u4EFB\u52A1", response.config?.collectionTaskId ? "ready" : "warning");
    } catch {
      setStatus("\u63D2\u4EF6\u540E\u53F0\u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u5728\u6269\u5C55\u7BA1\u7406\u9875\u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6", "error");
    } finally {
      els.confirmPairBtn.disabled = false;
      await render();
    }
  }
  async function cancelPairing() {
    const response = await runtimeMessage({ type: MESSAGE.CANCEL_PAIRING });
    setStatus(response?.ok ? "\u5DF2\u53D6\u6D88\u5F85\u786E\u8BA4\u914D\u5BF9" : chineseError(response?.error, "\u53D6\u6D88\u5F85\u786E\u8BA4\u914D\u5BF9\u5931\u8D25"), response?.ok ? "warning" : "error");
    await render();
  }
  async function selectTask() {
    if (!els.taskSelect.value) {
      setStatus("\u5F53\u524D\u8D26\u53F7\u6682\u65E0\u53EF\u7528\u4EFB\u52A1\uFF0C\u8BF7\u5148\u5728\u7F51\u9875\u521B\u5EFA\u91C7\u96C6\u4EFB\u52A1", "error");
      return;
    }
    const response = await runtimeMessage({ type: MESSAGE.SELECT_TASK, payload: { collectionTaskId: els.taskSelect.value } });
    setStatus(response?.ok ? `\u5DF2\u7ED1\u5B9A\u9879\u76EE\uFF1A${response.config?.projectName || "\u672A\u547D\u540D\u9879\u76EE"}` : chineseError(response?.error, "\u4EFB\u52A1\u5207\u6362\u5931\u8D25"), response?.ok ? "ready" : "error");
    await render();
  }
  async function clearPairing() {
    const response = await runtimeMessage({ type: MESSAGE.CLEAR_PAIRING });
    setStatus(response?.ok ? "\u5DF2\u89E3\u9664\u672C\u5730\u7ED1\u5B9A\uFF1B\u670D\u52A1\u7AEF\u6388\u6743\u53EF\u5728\u8D26\u53F7\u6863\u6848\u4E2D\u64A4\u9500" : chineseError(response?.error, "\u89E3\u9664\u7ED1\u5B9A\u5931\u8D25"), response?.ok ? "warning" : "error");
    hideCaptureResult();
    await render();
  }
  function renderTaskOptions(context, selectedTaskId) {
    const options = [];
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = context?.account ? "\u8BF7\u9009\u62E9\u8BE5\u8D26\u53F7\u4E0B\u7684\u91C7\u96C6\u4EFB\u52A1" : "\u8BF7\u5148\u914D\u5BF9\u8D26\u53F7";
    options.push(placeholder);
    for (const project of context?.account?.projects || []) {
      for (const task of project.tasks || []) {
        const option = document.createElement("option");
        option.value = task.id;
        option.textContent = `${project.name} / ${task.pageTitle || "\u672A\u547D\u540D\u4EFB\u52A1"}`;
        option.selected = task.id === selectedTaskId;
        options.push(option);
      }
    }
    els.taskSelect.replaceChildren(...options);
  }
  function renderRouteOverrideOptions(task, selectedRouteKey) {
    const selected = normalizeCollectionRouteKey(selectedRouteKey);
    const options = [];
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = task ? "\u8BF7\u9009\u62E9\u5F53\u524D\u53EF\u89C1\u8DEF\u7EBF" : "\u7B49\u5F85\u4EFB\u52A1\u8DEF\u7EBF\u4FE1\u606F";
    options.push(placeholder);
    const seen = /* @__PURE__ */ new Set();
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
  async function startPatrol() {
    const requiredRoutes = selectedRoutes();
    if (!requiredRoutes.length) {
      setStatus("\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u76EE\u6807\u9875\u9762", "error");
      return;
    }
    const tab = await activeTab().catch(() => void 0);
    const response = await runtimeMessage({ type: MESSAGE.START_PATROL, payload: { requiredRoutes, tabId: tab?.id } });
    setStatus(response?.ok ? "\u56FA\u5B9A\u9875\u9762\u5DE1\u68C0\u5DF2\u5F00\u542F" : chineseError(response?.error, "\u5DE1\u68C0\u542F\u52A8\u5931\u8D25"), response?.ok ? "ready" : "error");
    await render();
  }
  async function stopPatrol() {
    const tab = await activeTab().catch(() => void 0);
    const response = await runtimeMessage({ type: MESSAGE.STOP_PATROL, payload: { tabId: tab?.id } });
    setStatus(response?.ok ? "\u5DE1\u68C0\u5DF2\u505C\u6B62" : chineseError(response?.error, "\u5DE1\u68C0\u505C\u6B62\u5931\u8D25"), response?.ok ? "warning" : "error");
    await render();
  }
  function selectedRoutes() {
    const choices = [
      ["routeDashboard", "LOCAL_PROMOTION_DASHBOARD"],
      ["routeLive", "LIVE_DATA_SCREEN"],
      ["routeProduct", "LIVE_PRODUCT_TAB"],
      ["routeTraffic", "LIVE_TRAFFIC_TAB"],
      ["routeTask", "TASK_TABLE"],
      ["routeMaterial", "MATERIAL_LIBRARY"],
      ["routeTrend", "HOURLY_TREND"]
    ];
    return choices.filter(([id]) => document.getElementById(id)?.checked).map(([, route]) => route);
  }
  async function openSidePanel() {
    await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    window.close();
  }
  async function uploadSnapshot() {
    const response = await runtimeMessage({ type: MESSAGE.UPLOAD_SNAPSHOT });
    setStatus(response?.ok ? "\u4E0A\u6B21\u5FEB\u7167\u5DF2\u91CD\u65B0\u4E0A\u4F20" : chineseError(response?.error, "\u5FEB\u7167\u4E0A\u4F20\u5931\u8D25"), response?.ok ? "ready" : "error");
    await render();
  }
  async function clearSnapshot() {
    await runtimeMessage({ type: MESSAGE.CLEAR_SNAPSHOT });
    setStatus("\u672C\u5730\u5FEB\u7167\u5DF2\u6E05\u7A7A", "warning");
    hideCaptureResult();
    await render();
  }
  function setStatus(message, tone) {
    els.status.textContent = message;
    els.statusDot.className = `status-dot${tone === "neutral" ? "" : ` ${tone}`}`;
  }
  function toggle(element, visible) {
    element.classList.toggle("hidden", !visible);
  }
  function showCaptureResult(message, success) {
    els.captureResult.textContent = message;
    els.captureResult.className = `panel ${success ? "success" : "error-box"}`;
  }
  function hideCaptureResult() {
    els.captureResult.className = "panel success hidden";
    els.captureResult.textContent = "";
  }
  function isCollectable(url) {
    return isSupportedExtensionCollectionUrl(url);
  }
  function inferPageTypeFromUrl(url) {
    if (/liveboard|liveScreen|room|screen/i.test(url)) return "LIVE_DATA_SCREEN";
    if (/task|campaign|ad|promotion|local|cockpit/i.test(url)) return "LOCAL_PROMOTION_DASHBOARD";
    return "UNKNOWN";
  }
  function pageTypeLabel(value) {
    const labels = {
      LIVE_DATA_SCREEN: "\u76F4\u64AD\u6570\u636E\u5927\u5C4F",
      LOCAL_PROMOTION_DASHBOARD: "\u5DE8\u91CF\u672C\u5730\u63A8\u6570\u636E\u9875",
      TASK_TABLE: "\u4EFB\u52A1\u6216\u8BA1\u5212\u5217\u8868",
      UNKNOWN: "\u5C1A\u672A\u8BC6\u522B"
    };
    return labels[value] || value;
  }
  function routeLabel(routeKey) {
    return collectionRouteLabels[routeKey] || (routeKey === "UNKNOWN" ? "\u5C1A\u672A\u8BC6\u522B" : routeKey);
  }
  function nextPendingRouteLabel(state) {
    const task = currentTask(state);
    const next = task?.routeSources?.find((route) => !state?.routeUploadState?.[route.routeKey]);
    return next ? routeLabel(normalizeCollectionRouteKey(next.routeKey)) : task ? "\u672C\u8F6E\u8DEF\u7EBF\u5DF2\u5B8C\u6210" : "\u7B49\u5F85\u4EFB\u52A1\u4FE1\u606F";
  }
  function currentTask(state) {
    const taskId = state?.config?.collectionTaskId;
    return state?.context?.account?.projects?.flatMap((project) => project.tasks || []).find((item) => item.id === taskId) || null;
  }
  function runtimeMessage(message, timeoutMs = 5e3) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("\u63D2\u4EF6\u540E\u53F0\u54CD\u5E94\u8D85\u65F6")), timeoutMs);
      chrome.runtime.sendMessage(message).then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        }
      );
    });
  }
  function contentMessage(tabId, message, timeoutMs = 5e3) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("\u9875\u9762\u63A2\u6D4B\u8D85\u65F6")), timeoutMs);
      chrome.tabs.sendMessage(tabId, message).then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        }
      );
    });
  }
  function formatPercent(value) {
    return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "\u5F85\u786E\u8BA4";
  }
  function chineseError(value, fallback) {
    const message = typeof value === "string" ? value.trim() : "";
    if (!message) return fallback;
    if (/failed to fetch|networkerror|load failed/i.test(message)) return "\u65E0\u6CD5\u8FDE\u63A5\u8BCA\u65AD\u670D\u52A1\uFF0C\u8BF7\u68C0\u67E5 API \u662F\u5426\u8FD0\u884C";
    if (/receiving end does not exist|could not establish connection/i.test(message)) return "\u63D2\u4EF6\u5C1A\u672A\u6CE8\u5165\u5F53\u524D\u9875\u9762\uFF0C\u8BF7\u5237\u65B0\u76EE\u6807\u7F51\u9875\u540E\u91CD\u8BD5";
    return message;
  }
})();
