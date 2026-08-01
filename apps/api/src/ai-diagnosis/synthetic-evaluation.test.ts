import { describe, expect, it } from "vitest";
import { buildDiagnosisEvidenceCatalog, syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import { createSyntheticDiagnosisTransport, evaluateSyntheticDiagnosisSuite } from "./synthetic-evaluation.js";
import { buildDeterministicDiagnosticSignals, normalizeDiagnosisModelOutput, orchestrateDiagnosis } from "./orchestrator.js";

describe("24-case synthetic diagnosis evaluation", () => {
  it("passes structure, hit-rate, evidence and safety gates with the scripted provider", async () => {
    const report = await evaluateSyntheticDiagnosisSuite(createSyntheticDiagnosisTransport);
    expect(report.total).toBe(24);
    expect(report.structurePassRate).toBe(1);
    expect(report.mainProblemHitRate).toBeGreaterThanOrEqual(0.8);
    expect(report.hallucinatedEvidence).toBe(0);
    expect(report.safetyViolations).toBe(0);
  });

  it("retrieves workspace cases after domain skills and exposes only case summaries as evidence", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      similarCases: [],
      transport: createSyntheticDiagnosisTransport(testCase),
      retrieveSimilarCases: async (hints) => {
        expect(hints.mainProblemTags.length).toBeGreaterThan(0);
        return [{ id: "eligible-case", mainProblemTag: "HEALTHY", summary: "同类任务保持稳定", actionTypes: ["OBSERVE"], outcome: "IMPROVED", score: 0.9 }];
      }
    });
    expect(execution.skillOutputs.some((output) => output.skillId === "retrieve_similar_cases")).toBe(true);
    expect(execution.evidenceCatalog).toContainEqual(expect.objectContaining({ id: "case:eligible-case", kind: "CASE", value: "同类任务保持稳定" }));
  });

  it("normalizes only safe scalar representations before strict diagnosis validation", () => {
    expect(normalizeDiagnosisModelOutput({
      confidence: "0.8",
      refused: null,
      refusalReason: null,
      facts: [{ statement: "有诊断内容", evidenceIds: ["metric:orders"] }],
      missingEvidence: "缺少同周期对照",
      hypotheses: [{ confidence: "high", supportingEvidenceIds: "metric:orders" }]
    })).toEqual({
      confidence: 0.8,
      refused: false,
      refusalReason: null,
      facts: [{ statement: "有诊断内容", evidenceIds: ["metric:orders"] }],
      missingEvidence: ["缺少同周期对照"],
      hypotheses: [{ confidence: "high", supportingEvidenceIds: ["metric:orders"] }]
    });
  });

  it("derives reviewed diagnostic signals without assigning the final problem tag", () => {
    const healthy = syntheticDiagnosisCases[0]!;
    const product = syntheticDiagnosisCases[12]!;
    const healthySignals = buildDeterministicDiagnosticSignals(buildDiagnosisEvidenceCatalog(healthy.input));
    const productSignals = buildDeterministicDiagnosticSignals(buildDiagnosisEvidenceCatalog(product.input));
    expect(healthySignals.healthyBaselineSatisfied).toBe(true);
    expect(productSignals.product.weak).toBe(true);
    expect(productSignals.healthyBaselineSatisfied).toBe(false);
  });

  it("ignores unused extra properties for no-argument diagnosis tools", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const base = createSyntheticDiagnosisTransport(testCase);
    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      similarCases: [],
      transport: {
        ...base,
        async chat(request) {
          const response = await base.chat(request);
          const firstCall = response.message.tool_calls?.[0];
          if (firstCall) firstCall.function.arguments = JSON.stringify({ parameter: "ignored" });
          return response;
        }
      }
    });
    expect(execution.result.mainProblemTag).toBe("HEALTHY");
  });
});
