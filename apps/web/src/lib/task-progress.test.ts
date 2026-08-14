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
    [4, { ...empty, extensionConnected: true, hasCapture: true, requiredRoutesCaptured: true }],
    [5, { ...empty, extensionConnected: true, hasCapture: true, requiredRoutesCaptured: true, reviewComplete: true }]
  ])("marks step %s as current", (expected, input) => {
    expect(getTaskWizardProgress(input).currentStep).toBe(expected);
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
