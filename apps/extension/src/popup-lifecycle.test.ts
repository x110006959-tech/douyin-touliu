import { describe, expect, it } from "vitest";
import popupHtml from "../popup.html?raw";
import popupSource from "./popup.ts?raw";
import livePulseStatusSource from "./live-pulse-status.ts?raw";

describe("API continuous collection popup lifecycle", () => {
  it("keeps collection running when the popup closes and presents it as the primary live action", () => {
    expect(popupSource).not.toContain('window.addEventListener("pagehide"');
    expect(popupSource).toContain("网页端实时数据栏会持续更新");
    expect(popupHtml).toContain("开始 API 持续采集");
    expect(popupHtml).toContain('id="livePulseBtn" class="primary capture-button"');
    expect(popupHtml.indexOf('id="livePulseBtn"')).toBeLessThan(popupHtml.indexOf('id="livePulseData"'));
    expect(popupHtml).toContain("核心指标 0/13");
    expect(popupHtml).toContain("等待首次上传");
    expect(popupHtml).toContain('id="livePulseCollected"');
    expect(popupHtml).toContain('id="copyLogsBtn"');
    expect(popupHtml).not.toContain("保存当前数据为正式快照");
    const toggleSource = popupSource.slice(
      popupSource.indexOf("async function toggleLivePulse"),
      popupSource.indexOf("async function pairExtension")
    );
    expect(toggleSource).not.toContain("chrome.sidePanel.open");
    expect(toggleSource).toContain("关闭弹窗不会停止");
  });

  it("keeps the latest pulse failure visible after the worker stops the session", () => {
    expect(popupSource).toContain("livePulseStatusText");
    expect(popupSource).toContain("refreshLivePulseStatus");
    expect(popupSource).toContain("let popupRenderGeneration = 0;");
    expect(popupSource).toContain("let livePulseActionInFlight = false;");
    expect(popupSource).toContain("if (renderGeneration !== popupRenderGeneration) return;");
    const refreshSource = popupSource.slice(
      popupSource.indexOf("async function refreshLivePulseStatus"),
      popupSource.indexOf("async function toggleLivePulse")
    );
    expect(refreshSource).toContain("syncLivePulseButton(currentPagePulse, internalApiEnabled)");
    expect(refreshSource).toContain("if (livePulseActionInFlight || refreshGeneration !== popupRenderGeneration) return;");
    const toggleSource = popupSource.slice(
      popupSource.indexOf("async function toggleLivePulse"),
      popupSource.indexOf("async function pairExtension")
    );
    expect(toggleSource).toContain("livePulseActionInFlight = true;");
    expect(toggleSource).toContain("currentPagePulse?.lastOutcome?.failure");
    expect(livePulseStatusSource).toContain("API 响应结构不匹配");
    expect(livePulseStatusSource).not.toContain("未向服务端发送实时脉冲");
  });

  it("renders only pulse counters instead of metric cards or raw evidence", () => {
    expect(popupSource).toContain("renderLivePulseData");
    expect(popupSource).toContain("livePulseCoverage");
    expect(popupSource).toContain("livePulseCollected");
    expect(popupSource).toContain("livePulseMissing");
    expect(popupSource).not.toContain("latestMetrics");
    expect(popupSource).not.toContain("rawEvidence");
  });

  it("does not expose formal snapshot controls on exact live API pages", () => {
    expect(popupSource).toContain("const isLiveApiPage = hasToken && hasTask && isExactLiveScreen");
    expect(popupSource).toContain("toggle(els.livePulsePanel, isLiveApiPage || isLocalPromotionApiPage)");
    expect(popupSource).toContain("不读取 DOM 数值补齐");
    expect(popupSource).toContain("不创建快照");
    expect(popupSource).not.toContain("captureAndUpload");
    expect(popupHtml).not.toContain("采集并上传数据总览");
    expect(popupHtml).not.toContain('id="captureBtn"');
  });

  it("keeps pulse state bound to the current tab and collection route", () => {
    expect(popupHtml).toContain('id="livePulseTitle"');
    expect(popupSource).toContain("function pulseForCurrentPage");
    expect(popupSource).toContain("livePulse?.routeKey === routeKey && livePulse.tabId === tabId");
    expect(popupSource).toContain("livePulse?.lastOutcome?.routeKey === routeKey && livePulse.lastOutcome.tabId === tabId");
    expect(popupSource).toContain("巨量本地推 API 采集");
  });

  it("keeps the popup focused on the two current collection entries", () => {
    expect(popupSource).toContain('routeKey === "LOCAL_PROMOTION_DASHBOARD"');
    expect(popupSource).not.toContain("renderRouteOverrideOptions");
    expect(popupSource).not.toContain("条路线已有成功记录");
    expect(popupHtml).not.toContain("采集并上传数据总览");
    expect(popupSource).toContain("巨量本地推 API 采集");
    expect(popupHtml).not.toContain('id="routeOverride"');
  });

  it("explains fixed collection reasons while preserving exact codes", () => {
    expect(popupSource).toContain("formatCollectionReason");
    expect(popupSource).toContain("已切换备用 v3 接口（V3_FALLBACK）");
    expect(popupSource).toContain("部分可信指标成功（PARTIAL_METRICS）");
    expect(popupSource).toContain("livePulseReasonText(reason)");
  });

  it("offers a local-only way to copy the already-sanitized collection log", () => {
    expect(popupSource).toContain("copyRecentCollectionLogs");
    expect(popupSource).toContain("navigator.clipboard.writeText(text)");
    expect(popupSource).toContain("采集日志已复制，可直接粘贴给我");
  });
});
