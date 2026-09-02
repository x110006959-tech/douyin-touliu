import { buildDiagnosisEvidenceCatalog } from "@douyin-local-life/diagnosis-skills";
import {
  decisionEngineInputSchema,
  type ActionProposalStatus,
  type ActionType,
  type DecisionEngineInput,
  type RiskLevel
} from "@douyin-local-life/shared";
import {
  diagnosisActionTypes,
  diagnosisFinalResultSchema,
  type DiagnosisExperiment,
  type DiagnosisFinalResult
} from "@douyin-local-life/shared/diagnosis";
import {
  buildDecisionRunDeterministicReview,
  buildDeterministicDiagnosticSignals,
  determineMainProblemTag
} from "./orchestrator.js";

type ProposalForDecisionView = {
  id: string;
  actionType: ActionType;
  title: string;
  reason: string;
  riskLevel: RiskLevel;
  status: ActionProposalStatus;
  manualExecutedAt: Date | null;
  expiresAt?: Date | null;
  outcomes?: Array<{ id: string }>;
};

const actionTypeSet = new Set<string>(diagnosisActionTypes);

export type DiagnosisDecisionView = {
  mainProblemTag: DiagnosisFinalResult["mainProblemTag"];
  headline: string;
  conclusion: string;
  conclusionSource: "AI_EXPLANATION" | "SERVER_DETERMINISTIC" | "SERVER_REVIEW";
  conclusionConfidence: number;
  problemSeverity: "UNASSESSED";
  problemSeverityReason: string;
  actionRisk: RiskLevel | null;
  targetComparison: {
    metricLabel: "全域支付 ROI";
    actual: number;
    target: number;
    absoluteGap: number;
    achievementRate: number;
    relativeShortfall: number;
  } | null;
  facts: DiagnosisFinalResult["factSnapshot"];
  openQuestions: string[];
  nextStep: {
    kind: "APPROVAL" | "MANUAL_EXECUTION" | "OBSERVATION" | "OUTCOME_REVIEW" | "COMPLETED" | "COLLECT_EVIDENCE" | "NONE";
    title: string;
    reason: string;
    proposalId: string | null;
    actionType: ActionType | null;
    status: ActionProposalStatus | null;
  };
  primaryExperiment: DiagnosisExperiment | null;
  blockedActions: Array<{
    actionType: ActionType;
    title: string;
    reason: string;
    source: "POLICY" | "LIFECYCLE";
  }>;
};

export function buildDiagnosisDecisionView(
  inputValue: unknown,
  finalResultValue: unknown,
  proposals: ProposalForDecisionView[]
): DiagnosisDecisionView | null {
  const input = decisionEngineInputSchema.safeParse(inputValue);
  const result = diagnosisFinalResultSchema.safeParse(finalResultValue);
  if (!input.success || !result.success) return null;

  const signals = buildDeterministicDiagnosticSignals(buildDiagnosisEvidenceCatalog(input.data as DecisionEngineInput));
  const review = buildDecisionRunDeterministicReview(inputValue, finalResultValue);
  const mainProblemTag = review?.expectedMainProblemTag || determineMainProblemTag(signals);
  const actionableProposals = review ? [] : proposals.map(withReadableStatus);
  const nextProposal = selectNextProposal(actionableProposals);
  const nextStep = buildNextStep(nextProposal, result.data.missingEvidence);
  const targetComparison = buildTargetComparison(signals);
  const primaryExperiment = review ? null : findProposalExperiment(result.data, nextProposal);
  const blockedActions = review ? [] : readBlockedActions(finalResultValue, result.data);
  const conclusion = review?.conclusion
    || buildDeterministicConclusion(mainProblemTag, targetComparison, nextProposal, result.data.coreConclusion);

  return {
    mainProblemTag,
    headline: problemLabel(mainProblemTag),
    conclusion,
    conclusionSource: review ? "SERVER_REVIEW" : targetComparison ? "SERVER_DETERMINISTIC" : "AI_EXPLANATION",
    conclusionConfidence: result.data.confidence,
    problemSeverity: "UNASSESSED",
    problemSeverityReason: "目标差距已确认；业务影响仍需结合历史趋势、投放规模和同口径拆解判断。",
    actionRisk: nextProposal?.riskLevel || null,
    targetComparison,
    facts: result.data.factSnapshot,
    openQuestions: unique([
      ...result.data.missingEvidence,
      ...result.data.hypotheses.flatMap((item) => item.missingEvidence)
    ]).slice(0, 3),
    nextStep,
    primaryExperiment,
    blockedActions
  };
}

function buildTargetComparison(signals: ReturnType<typeof buildDeterministicDiagnosticSignals>) {
  const actual = signals.delivery.payRoi;
  const target = signals.delivery.targetRoi;
  if (actual === null || target === null || target <= 0) return null;
  return {
    metricLabel: "全域支付 ROI" as const,
    actual,
    target,
    absoluteGap: round(target - actual),
    achievementRate: round(actual / target),
    relativeShortfall: round((target - actual) / target)
  };
}

function buildDeterministicConclusion(
  tag: DiagnosisFinalResult["mainProblemTag"],
  comparison: DiagnosisDecisionView["targetComparison"],
  nextProposal: ProposalForDecisionView | null,
  fallback: string
) {
  if (tag !== "DELIVERY_ROI" || !comparison) return fallback;
  const base = `全域支付 ROI 为 ${comparison.actual}，低于目标 ROI ${comparison.target}，目标差距已确认。`;
  if (nextProposal) {
    return `${base}现有证据尚不能仅凭整体 ROI 判断具体原因；服务端已将下一步限制为“${nextProposal.title}”，仍需人工确认并按同口径记录结果。`;
  }
  return `${base}现有证据尚不能说明差距由出价、定向、直播承接或商品结构中的哪一项造成，先补齐同口径拆解和历史对比，不直接调整预算或出价。`;
}

function selectNextProposal(proposals: ProposalForDecisionView[]) {
  const rank: Partial<Record<ActionProposalStatus, number>> = {
    APPROVED: 1,
    PENDING_APPROVAL: 2,
    OBSERVING: 3
  };
  return [...proposals]
    .filter((proposal) => rank[proposal.status] !== undefined || proposal.status === "MANUAL_EXECUTED")
    .sort((left, right) => {
      const leftNeedsOutcome = left.status === "MANUAL_EXECUTED" && !(left.outcomes?.length);
      const rightNeedsOutcome = right.status === "MANUAL_EXECUTED" && !(right.outcomes?.length);
      if (leftNeedsOutcome !== rightNeedsOutcome) return leftNeedsOutcome ? -1 : 1;
      const leftRank = left.status === "MANUAL_EXECUTED" ? 10 : rank[left.status] ?? 99;
      const rightRank = right.status === "MANUAL_EXECUTED" ? 10 : rank[right.status] ?? 99;
      return leftRank - rightRank;
    })[0] || null;
}

function withReadableStatus(proposal: ProposalForDecisionView): ProposalForDecisionView {
  const expirable = ["PENDING_APPROVAL", "APPROVED", "OBSERVING"].includes(proposal.status);
  return expirable && proposal.expiresAt && proposal.expiresAt <= new Date()
    ? { ...proposal, status: "EXPIRED" }
    : proposal;
}

function buildNextStep(proposal: ProposalForDecisionView | null, missingEvidence: string[]): DiagnosisDecisionView["nextStep"] {
  if (!proposal) {
    const reason = missingEvidence[0] || "本轮没有通过服务端规则且仍需推进的动作。";
    return {
      kind: missingEvidence.length ? "COLLECT_EVIDENCE" : "NONE",
      title: missingEvidence.length ? "先补齐会改变决定的关键证据" : "当前无需新增动作",
      reason,
      proposalId: null,
      actionType: null,
      status: null
    };
  }
  const base = {
    title: proposal.title,
    reason: stripTechnicalEvidence(proposal.reason),
    proposalId: proposal.id,
    actionType: proposal.actionType,
    status: proposal.status
  };
  if (proposal.status === "MANUAL_EXECUTED") {
    return proposal.outcomes?.length
      ? { ...base, kind: "COMPLETED" as const, reason: "人工执行与结果复盘均已记录，可用于后续离线评估。" }
      : { ...base, kind: "OUTCOME_REVIEW" as const, reason: "人工执行已经记录，下一步是补充同口径执行结果，完成本轮复盘。" };
  }
  if (proposal.status === "APPROVED") return { ...base, kind: "MANUAL_EXECUTION" as const };
  if (proposal.status === "OBSERVING") return { ...base, kind: "OBSERVATION" as const };
  return { ...base, kind: "APPROVAL" as const };
}

function findProposalExperiment(result: DiagnosisFinalResult, proposal: ProposalForDecisionView | null) {
  if (!proposal) return null;
  const candidate = result.candidateActions.find((item) => item.actionType === proposal.actionType);
  if (!candidate?.experimentId) return null;
  return result.experiments.find((item) => item.id === candidate.experimentId) || null;
}

function readBlockedActions(value: unknown, result: DiagnosisFinalResult): DiagnosisDecisionView["blockedActions"] {
  const adjudication = readRecord(readRecord(value)?.ruleAdjudication);
  if (!adjudication) return [];
  const blocked: DiagnosisDecisionView["blockedActions"] = [];
  if (Array.isArray(adjudication.rejected)) {
    for (const itemValue of adjudication.rejected) {
      const item = readRecord(itemValue);
      const candidate = readRecord(item?.candidate);
      const actionType = readActionType(candidate?.actionType);
      if (!item || !candidate || !actionType) continue;
      blocked.push({
        actionType,
        title: typeof candidate.title === "string" ? candidate.title : actionType,
        reason: typeof item.reason === "string" ? item.reason : "未通过服务端证据与安全规则。",
        source: "POLICY"
      });
    }
  }
  if (Array.isArray(adjudication.lifecycleSuppressed)) {
    for (const itemValue of adjudication.lifecycleSuppressed) {
      const item = readRecord(itemValue);
      const actionType = readActionType(item?.actionType);
      if (!item || !actionType) continue;
      const candidate = result.candidateActions.find((entry) => entry.actionType === actionType);
      blocked.push({
        actionType,
        title: candidate?.title || actionType,
        reason: item.reason === "FREQUENCY_LIMIT" ? "当前项目一小时内可处理动作已达到上限。" : "同类动作仍在冷却期，避免重复调整。",
        source: "LIFECYCLE"
      });
    }
  }
  return blocked;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readActionType(value: unknown): ActionType | null {
  return typeof value === "string" && actionTypeSet.has(value) ? value as ActionType : null;
}

function stripTechnicalEvidence(value: string) {
  return value.replace(/[（(]证据[:：][^）)]*[）)]/g, "").trim();
}

function problemLabel(tag: DiagnosisFinalResult["mainProblemTag"]) {
  return {
    HEALTHY: "当前未发现明确异常",
    DATA_READINESS: "判断条件不足",
    TRAFFIC: "优先检查流量进入",
    LIVE_ROOM: "优先检查直播承接",
    PRODUCT: "优先检查商品与优惠",
    DELIVERY_ROI: "投放产出未达到本次目标",
    ACTIVITY_COMPLIANCE: "优先处理活动、履约或合规风险",
    MULTI_FACTOR: "需要分两步验证"
  }[tag];
}

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
