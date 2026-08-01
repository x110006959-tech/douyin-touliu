import type {
  CollectionRouteKey,
  CollectionSnapshotPayload
} from "@douyin-local-life/shared";
import { detectActiveCollectionRoute } from "@douyin-local-life/shared/collection-routes";
import { MESSAGE } from "./messages";
import { selectPageAdapter } from "./page-adapters";
import { sanitizeSnapshotPayload } from "./safety";
import { applyCaptureBudget, collectBudgetedTables, collectBudgetedVisibleText, createCaptureBudgetState, isCaptureVisibleElement } from "./capture-budget";

let pageActivityTimer: number | null = null;

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
  return false;
});

function startContentRuntime() {
  startPageActivityHeartbeat();
}

function collectSnapshot(collectionRunId?: string | null, routeOverride?: CollectionRouteKey | null): CollectionSnapshotPayload {
  const budget = createCaptureBudgetState();
  const rawDomText = collectBudgetedVisibleText(document, budget);
  const rawTableData = collectBudgetedTables(document, budget);
  const baseAdapter = selectPageAdapter({ document, url: window.location.href, title: document.title, visibleText: rawDomText, tables: rawTableData });
  const routeDetection = detectCurrentRoute(rawDomText, baseAdapter.pageType, routeOverride);
  const adapterInput = { document, url: window.location.href, title: document.title, visibleText: rawDomText, tables: rawTableData, routeKey: routeDetection.routeKey };
  const adapter = selectPageAdapter(adapterInput);
  const visibleMetricsJson = adapter.extractMetrics(adapterInput);
  const captureMeta = applyCaptureBudget(adapter.extractCoverage(adapterInput, visibleMetricsJson), budget);
  return sanitizeSnapshotPayload({
    pageType: adapter.pageType,
    sourceUrl: window.location.href,
    pageTitle: document.title,
    // Visible text is used only during this capture to derive safe fields; it is never persisted or uploaded.
    rawDomText: "",
    rawNetworkJson: [],
    rawTableData,
    visibleMetricsJson,
    screenshotUrl: null,
    localCollectedAt: new Date().toISOString(),
    collectionRunId: collectionRunId || null,
    routeKey: routeDetection.routeKey,
    captureMeta: { ...captureMeta, routeDetection }
  }) as CollectionSnapshotPayload;
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
        observedAt: new Date().toISOString()
      }
    }, () => void chrome.runtime.lastError);
  };
  emit();
  pageActivityTimer = window.setInterval(emit, 5_000);
}

function collectPageContext() {
  const routeDetection = detectCurrentRoute("");
  const baseInput = { document, url: window.location.href, title: document.title, visibleText: "", tables: [] as unknown[] };
  const baseAdapter = selectPageAdapter(baseInput);
  const adapter = selectPageAdapter({ ...baseInput, routeKey: routeDetection.routeKey });
  return {
    currentUrl: window.location.href,
    pageType: adapter.pageType,
    routeKey: routeDetection.routeKey,
    routeDetection
  };
}

function detectCurrentRoute(rawDomText: string, pageType?: CollectionSnapshotPayload["pageType"], manualOverride?: CollectionRouteKey | null) {
  return detectActiveCollectionRoute({
    pageType: pageType || "UNKNOWN",
    sourceUrl: window.location.href,
    pageTitle: document.title,
    selectedTabLabels: selectedTabLabels(),
    visibleHeadings: visibleHeadings(),
    visibleText: rawDomText ? rawDomText.slice(0, 50_000) : undefined,
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
  return [...document.querySelectorAll(selector)]
    .filter(isCaptureVisibleElement)
    .map((element) => (element.textContent || "").trim())
    .filter((value) => value.length > 0 && value.length <= 20)
    .slice(0, 20);
}

function visibleHeadings() {
  return [...document.querySelectorAll("h1,h2,h3,[role=heading]")]
    .filter(isCaptureVisibleElement)
    .map((element) => (element.textContent || "").trim())
    .filter(Boolean)
    .slice(0, 50);
}
