import { describe, expect, it } from "vitest";
import contentSource from "./content.ts?raw";
import serviceWorkerSource from "./service-worker.ts?raw";
import serviceWorkerRuntimeSource from "./service-worker-runtime.ts?raw";
import { isLivePulseActivityReporter, livePulseActivityForTab } from "./live-pulse-activity";

const activity = {
  currentUrl: "https://eos.douyin.com/dp/liveScreen?room_id=1",
  pageType: "LIVE_DATA_SCREEN" as const,
  routeKey: "LIVE_DATA_SCREEN" as const,
  collectable: true,
  tabState: "VISIBLE" as const,
  observedAt: "2026-08-11T10:00:00.000Z"
};

describe("live pulse activity isolation", () => {
  it("runs under the post-minute-trend isolation protocol", async () => {
    const { extensionCollectionProtocolVersion } = await import("@douyin-local-life/shared");
    expect(extensionCollectionProtocolVersion).toBe(8);
  });

  it("keeps the running live pulse activity scoped to its starting tab", () => {
    expect(isLivePulseActivityReporter(42, 42)).toBe(true);
    expect(isLivePulseActivityReporter(42, 7)).toBe(false);
    expect(isLivePulseActivityReporter(42, undefined)).toBe(false);
  });

  it("adds the originating tab to the stored live pulse activity", () => {
    expect(livePulseActivityForTab(activity, 42)).toEqual({ ...activity, tabId: 42 });
    expect(livePulseActivityForTab(activity, 0)).toBeNull();
  });

  it("validates submitted pulses from isolated live activity rather than the global page activity", () => {
    const submitLivePulseSource = serviceWorkerSource.slice(
      serviceWorkerSource.indexOf("async function submitLivePulse"),
      serviceWorkerSource.indexOf("async function uploadMetricPulse")
    );

    expect(submitLivePulseSource).toContain("hydrateLivePulseActivity(tabId)");
    expect(submitLivePulseSource).not.toContain("STORAGE.PAGE_ACTIVITY");
  });

  it("checks a live tab activity before updating its isolated activity record", () => {
    const activityHandlerSource = serviceWorkerSource.slice(
      serviceWorkerSource.indexOf("async function handlePageActivity"),
      serviceWorkerSource.indexOf("async function captureAndUpload")
    );

    expect(activityHandlerSource.indexOf("shouldStopLivePulseForActivity")).toBeLessThan(
      activityHandlerSource.indexOf("livePulseActivityForTab")
    );
  });

  it("allows a running live pulse tab to become hidden while the user views the web dashboard", () => {
    const stopPredicateSource = serviceWorkerSource.slice(
      serviceWorkerSource.indexOf("function shouldStopLivePulseForActivity"),
      serviceWorkerSource.indexOf("async function stopLivePulseForTab")
    );

    expect(stopPredicateSource).toContain("isExactLiveScreenPage");
    expect(stopPredicateSource).toContain('activity.pageType !== "LIVE_DATA_SCREEN"');
    expect(stopPredicateSource).not.toContain('activity.tabState !== "VISIBLE"');
  });

  it("keeps a hidden local-promotion source tab active as long as its exact URL remains valid", () => {
    const stopPredicateSource = serviceWorkerSource.slice(
      serviceWorkerSource.indexOf("function shouldStopLivePulseForActivity"),
      serviceWorkerSource.indexOf("async function stopLivePulseForTab")
    );

    expect(stopPredicateSource).toContain('routeKey === "LOCAL_PROMOTION_DASHBOARD"');
    expect(stopPredicateSource).toContain("isExactLocalPromotionInternalApiPage(activity.currentUrl)");
    expect(stopPredicateSource).not.toContain('activity.tabState !== "VISIBLE"');
  });

  it("does not let late callbacks clear a newer pulse and tolerates same-identity history updates", () => {
    expect(serviceWorkerSource).toContain("expectedState?: PulseState");
    expect(serviceWorkerSource).toContain("if (expectedState && !isLivePulseStateActive(expectedState)) return;");
    expect(serviceWorkerSource).toContain("canKeepLivePulseForUrlUpdate");
    expect(serviceWorkerSource).toContain('if (changeInfo.status === "loading")');
  });

  it("allows one pulse per tab while keeping duplicate starts on the same tab blocked", () => {
    expect(serviceWorkerSource).toContain("const livePulseStates = new Map<number, PulseState>()");
    expect(serviceWorkerSource).toContain("const active = livePulseStates.get(tabId) || null;");
    expect(serviceWorkerSource).toContain("livePulseStates.set(tabId, state)");
    expect(serviceWorkerRuntimeSource).toContain("message.payload?.tabId");
  });

  it("does not let an old content-loop response stop a newer loop", () => {
    expect(contentSource).not.toContain("if (activeLivePulseLoop !== loop || response?.stop)");
    expect(contentSource).toContain("if (activeLivePulseLoop !== loop) return;");
    expect(contentSource).toContain("if (response?.stop)");
    expect(contentSource).toContain("loopId: loop.loopId");
    expect(serviceWorkerSource).toContain("payload.loopId !== state.loopId");
  });

  it("retains the endpoint when an upload safety failure stops immediately", () => {
    const failureSource = serviceWorkerSource.slice(
      serviceWorkerSource.indexOf("async function handleLivePulseFailure"),
      serviceWorkerSource.indexOf("async function stopLivePulse")
    );
    expect(failureSource).toContain("await stopLivePulse(fatalReason, endpoint, undefined, state)");
  });

  it("rejects an old live-page content script before creating a collection session", () => {
    const startSource = serviceWorkerSource.slice(
      serviceWorkerSource.indexOf("async function startLivePulse"),
      serviceWorkerSource.indexOf("async function submitLivePulse")
    );
    expect(startSource).toContain("pageContext?.buildFingerprint !== __PXXIS_EXTENSION_BUILD__");
    expect(startSource.indexOf("pageContext?.buildFingerprint !== __PXXIS_EXTENSION_BUILD__"))
      .toBeLessThan(startSource.indexOf("const session = await ensureCollectionSession();"));
  });
});
