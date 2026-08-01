export type FormalDecisionReadinessInput = {
  missingRequiredRouteLabels: string[];
  unverifiedRequiredRouteLabels: string[];
  staleRequiredRouteLabels: string[];
  subjectReady: boolean;
  reviewTotalCount: number;
  reviewPendingCount: number;
};

export type FormalDecisionReadiness = {
  ready: boolean;
  blockingReasons: string[];
};

export function evaluateFormalDecisionReadiness(
  input: FormalDecisionReadinessInput
): FormalDecisionReadiness {
  const blockingReasons: string[] = [];
  if (input.missingRequiredRouteLabels.length) {
    blockingReasons.push(`基础采集路线未完成（尚未采集）：${input.missingRequiredRouteLabels.join("、")}`);
  }
  if (input.unverifiedRequiredRouteLabels.length) {
    blockingReasons.push(`以下页面尚未确认属于当前账号：${input.unverifiedRequiredRouteLabels.join("、")}`);
  }
  if (input.staleRequiredRouteLabels.length) {
    blockingReasons.push(`以下必需路线的数据已过期：${input.staleRequiredRouteLabels.join("、")}`);
  }
  if (!input.subjectReady) {
    blockingReasons.push("直播主体或操盘主体尚未校准");
  }
  if (input.reviewTotalCount <= 0) {
    blockingReasons.push("关键指标尚未开始人工复核");
  } else if (input.reviewPendingCount > 0) {
    blockingReasons.push(`还有 ${input.reviewPendingCount} 项指标待复核`);
  }
  return { ready: blockingReasons.length === 0, blockingReasons };
}
