import { z } from "zod";
import {
  buildDiagnosisEvidenceCatalog,
  createDiagnosisSkillPlan,
  getDiagnosisScenarioStrategy,
  diagnosisSkillRegistry,
  releasedDiagnosisRoutes,
  type DiagnosisSkillPlan,
  type DiagnosisSkillModel,
  type DiagnosisTokenUsage
} from "@douyin-local-life/diagnosis-skills";
import {
  completeJsonWithRepair,
  type ChatTokenUsage,
  type ChatTransport
} from "@douyin-local-life/llm";
import {
  diagnosisDomainAnalysisOutputSchema,
  diagnosisFinalModelOutputSchema,
  type DiagnosisEvidence,
  type DiagnosisFinalResult,
  type DiagnosisSkillExecutionStatus,
  type DiagnosisSkillId,
  type DiagnosisSkillInput,
  type DiagnosisSkillOutput,
  type SimilarDiagnosisCase
} from "@douyin-local-life/shared/diagnosis";
import type { CollectionRouteKey } from "@douyin-local-life/shared/collection-routes";
import type { DecisionEngineInput } from "@douyin-local-life/shared";
import type { DiagnosisCaseRetrievalHints } from "../diagnosis-cases.js";
import { buildServerDiagnosisInsights } from "./server-insights.js";
import {
  addUsage,
  assertBriefReferences,
  assertBusinessFacingLanguage,
  assertDeterministicResultConsistency,
  assertDomainReferences,
  assertDomainResultConsistency,
  assertExperimentDesign,
  assertFinalReferences,
  assertFixedSkillPlan,
  buildDeterministicDiagnosticSignals,
  buildDecisionRunDeterministicReview,
  determineMainProblemTag,
  deterministicRepairContext,
  DiagnosisOrchestrationError,
  diagnosisOrchestrationVersion,
  diagnosisPromptVersion,
  domainOutputInstruction,
  emptyUsage,
  finalOutputInstruction,
  isUsefulDiagnosisHypothesis,
  legacyDiagnosisOrchestrationLimits,
  normalizeDiagnosisModelOutput,
  neutralizeUnsupportedComparisonLanguage,
  normalizeError,
  projectDomainResult,
  projectUsefulHypotheses,
  summarizeSkillInput,
  synthesisDecisionBriefSchema,
  unsupportedComparisonRepairInstruction,
  withCompatibilityStopConditions
} from "./orchestrator-validation.js";
import type { ObservationValidationDiagnostic } from "./validation-diagnostic.js";

export {
  buildDecisionRunDeterministicReview,
  buildDeterministicDiagnosticSignals,
  determineMainProblemTag,
  DiagnosisOrchestrationError,
  diagnosisOrchestrationVersion,
  diagnosisPromptVersion,
  isUsefulDiagnosisHypothesis,
  legacyDiagnosisOrchestrationLimits,
  normalizeDiagnosisModelOutput
};

export type SkillExecutionEvent = {
  skillId: DiagnosisSkillId;
  skillVersion: string;
  sequence: number;
  status: DiagnosisSkillExecutionStatus;
  input?: unknown;
  output?: DiagnosisSkillOutput;
  usage?: DiagnosisTokenUsage;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
};

export async function orchestrateDiagnosis(input: {
  decisionInput: DecisionEngineInput;
  skillPlan: DiagnosisSkillPlan;
  /** Legacy compatibility only. Cases are not part of the phase-one formal path. */
  similarCases?: SimilarDiagnosisCase[];
  /** Legacy compatibility only. This callback is intentionally not invoked in phase one. */
  retrieveSimilarCases?: (hints: DiagnosisCaseRetrievalHints) => Promise<SimilarDiagnosisCase[]>;
  transport: ChatTransport;
  signal?: AbortSignal;
  onSkillEvent?: (event: SkillExecutionEvent) => Promise<void>;
  onValidationDiagnostic?: (diagnostic: ObservationValidationDiagnostic) => void;
  onStage?: (stage: "SYNTHESIZING_JUDGMENT" | "SYNTHESIZING_ACTION_PLAN") => Promise<void>;
}): Promise<{
  result: DiagnosisFinalResult;
  evidenceCatalog: DiagnosisEvidence[];
  skillOutputs: DiagnosisSkillOutput[];
  usage: ChatTokenUsage;
}> {
  const availableRoutes = releasedDiagnosisRoutes(input.decisionInput);
  const expectedPlan = createDiagnosisSkillPlan(input.decisionInput);
  const scenarioStrategy = getDiagnosisScenarioStrategy(input.decisionInput.diagnosisContext?.scenario);
  assertFixedSkillPlan(input.skillPlan, expectedPlan);
  const evidenceCatalog = buildDiagnosisEvidenceCatalog(input.decisionInput);
  const deterministicSignals = buildDeterministicDiagnosticSignals(evidenceCatalog, input.decisionInput);
  const serverBusinessInsights = buildServerDiagnosisInsights(input.decisionInput, evidenceCatalog);
  const validEvidenceIds = new Set(evidenceCatalog.map((item) => item.id));
  const allowedEvidenceIds = [...validEvidenceIds];
  const skillInput: DiagnosisSkillInput = {
    businessMode: "MANAGED_LIVE_GROWTH",
    decisionInput: input.decisionInput,
    evidenceCatalog,
    availableRoutes,
    similarCases: []
  };
  const usage = emptyUsage();
  const outputs = new Map<DiagnosisSkillId, DiagnosisSkillOutput>();
  let sequence = 0;

  const skillModel: DiagnosisSkillModel = {
    async completeSkill(request) {
      const skillValidEvidenceIds = new Set(request.evidence.map((item) => item.id));
      const skillAllowedEvidenceIds = [...skillValidEvidenceIds];
      const parseDomainOutput = (value: unknown) => {
        const parsed = diagnosisDomainAnalysisOutputSchema.parse(normalizeDiagnosisModelOutput(value));
        assertDomainReferences(parsed, skillValidEvidenceIds);
        const scoped = projectDomainResult(parsed, request.deterministicContext.dimension);
        assertDomainResultConsistency(scoped, request.deterministicContext.dimension);
        assertBusinessFacingLanguage(scoped);
        return scoped;
      };
      const completion = await completeJsonWithRepair({
        transport: input.transport,
        messages: [
          { role: "system", content: `${request.systemPrompt}\n${domainOutputInstruction}` },
          {
            role: "user",
            content: JSON.stringify({
              allowedEvidenceIds: skillAllowedEvidenceIds,
              deterministicContext: request.deterministicContext,
              evidence: request.evidence
            })
          }
        ],
        parse: parseDomainOutput,
        repairInstruction: `上次输出不符合领域 Skill 契约。evidenceIds 必须从以下唯一合法列表逐字复制，不得改写、缩写或猜测：${JSON.stringify(skillAllowedEvidenceIds)}。领域 Skill 只能输出事实、假设与缺口，禁止输出 experiments、candidateActions、stopConditions 或 abortCriteria。不得回显输入或增加包装层。${unsupportedComparisonRepairInstruction}${domainOutputInstruction}`,
        repairAfterValidation: (value, issue) => neutralizeUnsupportedComparisonLanguage(value, issue, parseDomainOutput),
        maxTokens: 2_048,
        thinking: "disabled",
        signal: input.signal
      });
      return { output: completion.value, usage: completion.usage };
    }
  };

  const executeSkill = async (skillId: DiagnosisSkillId) => {
    const cached = outputs.get(skillId);
    if (cached) return cached;
    const skill = diagnosisSkillRegistry.get(skillId);
    if (!skill) throw new DiagnosisOrchestrationError("DIAGNOSIS_TOOL_UNKNOWN", `未知诊断 Skill：${skillId}`);
    sequence += 1;
    const currentSequence = sequence;
    const startedAt = Date.now();
    await input.onSkillEvent?.({
      skillId,
      skillVersion: skill.version,
      sequence: currentSequence,
      status: "RUNNING",
      input: summarizeSkillInput(skillInput, skill.applicableRoutes)
    });
    try {
      const execution = await skill.execute(skillInput, skillModel);
      outputs.set(skillId, execution.output);
      addUsage(usage, execution.usage);
      await input.onSkillEvent?.({
        skillId,
        skillVersion: skill.version,
        sequence: currentSequence,
        status: "SUCCEEDED",
        output: execution.output,
        usage: execution.usage,
        durationMs: Date.now() - startedAt
      });
      if (skillId === "audit_data_readiness" && execution.output.refused) {
        throw new DiagnosisOrchestrationError("DECISION_NOT_READY", execution.output.refusalReason || "数据就绪审计未通过");
      }
      return execution.output;
    } catch (error) {
      const normalized = normalizeError(error);
      await input.onSkillEvent?.({
        skillId,
        skillVersion: skill.version,
        sequence: currentSequence,
        status: "FAILED",
        durationMs: Date.now() - startedAt,
        errorCode: normalized.code,
        errorMessage: normalized.message
      });
      throw error;
    }
  };

  await executeSkill(input.skillPlan.auditSkillId);
  if (!outputs.has("audit_data_readiness")) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_AUDIT_MISSING", "编排器没有首先完成数据就绪审计");
  }

  // The server-generated plan is the sole source of domain selection and order.
  // Execute serially so persisted sequences are stable and every required Skill
  // is invoked exactly once, including explicit evidence refusals.
  for (const skillId of input.skillPlan.domainSkillIds) {
    await executeSkill(skillId);
  }

  const skillOutputs = [...outputs.values()];
  const serverMainProblemTag = determineMainProblemTag(deterministicSignals);
  await input.onStage?.("SYNTHESIZING_JUDGMENT");
  const decisionBrief = await completeJsonWithRepair({
    transport: input.transport,
    messages: [
      {
        role: "system",
        content: [
          "你是代直播增长核心问题裁决器。使用 thinking 比较直接证据、因果上游和缺失数据，但只输出一个很短的可见 JSON 裁决摘要。",
          "输出顶层必须且只能包含 mainProblemTag、rationale、evidenceIds；evidenceIds 必须来自输入合法列表。",
          "mainProblemTag 已由服务端确定性规则给出，必须逐字返回 serverMainProblemTag，不得重新选择或改判。",
          "服务端顺序为：missingCoreMetrics 非空选 DATA_READINESS；否则 traffic.weak 选 TRAFFIC；否则 product.weak 选 PRODUCT；否则 liveRoom.weak 选 LIVE_ROOM；否则 delivery.weak 选 DELIVERY_ROI；否则 activityCompliance.risk 选 ACTIVITY_COMPLIANCE；其余才选 HEALTHY。",
          "HEALTHY 在第一阶段只表示‘当前证据未发现断流、零成交、低于明确目标或合规异常’，不代表达到行业优秀水平；comparisonGaps 必须在最终综合中保留为判断边界。",
          "不得用 MULTI_FACTOR 回避上述顺序；只有上述信号无法覆盖且存在两个互不解释的直接主因时才可使用 MULTI_FACTOR。",
          "不得输出 analysis、reasoning 或包装层。",
          scenarioStrategy.synthesisInstruction
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          evidenceIds: evidenceCatalog.map((item) => item.id),
          serverMainProblemTag,
          deterministicSignals,
          serverBusinessInsights,
          diagnosisContext: input.decisionInput.diagnosisContext || null,
          historyContext: input.decisionInput.historyContext || null,
          skillFindings: skillOutputs.map((output) => ({
            skillId: output.skillId,
            facts: output.facts,
            hypotheses: output.hypotheses,
            missingEvidence: output.missingEvidence,
            confidence: output.confidence
          }))
        })
      }
    ],
    parse: (value) => {
      const parsed = synthesisDecisionBriefSchema.parse(normalizeDiagnosisModelOutput(value));
      z.literal(serverMainProblemTag).parse(parsed.mainProblemTag);
      assertBriefReferences(parsed.evidenceIds, validEvidenceIds);
      return parsed;
    },
    repairInstruction: `上次核心问题裁决摘要不合法。mainProblemTag 必须逐字返回服务端固定值 ${serverMainProblemTag}。evidenceIds 必须从以下唯一合法列表逐字复制：${JSON.stringify(allowedEvidenceIds)}。只返回 {mainProblemTag,rationale,evidenceIds}，不得增加包装层。`,
    maxTokens: 2_048,
    thinking: "enabled",
    signal: input.signal
  });
  addUsage(usage, decisionBrief.usage);
  assertBriefReferences(decisionBrief.value.evidenceIds, validEvidenceIds);
  const parseFinalOutput = (value: unknown) => {
    const modelOutput = diagnosisFinalModelOutputSchema.parse(normalizeDiagnosisModelOutput(value));
    const parsed = withCompatibilityStopConditions(modelOutput);
    z.literal(decisionBrief.value.mainProblemTag).parse(parsed.mainProblemTag);
    assertFinalReferences(parsed, validEvidenceIds);
    try {
      assertExperimentDesign(parsed);
    } catch (error) {
      if (error instanceof DiagnosisOrchestrationError && error.validationDiagnostic) {
        input.onValidationDiagnostic?.(error.validationDiagnostic);
      }
      throw error;
    }
    assertBusinessFacingLanguage(parsed);
    assertDeterministicResultConsistency(parsed, deterministicSignals);
    return projectUsefulHypotheses(parsed, new Map(evidenceCatalog.map((item) => [item.id, item])));
  };
  await input.onStage?.("SYNTHESIZING_ACTION_PLAN");
  const synthesis = await completeJsonWithRepair({
    transport: input.transport,
    messages: [
      {
        role: "system",
        content: [
          "你是代直播增长诊断综合器。只综合 Skill 结构化结果与服务端冻结的诊断上下文，不发明新事实。",
          "你的读者是本地生活商家和代运营人员。最终结果应像一份简短经营判断，而不是模型分析记录、审计日志或指标字典。",
          "每个事实、假设、实验和候选动作必须引用 evidence id；同时保留支持、冲突与缺失证据。",
          "候选动作只供服务端规则裁决和人工审批，不得声称已操作平台。",
          "输出 schemaVersion 固定为 ai-diagnosis-result-v1，只返回 JSON 对象，不输出隐藏推理。",
          finalOutputInstruction,
          scenarioStrategy.synthesisInstruction
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          evidenceIds: evidenceCatalog.map((item) => item.id),
          deterministicSignals,
          diagnosisContext: input.decisionInput.diagnosisContext || null,
          historyContext: input.decisionInput.historyContext || null,
          decisionBrief: decisionBrief.value,
          serverBusinessInsights,
          // The final synthesizer needs the values, route, scope and period
          // behind each id. Passing ids alone makes it impossible to check
          // whether an explanation compares like with like.
          evidenceCatalog,
          skillOutputs
        })
      }
    ],
    parse: parseFinalOutput,
    repairInstruction: `上次综合输出未通过结构、证据或确定性事实契约。mainProblemTag 必须是 ${decisionBrief.value.mainProblemTag}。${deterministicRepairContext(deterministicSignals)}所有 evidence id 必须从以下唯一合法列表逐字复制：${JSON.stringify(allowedEvidenceIds)}。baselineMetrics 与 verifyMetrics 只能填非空指标名称字符串数组，绝不能填对象；没有单独基线名称时，逐字复制 verifyMetrics。每个实验只输出 abortCriteria，禁止输出 stopConditions；abortCriteria 不得为空，也不得混入完成条件。不得回显输入或增加包装层，不要新增证据。${unsupportedComparisonRepairInstruction}${finalOutputInstruction}`,
    repairAfterValidation: (value, issue) => neutralizeUnsupportedComparisonLanguage(value, issue, parseFinalOutput),
    maxTokens: 4_096,
    thinking: "disabled",
    signal: input.signal
  });
  addUsage(usage, synthesis.usage);
  assertFinalReferences(synthesis.value, validEvidenceIds);
  return { result: synthesis.value, evidenceCatalog, skillOutputs, usage };
}
