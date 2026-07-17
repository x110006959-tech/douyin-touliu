import { describe, expect, it } from "vitest";
import { getTaskWizardProgress, type TaskWizardProgressInput } from "./task-progress";

const empty: TaskWizardProgressInput = {
  extensionConnected: false,
  hasCapture: false,
  requiredRoutesCaptured: false,
  requiredRoutesAccountMatched: false,
  reviewComplete: false,
  decisionCreated: false
};

describe("task wizard progress", () => {
  it.each([
    [1, empty],
    [2, { ...empty, extensionConnected: true }],
    [3, { ...empty, hasCapture: true, requiredRoutesCaptured: true }],
    [4, { ...empty, hasCapture: true, requiredRoutesCaptured: true, requiredRoutesAccountMatched: true }],
    [5, { ...empty, hasCapture: true, requiredRoutesCaptured: true, requiredRoutesAccountMatched: true, reviewComplete: true }]
  ])("marks step %s as current", (expected, input) => {
    expect(getTaskWizardProgress(input).currentStep).toBe(expected);
  });

  it("does not roll back to connection when historical capture exists and the plugin is offline", () => {
    const progress = getTaskWizardProgress({
      ...empty,
      hasCapture: true,
      requiredRoutesCaptured: true,
      requiredRoutesAccountMatched: true
    });
    expect(progress.steps[0]?.complete).toBe(true);
    expect(progress.currentStep).toBe(4);
  });
});
