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
    expect(popupHtml).toContain("核心指标 0/7");
    expect(popupHtml).toContain("等待首次上传");
    expect(popupHtml).not.toContain("保存当前数据为正式快照");
    const toggleSource = popupSource.slice(
      popupSource.indexOf("async function toggleLivePulse"),
      popupSource.indexOf("async function captureAndUpload")
    );
    expect(toggleSource).not.toContain("chrome.sidePanel.open");
    expect(toggleSource).toContain("关闭弹窗不会停止");
  });

  it("keeps the latest pulse failure visible after the worker stops the session", () => {
    expect(popupSource).toContain("livePulseStatusText");
    expect(popupSource).toContain("refreshLivePulseStatus");
    const refreshSource = popupSource.slice(
      popupSource.indexOf("async function refreshLivePulseStatus"),
      popupSource.indexOf("async function toggleLivePulse")
    );
    expect(refreshSource).toContain("syncLivePulseButton(state)");
    expect(livePulseStatusSource).toContain("API 响应结构不匹配");
    expect(livePulseStatusSource).not.toContain("未向服务端发送实时脉冲");
  });

  it("renders only pulse counters instead of metric cards or raw evidence", () => {
    expect(popupSource).toContain("renderLivePulseData");
    expect(popupSource).toContain("livePulseCoverage");
    expect(popupSource).toContain("livePulseMissing");
    expect(popupSource).not.toContain("latestMetrics");
    expect(popupSource).not.toContain("rawEvidence");
  });

  it("does not expose formal snapshot controls on exact live API pages", () => {
    expect(popupSource).toContain("const isLiveApiPage = hasToken && hasTask && isExactLiveScreen");
    expect(popupSource).toContain("toggle(els.boundPanel, hasToken && hasTask && isLocalPromotionPage)");
    expect(popupSource).toContain("toggle(els.captureBtn, isLocalPromotionPage)");
    expect(popupSource).toContain("toggle(els.livePulsePanel, isLiveApiPage)");
    expect(popupSource).toContain("不读取 DOM 数值补齐");
  });

  it("keeps the popup focused on the two current collection entries", () => {
    expect(popupSource).toContain('routeKey === "LOCAL_PROMOTION_DASHBOARD"');
    expect(popupSource).not.toContain("renderRouteOverrideOptions");
    expect(popupSource).not.toContain("条路线已有成功记录");
    expect(popupHtml).toContain("采集并上传数据总览");
    expect(popupHtml).toContain("任务或计划列表不再采集");
    expect(popupHtml).not.toContain('id="routeOverride"');
  });
});
