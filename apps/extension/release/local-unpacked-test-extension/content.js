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
  function detectActiveCollectionRoute(input) {
    if (input.manualOverride && input.manualOverride !== "UNKNOWN") {
      return {
        routeKey: input.manualOverride,
        source: "MANUAL",
        confidence: 1,
        manuallyConfirmed: true,
        evidence: [`\u4EBA\u5DE5\u9009\u62E9\uFF1A${collectionRouteLabels[input.manualOverride] || input.manualOverride}`]
      };
    }
    const urlRoute = routeFromUrl(input.sourceUrl);
    if (urlRoute) {
      return { routeKey: urlRoute, source: "URL", confidence: 0.98, manuallyConfirmed: false, evidence: [`URL\uFF1A${urlRoute}`] };
    }
    const selectedRoutes = [...new Set((input.selectedTabLabels || []).map(routeFromSelectedLabel).filter((route) => Boolean(route)))];
    if (selectedRoutes.length === 1) {
      return {
        routeKey: selectedRoutes[0],
        source: "ACTIVE_TAB",
        confidence: 0.92,
        manuallyConfirmed: false,
        evidence: [`\u9009\u4E2D\u5206\u680F\uFF1A${(input.selectedTabLabels || []).join(" / ")}`]
      };
    }
    if (selectedRoutes.length > 1) {
      return {
        routeKey: "UNKNOWN",
        source: "UNKNOWN",
        confidence: 0,
        manuallyConfirmed: false,
        evidence: [`\u68C0\u6D4B\u5230\u51B2\u7A81\u7684\u9009\u4E2D\u5206\u680F\uFF1A${selectedRoutes.join(" / ")}`]
      };
    }
    const headingRoutes = [...new Set([input.pageTitle || "", ...input.visibleHeadings || []].map(routeFromSpecificHeading).filter((route) => Boolean(route)))];
    if (headingRoutes.length === 1) {
      return {
        routeKey: headingRoutes[0],
        source: "VISIBLE_CONTENT",
        confidence: 0.9,
        manuallyConfirmed: false,
        evidence: [`\u4E13\u5C5E\u6807\u9898\uFF1A${collectionRouteLabels[headingRoutes[0]] || headingRoutes[0]}`]
      };
    }
    if (headingRoutes.length > 1) {
      return {
        routeKey: "UNKNOWN",
        source: "UNKNOWN",
        confidence: 0,
        manuallyConfirmed: false,
        evidence: [`\u68C0\u6D4B\u5230\u51B2\u7A81\u7684\u4E13\u5C5E\u6807\u9898\uFF1A${headingRoutes.join(" / ")}`]
      };
    }
    const content = `${input.pageTitle || ""}
${(input.visibleHeadings || []).join("\n")}
${input.visibleText || ""}`;
    const scores = [
      scoreRoute("LIVE_PRODUCT_TAB", content, ["\u5546\u54C1\u5217\u8868", "\u5173\u6CE8\u5546\u54C1", "\u63A8\u8350\u8FD4\u573A", "\u5546\u54C1\u753B\u50CF", "\u5546\u54C1\u66DD\u5149\u6B21\u6570", "\u5546\u54C1\u70B9\u51FB\u4EBA\u6570", "\u652F\u4ED8\u6210\u529F\u7528\u6237\u6570"]),
      scoreRoute("LIVE_TRAFFIC_TAB", content, ["\u76F4\u64AD\u6D41\u91CF", "\u6D41\u91CF\u5206\u6790", "\u5C0F\u65F6\u770B\u64AD\u6B21\u6570", "\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570", "\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570", "\u6D41\u91CF\u6E20\u9053", "\u5F15\u6D41\u77ED\u89C6\u9891"]),
      scoreRoute("LIVE_DATA_SCREEN", content, ["\u76F4\u64AD\u95F4\u6210\u4EA4\u91D1\u989D", "\u8D8B\u52BF\u5206\u6790", "\u7528\u6237\u753B\u50CF", "\u8F6C\u5316\u5206\u6790", "\u7D2F\u8BA1\u66DD\u5149\u6B21\u6570", "\u5546\u54C1\u8F6C\u5316\u7387"])
    ].filter((item) => item.score >= 2);
    scores.sort((left, right) => right.score - left.score);
    if (scores.length && (scores.length === 1 || scores[0].score > scores[1].score)) {
      const winner = scores[0];
      return {
        routeKey: winner.routeKey,
        source: "VISIBLE_CONTENT",
        confidence: Math.min(0.9, 0.68 + winner.score * 0.05),
        manuallyConfirmed: false,
        evidence: winner.markers.map((marker) => `\u53EF\u89C1\u5185\u5BB9\uFF1A${marker}`)
      };
    }
    const pageType = normalizeCollectionRouteKey(input.pageType);
    if (pageType !== "UNKNOWN" && pageType !== "LIVE_DATA_SCREEN") {
      return { routeKey: pageType, source: "PAGE_TYPE", confidence: 0.7, manuallyConfirmed: false, evidence: [`\u9875\u9762\u7C7B\u578B\uFF1A${pageType}`] };
    }
    return { routeKey: "UNKNOWN", source: "UNKNOWN", confidence: 0, manuallyConfirmed: false, evidence: ["\u5F53\u524D\u53EF\u89C1\u533A\u57DF\u4E0D\u8DB3\u4EE5\u786E\u5B9A\u5206\u680F"] };
  }
  function routeFromUrl(value) {
    if (!value)
      return null;
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const mode = ["mode", "tab", "view", "section"].map((key) => url.searchParams.get(key)?.toLowerCase() || "").join(" ");
      if (host === "localads.chengzijianzhan.cn" && /\/lamp\/pc\/liveboard2(?:\/|$)/.test(path))
        return "LOCAL_PROMOTION_DASHBOARD";
      if (host === "localads.chengzijianzhan.cn" && /\/lamp\/pc\/promotion\/roi2(?:\/|$)/.test(path))
        return "TASK_TABLE";
      if (/\b(product|products|goods|commodity)\b/.test(mode) || /\/(product|goods)(?:\/|$)/.test(path))
        return "LIVE_PRODUCT_TAB";
      if (/\b(traffic|flow|channel)\b/.test(mode) || /\/(traffic|flow)(?:\/|$)/.test(path))
        return "LIVE_TRAFFIC_TAB";
      if (/\b(main|overview|summary)\b/.test(mode) && /live|room|screen|liveboard/.test(path))
        return "LIVE_DATA_SCREEN";
      if (/material|creative/.test(path))
        return "MATERIAL_LIBRARY";
      if (/task|campaign/.test(path))
        return "TASK_TABLE";
    } catch {
      return null;
    }
    return null;
  }
  function routeFromSelectedLabel(value) {
    const label = value.replace(/[\s\u00a0]+/g, "").replace(/[（(].*?[）)]/g, "");
    if (["\u6982\u89C8", "\u76F4\u64AD\u6982\u89C8", "\u6570\u636E\u6982\u89C8"].includes(label))
      return "LIVE_DATA_SCREEN";
    if (["\u5546\u54C1", "\u5546\u54C1\u5206\u6790", "\u5546\u54C1\u5217\u8868"].includes(label))
      return "LIVE_PRODUCT_TAB";
    if (["\u6D41\u91CF", "\u6D41\u91CF\u5206\u6790", "\u76F4\u64AD\u6D41\u91CF"].includes(label))
      return "LIVE_TRAFFIC_TAB";
    return null;
  }
  function routeFromSpecificHeading(value) {
    const heading = value.replace(/[\s\u00a0]+/g, "");
    if (/商品列表|关注商品|推荐返场|商品画像/.test(heading))
      return "LIVE_PRODUCT_TAB";
    if (/直播流量|流量分析|流量趋势/.test(heading))
      return "LIVE_TRAFFIC_TAB";
    if (/直播间成交金额|直播数据大屏概览/.test(heading))
      return "LIVE_DATA_SCREEN";
    return null;
  }
  function scoreRoute(routeKey, content, markers) {
    const matched = markers.filter((marker) => content.includes(marker));
    return { routeKey, score: matched.length, markers: matched };
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

  // src/page-adapters.ts
  var commonMetrics = [
    { key: "spend", name: "ad spend", unit: "yuan", labels: ["\u6D88\u8017", "\u5E7F\u544A\u6D88\u8017", "\u4ECA\u65E5\u6D88\u8017"] },
    { key: "daily_budget", name: "daily budget", unit: "yuan", labels: ["\u65E5\u9884\u7B97", "\u9884\u7B97"] },
    { key: "remaining_budget", name: "remaining budget", unit: "yuan", labels: ["\u5269\u4F59\u9884\u7B97"] },
    { key: "impressions", name: "impressions", labels: ["\u66DD\u5149\u6B21\u6570", "\u66DD\u5149\u91CF", "\u5546\u54C1\u66DD\u5149\u4EBA\u6570", "\u76F4\u64AD\u66DD\u5149\u4EBA\u6570"] },
    { key: "clicks", name: "clicks", labels: ["\u70B9\u51FB\u4EBA\u6570", "\u5546\u54C1\u70B9\u51FB\u4EBA\u6570", "\u70B9\u51FB\u6B21\u6570"] },
    { key: "ctr", name: "click through rate", unit: "%", labels: ["\u5546\u54C1\u70B9\u51FB\u7387", "\u70B9\u51FB\u7387", "CTR"] },
    { key: "orders", name: "orders", labels: ["\u6210\u4EA4\u8BA2\u5355\u6570", "\u652F\u4ED8\u8BA2\u5355", "\u652F\u4ED8\u8BA2\u5355\u6570", "\u6210\u4EA4\u4EBA\u6570"] },
    { key: "pay_roi", name: "\u6574\u4F53\u652F\u4ED8 ROI", labels: ["\u6574\u4F53\u652F\u4ED8ROI", "\u6574\u4F53\u652F\u4ED8 ROI", "\u4ED8\u6B3E ROI"] },
    { key: "full_domain_pay_roi", name: "\u5168\u57DF\u652F\u4ED8 ROI", labels: ["\u5168\u57DF\u652F\u4ED8ROI", "\u5168\u57DF\u652F\u4ED8 ROI", "\u5168\u57DFROI", "\u5168\u57DF ROI"] },
    { key: "verify_roi", name: "verify ROI", labels: ["\u6838\u9500 ROI"] },
    { key: "gross_profit_roi", name: "gross profit ROI", labels: ["\u6BDB\u5229 ROI"] },
    { key: "gmv", name: "GMV", unit: "yuan", labels: ["\u6210\u4EA4\u91D1\u989D", "\u652F\u4ED8\u91D1\u989D", "GMV"] },
    { key: "gpm", name: "GPM", unit: "yuan", labels: ["\u5343\u6B21\u89C2\u770B\u6210\u4EA4\u91D1\u989D", "GPM"] },
    { key: "live_viewers", name: "live viewers", labels: ["\u76F4\u64AD\u95F4\u89C2\u770B\u4EBA\u6570", "\u89C2\u770B\u4EBA\u6570", "\u770B\u64AD\u4EBA\u6570", "\u6574\u573A\u7D2F\u8BA1\u770B\u64AD\u4EBA\u6570"] },
    { key: "hourly_live_views", name: "\u5C0F\u65F6\u770B\u64AD\u6B21\u6570", labels: ["\u5C0F\u65F6\u770B\u64AD\u6B21\u6570"] },
    { key: "hourly_natural_live_views", name: "\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570", labels: ["\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570"] },
    { key: "hourly_commercial_live_views", name: "\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570", labels: ["\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570"] },
    { key: "store_searches", name: "store searches", labels: ["\u95E8\u5E97\u641C\u7D22\u91CF", "\u641C\u7D22\u91CF"] },
    { key: "poi_visits", name: "POI visits", labels: ["POI\u8BBF\u95EE", "POI \u8BBF\u95EE", "\u95E8\u5E97\u8BBF\u95EE"] },
    { key: "shelf_gmv", name: "shelf GMV", unit: "yuan", labels: ["\u8D27\u67B6\u6210\u4EA4", "\u56E2\u8D2D\u8D27\u67B6"] },
    { key: "search_gmv", name: "search GMV", unit: "yuan", labels: ["\u641C\u7D22\u6210\u4EA4"] }
  ];
  var adapters = [
    createAdapter("live-product-tab", "LIVE_DATA_SCREEN", ["gmv", "orders", "impressions", "clicks", "ctr"], ["\u5546\u54C1\u5217\u8868", "\u5173\u6CE8\u5546\u54C1", "\u63A8\u8350\u8FD4\u573A", "\u5546\u54C1\u753B\u50CF"], "LIVE_PRODUCT_TAB"),
    createAdapter("live-traffic-tab", "LIVE_DATA_SCREEN", ["live_viewers", "hourly_live_views", "hourly_natural_live_views", "hourly_commercial_live_views"], ["\u76F4\u64AD\u6D41\u91CF", "\u6D41\u91CF\u5206\u6790", "\u5C0F\u65F6\u81EA\u7136\u770B\u64AD\u6B21\u6570", "\u5C0F\u65F6\u5546\u4E1A\u770B\u64AD\u6B21\u6570"], "LIVE_TRAFFIC_TAB"),
    createAdapter("live-screen", "LIVE_DATA_SCREEN", ["gmv", "gpm", "live_viewers", "impressions", "clicks", "orders"], ["\u76F4\u64AD\u6570\u636E\u5927\u5C4F", "\u76F4\u64AD\u95F4", "\u770B\u64AD", "\u66DD\u5149\u4EBA\u6570", "\u6210\u4EA4\u4EBA\u6570"], "LIVE_DATA_SCREEN"),
    createAdapter("local-promotion", "LOCAL_PROMOTION_DASHBOARD", ["spend", "daily_budget", "pay_roi", "full_domain_pay_roi", "orders", "impressions", "clicks"], ["\u5DE8\u91CF\u672C\u5730\u63A8", "\u672C\u5730\u63A8", "\u6295\u653E", "\u51FA\u4EF7", "\u9884\u7B97", "\u6D88\u8017"], "LOCAL_PROMOTION_DASHBOARD"),
    createAdapter("task-table", "TASK_TABLE", ["spend", "daily_budget", "orders"], ["\u4EFB\u52A1\u5217\u8868", "\u8BA1\u5212\u5217\u8868", "\u5E7F\u544A\u7EC4", "\u5355\u5143", "\u521B\u610F", "\u72B6\u6001"], "TASK_TABLE")
  ];
  function selectPageAdapter(input) {
    return adapters.find((adapter) => adapter.detect(input)) || unknownAdapter;
  }
  function createAdapter(id, pageType, expectedFields, keywords, routeKey) {
    return {
      id,
      version: "1.2.0",
      pageType,
      expectedFields,
      detect(input) {
        if (routeKey && input.routeKey === routeKey) return true;
        if (routeKey && input.routeKey && input.routeKey !== "UNKNOWN") return false;
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
    if (isCredentialReferenceKey(normalized))
      return false;
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
  function isCredentialReferenceKey(normalizedKey) {
    return normalizedKey.endsWith("id");
  }

  // src/safety.ts
  var sanitizeSnapshotPayload = sanitizeCollectionSnapshotPayload;

  // src/account-identity.ts
  var accountIdQueryParams = ["advertiser_id", "account_id", "advid", "aadvid"];
  function detectAccountIdentity(text, sourceUrl) {
    let accountId = null;
    let idSource = null;
    try {
      const url = new URL(sourceUrl);
      for (const key of accountIdQueryParams) {
        const value = url.searchParams.get(key)?.trim();
        if (value && /^[A-Za-z0-9_-]{4,100}$/.test(value)) {
          accountId = value;
          idSource = `URL:${key}`;
          break;
        }
      }
    } catch {
    }
    const nameMatch = text.match(/(?:当前账号|账号名称|账户名称|广告主名称)\s*[:：]?\s*([^\n]{2,100})/);
    const accountName = nameMatch?.[1]?.trim() || null;
    return { accountId, accountName, evidence: { idSource, nameSource: accountName ? "VISIBLE_TEXT_LABEL" : null } };
  }

  // src/capture-budget.ts
  var captureBudget = {
    maxTraversalNodes: 5e4,
    maxRows: 1e3,
    maxColumns: 100,
    maxCells: 5e4,
    maxTableTextBytes: 1048576,
    maxVisibleTextBytes: 1048576,
    maxDurationMs: 100
  };
  function createCaptureBudgetState(now = performance.now()) {
    return {
      startedAt: now,
      traversedNodes: 0,
      rows: 0,
      columns: 0,
      cells: 0,
      tableTextBytes: 0,
      visibleTextBytes: 0,
      reasons: /* @__PURE__ */ new Set()
    };
  }
  function collectBudgetedVisibleText(document2, state) {
    const walker = document2.createTreeWalker(document2.body || document2.documentElement, NodeFilter.SHOW_TEXT);
    const chunks = [];
    while (walker.nextNode()) {
      if (!consumeNode(state)) break;
      const text = walker.currentNode.textContent?.trim() || "";
      const parent = walker.currentNode.parentElement;
      if (!text || !parent || !isCaptureVisibleElement(parent)) continue;
      const accepted = consumeText(state, text, "VISIBLE_TEXT_LIMIT", "visibleTextBytes", captureBudget.maxVisibleTextBytes);
      if (accepted) chunks.push(accepted);
      if (isTimedOut(state)) break;
    }
    return chunks.join("\n");
  }
  function collectBudgetedTables(document2, state) {
    const tables = [];
    for (const table of document2.querySelectorAll("table")) {
      if (!consumeNode(state) || !isCaptureVisibleElement(table)) break;
      const rows = [];
      for (const row of table.querySelectorAll("tr")) {
        if (!consumeNode(state) || state.rows >= captureBudget.maxRows) {
          state.reasons.add("TABLE_ROW_LIMIT");
          break;
        }
        const cells = [];
        for (const cell of row.querySelectorAll("th,td")) {
          if (!consumeNode(state) || state.cells >= captureBudget.maxCells || cells.length >= captureBudget.maxColumns) {
            state.reasons.add(state.cells >= captureBudget.maxCells ? "TABLE_CELL_LIMIT" : "TABLE_COLUMN_LIMIT");
            break;
          }
          if (!isCaptureVisibleElement(cell)) continue;
          const text = consumeText(state, cell.textContent?.trim() || "", "TABLE_TEXT_LIMIT", "tableTextBytes", captureBudget.maxTableTextBytes);
          if (text) cells.push(text);
          state.cells += 1;
        }
        state.rows += 1;
        state.columns = Math.max(state.columns, cells.length);
        if (cells.length) rows.push(cells);
        if (isTimedOut(state)) break;
      }
      if (rows.length) tables.push(rows);
      if (isTimedOut(state) || state.rows >= captureBudget.maxRows || state.cells >= captureBudget.maxCells) break;
    }
    return tables;
  }
  function applyCaptureBudget(meta, state) {
    if (performance.now() - state.startedAt >= captureBudget.maxDurationMs) state.reasons.add("TIME_BUDGET_EXCEEDED");
    const truncationReasons = [.../* @__PURE__ */ new Set([...meta.truncationReasons, ...state.reasons])];
    const truncatedFields = [.../* @__PURE__ */ new Set([
      ...meta.truncatedFields,
      ...truncationReasons.some((reason) => reason.includes("TABLE")) ? ["rawTableData"] : [],
      ...truncationReasons.some((reason) => reason.includes("VISIBLE_TEXT")) ? ["rawDomText"] : []
    ])];
    const partial = truncationReasons.length > 0;
    return {
      ...meta,
      completeness: partial ? "PARTIAL" : meta.completeness,
      originalBytes: Math.max(meta.originalBytes, state.tableTextBytes + state.visibleTextBytes),
      acceptedBytes: state.tableTextBytes + state.visibleTextBytes,
      truncatedFields,
      truncationReasons
    };
  }
  function consumeNode(state) {
    if (isTimedOut(state)) return false;
    state.traversedNodes += 1;
    if (state.traversedNodes > captureBudget.maxTraversalNodes) {
      state.reasons.add("NODE_TRAVERSAL_LIMIT");
      return false;
    }
    return true;
  }
  function consumeText(state, value, reason, field, limit) {
    if (!value) return "";
    const available = Math.max(0, limit - state[field]);
    const bytes = new TextEncoder().encode(value);
    if (bytes.byteLength <= available) {
      state[field] += bytes.byteLength;
      return value;
    }
    state.reasons.add(reason);
    if (!available) return "";
    let result = "";
    for (const character of value) {
      const next = result + character;
      if (new TextEncoder().encode(next).byteLength > available) break;
      result = next;
    }
    state[field] += new TextEncoder().encode(result).byteLength;
    return result;
  }
  function isTimedOut(state) {
    if (performance.now() - state.startedAt < captureBudget.maxDurationMs) return false;
    state.reasons.add("TIME_BUDGET_EXCEEDED");
    return true;
  }
  function isCaptureVisibleElement(element) {
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

  // src/content.ts
  var patrolTimer = null;
  var pulseTimer = null;
  var pulseHeartbeatTimer = null;
  var pulseObserver = null;
  var lastPulseAt = 0;
  var visibilityHandler = null;
  var pageActivityTimer = null;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startContentRuntime, { once: true });
  else startContentRuntime();
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === MESSAGE.START_COLLECTION) {
      const snapshot = collectSnapshot(message.payload?.collectionRunId || null, message.payload?.routeOverride || null);
      sendResponse({ ok: true, snapshot });
      return true;
    }
    if (message?.type === MESSAGE.GET_PAGE_CONTEXT) {
      sendResponse({ ok: true, ...collectPageContext() });
      return true;
    }
    if (message?.type === MESSAGE.SYNC_PATROL_STATE) {
      syncPatrol(message.payload || {});
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });
  function startContentRuntime() {
    void syncPatrolFromWorker();
    startPageActivityHeartbeat();
  }
  function collectSnapshot(collectionRunId, routeOverride) {
    const budget = createCaptureBudgetState();
    const rawDomText = collectBudgetedVisibleText(document, budget);
    const rawTableData = collectBudgetedTables(document, budget);
    const baseAdapter = selectPageAdapter({ document, url: window.location.href, title: document.title, visibleText: rawDomText, tables: rawTableData });
    const routeDetection = detectCurrentRoute(rawDomText, baseAdapter.pageType, routeOverride);
    const adapterInput = { document, url: window.location.href, title: document.title, visibleText: rawDomText, tables: rawTableData, routeKey: routeDetection.routeKey };
    const adapter = selectPageAdapter(adapterInput);
    const visibleMetricsJson = adapter.extractMetrics(adapterInput);
    const captureMeta = applyCaptureBudget(adapter.extractCoverage(adapterInput, visibleMetricsJson), budget);
    const accountIdentity = detectAccountIdentity(rawDomText, window.location.href);
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
      collectionRunId: collectionRunId || null,
      routeKey: routeDetection.routeKey,
      captureMeta: { ...captureMeta, routeDetection },
      detectedAccountId: accountIdentity.accountId,
      detectedAccountName: accountIdentity.accountName,
      accountMatchEvidence: accountIdentity.evidence
    });
  }
  function startPageActivityHeartbeat() {
    if (pageActivityTimer != null) window.clearInterval(pageActivityTimer);
    const emit = () => {
      const context = collectPageContext();
      chrome.runtime.sendMessage({
        type: MESSAGE.PAGE_ACTIVITY,
        payload: {
          currentUrl: window.location.href,
          pageType: context.pageType,
          routeKey: context.routeKey,
          collectable: true,
          tabState: document.visibilityState === "visible" ? "VISIBLE" : "HIDDEN",
          detectedAccountId: context.detectedAccountId,
          detectedAccountName: context.detectedAccountName,
          accountMatchEvidence: context.accountMatchEvidence,
          observedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      }, () => void chrome.runtime.lastError);
    };
    emit();
    pageActivityTimer = window.setInterval(emit, 5e3);
  }
  function collectPageContext() {
    const rawDomText = document.visibilityState === "visible" ? collectBudgetedVisibleText(document, createCaptureBudgetState()).slice(0, 5e4) : "";
    const baseInput = { document, url: window.location.href, title: document.title, visibleText: rawDomText, tables: [] };
    const baseAdapter = selectPageAdapter(baseInput);
    const routeDetection = rawDomText ? detectCurrentRoute(rawDomText, baseAdapter.pageType) : null;
    const adapter = selectPageAdapter({ ...baseInput, routeKey: routeDetection?.routeKey || "UNKNOWN" });
    const accountIdentity = rawDomText ? detectAccountIdentity(rawDomText, window.location.href) : { accountId: null, accountName: null, evidence: null };
    return {
      currentUrl: window.location.href,
      pageType: adapter.pageType,
      routeKey: routeDetection?.routeKey || "UNKNOWN",
      routeDetection,
      detectedAccountId: accountIdentity.accountId,
      detectedAccountName: accountIdentity.accountName,
      accountMatchEvidence: accountIdentity.evidence
    };
  }
  function detectCurrentRoute(rawDomText, pageType, manualOverride) {
    return detectActiveCollectionRoute({
      pageType,
      sourceUrl: window.location.href,
      pageTitle: document.title,
      selectedTabLabels: selectedTabLabels(),
      visibleHeadings: visibleHeadings(),
      visibleText: rawDomText.slice(0, 5e4),
      manualOverride
    });
  }
  function selectedTabLabels() {
    const selector = [
      '[role="tab"][aria-selected="true"]',
      '[aria-current="page"]',
      '[role="tab"][class*="active" i]',
      '[role="tab"][class*="selected" i]',
      'nav a[class*="active" i]',
      'nav li[class*="active" i]'
    ].join(",");
    return [...document.querySelectorAll(selector)].filter(isCaptureVisibleElement).map((element) => (element.textContent || "").trim()).filter((value) => value.length > 0 && value.length <= 20).slice(0, 20);
  }
  function visibleHeadings() {
    return [...document.querySelectorAll("h1,h2,h3,[role=heading]")].filter(isCaptureVisibleElement).map((element) => (element.textContent || "").trim()).filter(Boolean).slice(0, 50);
  }
  async function syncPatrolFromWorker() {
    const patrol = await chrome.runtime.sendMessage({ type: MESSAGE.GET_PATROL_STATE }).catch(() => null);
    syncPatrol(patrol || {});
  }
  function syncPatrol(patrol) {
    if (document.readyState === "loading") return;
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
      captureMeta: snapshot.captureMeta,
      sourceUrl: snapshot.sourceUrl,
      detectedAccountId: snapshot.detectedAccountId || null,
      detectedAccountName: snapshot.detectedAccountName || null,
      accountMatchEvidence: snapshot.accountMatchEvidence || null
    };
    chrome.runtime.sendMessage({ type: MESSAGE.METRIC_PULSE_CAPTURED, payload: pulse }, () => void chrome.runtime.lastError);
  }
})();
