import type {
  CollectionRouteKey,
  CollectionSnapshotPayload,
  MetricPulse
} from "@douyin-local-life/shared";
import { collectionFreshnessPolicy, detectActiveCollectionRoute } from "@douyin-local-life/shared/collection-routes";
import { MESSAGE } from "./messages";
import { selectPageAdapter } from "./page-adapters";
import { sanitizeSnapshotPayload } from "./safety";
import { detectAccountIdentity } from "./account-identity";
import { applyCaptureBudget, collectBudgetedTables, collectBudgetedVisibleText, createCaptureBudgetState, isCaptureVisibleElement } from "./capture-budget";

let patrolTimer: number | null = null;
let pulseTimer: number | null = null;
let pulseHeartbeatTimer: number | null = null;
let pulseObserver: MutationObserver | null = null;
let lastPulseAt = 0;
let visibilityHandler: (() => void) | null = null;
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
  if (message?.type === MESSAGE.SYNC_PATROL_STATE) {
    syncPatrol((message.payload || {}) as PatrolState);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

function startContentRuntime() {
  void syncPatrolFromWorker();
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
    localCollectedAt: new Date().toISOString(),
    collectionRunId: collectionRunId || null,
    routeKey: routeDetection.routeKey,
    captureMeta: { ...captureMeta, routeDetection },
    detectedAccountId: accountIdentity.accountId,
    detectedAccountName: accountIdentity.accountName,
    accountMatchEvidence: accountIdentity.evidence
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
        detectedAccountId: context.detectedAccountId,
        detectedAccountName: context.detectedAccountName,
        observedAt: new Date().toISOString()
      }
    }, () => void chrome.runtime.lastError);
  };
  emit();
  pageActivityTimer = window.setInterval(emit, 5_000);
}

function collectPageContext() {
  const rawDomText = document.visibilityState === "visible"
    ? collectBudgetedVisibleText(document, createCaptureBudgetState()).slice(0, 50_000)
    : "";
  const baseInput = { document, url: window.location.href, title: document.title, visibleText: rawDomText, tables: [] as unknown[] };
  const baseAdapter = selectPageAdapter(baseInput);
  const routeDetection = rawDomText ? detectCurrentRoute(rawDomText, baseAdapter.pageType) : null;
  const adapter = selectPageAdapter({ ...baseInput, routeKey: routeDetection?.routeKey || "UNKNOWN" as const });
  const accountIdentity = rawDomText ? detectAccountIdentity(rawDomText, window.location.href) : { accountId: null, accountName: null };
  return {
    currentUrl: window.location.href,
    pageType: adapter.pageType,
    routeKey: routeDetection?.routeKey || "UNKNOWN" as CollectionRouteKey,
    routeDetection,
    detectedAccountId: accountIdentity.accountId,
    detectedAccountName: accountIdentity.accountName
  };
}

function detectCurrentRoute(rawDomText: string, pageType: CollectionSnapshotPayload["pageType"], manualOverride?: CollectionRouteKey | null) {
  return detectActiveCollectionRoute({
    pageType,
    sourceUrl: window.location.href,
    pageTitle: document.title,
    selectedTabLabels: selectedTabLabels(),
    visibleHeadings: visibleHeadings(),
    visibleText: rawDomText.slice(0, 50_000),
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

type PatrolState = {
  enabled?: boolean;
  collectionRunId?: string;
  requiredRoutes?: CollectionRouteKey[];
  intervalMs?: number;
};

async function syncPatrolFromWorker() {
  const patrol = await chrome.runtime.sendMessage({ type: MESSAGE.GET_PATROL_STATE }).catch(() => null) as PatrolState | null;
  syncPatrol(patrol || {});
}

function syncPatrol(patrol: PatrolState) {
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
  patrolTimer = window.setInterval(captureIfSelected, Math.max(30_000, patrol.intervalMs || collectionFreshnessPolicy.patrolIntervalMs));
  startRealtimePulse(patrol);
}

function startRealtimePulse(patrol: PatrolState) {
  const schedule = () => {
    if (document.visibilityState !== "visible") {
      chrome.runtime.sendMessage({ type: MESSAGE.PAGE_ACTIVITY, payload: { tabState: "HIDDEN", observedAt: new Date().toISOString() } }, () => void chrome.runtime.lastError);
      return;
    }
    if (pulseTimer != null) window.clearTimeout(pulseTimer);
    pulseTimer = window.setTimeout(() => emitPulse(patrol), 2_000);
  };
  pulseObserver = new MutationObserver(schedule);
  pulseObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  visibilityHandler = schedule;
  document.addEventListener("visibilitychange", visibilityHandler);
  pulseHeartbeatTimer = window.setInterval(() => emitPulse(patrol), 5_000);
  schedule();
}

function emitPulse(patrol: PatrolState) {
  pulseTimer = null;
  if (document.visibilityState !== "visible") return;
  const remaining = 5_000 - (Date.now() - lastPulseAt);
  if (remaining > 0) {
    if (pulseTimer != null) window.clearTimeout(pulseTimer);
    pulseTimer = window.setTimeout(() => emitPulse(patrol), remaining);
    return;
  }
  const snapshot = collectSnapshot();
  const routeKey = snapshot.routeKey || "UNKNOWN";
  if (patrol.requiredRoutes?.length && !patrol.requiredRoutes.includes(routeKey)) return;
  lastPulseAt = Date.now();
  const pulse: MetricPulse = {
    collectionRunId: patrol.collectionRunId || null,
    routeKey,
    pageType: snapshot.pageType,
    localCapturedAt: snapshot.localCollectedAt,
    tabState: "VISIBLE",
    metrics: snapshot.visibleMetricsJson.slice(0, 32),
    captureMeta: snapshot.captureMeta!,
    detectedAccountId: snapshot.detectedAccountId || null,
    detectedAccountName: snapshot.detectedAccountName || null
  };
  chrome.runtime.sendMessage({ type: MESSAGE.METRIC_PULSE_CAPTURED, payload: pulse }, () => void chrome.runtime.lastError);
}
