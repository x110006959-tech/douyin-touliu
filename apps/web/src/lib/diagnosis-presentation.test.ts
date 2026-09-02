import { describe, expect, it } from "vitest";
import { humanizeBusinessText, humanizeDiagnosisFailure, summarizeDecisionBoundaries } from "./diagnosis-presentation";

describe("summarizeDecisionBoundaries", () => {
  it("merges repeated same-type history gaps into one useful business sentence", () => {
    expect(summarizeDecisionBoundaries([
      "同直播类型、同时段、同口径的历史观看人数数据",
      "同直播类型、同时段、同口径的历史商品点击次数",
      "缺少本场明确的投放目标 ROI"
    ])).toEqual([
      "缺少近期历史趋势，暂不能判断当前表现是在改善还是回落。",
      "缺少本场明确的投放目标 ROI"
    ]);
  });

  it("keeps distinct decision-critical gaps and removes exact duplicates", () => {
    expect(summarizeDecisionBoundaries([
      "缺少商品明细",
      "缺少商品明细",
      "缺少流量来源明细"
    ])).toEqual(["缺少商品明细", "缺少流量来源明细"]);
  });

  it("removes internal evidence ids and unnecessary same-type wording from business copy", () => {
    expect(humanizeBusinessText(
      "继续观察同直播类型、同时段、同口径的历史数据。（证据：route:LIVE_DATA_SCREEN、metric:live_viewers:LOCAL_PROMOTION_DASHBOARD:4）"
    )).toBe("继续观察近期历史数据。");
  });

  it("turns deterministic conflict internals into a business-facing retry message", () => {
    expect(humanizeDiagnosisFailure(
      "DIAGNOSIS_OUTPUT_INVALID",
      "模型结构化诊断不合法；DIAGNOSIS_DETERMINISTIC_CONFLICT: 不同路线或口径不能拼接"
    )).toBe("AI 对指标关系的表述未通过证据一致性检查，本次已安全停止。当前数据没有被改动，请重新运行诊断。");
  });
});
