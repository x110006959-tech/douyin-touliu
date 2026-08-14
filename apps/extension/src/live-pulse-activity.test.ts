import { describe, expect, it } from "vitest";
import serviceWorkerSource from "./service-worker.ts?raw";
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

    expect(submitLivePulseSource).toContain("STORAGE.LIVE_PULSE_ACTIVITY");
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
});
