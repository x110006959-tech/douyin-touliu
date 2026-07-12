"use strict";
(() => {
  // ../../packages/shared/dist/collection-routes.js
  var collectionRouteKeys = [
    "LOCAL_PROMOTION_DASHBOARD",
    "LIVE_DATA_SCREEN",
    "TASK_TABLE",
    "MATERIAL_LIBRARY",
    "HOURLY_TREND",
    "UNKNOWN"
  ];
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
  function inferCollectionRoute(input) {
    const haystack = `${input.sourceUrl || ""}
${input.pageTitle || ""}`.toLowerCase();
    if (/material|creative|素材/.test(haystack))
      return "MATERIAL_LIBRARY";
    if (/hour|trend|小时|趋势/.test(haystack))
      return "HOURLY_TREND";
    if (/task|campaign|计划|任务/.test(haystack))
      return "TASK_TABLE";
    if (/live|room|直播|大屏/.test(haystack))
      return "LIVE_DATA_SCREEN";
    const pageType = normalizeCollectionRouteKey(input.pageType);
    if (pageType !== "UNKNOWN")
      return pageType;
    if (/promotion|local|投放|本地推/.test(haystack))
      return "LOCAL_PROMOTION_DASHBOARD";
    return "UNKNOWN";
  }

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

  // src/page-adapters.ts
  var commonMetrics = [
    { key: "spend", name: "ad spend", unit: "yuan", labels: ["\u6D88\u8017", "\u5E7F\u544A\u6D88\u8017", "\u4ECA\u65E5\u6D88\u8017"] },
    { key: "daily_budget", name: "daily budget", unit: "yuan", labels: ["\u65E5\u9884\u7B97", "\u9884\u7B97"] },
    { key: "remaining_budget", name: "remaining budget", unit: "yuan", labels: ["\u5269\u4F59\u9884\u7B97"] },
    { key: "impressions", name: "impressions", labels: ["\u66DD\u5149\u6B21\u6570", "\u66DD\u5149\u91CF", "\u5546\u54C1\u66DD\u5149\u4EBA\u6570", "\u76F4\u64AD\u66DD\u5149\u4EBA\u6570"] },
    { key: "clicks", name: "clicks", labels: ["\u70B9\u51FB\u4EBA\u6570", "\u5546\u54C1\u70B9\u51FB\u4EBA\u6570", "\u70B9\u51FB\u6B21\u6570"] },
    { key: "ctr", name: "click through rate", unit: "%", labels: ["\u5546\u54C1\u70B9\u51FB\u7387", "\u70B9\u51FB\u7387", "CTR"] },
    { key: "orders", name: "orders", labels: ["\u6210\u4EA4\u8BA2\u5355\u6570", "\u652F\u4ED8\u8BA2\u5355", "\u652F\u4ED8\u8BA2\u5355\u6570", "\u6210\u4EA4\u4EBA\u6570"] },
    { key: "pay_roi", name: "pay ROI", labels: ["\u652F\u4ED8 ROI", "\u4ED8\u6B3E ROI"] },
    { key: "verify_roi", name: "verify ROI", labels: ["\u6838\u9500 ROI"] },
    { key: "gross_profit_roi", name: "gross profit ROI", labels: ["\u6BDB\u5229 ROI"] },
    { key: "gmv", name: "GMV", unit: "yuan", labels: ["\u6210\u4EA4\u91D1\u989D", "\u652F\u4ED8\u91D1\u989D", "GMV"] },
    { key: "live_viewers", name: "live viewers", labels: ["\u76F4\u64AD\u95F4\u89C2\u770B\u4EBA\u6570", "\u89C2\u770B\u4EBA\u6570", "\u770B\u64AD\u4EBA\u6570", "\u6574\u573A\u7D2F\u8BA1\u770B\u64AD\u4EBA\u6570"] },
    { key: "store_searches", name: "store searches", labels: ["\u95E8\u5E97\u641C\u7D22\u91CF", "\u641C\u7D22\u91CF"] },
    { key: "poi_visits", name: "POI visits", labels: ["POI\u8BBF\u95EE", "POI \u8BBF\u95EE", "\u95E8\u5E97\u8BBF\u95EE"] },
    { key: "shelf_gmv", name: "shelf GMV", unit: "yuan", labels: ["\u8D27\u67B6\u6210\u4EA4", "\u56E2\u8D2D\u8D27\u67B6"] },
    { key: "search_gmv", name: "search GMV", unit: "yuan", labels: ["\u641C\u7D22\u6210\u4EA4"] }
  ];
  var adapters = [
    createAdapter("live-screen", "LIVE_DATA_SCREEN", ["gmv", "live_viewers", "impressions", "clicks", "orders"], ["\u76F4\u64AD\u6570\u636E\u5927\u5C4F", "\u76F4\u64AD\u95F4", "\u770B\u64AD", "\u66DD\u5149\u4EBA\u6570", "\u6210\u4EA4\u4EBA\u6570"]),
    createAdapter("local-promotion", "LOCAL_PROMOTION_DASHBOARD", ["spend", "daily_budget", "pay_roi", "orders", "impressions", "clicks"], ["\u5DE8\u91CF\u672C\u5730\u63A8", "\u672C\u5730\u63A8", "\u6295\u653E", "\u51FA\u4EF7", "\u9884\u7B97", "\u6D88\u8017"]),
    createAdapter("task-table", "TASK_TABLE", ["spend", "daily_budget", "orders"], ["\u4EFB\u52A1\u5217\u8868", "\u8BA1\u5212\u5217\u8868", "\u5E7F\u544A\u7EC4", "\u5355\u5143", "\u521B\u610F", "\u72B6\u6001"])
  ];
  function selectPageAdapter(input) {
    return adapters.find((adapter) => adapter.detect(input)) || unknownAdapter;
  }
  function createAdapter(id, pageType, expectedFields, keywords) {
    return {
      id,
      version: "1.0.0",
      pageType,
      expectedFields,
      detect(input) {
        const combined = `${input.title}
${input.url}
${input.visibleText.slice(0, 5e4)}`;
        return keywords.some((keyword) => combined.includes(keyword));
      },
      extractMetrics(input) {
        return extractMetricsFromText(input.visibleText);
      },
      extractCoverage(input, metrics) {
        return buildCaptureMeta(this, input, metrics);
      }
    };
  }
  var unknownAdapter = {
    id: "unknown-page",
    version: "1.0.0",
    pageType: "UNKNOWN",
    expectedFields: [],
    detect: () => true,
    extractMetrics: (input) => extractMetricsFromText(input.visibleText),
    extractCoverage(input, metrics) {
      return buildCaptureMeta(this, input, metrics);
    }
  };
  function extractMetricsFromText(text) {
    return commonMetrics.flatMap((definition) => {
      const evidence = extractValueAfterAnyLabel(text, definition.labels);
      if (!evidence) return [];
      return [{
        key: definition.key,
        name: definition.name,
        value: parseValue(evidence.raw, definition.unit),
        unit: definition.unit || null,
        source: "dom",
        metricSource: "DOM_TEXT",
        confidence: 0.6,
        rawEvidence: { sourceType: "DOM_TEXT", textSnippet: evidence.textSnippet }
      }];
    });
  }
  function buildCaptureMeta(adapter, input, metrics) {
    const extractedFields = [...new Set(metrics.map((metric) => String(metric.key)))];
    const expected = adapter.expectedFields;
    const matched = expected.filter((field) => extractedFields.includes(field)).length;
    const coverageRatio = expected.length ? matched / expected.length : 0;
    const renderModes = ["DOM"];
    if (input.document.querySelector("table")) renderModes.push("TABLE");
    if (input.document.querySelector("canvas")) renderModes.push("CANVAS");
    if (detectVirtualizedContent(input.document)) renderModes.push("VIRTUALIZED");
    const partialRender = renderModes.includes("CANVAS") || renderModes.includes("VIRTUALIZED");
    const completeness = adapter.pageType === "UNKNOWN" ? "UNKNOWN" : partialRender || coverageRatio < 0.75 ? "PARTIAL" : "COMPLETE";
    const originalBytes = byteLength(input.visibleText) + byteLength(safeStringify(input.tables));
    const truncatedFields = input.visibleText.length >= 2e5 ? ["rawDomText"] : [];
    return {
      adapterId: adapter.id,
      adapterVersion: adapter.version,
      pageFingerprint: fingerprintPage(input),
      completeness,
      coverageRatio: Math.round(coverageRatio * 100) / 100,
      expectedFields: expected,
      extractedFields,
      visibleRegions: [...input.document.querySelectorAll("h1,h2,h3,[role=heading]")].slice(0, 30).map((element) => (element.textContent || "").trim()).filter(Boolean),
      renderModes: [...new Set(renderModes)],
      tabState: input.document.visibilityState === "visible" ? "VISIBLE" : "HIDDEN",
      originalBytes,
      acceptedBytes: originalBytes,
      truncatedFields,
      truncationReasons: truncatedFields.length ? ["DOM_TEXT_LIMIT"] : []
    };
  }
  function detectVirtualizedContent(document2) {
    return [...document2.querySelectorAll("[aria-rowcount]")].some((element) => {
      const total = Number(element.getAttribute("aria-rowcount") || 0);
      const rendered = element.querySelectorAll('[role="row"]').length;
      return total > rendered && rendered > 0;
    });
  }
  function fingerprintPage(input) {
    const headers = [...input.document.querySelectorAll("h1,h2,h3,th,[role=columnheader]")].slice(0, 50).map((element) => (element.textContent || "").trim()).join("|");
    let value = `${new URL(input.url).hostname}${new URL(input.url).pathname}|${input.title}|${headers}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function extractValueAfterAnyLabel(text, labels) {
    for (const label of labels) {
      const index = text.indexOf(label);
      if (index < 0) continue;
      const slice = text.slice(index + label.length, index + label.length + 120);
      const matched = slice.match(/[¥￥]?\s*-?\d[\d,]*(?:\.\d+)?\s*(?:万|w|W|%)?/);
      if (matched?.[0]) return { raw: matched[0], textSnippet: text.slice(Math.max(0, index - 40), Math.min(text.length, index + label.length + 120)) };
    }
    return null;
  }
  function parseValue(raw, unit) {
    const multiplier = /万|w/i.test(raw) ? 1e4 : 1;
    const percent = raw.includes("%") || unit === "%";
    const value = Number(raw.replace(/[¥￥,\s%万wW]/g, ""));
    if (!Number.isFinite(value)) return raw;
    const normalized = value * multiplier;
    return percent ? normalized / 100 : normalized;
  }
  function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
  }
  function safeStringify(value) {
    try {
      return JSON.stringify(value) || "";
    } catch {
      return "";
    }
  }

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
    const serialized = safeStringify2(value);
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
    return safeStringify2(value).length;
  }
  function safeStringify2(value) {
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

  // src/content.ts
  var patrolTimer = null;
  var pulseTimer = null;
  var pulseHeartbeatTimer = null;
  var pulseObserver = null;
  var lastPulseAt = 0;
  var visibilityHandler = null;
  var MESSAGE_PATROL_STORAGE_KEY = "douyinLocalLifeDiagnosisPatrol";
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void syncPatrol(), { once: true });
  else void syncPatrol();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[MESSAGE_PATROL_STORAGE_KEY]) void syncPatrol();
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE.START_COLLECTION) return false;
    const snapshot = collectSnapshot();
    chrome.runtime.sendMessage({ type: MESSAGE.SNAPSHOT_CAPTURED, payload: snapshot }, () => void chrome.runtime.lastError);
    sendResponse({ ok: true, snapshot });
    return true;
  });
  function collectSnapshot() {
    const rawDomText = visibleText();
    const rawTableData = collectTables();
    const adapterInput = { document, url: window.location.href, title: document.title, visibleText: rawDomText, tables: rawTableData };
    const adapter = selectPageAdapter(adapterInput);
    const visibleMetricsJson = adapter.extractMetrics(adapterInput);
    const captureMeta = adapter.extractCoverage(adapterInput, visibleMetricsJson);
    return sanitizeSnapshotPayload({
      pageType: adapter.pageType,
      sourceUrl: window.location.href,
      pageTitle: document.title,
      rawDomText,
      rawNetworkJson: [],
      rawTableData,
      visibleMetricsJson,
      screenshotUrl: null,
      localCollectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      routeKey: inferCollectionRoute({ pageType: adapter.pageType, sourceUrl: window.location.href, pageTitle: document.title }),
      captureMeta
    });
  }
  async function syncPatrol() {
    if (document.readyState === "loading") return;
    const stored = await chrome.storage.local.get([MESSAGE_PATROL_STORAGE_KEY]);
    const patrol = stored[MESSAGE_PATROL_STORAGE_KEY] || {};
    if (patrolTimer != null) {
      window.clearInterval(patrolTimer);
      patrolTimer = null;
    }
    if (pulseTimer != null) {
      window.clearTimeout(pulseTimer);
      pulseTimer = null;
    }
    if (pulseHeartbeatTimer != null) {
      window.clearInterval(pulseHeartbeatTimer);
      pulseHeartbeatTimer = null;
    }
    pulseObserver?.disconnect();
    pulseObserver = null;
    if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
    if (!patrol.enabled || !patrol.collectionRunId) return;
    const captureIfSelected = () => {
      const snapshot = collectSnapshot();
      const routeKey = snapshot.routeKey || "UNKNOWN";
      if (patrol.requiredRoutes?.length && !patrol.requiredRoutes.includes(routeKey)) return;
      snapshot.collectionRunId = patrol.collectionRunId;
      chrome.runtime.sendMessage({ type: MESSAGE.SNAPSHOT_CAPTURED, payload: snapshot }, () => void chrome.runtime.lastError);
    };
    captureIfSelected();
    patrolTimer = window.setInterval(captureIfSelected, Math.max(3e4, patrol.intervalMs || collectionFreshnessPolicy.patrolIntervalMs));
    startRealtimePulse(patrol);
  }
  function startRealtimePulse(patrol) {
    const schedule = () => {
      if (document.visibilityState !== "visible") {
        chrome.runtime.sendMessage({ type: MESSAGE.PAGE_ACTIVITY, payload: { tabState: "HIDDEN", observedAt: (/* @__PURE__ */ new Date()).toISOString() } }, () => void chrome.runtime.lastError);
        return;
      }
      if (pulseTimer != null) window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => emitPulse(patrol), 2e3);
    };
    pulseObserver = new MutationObserver(schedule);
    pulseObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    visibilityHandler = schedule;
    document.addEventListener("visibilitychange", visibilityHandler);
    pulseHeartbeatTimer = window.setInterval(() => emitPulse(patrol), 5e3);
    schedule();
  }
  function emitPulse(patrol) {
    pulseTimer = null;
    if (document.visibilityState !== "visible") return;
    const remaining = 5e3 - (Date.now() - lastPulseAt);
    if (remaining > 0) {
      if (pulseTimer != null) window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => emitPulse(patrol), remaining);
      return;
    }
    const snapshot = collectSnapshot();
    const routeKey = snapshot.routeKey || "UNKNOWN";
    if (patrol.requiredRoutes?.length && !patrol.requiredRoutes.includes(routeKey)) return;
    lastPulseAt = Date.now();
    const pulse = {
      collectionRunId: patrol.collectionRunId || null,
      routeKey,
      pageType: snapshot.pageType,
      localCapturedAt: snapshot.localCollectedAt,
      tabState: "VISIBLE",
      metrics: snapshot.visibleMetricsJson.slice(0, 32),
      captureMeta: snapshot.captureMeta
    };
    chrome.runtime.sendMessage({ type: MESSAGE.METRIC_PULSE_CAPTURED, payload: pulse }, () => void chrome.runtime.lastError);
  }
  function visibleText() {
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.textContent?.trim();
        if (!text) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (!isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const chunks = [];
    let length = 0;
    while (walker.nextNode() && length < 2e5) {
      const chunk = walker.currentNode.textContent?.trim() || "";
      chunks.push(chunk);
      length += chunk.length + 1;
    }
    return chunks.join("\n");
  }
  function collectTables() {
    return [...document.querySelectorAll("table")].filter(isVisibleElement).slice(0, 20).map((table) => {
      return [...table.querySelectorAll("tr")].slice(0, 200).map((row) => {
        return [...row.querySelectorAll("th,td")].filter(isVisibleElement).slice(0, 100).map((cell) => (cell.textContent || "").trim());
      });
    });
  }
  function isVisibleElement(element) {
    let current = element;
    while (current) {
      if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return false;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(current.tagName)) return false;
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false;
      current = current.parentElement;
    }
    return true;
  }
})();
