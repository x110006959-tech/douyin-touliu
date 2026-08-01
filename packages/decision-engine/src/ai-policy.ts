import {
  decisionEngineActionTypes,
  type ActionProposalDTO,
  type DecisionDataQuality
} from "@douyin-local-life/shared";
import type {
  AiCandidateAction,
  DiagnosisPolicyRejection,
  DiagnosisRuleAdjudication
} from "@douyin-local-life/shared/diagnosis";

const allowedActionTypes = new Set<string>(decisionEngineActionTypes);

export function guardAiCandidateActionsWithPolicy(input: {
  policy: { policyVersion: string; dataQuality: DecisionDataQuality };
  candidates: AiCandidateAction[];
  validEvidenceIds: ReadonlySet<string>;
}): { adjudication: DiagnosisRuleAdjudication; acceptedProposals: ActionProposalDTO[] } {
  const accepted: DiagnosisRuleAdjudication["accepted"] = [];
  const acceptedProposals: ActionProposalDTO[] = [];
  const rejected: DiagnosisPolicyRejection[] = [];

  for (const candidate of input.candidates) {
    if (!allowedActionTypes.has(candidate.actionType)) {
      rejected.push({ candidate, reasonCode: "ACTION_NOT_ALLOWED", reason: "候选动作不在服务端允许枚举内" });
      continue;
    }
    if (!candidate.evidenceIds.length) {
      rejected.push({ candidate, reasonCode: "EVIDENCE_REQUIRED", reason: "候选动作没有引用任何诊断证据" });
      continue;
    }
    const invalidEvidence = candidate.evidenceIds.filter((id) => !input.validEvidenceIds.has(id));
    if (invalidEvidence.length) {
      rejected.push({ candidate, reasonCode: "EVIDENCE_INVALID", reason: `候选动作引用了无效证据：${invalidEvidence.join("、")}` });
      continue;
    }
    const eligibility = input.policy.dataQuality.actionEligibility?.[candidate.actionType];
    if (eligibility && !eligibility.eligible) {
      const reasons = [...eligibility.blockingEvidence, ...eligibility.missingEvidence];
      rejected.push({
        candidate,
        reasonCode: "ACTION_POLICY_BLOCKED",
        reason: reasons.length ? reasons.join("；") : "候选动作未通过数据质量和安全策略"
      });
      continue;
    }
    accepted.push({ ...candidate, requiresApproval: true });
    acceptedProposals.push({
      actionType: candidate.actionType,
      title: candidate.title,
      reason: `${candidate.reason}（证据：${candidate.evidenceIds.join("、")}）`,
      expectedImpact: candidate.expectedImpact,
      riskLevel: candidate.riskLevel,
      confidence: candidate.confidence,
      requiresApproval: true,
      status: "PENDING_APPROVAL"
    });
  }

  return {
    adjudication: { policyVersion: input.policy.policyVersion, accepted, rejected },
    acceptedProposals
  };
}
