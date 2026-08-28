import type {
  CollectionRouteKey,
  CollectionSnapshotPayload
} from "@douyin-local-life/shared";
import { detectActiveCollectionRoute } from "@douyin-local-life/shared/collection-routes";
import { MESSAGE } from "./messages";
import { selectPageAdapter } from "./page-adapters";
import { isSupportedExtensionCollectionUrl, sanitizeSnapshotPayload } from "./safety";
import { applyCaptureBudget, collectBudgetedTables, collectBudgetedVisibleText, createCaptureBudgetState, isCaptureVisibleElement } from "./capture-budget";
import { collectLiveScreenInternalApi } from "./live-screen-internal-api";
import { liveScreenCapturePlan } from "./live-screen-capture-plan";
import { liveScreenMetricsForMode } from "./live-screen-metric-merge";
import { resolveLiveScreenRoomId } from "./live-screen-room-id";
import { isExactLiveScreenPage, livePulsePageContext, livePulseRouteDetection } from "./live-screen-pulse-page";
import { nextLivePulseAfter } from "./live-pulse-schedule";
import { isExactLocalPromotionInternalApiPage, localPromotionIdentityKey, resolveLocalPromotionIdentity } from "@douyin-local-life/shared";

let pageActivityTimer: number | null = null;
let activePulseController: AbortController | null = null;
let activeLivePulseLoop: LivePulseLoop | null = null;
let livePulseLoopGeneration = 0;

type LivePulseLoop = {
  generation: number;
  loopId: string;
  collectionRunId: string | null;
  liveScreenInternalApiEnabled: boolean;
  submitMessage: string;
  collectInWorker: boolean;
  transportFailures: number;
  timer: number | null;
  running: boolean;
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startContentRuntime, { once: true });
else startContentRuntime();
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE.START_COLLECTION) {
    void collectSnapshot(
      message.payload?.collectionRunId || null,
      message.payload?.routeOverride || null,
      message.payload?.liveScreenInternalApiEnabled === true,
      message.payload?.collectionMode === "PULSE" ? "PULSE" : "SNAPSHOT"
    )
      .then((snapshot) => sendResponse({ ok: true, snapshot }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "页面采集失败" }));
    return true;
  }
  if (message?.type === MESSAGE.BEGIN_LIVE_PULSE_LOOP) {
    startLivePulseLoop({
      loopId: typeof message.payload?.loopId === "string" ? message.payload.loopId : "",
      collectionRunId: typeof message.payload?.collectionRunId === "string" ? message.payload.collectionRunId : null,
      liveScreenInternalApiEnabled: message.payload?.liveScreenInternalApiEnabled === true,
      submitMessage: MESSAGE.SUBMIT_LIVE_PULSE,
      collectInWorker: false
    });
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === MESSAGE.BEGIN_LOCAL_PROMOTION_PULSE_LOOP) {
    startLivePulseLoop({
      loopId: typeof message.payload?.loopId === "string" ? message.payload.loopId : "",
      collectionRunId: typeof message.payload?.collectionRunId === "string" ? message.payload.collectionRunId : null,
      liveScreenInternalApiEnabled: false,
      submitMessage: MESSAGE.SUBMIT_LOCAL_PROMOTION_PULSE,
      collectInWorker: true
    });
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === MESSAGE.STOP_LIVE_PULSE) {
    stopActiveLivePulseLoop();
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === MESSAGE.STOP_LOCAL_PROMOTION_PULSE) {
    stopActiveLivePulseLoop();
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === MESSAGE.GET_PAGE_CONTEXT) {
    sendResponse({
      ok: true,
      ...collectPageContext(),
      tabState: document.visibilityState === "visible" ? "VISIBLE" : "HIDDEN",
      buildFingerprint: __PXXIS_EXTENSION_BUILD__
    });
    return true;
  }
  return false;
});

function startContentRuntime() {
  startPageActivityHeartbeat();
  document.addEventListener("visibilitychange", () => {
    reportPageActivity();
  });
  window.addEventListener("pagehide", () => {
    reportPageActivity();
  });
}

function startLivePulseLoop(input: { loopId: string; collectionRunId: string | null; liveScreenInternalApiEnabled: boolean; submitMessage: string; collectInWorker: boolean }) {
  stopActiveLivePulseLoop();
  const loop: LivePulseLoop = {
    generation: ++livePulseLoopGeneration,
    loopId: input.loopId,
    collectionRunId: input.collectionRunId,
    liveScreenInternalApiEnabled: input.liveScreenInternalApiEnabled,
    submitMessage: input.submitMessage,
    collectInWorker: input.collectInWorker,
    transportFailures: 0,
    timer: null,
    running: false
  };
  activeLivePulseLoop = loop;
  void runLivePulseLoop(loop);
}

function stopActiveLivePulseLoop() {
  const loop = activeLivePulseLoop;
  activeLivePulseLoop = null;
  if (loop?.timer != null) window.clearTimeout(loop.timer);
  activePulseController?.abort();
  activePulseController = null;
}

async function runLivePulseLoop(loop: LivePulseLoop) {
  if (activeLivePulseLoop !== loop || loop.running) return;
  loop.running = true;
  const pulseStartedAt = Date.now();
  let payload: { loopId: string; snapshot?: CollectionSnapshotPayload; error?: string; pulseStartedAt: number };
  try {
    payload = loop.collectInWorker
      ? { loopId: loop.loopId, pulseStartedAt }
      : {
          loopId: loop.loopId,
          pulseStartedAt,
          snapshot: await collectSnapshot(
            loop.collectionRunId,
            null,
            loop.liveScreenInternalApiEnabled,
            "PULSE"
          )
        };
  } catch (error) {
    payload = {
      loopId: loop.loopId,
      pulseStartedAt,
      error: error instanceof Error ? error.message : "PULSE_CAPTURE_FAILED"
    };
  } finally {
    loop.running = false;
  }
  if (activeLivePulseLoop !== loop) return;
  try {
    const response = await chrome.runtime.sendMessage({
      type: loop.submitMessage,
      payload
    }) as { ok?: boolean; stop?: boolean; nextDelayMs?: number } | undefined;
    loop.transportFailures = 0;
    // A response from an older loop may arrive after a new loop has already
    // started on this page. It must not stop the newer loop.
    if (activeLivePulseLoop !== loop) return;
    if (response?.stop) {
      stopActiveLivePulseLoop();
      return;
    }
    const nextDelayMs = Number.isFinite(response?.nextDelayMs)
      ? Math.max(0, Number(response?.nextDelayMs))
      : Math.max(0, nextLivePulseAfter(pulseStartedAt, Date.now()) - Date.now());
    loop.timer = window.setTimeout(() => void runLivePulseLoop(loop), nextDelayMs);
  } catch {
    if (activeLivePulseLoop !== loop) return;
    loop.transportFailures += 1;
    if (loop.transportFailures >= 3) {
      await chrome.runtime.sendMessage({
        type: loop.submitMessage,
        payload: { loopId: loop.loopId, pulseStartedAt, error: "PULSE_TRANSPORT_UNAVAILABLE" }
      }).catch(() => undefined);
      stopActiveLivePulseLoop();
      return;
    }
    loop.timer = window.setTimeout(() => void runLivePulseLoop(loop), 1_000 * loop.transportFailures);
  }
}

async function collectSnapshot(
  collectionRunId?: string | null,
  routeOverride?: CollectionRouteKey | null,
  liveScreenInternalApiEnabled = false,
  collectionMode: "SNAPSHOT" | "PULSE" = "SNAPSHOT"
): Promise<CollectionSnapshotPayload> {
  if (collectionMode === "PULSE" && isLiveEnded()) throw new Error("LIVE_ENDED");
  const budget = createCaptureBudgetState();
  const rawDomText = collectionMode === "PULSE" ? "" : collectBudgetedVisibleText(document, budget);
  const rawTableData = collectionMode === "PULSE" ? [] : collectBudgetedTables(document, budget);
  const isLiveApiPulse = collectionMode === "PULSE" && isExactLiveScreenPage(window.location.href);
  const baseAdapter = selectPageAdapter({
    document,
    url: window.location.href,
    title: document.title,
    visibleText: rawDomText,
    tables: rawTableData,
    ...(isLiveApiPulse ? { routeKey: "LIVE_DATA_SCREEN" as const } : {})
  });
  const detectedRoute = detectCurrentRoute(rawDomText, baseAdapter.pageType, routeOverride);
  // Pulses deliberately do not read DOM metric text. Their exact live-page URL
  // is sufficient to identify the room-level API observation, while snapshots
  // still retain the stricter visual-tab route confirmation path.
  const routeDetection = isLiveApiPulse ? livePulseRouteDetection(detectedRoute) : detectedRoute;
  const adapterInput = { document, url: window.location.href, title: document.title, visibleText: rawDomText, tables: rawTableData, routeKey: routeDetection.routeKey };
  const adapter = selectPageAdapter(adapterInput);
  const isLiveScreen = adapter.pageType === "LIVE_DATA_SCREEN" && isExactLiveScreenPage(window.location.href);
  const roomId = readRoomId();
  const internalApiEligible = isLiveScreen
    && Boolean(roomId.value)
    && (collectionMode === "PULSE" || routeDetection.routeKey === "LIVE_DATA_SCREEN");
  const capturePlan = liveScreenCapturePlan({
    mode: collectionMode,
    internalApiEnabled: liveScreenInternalApiEnabled,
    internalApiEligible
  });
  const domMetrics = capturePlan.collectDom ? adapter.extractMetrics(adapterInput) : [];
  const pulseController = collectionMode === "PULSE" && capturePlan.collectInternalApi
    ? new AbortController()
    : null;
  if (pulseController) activePulseController = pulseController;
  const api = isLiveScreen
    ? await collectLiveScreenInternalApi({
        enabled: capturePlan.collectInternalApi,
        roomId: roomId.value,
        roomIdSource: roomId.source,
        roomIdEvidence: roomId.evidence,
        mode: collectionMode,
        signal: pulseController?.signal
      })
    : null;
  if (activePulseController === pulseController) activePulseController = null;
  const visibleMetricsJson = liveScreenMetricsForMode(collectionMode, domMetrics, api?.metrics || []);
  const captureMeta = applyCaptureBudget(adapter.extractCoverage(adapterInput, visibleMetricsJson), budget);
  const isPulse = collectionMode === "PULSE";
  return sanitizeSnapshotPayload({
    pageType: adapter.pageType,
    sourceUrl: window.location.href,
    pageTitle: document.title,
    // Visible text is used only during this capture to derive safe fields; it is never persisted or uploaded.
    rawDomText: "",
    rawNetworkJson: [],
    rawTableData: isPulse ? [] : rawTableData,
    visibleMetricsJson,
    screenshotUrl: null,
    localCollectedAt: new Date().toISOString(),
    collectionRunId: collectionRunId || null,
    routeKey: routeDetection.routeKey,
    captureMeta: { ...captureMeta, routeDetection, ...(api ? { liveScreenInternalApi: api.captureMeta } : {}) }
  }) as CollectionSnapshotPayload;
}

function readLocalPromotionDomIdentity() {
  return {
    advid: [...document.querySelectorAll<HTMLElement>("[data-advid]")].map((element) => element.dataset.advid || ""),
    roomId: [...document.querySelectorAll<HTMLElement>("[data-room-id]")].map((element) => element.dataset.roomId || ""),
    selectedAdvid: [...document.querySelectorAll<HTMLElement>("[data-selected-advid]")].map((element) => element.dataset.selectedAdvid || ""),
    selectedAwemeId: [...document.querySelectorAll<HTMLElement>("[data-selected-aweme-id]")].map((element) => element.dataset.selectedAwemeId || "")
  };
}

function readRoomId() {
  const urlRoomIds = new URL(window.location.href).searchParams.getAll("room_id");
  const domRoomIds = [...document.querySelectorAll<HTMLElement>("[data-room-id]")]
    .map((element) => element.dataset.roomId?.trim() || "");
  return resolveLiveScreenRoomId({ urlRoomIds, domRoomIds });
}

function startPageActivityHeartbeat() {
  if (pageActivityTimer != null) window.clearInterval(pageActivityTimer);
  reportPageActivity();
  pageActivityTimer = window.setInterval(reportPageActivity, 5_000);
}

function reportPageActivity() {
  const context = collectPageContext();
  chrome.runtime.sendMessage({
    type: MESSAGE.PAGE_ACTIVITY,
    payload: {
      currentUrl: window.location.href,
      pageType: context.pageType,
      routeKey: context.routeKey,
      collectable: isSupportedExtensionCollectionUrl(window.location.href),
      tabState: document.visibilityState === "visible" ? "VISIBLE" : "HIDDEN",
      observedAt: new Date().toISOString()
    }
  }, () => void chrome.runtime.lastError);
}

function isLiveEnded() {
  if (new URL(window.location.href).pathname !== "/dp/liveScreen") return false;
  const text = document.body?.innerText?.slice(0, 20_000) || "";
  return /直播已结束|本场直播已结束|直播结束/.test(text);
}

function collectPageContext() {
  const routeDetection = detectCurrentRoute("");
  const baseInput = { document, url: window.location.href, title: document.title, visibleText: "", tables: [] as unknown[] };
  if (isExactLiveScreenPage(window.location.href)) {
    const roomId = readRoomId().value;
    return {
      currentUrl: window.location.href,
      ...livePulsePageContext({
        routeDetection,
        roomId
      })
    };
  }
  if (isExactLocalPromotionInternalApiPage(window.location.href)) {
    const identity = resolveLocalPromotionIdentity({
      url: window.location.href,
      dom: readLocalPromotionDomIdentity()
    });
    const identityReady = identity.source !== "MISMATCH" && Boolean(identity.advid || identity.selectedAdvid);
    return {
      currentUrl: window.location.href,
      pageType: "LOCAL_PROMOTION_DASHBOARD" as const,
      routeKey: "LOCAL_PROMOTION_DASHBOARD" as const,
      routeDetection: { routeKey: "LOCAL_PROMOTION_DASHBOARD" as const, source: "PAGE_TYPE" as const, confidence: 0.98, manuallyConfirmed: false, evidence: ["实时 API 脉冲：精确本地推数据总览 URL"] },
      localPromotionPulseEligible: identityReady,
      localPromotionPulseIdentityKey: identityReady ? localPromotionIdentityKey(identity) : null,
      localPromotionPulseFailureCode: identityReady ? null : "IDENTITY_UNAVAILABLE"
    };
  }
  const baseAdapter = selectPageAdapter(baseInput);
  const adapter = selectPageAdapter({ ...baseInput, routeKey: routeDetection.routeKey });
  return {
    currentUrl: window.location.href,
    pageType: adapter.pageType,
    routeKey: routeDetection.routeKey,
    routeDetection,
    livePulseEligible: false,
    livePulseRoomId: null,
    livePulseFailureCode: null,
    localPromotionPulseEligible: false,
    localPromotionPulseIdentityKey: null,
    localPromotionPulseFailureCode: null
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
    .filter((element) => isCaptureVisibleElement(element))
    .map((element) => (element.textContent || "").trim())
    .filter((value) => value.length > 0 && value.length <= 20)
    .slice(0, 20);
}

function visibleHeadings() {
  return [...document.querySelectorAll("h1,h2,h3,[role=heading]")]
    .filter((element) => isCaptureVisibleElement(element))
    .map((element) => (element.textContent || "").trim())
    .filter(Boolean)
    .slice(0, 50);
}
