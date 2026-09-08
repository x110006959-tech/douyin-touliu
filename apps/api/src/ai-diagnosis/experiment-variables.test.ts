import { describe, expect, it } from "vitest";
import { changedExperimentVariables, experimentVariableNames } from "./experiment-variables.js";

describe("experiment intervention targets", () => {
  it.each([
    "商品讲解话术",
    "商品的讲解顺序",
    "优惠说明话术",
    "价格介绍脚本"
  ])("treats %s as content rather than a product or price change", (variable) => {
    expect(experimentVariableNames(variable)).toEqual(["直播话术"]);
  });

  it.each([
    "只优化商品讲解话术，保持预算、出价和优惠不变，观察商品成交。",
    "保持预算和人群不变并优化商品讲解话术，然后记录商品成交。",
    "优化商品讲解话术；不调整价格、出价或预算；核对商品成交。",
    "优化商品讲解话术用于观察商品成交。"
  ])("does not count controls or measured outcomes as changes: %s", (step) => {
    expect(changedExperimentVariables([step])).toEqual([{ stepIndex: 0, variables: ["直播话术"] }]);
  });

  it.each([
    "不调整预算、出价或人群，只观察商品成交。",
    "不要修改脚本或更换商品。",
    "保持预算不变，记录价格、优惠和商品点击。",
    "固定话术和商品价格，核对人群及出价。"
  ])("allows read-only controls: %s", (step) => {
    expect(changedExperimentVariables([step])).toEqual([]);
  });

  it.each([
    ["优化商品讲解话术并降低商品价格", ["直播话术", "价格"]],
    ["提高出价、预算", ["出价", "预算"]],
    ["将预算提高，再将出价降低", ["预算", "出价"]],
    ["不调整预算，但降低出价并修改人群", ["出价", "定向人群"]],
    ["保持出价不变，同时增加预算", ["预算"]],
    ["观察商品成交后更换商品", ["商品"]],
    ["修改话术并更换商品", ["直播话术", "商品"]],
    ["提高商品价格和优惠", ["价格", "优惠"]],
    ["预算翻倍，话术重写", ["预算", "直播话术"]],
    ["预算加倍", ["预算"]]
  ])("detects affirmative interventions in %s", (step, variables) => {
    expect(changedExperimentVariables([step])).toEqual([{ stepIndex: 0, variables }]);
  });

  it("keeps step locations for bounded repair feedback", () => {
    expect(changedExperimentVariables(["观察商品成交", "优化话术", "降低出价"]))
      .toEqual([{ stepIndex: 1, variables: ["直播话术"] }, { stepIndex: 2, variables: ["出价"] }]);
  });

  it.each(["观察预算后将其提高", "核对出价后将其降低", "然后提高", "优化话术并将其修改"])("does not erase an unresolved affirmative adjustment: %s", (step) => {
    expect(changedExperimentVariables([step])).toContainEqual(expect.objectContaining({ stepIndex: 0, unresolvedAdjustment: true }));
  });

  it.each(["观察预算后不要将其提高", "不要提高", "无需修改"])("keeps explicitly negated adjustments read-only: %s", (step) => {
    expect(changedExperimentVariables([step])).toEqual([]);
  });
});
