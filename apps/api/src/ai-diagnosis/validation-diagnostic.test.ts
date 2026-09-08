import { describe, expect, it } from "vitest";
import { createDiagnosisSkillPlan, syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import type { DiagnosisFinalModelOutput } from "@douyin-local-life/shared/diagnosis";
import { orchestrateDiagnosis } from "./orchestrator.js";
import { createSyntheticDiagnosisTransport } from "./synthetic-evaluation.js";
import { observationValidationDiagnostic, type ObservationValidationDiagnostic } from "./validation-diagnostic.js";

describe("observation validation diagnostics", () => {
  it("preserves the rejected business step, location and deterministic detection", () => {
    expect(observationValidationDiagnostic(0, "提高预算后观察成交", { stepIndex: 2, variables: ["预算"] })).toEqual({
      version: 1, rule: "OBSERVATION_STEP_CHANGE", path: "experiments.0.steps.2",
      stepText: "提高预算后观察成交", textRedacted: false, detectedVariables: ["预算"], unresolvedAdjustment: false
    });
  });

  it.each([
    "提高预算，api_key=private-value",
    "提高预算，sk-test-credential-value",
    "提高预算，Cookie: session=private-value",
    "提高预算，https://example.invalid/private?key=value",
    "提高预算，密码为private-value",
    "提高预算，GitHub PAT ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    "提高预算，AWS AccessKey AKIAIOSFODNN7EXAMPLE",
    "提高预算，访问 example.com/private/path",
    "提高预算，广告主账号 1234567890123456",
    "提高预算，联系张三"
  ])("withholds a credential or URL-bearing step: %s", (step) => {
    expect(observationValidationDiagnostic(0, step, { stepIndex: 0, variables: ["预算"] })).toMatchObject({
      stepText: "[REDACTED_SENSITIVE_STEP]", textRedacted: true, detectedVariables: ["预算"]
    });
  });

  it("withholds the whole step when contact information is present", () => {
    const diagnostic = observationValidationDiagnostic(0, "提高预算，联系 demo@example.com 或 13812345678", { stepIndex: 0, variables: ["预算"] });
    expect(diagnostic.stepText).toBe("[REDACTED_SENSITIVE_STEP]");
    expect(diagnostic.textRedacted).toBe(true);
  });

  it.each([
    "保持预算不变，观察成交",
    "核对预算是否与当前设置一致，不做调整",
    "提高预算后观察成交"
  ])("retains ordinary business wording needed to diagnose the gate: %s", (step) => {
    expect(observationValidationDiagnostic(0, step, { stepIndex: 0, variables: ["预算"] })).toMatchObject({
      stepText: step, textRedacted: false, detectedVariables: ["预算"]
    });
  });

  it("bounds the stored text and flags unresolved changes", () => {
    const diagnostic = observationValidationDiagnostic(1, "提高".repeat(400), { stepIndex: 1, variables: [], unresolvedAdjustment: true });
    // Shared truncation adds its explicit marker; payload remains bounded.
    expect(diagnostic.stepText.length).toBeLessThan(550);
    expect(diagnostic).toMatchObject({ textRedacted: true, unresolvedAdjustment: true });
  });

  it("captures rejected steps through the real repair path without copying unrelated fields", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const base = createSyntheticDiagnosisTransport(testCase);
    const diagnostics: ObservationValidationDiagnostic[] = [];
    let calls = 0;
    await expect(orchestrateDiagnosis({
      decisionInput: testCase.input, skillPlan: createDiagnosisSkillPlan(testCase.input),
      onValidationDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      transport: {
        ...base,
        async chat(request) {
          const response = await base.chat(request);
          if (!request.messages.some((message) => message.role === "system" && message.content?.includes("诊断综合器"))) return response;
          calls++;
          const value = JSON.parse(response.message.content!) as DiagnosisFinalModelOutput;
          value.experiments[0]!.steps = [calls === 1 ? "提高预算后观察成交" : "降低预算后观察成交"];
          value.coreConclusion = "unrelated-business-summary-must-not-be-logged";
          return { ...response, message: { ...response.message, content: JSON.stringify(value), reasoningContent: "hidden-reasoning-must-not-be-logged" } };
        }
      }
    })).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID" });
    expect(calls).toBe(2);
    expect(diagnostics[0]).toMatchObject({ stepText: "提高预算后观察成交", path: "experiments.0.steps.0", detectedVariables: ["预算"] });
    expect(diagnostics.at(-1)).toMatchObject({ stepText: "降低预算后观察成交", detectedVariables: ["预算"] });
    expect(JSON.stringify(diagnostics)).not.toContain("must-not-be-logged");
  });

  it("does not emit a diagnostic for a valid observation", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const diagnostics: ObservationValidationDiagnostic[] = [];
    await orchestrateDiagnosis({
      decisionInput: testCase.input, skillPlan: createDiagnosisSkillPlan(testCase.input),
      transport: createSyntheticDiagnosisTransport(testCase),
      onValidationDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });
    expect(diagnostics).toEqual([]);
  });
});
