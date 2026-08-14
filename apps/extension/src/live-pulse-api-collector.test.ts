import { describe, expect, it } from "vitest";
import contentSource from "./content.ts?raw";
import metricPulseUploadSource from "./metric-pulse-upload.ts?raw";
import serviceWorkerSource from "./service-worker.ts?raw";
import sidepanelSource from "./sidepanel.ts?raw";
import popupHtml from "../popup.html?raw";
import sidepanelHtml from "../sidepanel.html?raw";

describe("API collector-only live pulse mode", () => {
  it("keeps the five-second loop in the live page content script", () => {
    expect(contentSource).toContain("BEGIN_LIVE_PULSE_LOOP");
    expect(contentSource).toContain("SUBMIT_LIVE_PULSE");
    expect(contentSource).toContain("runLivePulseLoop");
    expect(contentSource).toContain("nextLivePulseAfter");
    expect(serviceWorkerSource).not.toContain("function scheduleLivePulse");
    expect(serviceWorkerSource).not.toContain("async function runLivePulse");
    expect(serviceWorkerSource).toContain("async function submitLivePulse");
  });

  it("prevents duplicate loops by replacing the previous content-script loop on every start", () => {
    const startLoopSource = contentSource.slice(
      contentSource.indexOf("function startLivePulseLoop"),
      contentSource.indexOf("function stopActiveLivePulseLoop")
    );
    expect(startLoopSource).toContain("stopActiveLivePulseLoop()");
    expect(startLoopSource).toContain("++livePulseLoopGeneration");
  });

  it("does not stop the live API loop merely because the user switches to the web dashboard tab", () => {
    const runtimeSource = contentSource.slice(
      contentSource.indexOf("function startContentRuntime"),
      contentSource.indexOf("function startLivePulseLoop")
    );
    const loopSource = contentSource.slice(
      contentSource.indexOf("async function runLivePulseLoop"),
      contentSource.indexOf("async function collectSnapshot")
    );
    expect(runtimeSource).toContain("visibilitychange");
    expect(runtimeSource).toContain("pagehide");
    expect(runtimeSource).not.toContain("stopActiveLivePulseLoop()");
    expect(loopSource).not.toContain('document.visibilityState !== "visible"');
  });

  it("removes plugin analysis coupling and diagnostic proposal requests", () => {
    expect(serviceWorkerSource).not.toContain("latestSignals");
    expect(serviceWorkerSource).not.toContain("serverPulseCount");
    expect(sidepanelSource).not.toContain("decision-runs/latest");
    expect(sidepanelSource).not.toContain("ActionProposal");
    expect(sidepanelSource).not.toContain("signals");
  });

  it("shows only collector status in API mode", () => {
    expect(popupHtml).toContain("核心指标 0/7");
    expect(popupHtml).toContain("等待首次上传");
    expect(popupHtml).not.toContain("成功次数");
    expect(popupHtml).not.toContain("指标数量");
    expect(popupHtml).not.toContain("30 秒");
    expect(popupHtml).not.toContain("正式诊断建议");
    expect(sidepanelHtml).toContain("API 持续采集状态");
    expect(sidepanelHtml).not.toContain("实时判断");
    expect(sidepanelHtml).not.toContain("正式诊断建议");
  });

  it("does not ship removed live-pulse signal and preview modules", () => {
    expect(metricPulseUploadSource).not.toContain("parseLivePulseServerResult");
    expect(serviceWorkerSource).not.toContain("live-pulse-preview");
    expect(serviceWorkerSource).not.toContain("live-pulse-signal");
  });
});
