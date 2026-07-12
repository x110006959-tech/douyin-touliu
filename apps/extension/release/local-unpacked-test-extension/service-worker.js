"use strict";
(() => {
  // ../../packages/shared/dist/collection-routes.js
  var collectionFreshnessPolicy = {
    agingAfterMs: 5 * 60 * 1e3,
    staleAfterMs: 10 * 60 * 1e3,
    patrolIntervalMs: 60 * 1e3,
    heartbeatUploadMs: 5 * 60 * 1e3,
    routeFailureThreshold: 3
  };
  var defaultRequiredCollectionRoutes = [
    "LOCAL_PROMOTION_DASHBOARD",
    "LIVE_DATA_SCREEN",
    "TASK_TABLE"
  ];

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

  // ../../packages/shared/dist/safety.js
  var snapshotSafetyLimits = {
    rawDomTextChars: 2e5,
    pageTitleChars: 500,
    urlChars: 2048,
    networkRecords: 50,
    networkRecordChars: 256e3,
    networkTotalChars: 1e6,
    tableItems: 20,
    visibleMetrics: 200,
    arrayItems: 200,
    objectKeys: 500,
    depth: 12,
    stringChars: 2e5
  };
  var redacted = "[REDACTED]";
  var truncated = "[TRUNCATED]";
  var sensitiveContains = ["token", "cookie", "password", "passwd", "authorization", "secret", "session", "credential"];
  var sensitiveExact = /* @__PURE__ */ new Set([
    "accesstoken",
    "refreshtoken",
    "phone",
    "mobile",
    "idcard",
    "identitycard",
    "email",
    "name",
    "realname",
    "username",
    "nickname",
    "contactname",
    "legalperson",
    "\u8EAB\u4EFD\u8BC1",
    "\u624B\u673A\u53F7",
    "\u59D3\u540D"
  ]);
  function shouldRedactSensitiveKey(key) {
    const normalized = normalizeKey(key);
    return sensitiveExact.has(normalized) || sensitiveContains.some((part) => normalized.includes(part));
  }
  function sanitizeVisibleText(text, maxChars = snapshotSafetyLimits.stringChars) {
    let sanitized = truncateText(text, maxChars);
    if (sanitized.includes("@"))
      sanitized = sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, redacted);
    if (/\d/.test(sanitized)) {
      sanitized = sanitized.replace(/\b1[3-9]\d{9}\b/g, redacted).replace(/\b\d{17}[\dXx]\b/g, redacted);
    }
    if (/bearer/i.test(sanitized))
      sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${redacted}`);
    if (/password|passwd|token|authorization|cookie|secret|session|credential/i.test(sanitized)) {
      sanitized = sanitized.replace(/((?:password|passwd|token|authorization|cookie|secret|session|credential)\s*[:=]\s*)[^\s,;&]+/gi, `$1${redacted}`);
    }
    return truncateText(sanitized, maxChars);
  }
  function sanitizeSensitiveData(value, depth = 0) {
    if (depth > snapshotSafetyLimits.depth)
      return truncated;
    const holder = {};
    const stack = [
      { input: value, parent: holder, key: "value", depth }
    ];
    const seen = /* @__PURE__ */ new WeakSet();
    while (stack.length) {
      const current = stack.pop();
      if (current.depth > snapshotSafetyLimits.depth) {
        current.parent[current.key] = truncated;
        continue;
      }
      if (typeof current.input === "string") {
        current.parent[current.key] = sanitizeVisibleText(current.input);
        continue;
      }
      if (!current.input || typeof current.input !== "object") {
        current.parent[current.key] = current.input;
        continue;
      }
      if (seen.has(current.input)) {
        current.parent[current.key] = truncated;
        continue;
      }
      seen.add(current.input);
      if (Array.isArray(current.input)) {
        const output2 = [];
        current.parent[current.key] = output2;
        const length = Math.min(current.input.length, snapshotSafetyLimits.arrayItems);
        for (let index = length - 1; index >= 0; index -= 1) {
          stack.push({ input: current.input[index], parent: output2, key: index, depth: current.depth + 1 });
        }
        continue;
      }
      const output = {};
      current.parent[current.key] = output;
      const entries = [];
      let count = 0;
      for (const key in current.input) {
        if (!Object.prototype.hasOwnProperty.call(current.input, key))
          continue;
        entries.push([key, current.input[key]]);
        count += 1;
        if (count >= snapshotSafetyLimits.objectKeys)
          break;
      }
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, raw] = entries[index];
        if (shouldRedactSensitiveKey(key))
          output[key] = redacted;
        else
          stack.push({ input: raw, parent: output, key, depth: current.depth + 1 });
      }
    }
    return holder.value;
  }
  function sanitizeCaptureUrl(inputUrl, baseUrl = "https://example.invalid") {
    try {
      const url = new URL(inputUrl, baseUrl);
      url.username = url.username ? redacted : "";
      url.password = url.password ? redacted : "";
      for (const key of [...url.searchParams.keys()]) {
        if (shouldRedactSensitiveKey(key))
          url.searchParams.set(key, redacted);
      }
      return truncateText(url.href, snapshotSafetyLimits.urlChars);
    } catch {
      return sanitizeVisibleText(inputUrl, snapshotSafetyLimits.urlChars);
    }
  }
  function sanitizeCollectionSnapshotPayload(snapshot) {
    const truncatedFields = [
      ...snapshot.rawDomText.length > snapshotSafetyLimits.rawDomTextChars ? ["rawDomText"] : [],
      ...snapshot.rawNetworkJson.length ? ["rawNetworkJson"] : [],
      ...snapshot.rawTableData.length > snapshotSafetyLimits.tableItems ? ["rawTableData"] : [],
      ...(snapshot.visibleMetricsJson?.length || 0) > snapshotSafetyLimits.visibleMetrics ? ["visibleMetricsJson"] : []
    ];
    const sanitized = {
      ...snapshot,
      sourceUrl: sanitizeCaptureUrl(snapshot.sourceUrl || ""),
      pageTitle: sanitizeVisibleText(snapshot.pageTitle || "", snapshotSafetyLimits.pageTitleChars),
      rawDomText: sanitizeVisibleText(snapshot.rawDomText || "", snapshotSafetyLimits.rawDomTextChars),
      rawNetworkJson: [],
      rawTableData: limitArrayValue(sanitizeSensitiveData(snapshot.rawTableData.slice(0, snapshotSafetyLimits.tableItems)), snapshotSafetyLimits.networkTotalChars),
      visibleMetricsJson: (snapshot.visibleMetricsJson || []).slice(0, snapshotSafetyLimits.visibleMetrics).map(sanitizeVisibleMetric),
      screenshotUrl: snapshot.screenshotUrl ? sanitizeCaptureUrl(snapshot.screenshotUrl) : snapshot.screenshotUrl
    };
    if ("captureMeta" in snapshot && snapshot.captureMeta && typeof snapshot.captureMeta === "object") {
      const meta = snapshot.captureMeta;
      sanitized.captureMeta = {
        ...meta,
        acceptedBytes: serializedLength({ rawDomText: sanitized.rawDomText, rawTableData: sanitized.rawTableData, visibleMetricsJson: sanitized.visibleMetricsJson }),
        truncatedFields: [.../* @__PURE__ */ new Set([...Array.isArray(meta.truncatedFields) ? meta.truncatedFields.map(String) : [], ...truncatedFields])],
        truncationReasons: [.../* @__PURE__ */ new Set([...Array.isArray(meta.truncationReasons) ? meta.truncationReasons.map(String) : [], ...snapshot.rawNetworkJson.length ? ["NETWORK_CAPTURE_DISABLED"] : [], ...truncatedFields.length ? ["SNAPSHOT_SAFETY_LIMIT"] : []])]
      };
    }
    return sanitized;
  }
  function sanitizeVisibleMetric(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return sanitizeSensitiveData(value);
    const metric = value;
    const sanitized = sanitizeSensitiveData(metric);
    return {
      ...sanitized,
      key: sanitizeVisibleText(String(metric.key || "unknown"), 100),
      name: sanitizeVisibleText(String(metric.name || ""), 200)
    };
  }
  function limitSerializedValue(value, maxChars) {
    const serialized = safeStringify(value);
    if (serialized.length <= maxChars)
      return value;
    return {
      truncated: true,
      originalChars: serialized.length,
      preview: truncateText(serialized, Math.min(1e4, maxChars))
    };
  }
  function limitArrayValue(value, maxChars) {
    const limited = limitSerializedValue(value, maxChars);
    return Array.isArray(limited) ? limited : [limited];
  }
  function serializedLength(value) {
    return safeStringify(value).length;
  }
  function safeStringify(value) {
    try {
      return JSON.stringify(value) || "";
    } catch {
      return JSON.stringify({ truncated: true, reason: "non_serializable" });
    }
  }
  function truncateText(value, maxChars) {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars)}${truncated}`;
  }
  function normalizeKey(key) {
    return key.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "").toLowerCase();
  }

  // src/safety.ts
  var sanitizeSnapshotPayload = sanitizeCollectionSnapshotPayload;
  function normalizeApiBaseUrl(value) {
    try {
      const url = new URL(value);
      const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.username || url.password || url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) return null;
      return url.href.replace(/\/$/, "");
    } catch {
      return null;
    }
  }

  // src/service-worker.ts
  var uploadQueue = Promise.resolve();
  chrome.runtime.onInstalled.addListener(() => {
    void appendLog("extension.installed");
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === MESSAGE.SNAPSHOT_CAPTURED) {
      void saveSnapshot(message.payload, sender.tab?.id).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.METRIC_PULSE_CAPTURED) {
      void uploadMetricPulse(message.payload).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.PAGE_ACTIVITY) {
      void chrome.storage.local.set({ [STORAGE.PAGE_ACTIVITY]: message.payload }).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === MESSAGE.GET_STATE) {
      void getState().then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.SAVE_CONFIG) {
      void saveConfig(message.payload || {}).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.UPLOAD_SNAPSHOT) {
      void uploadLatestSnapshot().then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.START_PATROL) {
      void startPatrol(message.payload || {}).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.STOP_PATROL) {
      void stopPatrol().then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.CLEAR_SNAPSHOT) {
      void chrome.storage.local.remove(STORAGE.LATEST_SNAPSHOT).then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });
  async function saveSnapshot(snapshot, tabId) {
    const safeSnapshot = sanitizeSnapshotPayload(snapshot);
    await chrome.storage.local.set({
      [STORAGE.LATEST_SNAPSHOT]: {
        ...safeSnapshot,
        extensionMeta: {
          tabId: tabId ?? null,
          savedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    });
    await appendLog("snapshot.saved", { sourceUrl: safeSnapshot.sourceUrl, metricCount: safeSnapshot.visibleMetricsJson.length, pageType: safeSnapshot.pageType });
    const local = await chrome.storage.local.get([STORAGE.PATROL]);
    const patrol = local[STORAGE.PATROL] || {};
    if (patrol.enabled && patrol.collectionRunId && safeSnapshot.collectionRunId === patrol.collectionRunId) {
      const upload = await enqueueSnapshotUpload(safeSnapshot);
      return { ok: true, upload };
    }
    return { ok: true };
  }
  async function saveConfig(payload) {
    const apiBaseUrl = normalizeApiBaseUrl(payload.apiBaseUrl || "http://localhost:4000");
    if (!apiBaseUrl) return { ok: false, error: "API address must use HTTPS, except for localhost development." };
    const config = {
      apiBaseUrl,
      collectionTaskId: payload.collectionTaskId
    };
    await chrome.storage.local.set({ [STORAGE.CONFIG]: config });
    if (payload.token) {
      await chrome.storage.session.set({ [STORAGE.TOKEN]: payload.token });
    }
    await appendLog("config.saved", { apiBaseUrl: config.apiBaseUrl, collectionTaskId: config.collectionTaskId, tokenStoredInSession: Boolean(payload.token) });
    return { ok: true };
  }
  async function getState() {
    const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.LATEST_SNAPSHOT, STORAGE.LOGS, STORAGE.PATROL, STORAGE.ROUTE_UPLOAD_STATE, STORAGE.LATEST_SIGNALS, STORAGE.PAGE_ACTIVITY]);
    const session = await chrome.storage.session.get([STORAGE.TOKEN]);
    return {
      ok: true,
      config: local[STORAGE.CONFIG] || {},
      latestSnapshot: local[STORAGE.LATEST_SNAPSHOT] || null,
      logs: local[STORAGE.LOGS] || [],
      patrol: local[STORAGE.PATROL] || { enabled: false },
      routeUploadState: local[STORAGE.ROUTE_UPLOAD_STATE] || {},
      latestSignals: local[STORAGE.LATEST_SIGNALS] || [],
      pageActivity: local[STORAGE.PAGE_ACTIVITY] || null,
      hasToken: Boolean(session[STORAGE.TOKEN])
    };
  }
  async function uploadMetricPulse(pulse) {
    const context = await apiContext();
    if (!context.ok) return context;
    if (pulse.tabState !== "VISIBLE") return { ok: true, skipped: true, reason: "PAGE_INACTIVE" };
    try {
      const response = await fetch(`${context.apiBaseUrl}/collection-tasks/${context.collectionTaskId}/metric-pulses`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${context.token}` },
        body: JSON.stringify(pulse)
      });
      const body = await response.json();
      if (!response.ok) return { ok: false, error: body?.error?.message || `HTTP ${response.status}` };
      const signals = body?.data?.signals || [];
      await chrome.storage.local.set({ [STORAGE.LATEST_SIGNALS]: signals, [STORAGE.PAGE_ACTIVITY]: { tabState: pulse.tabState, observedAt: pulse.localCapturedAt } });
      return { ok: true, signals };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Metric pulse upload failed" };
    }
  }
  async function uploadLatestSnapshot() {
    const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.LATEST_SNAPSHOT]);
    const session = await chrome.storage.session.get([STORAGE.TOKEN]);
    const config = local[STORAGE.CONFIG] || {};
    const snapshot = local[STORAGE.LATEST_SNAPSHOT];
    const token = session[STORAGE.TOKEN];
    if (!config.apiBaseUrl || !config.collectionTaskId) return { ok: false, error: "Configure API base URL and collection task ID first." };
    const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
    if (!apiBaseUrl) return { ok: false, error: "Configured API address is not allowed." };
    if (!token) return { ok: false, error: "Missing SaaS API token. Configure it in the popup." };
    if (!snapshot) return { ok: false, error: "No local snapshot available." };
    return enqueueSnapshotUpload(snapshot);
  }
  function enqueueSnapshotUpload(snapshot) {
    const next = uploadQueue.then(() => uploadSnapshot(snapshot));
    uploadQueue = next.then(() => void 0, () => void 0);
    return next;
  }
  async function uploadSnapshot(snapshot) {
    const local = await chrome.storage.local.get([STORAGE.CONFIG, STORAGE.ROUTE_UPLOAD_STATE]);
    const session = await chrome.storage.session.get([STORAGE.TOKEN]);
    const config = local[STORAGE.CONFIG] || {};
    const token = session[STORAGE.TOKEN];
    if (!config.apiBaseUrl || !config.collectionTaskId) return { ok: false, error: "Configure API base URL and collection task ID first." };
    const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
    if (!apiBaseUrl) return { ok: false, error: "Configured API address is not allowed." };
    if (!token) return { ok: false, error: "Missing SaaS API token. Configure it in the popup." };
    const routeKey = snapshot.routeKey || snapshot.pageType || "UNKNOWN";
    const routeState = local[STORAGE.ROUTE_UPLOAD_STATE] || {};
    const fingerprint = snapshotFingerprint(snapshot);
    const previous = routeState[routeKey];
    if (previous?.fingerprint === fingerprint && Date.now() - previous.lastUploadAt < collectionFreshnessPolicy.heartbeatUploadMs) {
      return { ok: true, skipped: true, reason: "UNCHANGED" };
    }
    let response;
    try {
      response = await fetch(`${apiBaseUrl}/collection-tasks/${config.collectionTaskId}/snapshots`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": `snapshot:${config.collectionTaskId}:${snapshot.localCollectedAt}`.slice(0, 128),
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(sanitizeSnapshotPayload(snapshot))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network upload failed";
      routeState[routeKey] = {
        fingerprint,
        lastUploadAt: previous?.lastUploadAt || 0,
        consecutiveFailures: (previous?.consecutiveFailures || 0) + 1
      };
      await chrome.storage.local.set({ [STORAGE.ROUTE_UPLOAD_STATE]: routeState });
      await appendLog("snapshot.upload_failed", { routeKey, error: message });
      if (snapshot.collectionRunId) await reportRouteFailure(apiBaseUrl, token, snapshot.collectionRunId, routeKey, message);
      return { ok: false, error: message };
    }
    const payload = await response.json();
    await appendLog("snapshot.uploaded", { ok: response.ok, status: response.status });
    routeState[routeKey] = {
      fingerprint,
      lastUploadAt: response.ok ? Date.now() : previous?.lastUploadAt || 0,
      consecutiveFailures: response.ok ? 0 : (previous?.consecutiveFailures || 0) + 1
    };
    await chrome.storage.local.set({ [STORAGE.ROUTE_UPLOAD_STATE]: routeState });
    if (!response.ok && snapshot.collectionRunId) {
      await reportRouteFailure(apiBaseUrl, token, snapshot.collectionRunId, routeKey, payload?.error?.message || `HTTP ${response.status}`);
    }
    return response.ok ? { ok: true, data: payload } : { ok: false, error: payload?.error?.message || "Upload failed." };
  }
  async function startPatrol(payload) {
    const context = await apiContext();
    if (!context.ok) return context;
    const requiredRoutes = payload.requiredRoutes?.length ? payload.requiredRoutes : [...defaultRequiredCollectionRoutes];
    const response = await fetch(`${context.apiBaseUrl}/collection-tasks/${context.collectionTaskId}/collection-runs`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${context.token}` },
      body: JSON.stringify({ requiredRoutes })
    });
    const body = await response.json();
    if (!response.ok) return { ok: false, error: body?.error?.message || "Unable to start patrol." };
    const run = body?.data;
    const patrol = {
      enabled: true,
      collectionRunId: run.id,
      requiredRoutes,
      intervalMs: Math.max(3e4, payload.intervalMs || collectionFreshnessPolicy.patrolIntervalMs),
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await chrome.storage.local.set({ [STORAGE.PATROL]: patrol, [STORAGE.ROUTE_UPLOAD_STATE]: {} });
    await appendLog("patrol.started", { collectionRunId: run.id, requiredRoutes });
    return { ok: true, patrol, run };
  }
  async function stopPatrol() {
    const local = await chrome.storage.local.get([STORAGE.PATROL]);
    const patrol = local[STORAGE.PATROL] || {};
    const context = await apiContext();
    if (patrol.collectionRunId && context.ok) {
      await fetch(`${context.apiBaseUrl}/collection-runs/${patrol.collectionRunId}/stop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${context.token}` }
      });
    }
    const stopped = {
      enabled: false,
      collectionRunId: null,
      requiredRoutes: patrol.requiredRoutes || [...defaultRequiredCollectionRoutes],
      intervalMs: patrol.intervalMs || collectionFreshnessPolicy.patrolIntervalMs,
      startedAt: null
    };
    await chrome.storage.local.set({ [STORAGE.PATROL]: stopped });
    await appendLog("patrol.stopped", { collectionRunId: patrol.collectionRunId || null });
    return { ok: true, patrol: stopped };
  }
  async function apiContext() {
    const local = await chrome.storage.local.get([STORAGE.CONFIG]);
    const session = await chrome.storage.session.get([STORAGE.TOKEN]);
    const config = local[STORAGE.CONFIG] || {};
    const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl || "");
    const token = session[STORAGE.TOKEN];
    if (!apiBaseUrl || !config.collectionTaskId) return { ok: false, error: "Configure API base URL and collection task ID first." };
    if (!token) return { ok: false, error: "Missing SaaS API token. Configure it in the popup." };
    return { ok: true, apiBaseUrl, collectionTaskId: config.collectionTaskId, token };
  }
  async function reportRouteFailure(apiBaseUrl, token, collectionRunId, routeKey, error) {
    await fetch(`${apiBaseUrl}/collection-runs/${collectionRunId}/failures`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ routeKey, error: String(error).slice(0, 500) })
    }).catch(() => void 0);
  }
  function snapshotFingerprint(snapshot) {
    const value = JSON.stringify({ routeKey: snapshot.routeKey, metrics: snapshot.visibleMetricsJson, tables: snapshot.rawTableData });
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
  async function appendLog(action, detail) {
    const current = await chrome.storage.local.get([STORAGE.LOGS]);
    const logs = Array.isArray(current[STORAGE.LOGS]) ? current[STORAGE.LOGS] : [];
    logs.unshift({ action, detail, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    await chrome.storage.local.set({ [STORAGE.LOGS]: logs.slice(0, 100) });
  }
})();
