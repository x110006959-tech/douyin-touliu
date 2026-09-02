import { describe, expect, it } from "vitest";
import { getTaskWizardProgress, type TaskWizardProgressInput } from "./task-progress";

const empty: TaskWizardProgressInput = {
  extensionConnected: false,
  hasCapture: false,
  requiredRoutesCaptured: false,
  reviewComplete: false,
  decisionCreated: false
};

describe("task wizard progress", () => {
  it.each([
    [1, empty],
    [2, { ...empty, extensionConnected: true }],
    [3, { ...empty, extensionConnected: true, hasCapture: true, requiredRoutesCaptured: true }],
    [4, { ...empty, extensionConnected: true, hasCapture: true, requiredRoutesCaptured: true, reviewComplete: true }]
  ])("marks step %s as current", (expected, input) => {
    expect(getTaskWizardProgress(input).currentStep).toBe(expected);
  });

  it("folds data confirmation into the summary step", () => {
    const progress = getTaskWizardProgress({
      ...empty,
      extensionConnected: true,
      hasCapture: true,
      requiredRoutesCaptured: true,
    });
    expect(progress.steps.map((step) => step.label)).toEqual(["连接插件", "采集页面", "数据汇总", "诊断建议"]);
    expect(progress.steps.some((step) => step.label === "人工核对")).toBe(false);
  });

  it("returns to connection when historical capture exists but the plugin is offline", () => {
    const progress = getTaskWizardProgress({
      ...empty,
      hasCapture: true,
      requiredRoutesCaptured: true
    });
    expect(progress.steps[0]?.complete).toBe(false);
    expect(progress.currentStep).toBe(1);
  });
});
