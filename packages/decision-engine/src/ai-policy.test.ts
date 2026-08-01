import { describe, expect, it } from "vitest";
import { guardAiCandidateActionsWithPolicy } from "./ai-policy.js";

const candidate = {
  actionType: "INCREASE_BUDGET" as const,
  title: "小样本增量测试",
  reason: "ROI 达标",
  riskLevel: "HIGH" as const,
  confidence: 0.8,
  evidenceIds: ["metric:roi"]
};

describe("AI candidate policy guard", () => {
  it("rejects invalid evidence and policy-ineligible actions", () => {
    const invalid = guardAiCandidateActionsWithPolicy({
      policy: { policyVersion: "v1", dataQuality: { missingFields: [], completeness: 1, blocksStrongActions: false } },
      candidates: [candidate],
      validEvidenceIds: new Set()
    });
    expect(invalid.adjudication.rejected[0]?.reasonCode).toBe("EVIDENCE_INVALID");

    const blocked = guardAiCandidateActionsWithPolicy({
      policy: {
        policyVersion: "v1",
        dataQuality: {
          missingFields: [],
          completeness: 1,
          blocksStrongActions: true,
          actionEligibility: { INCREASE_BUDGET: { eligible: false, blockingEvidence: ["数据过期"], missingEvidence: [], maxDataAgeMs: 90_000 } }
        }
      },
      candidates: [candidate],
      validEvidenceIds: new Set(["metric:roi"])
    });
    expect(blocked.adjudication.rejected[0]?.reasonCode).toBe("ACTION_POLICY_BLOCKED");
  });

  it("only emits pending manual approval proposals", () => {
    const result = guardAiCandidateActionsWithPolicy({
      policy: { policyVersion: "v1", dataQuality: { missingFields: [], completeness: 1, blocksStrongActions: false } },
      candidates: [candidate],
      validEvidenceIds: new Set(["metric:roi"])
    });
    expect(result.acceptedProposals[0]).toMatchObject({ requiresApproval: true, status: "PENDING_APPROVAL" });
  });
});
