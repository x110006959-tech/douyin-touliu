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
  LlmTransportError,
  type ChatTokenUsage,
  type ChatTransport
} from "@douyin-local-life/llm";
import {
  diagnosisActionTypes,
  diagnosisDomainAnalysisOutputSchema,
  diagnosisExperimentV2Schema,
  diagnosisFinalModelOutputSchema,
  diagnosisFinalResultSchema,
  type DiagnosisEvidence,
  type DiagnosisFinalResult,
  type DiagnosisSkillExecutionStatus,
  type DiagnosisSkillId,
  type DiagnosisSkillInput,
  type DiagnosisSkillOutput,
  type SimilarDiagnosisCase
} from "@douyin-local-life/shared/diagnosis";
import type { CollectionRouteKey } from "@douyin-local-life/shared/collection-routes";
import { decisionEngineInputSchema, type DecisionEngineInput } from "@douyin-local-life/shared";
import type { DiagnosisCaseRetrievalHints } from "../diagnosis-cases.js";
import { changedExperimentVariables, experimentVariableNames } from "./experiment-variables.js";
import { hasKnownRoiContradiction, hasUnsupportedBenchmark, hasUnsupportedQualitativeComparison } from "./comparison-language.js";
import { observationValidationDiagnostic, type ObservationValidationDiagnostic } from "./validation-diagnostic.js";
import { buildServerDiagnosisInsights } from "./server-insights.js";

export const diagnosisPromptVersion = "managed-live-growth-prompt-v28";
export const diagnosisOrchestrationVersion = "server-determined-skill-plan-v37";
// Kept for historical record compatibility. The formal path no longer consumes
// model-selected tool rounds or tool-call quota.
export const legacyDiagnosisOrchestrationLimits = { maxRounds: 8, maxToolCalls: 12 } as const;
const domainSkillOutputSchema = diagnosisDomainAnalysisOutputSchema;
const experimentDesignInstruction = "singleVariable 只写实际调整对象，如‘商品讲解话术’。steps 把调整、保持不变、观察结果分句写清；‘只优化商品讲解话术；保持预算、出价和优惠不变；观察商品成交’只调整话术，‘优化话术并降低价格’改变了两个变量，必须拆成独立实验。不要为凑齐实验而增加调整；无法给出符合证据和单变量要求的实验时返回 experiments:[]，并删除其关联 candidateActions，不得伪造实验或改写事实。";
export const unsupportedComparisonRepairInstruction = "如果 validationIssue 包含 DIAGNOSIS_BENCHMARK_UNSUPPORTED，只修正触发门禁的可见文案，保留合法 evidenceIds、维度、主问题标签和已被证据支持的事实，不要新增数字、证据或推断。逐项检查 coreConclusion、statement、title、conclusion、missingEvidence、steps、singleVariable、controlScope、observationWindow、completionCriteria、abortCriteria、interferenceFactors、reason、expectedImpact、refusalReason；在没有明确目标、同口径历史对比或输入内基准时，删除‘良好、较好、较高、较低、有限、优秀、偏弱、健康、行业平均’等比较性评价。能引用输入事实时改写为可核对的当前事实；没有足够依据时改写为‘当前证据不足，暂不能判断……’，不得猜测或补充阈值。若某个假设、实验或候选动作无法改成合规文案，就删除该项及其依赖项，返回空数组也可以；不要把修复说明写入 JSON。";
export const domainOutputInstruction = [
  "分析输入数据，不得复制或回显输入对象。",
  "面向本地生活代直播经营人员表达，按‘流量进入→直播承接→商品点击与成交→投放产出’组织结论；不要展示分析过程。",
  "事实陈述、标题、结论、原因和步骤只能使用中文业务名称，不得出现 impressions、ctr、pay_roi、target_roi、live_viewers、metric:、route: 等内部字段或证据 ID；证据 ID 只能放在 evidenceIds 字段。",
  "严禁把培训材料、单个案例或模型常识中的数字当作通用行业阈值。输入没有明确目标、同口径历史对比或行业基准证据时，不得使用‘行业平均/行业均值/健康水平/健康区间/通常应达到’等判断，只能说明当前事实及还不能判断什么。",
  "没有目标、同口径历史或输入内基准时，不得使用‘良好、较高、较低、有限、优秀、偏弱’等比较性评价。数值低于明确目标时只能说明目标差距，不能据此断定具体原因。",
  "缺口和假设要明确区分未知与断言：允许‘缺少行业基准，无法判断当前承接效率是否较低’，不允许‘缺少历史，但当前承接效率较低’。不要在缺口中夹带好坏结论或编造阈值。",
  "不得自行用口径不同的指标相除来创造点击率、转化率或 ROI；只使用输入已有指标和 deterministicContext 明确给出的派生结果。",
  "不得把不同采集路线的观看人数、点击次数、订单数拼成漏斗，也不得仅凭数字逐级递减声称存在流失或转化偏低。",
  "经营框架只用于组织事实与待验证假设：好商品、好内容/直播承接与广告流量应协同；框架不能替代证据，也不能直接生成行动方案。",
  "missingEvidence 只保留会改变经营决定的关键缺口；同一类历史对比不得按观看、点击、成交等指标重复列出，也不要要求‘同直播类型’。需要历史趋势时合并成一句‘缺少近期历史趋势，暂不能判断当前表现是在改善还是回落’。",
  "返回 JSON 顶层必须且只能包含：applicable、refused、refusalReason、facts、hypotheses、missingEvidence、confidence。",
  "refusalReason 必须是字符串或 null；所有集合字段都必须是数组，没有内容时返回空数组。",
  "facts 每项严格为 {statement,evidenceIds}；statement 必须是非空字符串，evidenceIds 至少包含一个输入中的真实 id。",
  "hypotheses 每项严格为 {id,dimension,title,conclusion,supportingEvidenceIds,conflictingEvidenceIds,missingEvidence,confidence}。",
  "hypotheses 中 supportingEvidenceIds、conflictingEvidenceIds、missingEvidence 必须始终是数组，即使只有一项或没有内容。",
  "所有 confidence 都必须是 0 到 1 的 JSON number，禁止使用字符串或百分号。",
  "保持聚焦：facts 最多 3 条、hypotheses 最多 2 条；任何事实或假设若没有合法 evidence id 就不要生成，绝不能使用空 evidenceIds。",
  "hypotheses.dimension 只能是 DATA、TRAFFIC、LIVE_ROOM、PRODUCT、DELIVERY、ACTIVITY_COMPLIANCE。",
  "不得返回 experiments、candidateActions、stopConditions、abortCriteria、outputContract、deterministicContext、evidence、analysis、reasoning 或 result 包装层。只返回最终 JSON 对象。"
].join("\n");
export const finalOutputInstruction = [
  experimentDesignInstruction,
  "返回 JSON 顶层必须且只能包含：schemaVersion、coreConclusion、mainProblemTag、confidence、factSnapshot、hypotheses、missingEvidence、experiments、candidateActions。",
  "schemaVersion 固定为 ai-diagnosis-result-v1；所有集合字段都必须是数组。",
  "mainProblemTag 必须与输入 decisionBrief.mainProblemTag 完全一致；综合器只能展开依据，不得重新改判。",
  "factSnapshot 每项严格为 {statement,evidenceIds}，evidenceIds 至少一个；hypotheses 每项严格为 {id,dimension,title,conclusion,supportingEvidenceIds,conflictingEvidenceIds,missingEvidence,confidence}。",
  "hypotheses 中 supportingEvidenceIds、conflictingEvidenceIds、missingEvidence 必须始终是数组。",
  "experiments 每项严格为 {id,title,hypothesisId,steps,verifyMetrics,evidenceIds,experimentType,actionType,singleVariable,controlScope,observationWindow,baselineMetrics,completionCriteria,abortCriteria,interferenceFactors}；verifyMetrics 和 baselineMetrics 都只能是指标名称字符串数组，不得输出对象；candidateActions 每项严格为 {actionType,title,reason,expectedImpact,riskLevel,confidence,evidenceIds,experimentId}。",
  "实验必须一次只观察或改变一个变量。OBSERVATION 的 actionType 只能为 null 或只读核对类动作且步骤不得包含调整动作；MANUAL_CHANGE 必须填写唯一 actionType，并由同一 experimentId 的 candidateAction 关联。每个 candidateAction 的 experimentId 必须对应本轮一个实验，不能为 null。completionCriteria 是完成标准，abortCriteria 是唯一风险止损标准且至少一项；不得输出 stopConditions，也不得把完成条件写进 abortCriteria。baselineMetrics 不得为空；如没有单独名称，逐字复制 verifyMetrics，例如 baselineMetrics:[\"商品点击次数\",\"成交人数\"]。",
  "所有 confidence 都必须是 0 到 1 的 JSON number，禁止使用字符串或百分号。",
  "面向本地生活经营人员直接给答案，不展示分析过程。coreConclusion 用 2 至 3 句说明‘当前结果、最确定的问题或判断边界、第一步怎么做’，不得罗列内部字段名。",
  "事实、假设、动作与步骤使用中文业务名称；impressions、ctr、pay_roi、target_roi、live_viewers、metric:、route: 等内部字段或证据 ID 只能出现在 evidenceIds 中，不得写进可见文案。",
  "严禁把培训材料、单个案例或模型常识中的数字当作通用行业阈值。没有明确目标、同口径历史对比或行业基准证据时，不得声称某项指标低于行业平均、健康水平或通常标准，也不得据此判定优劣。",
  "没有目标、同口径历史或输入内基准时，不得使用‘良好、较高、较低、有限、优秀、偏弱’等比较性评价。实际 ROI 低于目标只证明结果未达标，coreConclusion 不得直接把降低出价、改定向、改预算写成第一步；具体动作只能作为候选并交给服务端规则裁决。",
  "不得自行用口径不同的指标相除来创造点击率、转化率或 ROI；只能复述输入已有指标及 deterministicSignals 明确给出的结果。",
  "全域支付 ROI 与目标 ROI 同时存在时，必须直接说明是否达标；普通支付 ROI 不能替代全域支付 ROI 与目标比较。目标达成只说明目标结果，不能据此断言订单正常、整体经营健康或具体原因已确认。",
  "不得把不同采集路线的观看人数、点击次数、订单数拼成漏斗，也不得仅凭数字逐级递减声称存在流失或转化偏低。",
  "把本地生活经营方法论转成少量可执行建议：优先说明商品/优惠承接、内容与直播节奏、广告流量与成交目标如何协同；每条建议必须对应本轮证据和人工验证方式。",
  "missingEvidence 只保留会改变经营决定的关键缺口，最多 3 条；同一类历史对比不得按观看、点击、成交等指标重复列出，也不要要求‘同直播类型’。需要历史趋势时合并成一句‘缺少近期历史趋势，暂不能判断当前表现是在改善还是回落’。",
  "保持聚焦：factSnapshot 最多 5 条、hypotheses 最多 3 条、experiments 最多 1 条、candidateActions 最多 1 条、missingEvidence 最多 3 条。没有依据时允许不新增调整并输出空实验和动作。",
  "hypotheses 是给经营人员看的待验证分析，不是数据清单：用结论说明事实对本次直播意味着什么，保留替代解释，并在 missingEvidence 写明哪项核对可以区分原因。不要重复事实卡，也不要把缺数据包装成已发现的经营问题。hypotheses 的标题和结论不能夹带调整指令，操作只放在最终唯一实验与候选动作中。",
  "serverBusinessInsights 是服务端已确认的当前口径关系，可作为事实和缺口依据；可以据此解释已知结果和还需核对什么，但不能把这些确定性关系伪装成原因已经确认，也不能直接生成平台操作。",
  "如果没有同时满足‘真实指标或明细证据 + 会改变判断的具体核对项’，hypotheses 必须返回空数组；不要用‘结果已确认、原因待验证’或重复 missingEvidence 凑数量。",
  "diagnosisContext 是服务端冻结的使用场景、完整窗口趋势和本任务人工执行记录。场景仅是用户用途，不是开播或下播证据。直播中优先检查数据新鲜度、近期变化和下次检查条件；场后优先说明可用范围、目标结果与下一场验证问题。",
  "人工审批不等于执行，执行不等于有效。manualActions 中 outcome 为 null 时，优先明确记录哪条已执行动作的结果、需要哪些数据及能回答的问题，不重复建议执行该动作。拒绝建议不构成长期规则。",
  "不得为了产生问题而强行诊断。deterministicSignals 全部健康且无风险时，mainProblemTag 必须优先考虑 HEALTHY。",
  "核心标签按直接证据和因果上游确定：missingCoreMetrics 非空时必须选 DATA_READINESS；否则 traffic.weak 时优先 TRAFFIC；product.weak 时必须优先 PRODUCT，即使同时出现其下游 liveRoom.weak；只有商品不弱而成交承接弱时选 LIVE_ROOM；高消耗且 ROI 低于目标、且更上游信号不弱时选 DELIVERY_ROI；明确合规风险且数据完整时选 ACTIVITY_COMPLIANCE。",
  "MULTI_FACTOR 仅用于两个互不解释、证据同等直接的独立主因；不得用它回避上述优先级，也不得把上游问题及其下游结果重复算成两个主因。",
  "事实、实验和候选动作没有合法 evidence id 时不得生成；每个实验的 abortCriteria 至少一项。",
  "mainProblemTag 只能是 HEALTHY、DATA_READINESS、TRAFFIC、LIVE_ROOM、PRODUCT、DELIVERY_ROI、ACTIVITY_COMPLIANCE、MULTI_FACTOR。",
  `candidateActions.actionType 只能是：${diagnosisActionTypes.join("、")}。`,
  "不得返回 outputContract、evidenceIds、skillOutputs、analysis、reasoning 或 result 包装层。只返回最终 JSON 对象。"
].join("\n");
export const synthesisDecisionBriefSchema = z.object({
  mainProblemTag: diagnosisFinalResultSchema.shape.mainProblemTag,
  rationale: z.string().min(1).max(800),
  evidenceIds: z.array(z.string().min(1)).min(1).max(12)
});

export class DiagnosisOrchestrationError extends Error {
  constructor(public readonly code: string, message: string, public readonly validationDiagnostic?: ObservationValidationDiagnostic) {
    super(message);
  }
}

export function withCompatibilityStopConditions(value: z.infer<typeof diagnosisFinalModelOutputSchema>): DiagnosisFinalResult {
  const experiments = value.experiments.map((experiment) => ({
    ...experiment,
    // New model responses have one risk field. The legacy field is generated
    // from it only after parsing, so it cannot override or conceal a conflict.
    stopConditions: uniqueStrings(experiment.abortCriteria)
  }));
  return diagnosisFinalResultSchema.parse({
    ...value,
    experiments,
    stopConditions: uniqueStrings(experiments.flatMap((experiment) => experiment.abortCriteria))
  });
}

export function assertFixedSkillPlan(actual: DiagnosisSkillPlan, expected: DiagnosisSkillPlan) {
  const matches = actual.auditSkillId === expected.auditSkillId
    && actual.retrievalEnabled === false
    && actual.domainSkillIds.length === expected.domainSkillIds.length
    && actual.domainSkillIds.every((skillId, index) => skillId === expected.domainSkillIds[index]);
  if (!matches) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_SKILL_PLAN_INVALID", "诊断 Skill 调度计划与服务端固定计划不一致");
  }
}

export function summarizeSkillInput(input: DiagnosisSkillInput, routes: readonly CollectionRouteKey[]) {
  const selectedEvidenceIds = input.evidenceCatalog
    .filter((item) => !routes.length || (item.routeKey && routes.includes(item.routeKey)) || item.kind === "POLICY")
    .map((item) => item.id);
  return {
    businessMode: input.businessMode,
    scenario: input.decisionInput.diagnosisContext?.scenario || "UNSPECIFIED",
    scenarioStrategyTitle: getDiagnosisScenarioStrategy(input.decisionInput.diagnosisContext?.scenario).title,
    routes,
    selectedEvidenceIds
  };
}

export function assertDomainReferences(result: z.infer<typeof domainSkillOutputSchema>, validIds: Set<string>) {
  result.facts.forEach((item, index) => assertEvidenceList(item.evidenceIds, validIds, `facts.${index}.evidenceIds`));
  result.hypotheses.forEach((item, index) => {
    assertEvidenceList(item.supportingEvidenceIds, validIds, `hypotheses.${index}.supportingEvidenceIds`);
    assertEvidenceList(item.conflictingEvidenceIds, validIds, `hypotheses.${index}.conflictingEvidenceIds`);
  });
}

function assertEvidenceList(ids: string[], validIds: Set<string>, path: string) {
  const index = ids.findIndex((id) => !validIds.has(id));
  if (index >= 0) throw new DiagnosisOrchestrationError("DIAGNOSIS_EVIDENCE_INVALID", `${path}.${index}：引用不在本次合法证据清单内`);
}

export function assertDomainResultConsistency(
  result: z.infer<typeof domainSkillOutputSchema>,
  expectedDimension: unknown
) {
  if (typeof expectedDimension !== "string") return;
  const crossDomain = result.hypotheses.find((item) => item.dimension !== expectedDimension);
  if (crossDomain) {
    throw new DiagnosisOrchestrationError(
      "DIAGNOSIS_DOMAIN_CONFLICT",
      `领域 Skill 只能输出 ${expectedDimension} 维度假设，不得代替其他领域下结论`
    );
  }
}

export function projectDomainResult(
  result: z.infer<typeof domainSkillOutputSchema>,
  expectedDimension: unknown
) {
  if (typeof expectedDimension !== "string") return result;
  const hypotheses = result.hypotheses.filter((item) => item.dimension === expectedDimension);
  if (hypotheses.length === result.hypotheses.length) return result;

  // The server owns domain routing. Retain only the assigned domain rather
  // than asking a paid model to repair an out-of-scope hypothesis.
  return {
    ...result,
    hypotheses
  };
}

export function assertFinalReferences(result: DiagnosisFinalResult, validIds: Set<string>) {
  const hypothesisIds = new Set(result.hypotheses.map((item) => item.id));
  for (const [index, experiment] of result.experiments.entries()) {
    if (!hypothesisIds.has(experiment.hypothesisId)) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `experiments.${index}.hypothesisId：实验必须关联本轮真实存在的假设`);
    }
  }
  result.factSnapshot.forEach((item, index) => assertEvidenceList(item.evidenceIds, validIds, `factSnapshot.${index}.evidenceIds`));
  result.hypotheses.forEach((item, index) => {
    assertEvidenceList(item.supportingEvidenceIds, validIds, `hypotheses.${index}.supportingEvidenceIds`);
    assertEvidenceList(item.conflictingEvidenceIds, validIds, `hypotheses.${index}.conflictingEvidenceIds`);
  });
  result.experiments.forEach((item, index) => assertEvidenceList(item.evidenceIds, validIds, `experiments.${index}.evidenceIds`));
  result.candidateActions.forEach((item, index) => assertEvidenceList(item.evidenceIds, validIds, `candidateActions.${index}.evidenceIds`));
}

const substantiveHypothesisEvidenceKinds = new Set(["METRIC", "TABLE_ROW", "CASE", "POLICY", "ROUTE"]);
const genericHypothesisText = /^(?:核心问题假设|领域主问题假设|主要问题为\s*[A-Z_]+。?|原因(?:仍)?待验证|具体原因(?:仍)?待验证)$/u;
const actionableVerificationText = /(?:核对|补齐|补采|对比|区分|确认|查看|检查|记录|拆分|获取|保留|比较)/u;

/**
 * A hypothesis is useful only when it can change the next decision. It must
 * connect to substantive evidence and name a concrete check that separates
 * plausible causes. Generic “the result is confirmed, cause pending”
 * statements are facts or boundaries, not hypotheses.
 */
export function isUsefulDiagnosisHypothesis(
  hypothesis: DiagnosisFinalResult["hypotheses"][number],
  evidenceById?: ReadonlyMap<string, DiagnosisEvidence>
) {
  if (!hypothesis.supportingEvidenceIds.length || !hypothesis.missingEvidence.length) return false;
  if (genericHypothesisText.test(`${hypothesis.title}。${hypothesis.conclusion}`)) return false;
  if (!hypothesis.missingEvidence.some((item) => item.length >= 8 && actionableVerificationText.test(item))) return false;
  if (evidenceById && !hypothesis.supportingEvidenceIds.some((id) => (
    substantiveHypothesisEvidenceKinds.has(evidenceById.get(id)?.kind || "")
      || id.startsWith("history:")
      || id.startsWith("manual-action:")
  ))) {
    return false;
  }
  return true;
}

export function projectUsefulHypotheses(result: DiagnosisFinalResult, evidenceById: ReadonlyMap<string, DiagnosisEvidence>): DiagnosisFinalResult {
  const hypotheses = result.hypotheses.filter((hypothesis) => isUsefulDiagnosisHypothesis(hypothesis, evidenceById));
  const hypothesisIds = new Set(hypotheses.map((hypothesis) => hypothesis.id));
  const experiments = result.experiments.filter((experiment) => hypothesisIds.has(experiment.hypothesisId));
  const experimentIds = new Set(experiments.map((experiment) => experiment.id));
  const candidateActions = result.candidateActions.filter((candidate) => candidate.experimentId && experimentIds.has(candidate.experimentId));
  return {
    ...result,
    hypotheses,
    experiments,
    stopConditions: uniqueStrings(experiments.flatMap((experiment) => experiment.abortCriteria ?? [])),
    candidateActions
  };
}

export function assertBriefReferences(references: string[], validIds: Set<string>) {
  assertEvidenceList(references, validIds, "evidenceIds");
}

const observationActionTypes = new Set([
  "OBSERVE",
  "CHECK_LIVE_ROOM",
  "CHECK_CREATIVE",
  "CHECK_AUDIENCE",
  "VERIFY_ACTIVITY",
  "CALIBRATE_SUBJECT",
  "REQUEST_MANUAL_REVIEW"
]);

export function assertExperimentDesign(result: Pick<DiagnosisFinalResult, "experiments" | "candidateActions">) {
  const experimentIds = new Set(result.experiments.map((experiment) => experiment.id));
  const unlinkedAction = result.candidateActions.find((candidate) => !candidate.experimentId || !experimentIds.has(candidate.experimentId));
  if (unlinkedAction) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", "candidateActions.0.experimentId：候选动作必须关联本轮已验证实验，不能脱离风险止损条件单独提交");
  }
  for (const [experimentIndex, experimentValue] of result.experiments.entries()) {
    const path = `experiments.${experimentIndex}`;
    const parsed = diagnosisExperimentV2Schema.safeParse(experimentValue);
    if (!parsed.success) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.${parsed.error.issues[0]?.path.join(".") || "design"}：实验缺少单变量、基线、观察窗口、完成标准、止损标准或干扰因素`);
    }
    const experiment = parsed.data;
    if (new Set(experiment.abortCriteria).size !== experiment.abortCriteria.length) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.abortCriteria：每条风险止损条件只能生成一次`);
    }
    const linkedActions = result.candidateActions.filter((candidate) => candidate.experimentId === experiment.id);
    if (experiment.actionType && linkedActions.some((candidate) => candidate.actionType !== experiment.actionType)) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.actionType：实验动作类型与关联候选动作不一致`);
    }
    if (experiment.experimentType === "MANUAL_CHANGE") {
      if (!experiment.actionType || linkedActions.length !== 1 || linkedActions[0]?.actionType !== experiment.actionType) {
        throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.actionType：人工调整实验必须且只能关联一个同类型候选动作`);
      }
      if (observationActionTypes.has(experiment.actionType)) {
        throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.experimentType：只读核对动作不能标记为人工调整实验`);
      }
      assertSingleChangedVariable(experiment.singleVariable, experiment.steps, path);
    } else {
      if (experiment.actionType && !observationActionTypes.has(experiment.actionType)) {
        throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.actionType：观察实验只能关联只读核对类动作`);
      }
      const changes = changedExperimentVariables(experiment.steps);
      if (changes.length) {
        const change = changes[0]!;
        throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.steps.${change.stepIndex}：观察实验不得夹带经营设置调整（${change.unresolvedAdjustment ? "调整对象不明确" : change.variables.join("、")}）`,
          observationValidationDiagnostic(experimentIndex, experiment.steps[change.stepIndex]!, change));
      }
    }
    if (experiment.completionCriteria.some((item) => experiment.abortCriteria.includes(item))) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.completionCriteria：实验完成标准与风险止损标准不得相同`);
    }
    if (experiment.abortCriteria.some((item) => /(?:完成|达成|结束观察|复盘完成)/.test(item))) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.abortCriteria：只能描述风险止损、数据失真或恶化条件，不能混入完成条件`);
    }
    if (experiment.completionCriteria.some((item) => /(?:停止|恶化|数据失真|风险上升)/.test(item))) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.completionCriteria：只能描述完成条件，不能混入风险止损条件`);
    }
  }
}

function assertSingleChangedVariable(singleVariable: string, steps: string[], path: string) {
  if (/(?:或|以及|同时|、|\/)/.test(singleVariable)) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.singleVariable：只能描述一个调整变量`);
  }
  const declaredVariables = experimentVariableNames(singleVariable);
  const changes = changedExperimentVariables(steps);
  const unresolved = changes.find((change) => change.unresolvedAdjustment);
  if (unresolved) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.steps.${unresolved.stepIndex}：调整对象不明确，请在调整语句中直接写明唯一经营变量，不使用代词或省略对象。`);
  }
  const variables = new Set([...declaredVariables, ...changes.flatMap((change) => change.variables)]);
  if (variables.size > 1) {
    const locations = changes.map((change) => `${path}.steps.${change.stepIndex}（${change.variables.join("、")}）`);
    throw new DiagnosisOrchestrationError("DIAGNOSIS_EXPERIMENT_INVALID", `${path}.singleVariable 与调整步骤涉及 ${[...variables].join("、")}；人工调整实验一次只能改变一个经营变量。${locations.join("；")}。请拆分实验并分别关联动作，保持不变的条件不算调整。`);
  }
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

const businessNarrativeKeys = new Set([
  "coreConclusion",
  "statement",
  "title",
  "conclusion",
  "missingEvidence",
  "steps",
  "stopConditions",
  "singleVariable",
  "controlScope",
  "observationWindow",
  "completionCriteria",
  "abortCriteria",
  "interferenceFactors",
  "reason",
  "expectedImpact",
  "refusalReason"
]);
const unsupportedBroadHealthClaim = /(?:整体经营|经营整体|整体|订单|成交)[^，。；！？\n]{0,16}?(?:健康|正常)/;

function hasUnsupportedBroadHealthClaim(text: string) {
  return text.split(/[，。；！？\n]|但是|但/u).some((clause) => {
    const match = unsupportedBroadHealthClaim.exec(clause);
    return match !== null && !/(?:不能|无法|不足以|尚不能|未能|不代表)/.test(clause.slice(0, match.index));
  });
}

export function assertBusinessFacingLanguage(value: unknown) {
  const narratives = collectBusinessNarratives(value);
  const internalField = /(?:^|[^A-Za-z_])(impressions|ctr|pay_roi|target_roi|live_viewers|metric:|route:)(?:$|[^A-Za-z_])/i;
  const internalExample = narratives.find((item) => internalField.test(item));
  if (internalExample) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_BUSINESS_LANGUAGE_INVALID", "可见诊断文案包含内部字段名或证据 ID");
  }
  const benchmarkExample = narratives.find(hasUnsupportedBenchmark);
  if (benchmarkExample) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_BENCHMARK_UNSUPPORTED", "可见诊断文案使用了未经本轮证据支持的行业阈值");
  }
  const qualitativeExample = narratives.find(hasUnsupportedQualitativeComparison);
  if (qualitativeExample) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_BENCHMARK_UNSUPPORTED", "可见诊断文案在没有目标、历史或基准时使用了比较性好坏判断");
  }
  if (narratives.some(hasUnsupportedBroadHealthClaim)) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_BENCHMARK_UNSUPPORTED", "单项指标或目标达成不能证明订单正常、整体经营正常或健康");
  }
  const unsupportedDerivedCalculation = /(?:客单价|转化率|点击率|ROI).{0,40}\d[\d,.]*\s*[\/÷]\s*\d/;
  if (narratives.some((item) => unsupportedDerivedCalculation.test(item))) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_DERIVED_METRIC_UNSUPPORTED", "可见诊断文案包含未经确定性上下文允许的自行派生计算");
  }
}

export function neutralizeUnsupportedComparisonLanguage(
  value: unknown,
  issue: string,
  validate: (value: unknown) => Record<string, unknown>
): unknown {
  if (!issue.includes("DIAGNOSIS_BENCHMARK_UNSUPPORTED")) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const isFinalSynthesisOutput = Object.hasOwn(record, "experiments") || Object.hasOwn(record, "candidateActions");
  // Numeric benchmarks and operational conditions cannot be made safe by
  // deleting words. Leave them to the model's single repair and full validation.
  if (collectBusinessNarratives(value).some(hasUnsupportedBenchmark)) return value;
  const protectedNarratives = collectBusinessNarratives({
    experiments: record.experiments,
    candidateActions: record.candidateActions,
    stopConditions: record.stopConditions,
    missingEvidence: record.missingEvidence
  });
  if (protectedNarratives.some((text) => hasUnsupportedQualitativeComparison(text) || hasUnsupportedBroadHealthClaim(text))) return value;
  const rewritten = rewriteBusinessNarratives(record, neutralizeComparisonText);
  // Validate before withdrawing proposals, so removal cannot mask another
  // violation in their evidence, calculations, or operational conditions.
  const validated = validate(rewritten);
  if (!isFinalSynthesisOutput) return validated;
  // A withdrawn assessment must not continue to authorize a proposed experiment
  // or action. Convert the server-derived legacy field back to the model
  // contract before the mandatory final validation, so recovery cannot smuggle
  // stopConditions into a new model response.
  const { stopConditions: _legacyStopConditions, ...modelOutput } = validated;
  return { ...modelOutput, experiments: [], candidateActions: [] };
}

function rewriteBusinessNarratives(record: Record<string, unknown>, rewrite: (text: string) => string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, child]) => {
    if (businessNarrativeKeys.has(key) && typeof child === "string") return [key, rewrite(child)];
    const visit = (item: unknown): unknown => item && typeof item === "object" && !Array.isArray(item)
      ? rewriteBusinessNarratives(item as Record<string, unknown>, rewrite)
      : item;
    return [key, Array.isArray(child) ? child.map(visit) : visit(child)];
  }));
}

function neutralizeComparisonText(text: string) {
  if (hasUnsupportedBroadHealthClaim(text)) {
    text = text.split(/([，。；！？\n]|但是|但)/u).map((clause) => hasUnsupportedBroadHealthClaim(clause)
      ? clause.replace(/((?:整体经营|经营整体|整体|订单|成交)[^，。；！？\n]{0,16}?)(?:健康|正常)/g, "$1状态尚未确认")
      : clause).join("");
  }
  if (!hasUnsupportedQualitativeComparison(text)) return text;
  // Keep subjects, numbers, units and neighboring facts intact. Only withdraw
  // the unsupported qualitative verdict; never synthesize a numeric threshold.
  return text.replace(/((?:表现|效率|时长|转化率|成交|承接)[^，。；！？\n]{0,16}?)(?:良好|较好|较高|较低|有限|优秀|偏弱)/g,
    "$1暂不能判断优劣");
}

export function determineMainProblemTag(
  signals: ReturnType<typeof buildDeterministicDiagnosticSignals>
): DiagnosisFinalResult["mainProblemTag"] {
  if (signals.missingCoreMetrics.length) return "DATA_READINESS";
  if (signals.traffic.weak) return "TRAFFIC";
  if (signals.product.weak) return "PRODUCT";
  if (signals.liveRoom.weak) return "LIVE_ROOM";
  if (signals.delivery.weak) return "DELIVERY_ROI";
  if (signals.activityCompliance.risk) return "ACTIVITY_COMPLIANCE";
  return "HEALTHY";
}

export function buildDecisionRunDeterministicReview(inputValue: unknown, finalResultValue: unknown) {
  const input = decisionEngineInputSchema.safeParse(inputValue);
  const result = diagnosisFinalResultSchema.safeParse(finalResultValue);
  if (!input.success || !result.success) return null;

  const signals = buildDeterministicDiagnosticSignals(buildDiagnosisEvidenceCatalog(input.data as DecisionEngineInput), input.data);
  const expectedMainProblemTag = determineMainProblemTag(signals);
  if (result.data.mainProblemTag === expectedMainProblemTag) return null;

  const conclusion = expectedMainProblemTag === "DELIVERY_ROI"
    && signals.delivery.payRoi !== null
    && signals.delivery.targetRoi !== null
    ? `服务端复核确认：全域支付 ROI 为 ${signals.delivery.payRoi}，低于本次目标 ROI ${signals.delivery.targetRoi}，应优先检查投放产出。原 AI 核心结论与已知目标冲突，本轮动作建议已暂停。`
    : `服务端复核发现原 AI 核心结论与确定性证据冲突，应按 ${expectedMainProblemTag} 重新判断；本轮动作建议已暂停。`;

  return {
    status: "CONFLICT" as const,
    expectedMainProblemTag,
    conclusion
  };
}

export function assertDeterministicResultConsistency(
  result: DiagnosisFinalResult,
  signals: ReturnType<typeof buildDeterministicDiagnosticSignals>
) {
  const expectedTag = determineMainProblemTag(signals);
  if (result.mainProblemTag !== expectedTag) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_DETERMINISTIC_CONFLICT", `主问题必须服从服务端确定性裁决：${expectedTag}`);
  }
  const narratives = collectBusinessNarratives(result);
  if (signals.delivery.payRoi !== null && signals.delivery.targetRoi !== null) {
    const contradictsKnownRoi = narratives.find(hasKnownRoiContradiction);
    if (contradictsKnownRoi) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_DETERMINISTIC_CONFLICT", "已有累计全域支付 ROI 与目标 ROI，不得声称缺少这两个值或无法判断本次是否达标；近期趋势、原因和不同区间或计划的 ROI 应分别表述");
    }
    const decisionReferences = [
      ...result.factSnapshot.flatMap((item) => item.evidenceIds),
      ...result.hypotheses.flatMap((item) => item.supportingEvidenceIds)
    ];
    const requiredReferences = [signals.delivery.payRoiEvidenceId, signals.delivery.targetRoiEvidenceId]
      .filter((item): item is string => Boolean(item));
    if (requiredReferences.some((id) => !decisionReferences.includes(id))) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_DETERMINISTIC_CONFLICT", "投放结论必须同时引用实际支付 ROI 与目标 ROI 证据");
    }
  }
  if (signals.delivery.fullDomainPayRoi === null && signals.delivery.ordinaryPayRoi !== null && signals.delivery.targetRoi !== null) {
    const ordinaryRoiAsTarget = narratives.find((item) => /(?:支付|ROI).{0,30}(?:达标|达到.{0,12}目标|低于.{0,12}目标|未达标)/.test(item));
    if (ordinaryRoiAsTarget) {
      throw new DiagnosisOrchestrationError("DIAGNOSIS_DETERMINISTIC_CONFLICT", "普通支付 ROI 不能替代全域支付 ROI 与目标进行达标比较");
    }
  }
  const unsupportedTraffic = !signals.traffic.weak && result.hypotheses.some((item) => (
    item.dimension === "TRAFFIC" && [item.title, item.conclusion].some(isAffirmativeUnsupportedFunnelClaim)
  ));
  const unsupportedLiveRoom = !signals.liveRoom.weak && result.hypotheses.some((item) => (
    item.dimension === "LIVE_ROOM" && [item.title, item.conclusion].some(isAffirmativeUnsupportedFunnelClaim)
  ));
  const unsupportedCoreConclusion = !signals.traffic.weak && !signals.liveRoom.weak && !signals.product.weak
    && isAffirmativeUnsupportedFunnelClaim(result.coreConclusion);
  if (unsupportedTraffic || unsupportedLiveRoom || unsupportedCoreConclusion) {
    throw new DiagnosisOrchestrationError("DIAGNOSIS_DETERMINISTIC_CONFLICT", "不同路线或口径的观看、点击、订单数字不能仅凭递减关系判定流失或转化偏低");
  }
}

function isAffirmativeUnsupportedFunnelClaim(text: string) {
  const unsupportedClaim = /转化效率.{0,12}(?:偏低|偏弱)|存在.{0,8}流失|逐级递减|承接环节.{0,8}(?:异常|问题)/;
  const explicitlyUncertain = /(?:无法|不能|难以|尚不能|暂不能|不足以).{0,40}(?:判断|确认|说明|证明).{0,40}(?:是否)?(?:存在)?(?:流失|转化.{0,8}(?:偏低|偏弱)|承接.{0,8}(?:异常|问题))/;
  const explicitlyUnsupported = /(?:尚无|没有|缺少).{0,24}(?:证据|数据).{0,20}(?:表明|证明|判断|确认).{0,30}(?:流失|转化.{0,8}(?:偏低|偏弱)|承接.{0,8}(?:异常|问题))/;
  // An uncertainty in one clause cannot excuse an affirmative claim elsewhere.
  return text.split(/[，,。；;！？!?\n]/).some((clause) => unsupportedClaim.test(clause)
    && !explicitlyUncertain.test(clause) && !explicitlyUnsupported.test(clause));
}

export function deterministicRepairContext(signals: ReturnType<typeof buildDeterministicDiagnosticSignals>) {
  if (signals.delivery.payRoi === null || signals.delivery.targetRoi === null) return "";
  const comparison = signals.delivery.weak ? "低于" : "不低于";
  return `服务端已确认全域支付 ROI 为 ${signals.delivery.payRoi}，目标 ROI 为 ${signals.delivery.targetRoi}，实际值${comparison}目标；必须直接使用这两个同口径值判断本次是否达标，不需要另补支付金额或客单价。累计达标结果、近期变化趋势、具体原因和区间或计划 ROI 是不同问题；窗口零消耗时允许明确区间 ROI 无法计算，但不得据此否认已知累计结果。`;
}

function collectBusinessNarratives(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectBusinessNarratives);
  const result: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (businessNarrativeKeys.has(key)) {
      if (typeof child === "string") result.push(child);
      else if (Array.isArray(child)) result.push(...child.filter((item): item is string => typeof item === "string"));
      continue;
    }
    result.push(...collectBusinessNarratives(child));
  }
  return result;
}

export function normalizeError(error: unknown) {
  if (error instanceof DiagnosisOrchestrationError || error instanceof LlmTransportError) return error;
  if (error instanceof Error) {
    const [code] = error.message.split(":", 1);
    return { code: code?.startsWith("DIAGNOSIS_") ? code : "DIAGNOSIS_SKILL_FAILED", message: error.message };
  }
  return { code: "DIAGNOSIS_SKILL_FAILED", message: "诊断 Skill 执行失败" };
}

export function emptyUsage(): ChatTokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

export function addUsage(target: ChatTokenUsage, value: DiagnosisTokenUsage | ChatTokenUsage) {
  target.inputTokens += value.inputTokens;
  target.outputTokens += value.outputTokens;
  target.totalTokens += value.totalTokens;
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
  "stopConditions",
  "baselineMetrics",
  "completionCriteria",
  "abortCriteria",
  "interferenceFactors"
]);

export function normalizeDiagnosisModelOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDiagnosisModelOutput);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const normalized = Object.fromEntries(Object.entries(record).map(([key, child]) => {
    if (key === "refused" && child === null) {
      if (typeof record.refusalReason === "string" && record.refusalReason.trim()) return [key, true];
      const hasDiagnosisContent = [record.facts, record.hypotheses].some((items) => Array.isArray(items) && items.length > 0);
      if (hasDiagnosisContent) return [key, false];
    }
    if (key === "confidence" && typeof child === "string") {
      const parsed = Number(child);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 && child.trim() !== "") return [key, parsed];
    }
    if (key === "baselineMetrics" || key === "verifyMetrics") {
      const normalizedMetrics = normalizeMetricNameList(child);
      if (normalizedMetrics) return [key, normalizedMetrics];
    }
    if (diagnosisArrayFields.has(key) && typeof child === "string" && child.trim()) {
      return [key, [child]];
    }
    return [key, normalizeDiagnosisModelOutput(child)];
  }));
  return normalizeExperimentBaselineMetrics(normalized);
}

function normalizeMetricNameList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const names = value.flatMap((item): string[] => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const candidate = [record.name, record.label, record.metric, record.metricName, record.metricKey, record.key]
      .find((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    return candidate ? [candidate.trim()] : [];
  });
  return names.length ? [...new Set(names)] : value.length === 0 ? [] : null;
}

function normalizeExperimentBaselineMetrics(value: Record<string, unknown>): Record<string, unknown> {
  const baselineMetrics = value.baselineMetrics;
  const verifyMetrics = value.verifyMetrics;
  if (!Array.isArray(baselineMetrics) || baselineMetrics.length || !Array.isArray(verifyMetrics)) return value;
  const fallback = verifyMetrics.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return fallback.length ? { ...value, baselineMetrics: [...new Set(fallback)] } : value;
}

export function buildDeterministicDiagnosticSignals(
  evidence: DiagnosisEvidence[],
  input?: Pick<DecisionEngineInput, "historyContext" | "diagnosisContext">
) {
  const metricEvidence = (key: string, routeKey?: CollectionRouteKey) => {
    const matches = evidence.filter((item) => item.kind === "METRIC" && item.metricKey === key);
    if (!routeKey) return matches[0];
    return matches.find((item) => item.routeKey === routeKey)
      ?? matches.find((item) => !item.routeKey || item.routeKey === "UNKNOWN");
  };
  const metric = (key: string, routeKey?: CollectionRouteKey) => {
    const value = metricEvidence(key, routeKey)?.value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };
  const hasRoute = (routeKey: CollectionRouteKey) => evidence.some((item) => (
    item.kind === "ROUTE" && item.routeKey === routeKey && item.value !== "MISSING" && item.value !== "STALE"
  ));
  const impressions = metric("impressions");
  const ctr = metric("ctr");
  const liveViewers = metric("live_viewers");
  const orders = metric("orders");
  const gpm = metric("gpm");
  const spend = metric("spend", "LOCAL_PROMOTION_DASHBOARD");
  const ordinaryPayRoi = metric("pay_roi", "LOCAL_PROMOTION_DASHBOARD");
  const fullDomainPayRoi = metric("full_domain_pay_roi", "LOCAL_PROMOTION_DASHBOARD");
  // The target is defined against the full-domain result. A narrower ordinary
  // payment ROI can be displayed as its own fact, but can never substitute for
  // the full-domain ROI in a target comparison.
  const fullDomainPayRoiEvidence = metricEvidence("full_domain_pay_roi", "LOCAL_PROMOTION_DASHBOARD");
  const targetRoi = metric("target_roi", "LOCAL_PROMOTION_DASHBOARD");
  const targetRoiEvidence = metricEvidence("target_roi", "LOCAL_PROMOTION_DASHBOARD");
  const product = productRowSignals(evidence);
  const missingCoreMetrics = [
    ...(hasRoute("LIVE_TRAFFIC_TAB") ? [["impressions", impressions], ["ctr", ctr]] as const : []),
    ...(hasRoute("LIVE_DATA_SCREEN") ? [["live_viewers", liveViewers], ["orders", orders], ["gpm", gpm]] as const : []),
    ...(hasRoute("LOCAL_PROMOTION_DASHBOARD") ? [["spend", spend], ["full_domain_pay_roi", fullDomainPayRoi]] as const : []),
    ...(hasRoute("LIVE_PRODUCT_TAB") ? [["product_detail", product.evidenceId]] as const : [])
  ].flatMap(([key, value]) => value === null ? [String(key)] : []);
  const comparisonGaps = [
    ...((hasRoute("LOCAL_PROMOTION_DASHBOARD") && targetRoi === null) ? ["缺少本场明确的投放目标 ROI，当前只能展示实际产出，不能判定是否达标"] : []),
    ...trendComparisonGap(input, hasRoute("LIVE_DATA_SCREEN") || hasRoute("LOCAL_PROMOTION_DASHBOARD")),
    ...(!hasRoute("LIVE_TRAFFIC_TAB") ? ["缺少流量来源与曝光进房明细，不能定位自然流量和商业流量的具体差异"] : []),
    ...(!hasRoute("LIVE_PRODUCT_TAB") ? ["缺少商品明细，不能定位具体商品的曝光、点击与成交承接"] : [])
  ];
  const complianceRisk = ["wrong_price_promise_risk", "fulfillment_exception_rate", "refund_rate"]
    .some((key) => (metric(key) || 0) > 0);
  // Phase one intentionally avoids universal industry thresholds. Only a hard
  // funnel break (zero) or comparison against the task's explicit target can
  // produce a deterministic weak signal.
  const trafficWeak = (hasRoute("LIVE_TRAFFIC_TAB") && (impressions === 0 || ctr === 0))
    || (hasRoute("LIVE_DATA_SCREEN") && liveViewers === 0);
  const liveRoomWeak = liveViewers !== null && liveViewers > 0 && (orders === 0 || gpm === 0);
  const productWeak = product.clickRate === 0 || product.orderRate === 0;
  const deliveryRoiWeak = fullDomainPayRoi !== null && targetRoi !== null && fullDomainPayRoi < targetRoi;
  return {
    missingCoreMetrics,
    comparisonGaps,
    traffic: { weak: trafficWeak, impressions, ctr },
    liveRoom: { weak: liveRoomWeak, liveViewers, orders, gpm },
    product: { weak: productWeak, clickRate: product.clickRate, orderRate: product.orderRate, evidenceId: product.evidenceId },
    delivery: {
      weak: deliveryRoiWeak,
      spend,
      // payRoi is retained for old consumers but now always means the
      // full-domain value in this deterministic comparison.
      payRoi: fullDomainPayRoi,
      fullDomainPayRoi,
      ordinaryPayRoi,
      targetRoi,
      payRoiEvidenceId: fullDomainPayRoiEvidence?.id ?? null,
      targetRoiEvidenceId: targetRoiEvidence?.id ?? null
    },
    activityCompliance: { risk: complianceRisk },
    healthyBaselineSatisfied: missingCoreMetrics.length === 0
      && !trafficWeak && !liveRoomWeak && !productWeak && !deliveryRoiWeak && !complianceRisk
  };
}

function trendComparisonGap(
  input: Pick<DecisionEngineInput, "historyContext" | "diagnosisContext"> | undefined,
  relevant: boolean
) {
  if (!relevant) return [];
  const recentTrend = input?.diagnosisContext?.recentTrend;
  if (recentTrend?.status === "AVAILABLE") return [];
  if (recentTrend?.status === "INSUFFICIENT") return [recentTrend.reason];

  const comparisons = [input?.historyContext?.archiveComparison, input?.historyContext?.periodComparison]
    .filter((comparison): comparison is NonNullable<typeof comparison> => Boolean(comparison));
  if (comparisons.some((comparison) => comparison.status !== "INSUFFICIENT")) {
    return ["已有历史对比，但本次未冻结两个完整的 15 分钟窗口，暂不能判断近期表现是在改善还是回落"];
  }
  const recordedReason = comparisons.flatMap((comparison) => comparison.notices).find(Boolean);
  return [recordedReason
    ? `现有历史记录不足以形成近期趋势判断：${recordedReason}`
    : "本次未冻结可比较的近期历史趋势，暂不能判断当前表现是在改善还是回落"];
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
