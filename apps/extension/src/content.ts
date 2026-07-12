import type {
  CollectionRouteKey,
  CollectionSnapshotPayload,
  MetricPulse
} from "@douyin-local-life/shared";
import { collectionFreshnessPolicy, inferCollectionRoute } from "@douyin-local-life/shared/collection-routes";
import { MESSAGE } from "./messages";
import { selectPageAdapter } from "./page-adapters";
import { sanitizeSnapshotPayload } from "./safety";

let patrolTimer: number | null = null;
let pulseTimer: number | null = null;
let pulseHeartbeatTimer: number | null = null;
let pulseObserver: MutationObserver | null = null;
let lastPulseAt = 0;
let visibilityHandler: (() => void) | null = null;
const MESSAGE_PATROL_STORAGE_KEY = "douyinLocalLifeDiagnosisPatrol";

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

function collectSnapshot(): CollectionSnapshotPayload {
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
    localCollectedAt: new Date().toISOString(),
    routeKey: inferCollectionRoute({ pageType: adapter.pageType, sourceUrl: window.location.href, pageTitle: document.title }),
    captureMeta
  }) as CollectionSnapshotPayload;
}

type PatrolState = {
  enabled?: boolean;
  collectionRunId?: string;
  requiredRoutes?: CollectionRouteKey[];
  intervalMs?: number;
};

async function syncPatrol() {
  if (document.readyState === "loading") return;
  const stored = await chrome.storage.local.get([MESSAGE_PATROL_STORAGE_KEY]);
  const patrol = (stored[MESSAGE_PATROL_STORAGE_KEY] || {}) as PatrolState;
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
    captureMeta: snapshot.captureMeta!
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
  const chunks: string[] = [];
  let length = 0;
  while (walker.nextNode() && length < 200_000) {
    const chunk = walker.currentNode.textContent?.trim() || "";
    chunks.push(chunk);
    length += chunk.length + 1;
  }
  return chunks.join("\n");
}

function collectTables() {
  return [...document.querySelectorAll("table")]
    .filter(isVisibleElement)
    .slice(0, 20)
    .map((table) => {
    return [...table.querySelectorAll("tr")].slice(0, 200).map((row) => {
      return [...row.querySelectorAll("th,td")]
        .filter(isVisibleElement)
        .slice(0, 100)
        .map((cell) => (cell.textContent || "").trim());
    });
  });
}

function isVisibleElement(element: Element) {
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return false;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(current.tagName)) return false;
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false;
    current = current.parentElement;
  }
  return true;
}
