export type TaskWizardProgressInput = {
  extensionConnected: boolean;
  hasCapture: boolean;
  requiredRoutesCaptured: boolean;
  reviewComplete: boolean;
  decisionCreated: boolean;
};

export function getTaskWizardProgress(input: TaskWizardProgressInput) {
  const steps = [
    // 历史快照只能证明过去曾采集成功，不能证明当前浏览器插件仍在线、
    // 仍绑定此任务，或当前页面可以安全采集。
    { number: 1, label: "连接插件", complete: input.extensionConnected },
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
