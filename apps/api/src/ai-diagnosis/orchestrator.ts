import { z } from "zod";
import {
  buildDiagnosisEvidenceCatalog,
  diagnosisSkillRegistry,
  diagnosisSkillSetVersion,
  requiredDomainSkills,
  type DiagnosisSkillModel,
  type DiagnosisTokenUsage
} from "@douyin-local-life/diagnosis-skills";
import {
  completeJsonWithRepair,
  runToolLoop,
  type ChatMessage,
  type ChatTokenUsage,
  type ChatTransport,
  type ToolLoopTool
} from "@douyin-local-life/llm";
import {
  diagnosisActionTypes,
  diagnosisFinalResultSchema,
  diagnosisSkillOutputSchema,
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

export const diagnosisPromptVersion = "managed-live-growth-prompt-v13";
export const diagnosisOrchestrationVersion = "deepseek-tool-orchestration-v19";
const domainSkillOutputSchema = diagnosisSkillOutputSchema.omit({ skillId: true, skillVersion: true });
const domainOutputInstruction = [
  "分析输入数据，不得复制或回显输入对象。",
  "返回 JSON 顶层必须且只能包含：applicable、refused、refusalReason、facts、hypotheses、missingEvidence、experiments、candidateActions、confidence。",
  "refusalReason 必须是字符串或 null；所有集合字段都必须是数组，没有内容时返回空数组。",
  "facts 每项严格为 {statement,evidenceIds}；statement 必须是非空字符串，evidenceIds 至少包含一个输入中的真实 id。",
  "hypotheses 每项严格为 {id,dimension,title,conclusion,supportingEvidenceIds,conflictingEvidenceIds,missingEvidence,confidence}。",
  "hypotheses 中 supportingEvidenceIds、conflictingEvidenceIds、missingEvidence 必须始终是数组，即使只有一项或没有内容。",
  "experiments 每项严格为 {id,title,hypothesisId,steps,verifyMetrics,stopConditions,evidenceIds}，steps、verifyMetrics、stopConditions、evidenceIds 都至少一项。",
  "candidateActions 每项严格为 {actionType,title,reason,expectedImpact,riskLevel,confidence,evidenceIds,experimentId}，evidenceIds 至少包含一个真实 id。",
  "所有 confidence 都必须是 0 到 1 的 JSON number，禁止使用字符串或百分号。",
  "保持聚焦：facts 最多 5 条、hypotheses 最多 3 条、experiments 最多 3 条、candidateActions 最多 3 条。",
  "任何事实、实验或动作若没有合法 evidence id 就不要生成该项，绝不能使用空 evidenceIds。",
  "hypotheses.dimension 只能是 DATA、TRAFFIC、LIVE_ROOM、PRODUCT、DELIVERY、ACTIVITY_COMPLIANCE。",
  `candidateActions.actionType 只能是：${diagnosisActionTypes.join("、")}。`,
  "不得返回 outputContract、deterministicContext、evidence、analysis、reasoning 或 result 包装层。只返回最终 JSON 对象。"
].join("\n");
const finalOutputInstruction = [
  "返回 JSON 顶层必须且只能包含：schemaVersion、coreConclusion、mainProblemTag、confidence、factSnapshot、hypotheses、missingEvidence、experiments、stopConditions、candidateActions。",
  "schemaVersion 固定为 ai-diagnosis-result-v1；所有集合字段都必须是数组。",
  "mainProblemTag 必须与输入 decisionBrief.mainProblemTag 完全一致；综合器只能展开依据，不得重新改判。",
  "factSnapshot 每项严格为 {statement,evidenceIds}，evidenceIds 至少一个；hypotheses 每项严格为 {id,dimension,title,conclusion,supportingEvidenceIds,conflictingEvidenceIds,missingEvidence,confidence}。",
  "hypotheses 中 supportingEvidenceIds、conflictingEvidenceIds、missingEvidence 必须始终是数组。",
  "experiments 每项严格为 {id,title,hypothesisId,steps,verifyMetrics,stopConditions,evidenceIds}；candidateActions 每项严格为 {actionType,title,reason,expectedImpact,riskLevel,confidence,evidenceIds,experimentId}。",
  "所有 confidence 都必须是 0 到 1 的 JSON number，禁止使用字符串或百分号。",
  "保持聚焦：factSnapshot 最多 8 条、hypotheses 最多 6 条、experiments 最多 6 条、candidateActions 最多 6 条、missingEvidence 最多 10 条。",
  "不得为了产生问题而强行诊断。deterministicSignals 全部健康且无风险时，mainProblemTag 必须优先考虑 HEALTHY。",
  "核心标签按直接证据和因果上游确定：missingCoreMetrics 非空时必须选 DATA_READINESS；否则 traffic.weak 时优先 TRAFFIC；product.weak 时必须优先 PRODUCT，即使同时出现其下游 liveRoom.weak；只有商品不弱而成交承接弱时选 LIVE_ROOM；高消耗且 ROI 低于目标、且更上游信号不弱时选 DELIVERY_ROI；明确合规风险且数据完整时选 ACTIVITY_COMPLIANCE。",
  "MULTI_FACTOR 仅用于两个互不解释、证据同等直接的独立主因；不得用它回避上述优先级，也不得把上游问题及其下游结果重复算成两个主因。",
  "事实、实验和候选动作没有合法 evidence id 时不得生成；stopConditions 至少一项。",
  "mainProblemTag 只能是 HEALTHY、DATA_READINESS、TRAFFIC、LIVE_ROOM、PRODUCT、DELIVERY_ROI、ACTIVITY_COMPLIANCE、MULTI_FACTOR。",
  `candidateActions.actionType 只能是：${diagnosisActionTypes.join("、")}。`,
  "不得返回 outputContract、evidenceIds、skillOutputs、analysis、reasoning 或 result 包装层。只返回最终 JSON 对象。"
].join("\n");
const synthesisDecisionBriefSchema = z.object({
  mainProblemTag: diagnosisFinalResultSchema.shape.mainProblemTag,
  rationale: z.string().min(1).max(800),
  evidenceIds: z.array(z.string().min(1)).min(1).max(12)
});

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
  similarCases: SimilarDiagnosisCase[];
  retrieveSimilarCases?: (hints: DiagnosisCaseRetrievalHints) => Promise<SimilarDiagnosisCase[]>;
  transport: ChatTransport;
  signal?: AbortSignal;
  onSkillEvent?: (event: SkillExecutionEvent) => Promise<void>;
}): Promise<{
  result: DiagnosisFinalResult;
  evidenceCatalog: DiagnosisEvidence[];
  skillOutputs: DiagnosisSkillOutput[];
  usage: ChatTokenUsage;
}> {
  const availableRoutes = routeKeys(input.decisionInput);
  const evidenceCatalog = buildDiagnosisEvidenceCatalog(input.decisionInput, input.similarCases);
  const skillInput: DiagnosisSkillInput = {
    businessMode: "MANAGED_LIVE_GROWTH",
    decisionInput: input.decisionInput,
    evidenceCatalog,
    availableRoutes,
    similarCases: input.similarCases
  };
  const usage = emptyUsage();
  const outputs = new Map<DiagnosisSkillId, DiagnosisSkillOutput>();
  let sequence = 0;
  let orchestrationRounds = 0;
  // The deterministic readiness audit is the first Skill invocation and counts
  // toward the same global tool-call budget even though no model round is needed.
  let toolCalls = 1;

  const skillModel: DiagnosisSkillModel = {
    async completeSkill(request) {
      const completion = await completeJsonWithRepair({
        transport: input.transport,
        messages: [
          { role: "system", content: `${request.systemPrompt}\n${domainOutputInstruction}` },
          {
            role: "user",
            content: JSON.stringify({
              deterministicContext: request.deterministicContext,
              evidence: request.evidence
            })
          }
        ],
        parse: (value) => domainSkillOutputSchema.parse(normalizeDiagnosisModelOutput(value)),
        repairInstruction: `上次输出不符合领域 Skill 契约。不得回显输入或增加包装层；保留合法 evidence id。${domainOutputInstruction}`,
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

  await executeSkill("audit_data_readiness");
  if (!outputs.has("audit_data_readiness")) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_AUDIT_MISSING", "编排器没有首先完成数据就绪审计");
  }

  const domainIds = [...diagnosisSkillRegistry.keys()].filter((id) => id !== "audit_data_readiness" && id !== "retrieve_similar_cases");
  const plannerLoop = await runToolLoop({
    transport: input.transport,
    messages: orchestrationMessages(
      "数据审计已通过。根据路线和证据选择必要的领域 Skills，可在一轮并行调用多个；不要重复调用。按最可能主问题优先排列工具调用。",
      evidenceCatalog
    ),
    tools: domainIds.map((id) => toolFor(id, executeSkill)),
    maxRounds: 3,
    maxToolCalls: 12 - toolCalls,
    concurrency: 3,
    maxTokens: 1_024,
    thinking: "disabled",
    stopAfterToolBatch: true,
    signal: input.signal
  });
  addUsage(usage, plannerLoop.usage);
  orchestrationRounds += plannerLoop.rounds;
  toolCalls += plannerLoop.toolCalls;

  const required = requiredDomainSkills(availableRoutes, false);
  const missing = required.filter((id) => !outputs.has(id));
  if (missing.length) {
    const repair = await input.transport.chat({
      messages: orchestrationMessages(`关键领域 Skill 遗漏：${missing.join("、")}。这是唯一一次编排修复，请在本轮调用全部遗漏 Skill。`, evidenceCatalog),
      tools: missing.map((id) => toolFor(id, executeSkill).definition),
      // DeepSeek thinking mode rejects required/named tool_choice; local checks below
      // fail the run unless every missing skill is actually called in this repair.
      tool_choice: "auto",
      thinking: "disabled",
      max_tokens: 2_048,
      signal: input.signal
    });
    addUsage(usage, repair.usage);
    orchestrationRounds += 1;
    const repairCalls = repair.message.tool_calls || [];
    assertOrchestrationLimits(orchestrationRounds, toolCalls + repairCalls.length);
    toolCalls += repairCalls.length;
    await executeRepairCalls(repairCalls, missing, executeSkill);
    const stillMissing = required.filter((id) => !outputs.has(id));
    if (stillMissing.length) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_REQUIRED_SKILL_MISSING", `编排修复后仍缺少：${stillMissing.join("、")}`);
    }
  }

  if (input.retrieveSimilarCases) {
    const similarCases = await input.retrieveSimilarCases(retrievalHints([...outputs.values()]));
    if (similarCases.length) {
      skillInput.similarCases = similarCases;
      const caseEvidence = buildDiagnosisEvidenceCatalog(input.decisionInput, similarCases).filter((item) => item.kind === "CASE");
      evidenceCatalog.push(...caseEvidence);
      const remainingRounds = 8 - orchestrationRounds;
      const remainingToolCalls = 12 - toolCalls;
      if (remainingRounds < 2 || remainingToolCalls < 1) {
        throw new DiagnosisOrchestrationError("DIAGNOSIS_TOOL_LIMIT", "案例检索会超过诊断编排上限");
      }
      const retrievalLoop = await runToolLoop({
        transport: input.transport,
        messages: orchestrationMessages("当前工作区存在符合条件的案例。调用 retrieve_similar_cases 后回复“案例已检索”。", evidenceCatalog),
        tools: [toolFor("retrieve_similar_cases", executeSkill)],
        initialRequiredToolName: "retrieve_similar_cases",
        maxRounds: remainingRounds,
        maxToolCalls: remainingToolCalls,
        concurrency: 1,
        maxTokens: 2_048,
        thinking: "disabled",
        signal: input.signal
      });
      addUsage(usage, retrievalLoop.usage);
      orchestrationRounds += retrievalLoop.rounds;
      toolCalls += retrievalLoop.toolCalls;
    }
  }
  assertOrchestrationLimits(orchestrationRounds, toolCalls);

  const skillOutputs = [...outputs.values()];
  const deterministicSignals = buildDeterministicDiagnosticSignals(evidenceCatalog);
  const decisionBrief = await completeJsonWithRepair({
    transport: input.transport,
    messages: [
      {
        role: "system",
        content: [
          "你是代直播增长核心问题裁决器。使用 thinking 比较直接证据、因果上游和缺失数据，但只输出一个很短的可见 JSON 裁决摘要。",
          "输出顶层必须且只能包含 mainProblemTag、rationale、evidenceIds；evidenceIds 必须来自输入合法列表。",
          "必须按 deterministicSignals 裁决：missingCoreMetrics 非空选 DATA_READINESS；否则 healthyBaselineSatisfied=true 选 HEALTHY；否则 traffic.weak=true 选 TRAFFIC；否则 product.weak=true 选 PRODUCT；否则 liveRoom.weak=true 选 LIVE_ROOM；否则 delivery.weak=true 选 DELIVERY_ROI；否则 activityCompliance.risk=true 选 ACTIVITY_COMPLIANCE。",
          "不得用 MULTI_FACTOR 回避上述顺序；只有上述信号无法覆盖且存在两个互不解释的直接主因时才可使用 MULTI_FACTOR。",
          "不得输出 analysis、reasoning 或包装层。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          evidenceIds: evidenceCatalog.map((item) => item.id),
          deterministicSignals,
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
    parse: (value) => synthesisDecisionBriefSchema.parse(normalizeDiagnosisModelOutput(value)),
    repairInstruction: "上次核心问题裁决摘要不合法。只返回 {mainProblemTag,rationale,evidenceIds}，不得增加包装层。",
    maxTokens: 2_048,
    thinking: "enabled",
    signal: input.signal
  });
  addUsage(usage, decisionBrief.usage);
  assertBriefReferences(decisionBrief.value.evidenceIds, new Set(evidenceCatalog.map((item) => item.id)));
  const synthesis = await completeJsonWithRepair({
    transport: input.transport,
    messages: [
      {
        role: "system",
        content: [
          "你是代直播增长诊断综合器。只综合 Skill 的结构化结果，不发明新事实。",
          "每个事实、假设、实验和候选动作必须引用 evidence id；同时保留支持、冲突与缺失证据。",
          "候选动作只供服务端规则裁决和人工审批，不得声称已操作平台。",
          "输出 schemaVersion 固定为 ai-diagnosis-result-v1，只返回 JSON 对象，不输出隐藏推理。",
          finalOutputInstruction
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          evidenceIds: evidenceCatalog.map((item) => item.id),
          deterministicSignals,
          decisionBrief: decisionBrief.value,
          skillOutputs
        })
      }
    ],
    parse: (value) => {
      const parsed = diagnosisFinalResultSchema.parse(normalizeDiagnosisModelOutput(value));
      z.literal(decisionBrief.value.mainProblemTag).parse(parsed.mainProblemTag);
      return parsed;
    },
    repairInstruction: `上次综合输出未通过结构或证据契约。mainProblemTag 必须是 ${decisionBrief.value.mainProblemTag}；不得回显输入或增加包装层，不要新增证据。${finalOutputInstruction}`,
    maxTokens: 4_096,
    thinking: "disabled",
    signal: input.signal
  });
  addUsage(usage, synthesis.usage);
  assertFinalReferences(synthesis.value, new Set(evidenceCatalog.map((item) => item.id)));
  return { result: synthesis.value, evidenceCatalog, skillOutputs, usage };
}

export class DiagnosisOrchestrationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function toolFor(skillId: DiagnosisSkillId, execute: (id: DiagnosisSkillId) => Promise<DiagnosisSkillOutput>): ToolLoopTool {
  const skill = diagnosisSkillRegistry.get(skillId)!;
  return {
    definition: {
      type: "function",
      function: {
        name: skill.id,
        description: `${skill.title}；版本 ${skill.version}；适用路线：${skill.applicableRoutes.join("、") || "全部"}`,
        parameters: { type: "object", properties: {}, additionalProperties: false }
      }
    },
    async execute(argumentsValue) {
      z.object({}).parse(argumentsValue);
      return execute(skillId);
    }
  };
}

function orchestrationMessages(instruction: string, evidence: DiagnosisEvidence[]): ChatMessage[] {
  return [
    { role: "system", content: "你负责选择诊断 Skills，不直接生成经营结论。严格遵守工具顺序、调用上限和证据边界。" },
    {
      role: "user",
      content: JSON.stringify({
        instruction,
        availableEvidence: evidence.map((item) => ({
          id: item.id,
          kind: item.kind,
          label: item.label,
          value: typeof item.value === "string" ? item.value.slice(0, 300) : item.value,
          routeKey: item.routeKey || null,
          metricKey: item.metricKey || null
        }))
      })
    }
  ];
}

function routeKeys(input: DecisionEngineInput): CollectionRouteKey[] {
  return [...new Set([
    ...(input.collectionQuality?.routes.filter((route) => route.state === "FRESH" || route.state === "AGING").map((route) => route.routeKey) || []),
    ...input.tables.flatMap((table) => table.routeKey ? [table.routeKey] : [])
  ])];
}

function summarizeSkillInput(input: DiagnosisSkillInput, routes: readonly CollectionRouteKey[]) {
  const selectedEvidenceIds = input.evidenceCatalog
    .filter((item) => !routes.length || (item.routeKey && routes.includes(item.routeKey)) || item.kind === "POLICY")
    .map((item) => item.id);
  return {
    businessMode: input.businessMode,
    routes,
    selectedEvidenceIds,
    similarCaseIds: input.similarCases.map((item) => item.id)
  };
}

function assertFinalReferences(result: DiagnosisFinalResult, validIds: Set<string>) {
  const references = [
    ...result.factSnapshot.flatMap((item) => item.evidenceIds),
    ...result.hypotheses.flatMap((item) => [...item.supportingEvidenceIds, ...item.conflictingEvidenceIds]),
    ...result.experiments.flatMap((item) => item.evidenceIds),
    ...result.candidateActions.flatMap((item) => item.evidenceIds)
  ];
  const invalid = references.filter((id) => !validIds.has(id));
  if (invalid.length) throw new DiagnosisOrchestrationError("DIAGNOSIS_EVIDENCE_INVALID", `综合诊断引用无效证据：${[...new Set(invalid)].join("、")}`);
}

function assertBriefReferences(references: string[], validIds: Set<string>) {
  const invalid = references.filter((id) => !validIds.has(id));
  if (invalid.length) throw new DiagnosisOrchestrationError("DIAGNOSIS_EVIDENCE_INVALID", `核心裁决引用无效证据：${[...new Set(invalid)].join("、")}`);
}

function normalizeError(error: unknown) {
  if (error instanceof DiagnosisOrchestrationError) return error;
  if (error instanceof Error) {
    const [code] = error.message.split(":", 1);
    return { code: code?.startsWith("DIAGNOSIS_") ? code : "DIAGNOSIS_SKILL_FAILED", message: error.message };
  }
  return { code: "DIAGNOSIS_SKILL_FAILED", message: "诊断 Skill 执行失败" };
}

function emptyUsage(): ChatTokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(target: ChatTokenUsage, value: DiagnosisTokenUsage | ChatTokenUsage) {
  target.inputTokens += value.inputTokens;
  target.outputTokens += value.outputTokens;
  target.totalTokens += value.totalTokens;
}

function retrievalHints(outputs: DiagnosisSkillOutput[]): DiagnosisCaseRetrievalHints {
  const dimensionTags: Record<DiagnosisSkillOutput["hypotheses"][number]["dimension"], string> = {
    DATA: "DATA_READINESS",
    TRAFFIC: "TRAFFIC",
    LIVE_ROOM: "LIVE_ROOM",
    PRODUCT: "PRODUCT",
    DELIVERY: "DELIVERY_ROI",
    ACTIVITY_COMPLIANCE: "ACTIVITY_COMPLIANCE"
  };
  return {
    mainProblemTags: [...new Set(outputs.flatMap((output) => output.hypotheses.map((hypothesis) => dimensionTags[hypothesis.dimension])))],
    actionTypes: [...new Set(outputs.flatMap((output) => output.candidateActions.map((candidate) => candidate.actionType)))]
  };
}

function assertOrchestrationLimits(rounds: number, toolCalls: number) {
  if (rounds > 8) throw new DiagnosisOrchestrationError("DIAGNOSIS_ROUND_LIMIT", "诊断编排轮数超过上限");
  if (toolCalls > 12) throw new DiagnosisOrchestrationError("DIAGNOSIS_TOOL_LIMIT", "诊断工具调用超过上限");
}

const diagnosisArrayFields = new Set([
  "facts",
  "factSnapshot",
  "hypotheses",
  "missingEvidence",
  "experiments",
  "candidateActions",
  "evidenceIds",
  "supportingEvidenceIds",
  "conflictingEvidenceIds",
  "steps",
  "verifyMetrics",
  "stopConditions"
]);

export function normalizeDiagnosisModelOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDiagnosisModelOutput);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record).map(([key, child]) => {
    if (key === "refused" && child === null) {
      if (typeof record.refusalReason === "string" && record.refusalReason.trim()) return [key, true];
      const hasDiagnosisContent = [record.facts, record.hypotheses].some((items) => Array.isArray(items) && items.length > 0);
      if (hasDiagnosisContent) return [key, false];
    }
    if (key === "confidence" && typeof child === "string") {
      const parsed = Number(child);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 && child.trim() !== "") return [key, parsed];
    }
    if (diagnosisArrayFields.has(key) && typeof child === "string" && child.trim()) {
      return [key, [child]];
    }
    return [key, normalizeDiagnosisModelOutput(child)];
  }));
}

export function buildDeterministicDiagnosticSignals(evidence: DiagnosisEvidence[]) {
  const metric = (key: string) => {
    const value = evidence.find((item) => item.kind === "METRIC" && item.metricKey === key)?.value;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const impressions = metric("impressions");
  const ctr = metric("ctr");
  const liveViewers = metric("live_viewers");
  const orders = metric("orders");
  const gpm = metric("gpm");
  const spend = metric("spend");
  const payRoi = metric("pay_roi");
  const targetRoi = metric("target_roi");
  const viewerOrderRate = liveViewers !== null && liveViewers > 0 && orders !== null ? orders / liveViewers : null;
  const product = productRowSignals(evidence);
  const missingCoreMetrics = [
    ["impressions", impressions], ["ctr", ctr], ["live_viewers", liveViewers], ["orders", orders],
    ["gpm", gpm], ["spend", spend], ["pay_roi", payRoi], ["target_roi", targetRoi]
  ].flatMap(([key, value]) => value === null ? [String(key)] : []);
  const complianceRisk = ["wrong_price_promise_risk", "fulfillment_exception_rate", "refund_rate"]
    .some((key) => (metric(key) || 0) > 0);
  const trafficWeak = (impressions !== null && impressions < 30_000) || (ctr !== null && ctr < 0.01);
  const liveRoomWeak = (viewerOrderRate !== null && viewerOrderRate < 0.005) || (gpm !== null && gpm < 150);
  const productWeak = (product.clickRate !== null && product.clickRate < 0.01)
    || (product.orderRate !== null && product.orderRate < 0.04);
  const deliveryRoiWeak = spend !== null && spend >= 5_000 && payRoi !== null && targetRoi !== null && payRoi < targetRoi;
  return {
    missingCoreMetrics,
    traffic: { weak: trafficWeak, impressions, ctr },
    liveRoom: { weak: liveRoomWeak, viewerOrderRate, gpm },
    product: { weak: productWeak, clickRate: product.clickRate, orderRate: product.orderRate, evidenceId: product.evidenceId },
    delivery: { weak: deliveryRoiWeak, spend, payRoi, targetRoi },
    activityCompliance: { risk: complianceRisk },
    healthyBaselineSatisfied: missingCoreMetrics.length === 0
      && !trafficWeak && !liveRoomWeak && !productWeak && !deliveryRoiWeak && !complianceRisk
  };
}

function productRowSignals(evidence: DiagnosisEvidence[]) {
  for (const item of evidence) {
    if (item.kind !== "TABLE_ROW" || item.routeKey !== "LIVE_PRODUCT_TAB" || typeof item.value !== "string") continue;
    try {
      const row: unknown = JSON.parse(item.value);
      if (!Array.isArray(row) || row.length < 4) continue;
      const impressions = numeric(row[1]);
      const clicks = numeric(row[2]);
      const orders = numeric(row[3]);
      if (impressions === null || clicks === null || orders === null) continue;
      return {
        clickRate: impressions > 0 ? clicks / impressions : null,
        orderRate: clicks > 0 ? orders / clicks : null,
        evidenceId: item.id
      };
    } catch {
      // Non-JSON table projections are ignored; no signal is invented.
    }
  }
  return { clickRate: null, orderRate: null, evidenceId: null };
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function executeRepairCalls(
  calls: Array<{ function: { name: string; arguments: string } }>,
  allowed: DiagnosisSkillId[],
  execute: (skillId: DiagnosisSkillId) => Promise<DiagnosisSkillOutput>
) {
  for (let index = 0; index < calls.length; index += 3) {
    await Promise.all(calls.slice(index, index + 3).map(async (call) => {
      if (!allowed.includes(call.function.name as DiagnosisSkillId)) return;
      z.object({}).parse(JSON.parse(call.function.arguments || "{}"));
      await execute(call.function.name as DiagnosisSkillId);
    }));
  }
}
