export type TaskWizardProgressInput = {
  extensionConnected: boolean;
  hasCapture: boolean;
  requiredRoutesCaptured: boolean;
  reviewComplete: boolean;
  decisionCreated: boolean;
};

export function getTaskWizardProgress(input: TaskWizardProgressInput) {
  const steps = [
    { number: 1, label: "连接插件", complete: input.extensionConnected || input.hasCapture },
    { number: 2, label: "采集页面", complete: input.requiredRoutesCaptured },
    { number: 3, label: "数据汇总", complete: input.requiredRoutesCaptured },
    { number: 4, label: "人工核对", complete: input.reviewComplete },
    { number: 5, label: "诊断建议", complete: input.decisionCreated }
  ];
  return {
    currentStep: steps.find((step) => !step.complete)?.number || 5,
    steps
  };
}
