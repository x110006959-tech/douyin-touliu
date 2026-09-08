import { describe, expect, it } from "vitest";
import { diagnosisExperimentFailureReason, humanizeBusinessText, humanizeDiagnosisFailure, summarizeDecisionBoundaries } from "./diagnosis-presentation";

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

  it("explains the captured experiment failure without technical paths or another blind retry instruction", () => {
    const error = "模型结构化诊断在一次修复后仍不合法；DIAGNOSIS_EXPERIMENT_INVALID: 人工调整实验一次只能改变一个经营变量";
    expect(humanizeDiagnosisFailure("DIAGNOSIS_OUTPUT_INVALID", error)).toBe(
      "验证方案被判定为同时调整多个经营变量，无法单独判断哪项调整有效。本次未生成建议，已采集数据仍保留。"
    );
    expect(diagnosisExperimentFailureReason(`${error}。experiments.0.steps.1（价格）`))
      .toBe("验证方案被判定为同时调整多个经营变量，无法单独判断哪项调整有效。");
  });

  it("distinguishes observation and other experiment contract failures", () => {
    expect(diagnosisExperimentFailureReason("DIAGNOSIS_EXPERIMENT_INVALID: 观察实验不得夹带经营设置调整"))
      .toBe("观察方案中包含了经营调整，未通过只读检查。");
    expect(diagnosisExperimentFailureReason("DIAGNOSIS_EXPERIMENT_INVALID: 实验动作类型与关联候选动作不一致"))
      .toBe("验证方案的动作关联、观察条件或停止标准未通过实验设计检查。");
    expect(diagnosisExperimentFailureReason("DIAGNOSIS_EVIDENCE_INVALID")).toBeNull();
  });

  it.each([
    ["DIAGNOSIS_BENCHMARK_UNSUPPORTED", null],
    ["DIAGNOSIS_OUTPUT_INVALID", "自动修复失败；DIAGNOSIS_BENCHMARK_UNSUPPORTED: facts.0.statement"]
  ])("explains unsupported comparisons without raw paths or a blind retry instruction", (code, message) => {
    expect(humanizeDiagnosisFailure(code, message)).toBe(
      "AI 使用了当前证据无法支持的好坏评价或行业阈值，自动纠正后仍不符合要求。本次未生成建议，已采集数据仍保留。"
    );
  });
});
