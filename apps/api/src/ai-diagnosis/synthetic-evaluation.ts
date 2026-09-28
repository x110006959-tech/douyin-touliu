import {
  diagnosisActionTypes,
  type DiagnosisFinalModelOutput,
  type DiagnosisFinalResult
} from "@douyin-local-life/shared/diagnosis";
import { createDiagnosisSkillPlan, syntheticDiagnosisCases, type SyntheticDiagnosisCase } from "@douyin-local-life/diagnosis-skills";
import type { ChatRequest, ChatResponse, ChatTransport } from "@douyin-local-life/llm";
import type { DecisionEngineInput } from "@douyin-local-life/shared";
import { aiDiagnosisTimeoutMs } from "./config.js";
import { orchestrateDiagnosis } from "./orchestrator.js";
import { buildDecisionRunDeterministicReview } from "./orchestrator.js";
import { buildTrustedDiagnosisFactsView } from "./decision-view.js";
import { guardAiCandidateActions } from "@douyin-local-life/decision-engine";

export type DiagnosisEvaluationCase = Pick<SyntheticDiagnosisCase, "id" | "expectedMainProblemTag" | "input">;
type DiagnosisEvaluationDetail = {
  id: string;
  expectedMainProblemTag: DiagnosisFinalResult["mainProblemTag"];
  actualMainProblemTag: DiagnosisFinalResult["mainProblemTag"] | null;
  structurePassed: boolean;
  mainProblemHit: boolean;
  hallucinatedEvidence: number;
  safetyViolations: number;
  factsAvailable: boolean;
  conclusionGrounded: boolean;
  policyAccepted: number;
  policyRejected: number;
  skillExecutions: Array<{ skillId: string; status: string; durationMs: number | null; totalTokens: number | null }>;
  error: string | null;
};

export function createSyntheticDiagnosisTransport(testCase: DiagnosisEvaluationCase): ChatTransport {
  return {
    provider: "fake",
    model: "synthetic-diagnosis-v1",
    async chat(request) {
      const system = request.messages.find((message) => message.role === "system")?.content || "";
      return system.includes("核心问题裁决器")
        ? jsonResponse(buildDecisionBrief(testCase, request))
        : system.includes("诊断综合器")
        ? jsonResponse(buildFinalResult(testCase, request))
        : jsonResponse(buildSkillOutput(request));
    }
  };
}

export async function evaluateSyntheticDiagnosisSuite(
  transportFactory: (testCase: DiagnosisEvaluationCase) => ChatTransport,
  cases: DiagnosisEvaluationCase[] = syntheticDiagnosisCases,
  options: { concurrency?: number } = {}
) {
  const details: DiagnosisEvaluationDetail[] = [];
  const concurrency = Math.min(4, Math.max(1, options.concurrency ?? 1));
  for (let index = 0; index < cases.length; index += concurrency) {
    details.push(...await Promise.all(
      cases.slice(index, index + concurrency).map((testCase) => evaluateOneCase(testCase, transportFactory(testCase)))
    ));
  }
  const structurePassed = details.filter((item) => item.structurePassed).length;
  const mainProblemHits = details.filter((item) => item.mainProblemHit).length;
  return {
    total: details.length,
    structurePassed,
    structurePassRate: structurePassed / details.length,
    mainProblemHits,
    mainProblemHitRate: mainProblemHits / details.length,
    hallucinatedEvidence: details.reduce((sum, item) => sum + item.hallucinatedEvidence, 0),
    safetyViolations: details.reduce((sum, item) => sum + item.safetyViolations, 0),
    factsAvailable: details.filter((item) => item.factsAvailable).length,
    groundedConclusions: details.filter((item) => item.conclusionGrounded).length,
    policyAccepted: details.reduce((sum, item) => sum + item.policyAccepted, 0),
    policyRejected: details.reduce((sum, item) => sum + item.policyRejected, 0),
    partialFailureFactsPreserved: details.filter((item) => !item.structurePassed && item.factsAvailable && item.skillExecutions.some((skill) => skill.status === "SUCCEEDED")).length,
    details
  };
}

async function evaluateOneCase(testCase: DiagnosisEvaluationCase, transport: ChatTransport): Promise<DiagnosisEvaluationDetail> {
  const factsAvailable = buildTrustedDiagnosisFactsView(testCase.input) !== null;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), aiDiagnosisTimeoutMs());
  const skillExecutions: DiagnosisEvaluationDetail["skillExecutions"] = [];
  try {
    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      skillPlan: createDiagnosisSkillPlan(testCase.input),
      transport,
      signal: timeout.signal,
      onSkillEvent: async (event) => {
        if (event.status === "SUCCEEDED" || event.status === "FAILED") {
          skillExecutions.push({
            skillId: event.skillId,
            status: event.status,
            durationMs: event.durationMs ?? null,
            totalTokens: event.usage?.totalTokens ?? null
          });
        }
      }
    });
    const validEvidence = new Set(execution.evidenceCatalog.map((item) => item.id));
    const referenced = references(execution.result);
    const guarded = guardAiCandidateActions({ decisionInput: testCase.input, candidates: execution.result.candidateActions, validEvidenceIds: validEvidence });
    return {
      id: testCase.id,
      expectedMainProblemTag: testCase.expectedMainProblemTag,
      actualMainProblemTag: execution.result.mainProblemTag,
      structurePassed: true,
      mainProblemHit: execution.result.mainProblemTag === testCase.expectedMainProblemTag,
      hallucinatedEvidence: referenced.filter((id) => !validEvidence.has(id)).length,
      safetyViolations: safetyViolations(execution.result),
      factsAvailable,
      conclusionGrounded: referenced.every((id) => validEvidence.has(id)) && !buildDecisionRunDeterministicReview(testCase.input, execution.result),
      policyAccepted: guarded.adjudication.accepted.length,
      policyRejected: guarded.adjudication.rejected.length,
      skillExecutions,
      error: null
    };
  } catch (error) {
    return {
      id: testCase.id,
      expectedMainProblemTag: testCase.expectedMainProblemTag,
      actualMainProblemTag: null,
      structurePassed: false,
      mainProblemHit: false,
      hallucinatedEvidence: 0,
      safetyViolations: 0,
      factsAvailable,
      conclusionGrounded: false,
      policyAccepted: 0,
      policyRejected: 0,
      skillExecutions,
      error: error instanceof Error ? error.message : "unknown error"
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Offline fault injection only; never wraps a configured real model. */
export function evaluateSyntheticFailureDisplaySuite(cases: DiagnosisEvaluationCase[] = syntheticDiagnosisCases) {
  return evaluateSyntheticDiagnosisSuite((testCase) => {
    const base = createSyntheticDiagnosisTransport(testCase);
    return {
      ...base,
      async chat(request) {
        if (request.messages.some((message) => message.role === "system" && message.content?.includes("诊断综合器"))) {
          throw new Error("OFFLINE_SYNTHESIS_FAILURE");
        }
        return base.chat(request);
      }
    };
  }, cases);
}

function buildSkillOutput(request: ChatRequest) {
  const user = parseLastUser(request);
  const evidence = Array.isArray(user.evidence) ? user.evidence as Array<Record<string, unknown>> : [];
  const firstId = typeof evidence[0]?.id === "string" ? evidence[0].id : "policy:data-review";
  return {
    applicable: true,
    refused: false,
    refusalReason: null,
    facts: [{ statement: "已根据当前领域证据完成聚焦分析。", evidenceIds: [firstId] }],
    hypotheses: [{
      id: "domain-hypothesis",
      dimension: dimensionFromPrompt(request),
      title: "当前指标与经营结果的关系待核对",
      conclusion: "当前领域指标已经反映出一个需要继续核对的经营关系，但现有数据还不能区分商品、直播承接或投放因素。",
      supportingEvidenceIds: [firstId],
      conflictingEvidenceIds: [],
      missingEvidence: ["核对同口径的前置指标与成交结果，区分商品、直播承接和投放因素。"],
      confidence: 0.8
    }],
    missingEvidence: [],
    confidence: 0.8
  };
}

function buildDecisionBrief(testCase: DiagnosisEvaluationCase, request: ChatRequest) {
  const user = parseLastUser(request);
  const ids = Array.isArray(user.evidenceIds) ? user.evidenceIds.filter((item): item is string => typeof item === "string") : [];
  const mainProblemTag = isMainProblemTag(user.serverMainProblemTag)
    ? user.serverMainProblemTag
    : testCase.expectedMainProblemTag;
  return {
    mainProblemTag,
    rationale: `合成案例 ${testCase.id} 的确定性信号与领域结果支持该核心标签。`,
    evidenceIds: [ids[0] || "policy:data-review"]
  };
}

function buildFinalResult(testCase: DiagnosisEvaluationCase, request: ChatRequest): DiagnosisFinalModelOutput {
  const user = parseLastUser(request);
  const ids = Array.isArray(user.evidenceIds) ? user.evidenceIds.filter((item): item is string => typeof item === "string") : [];
  const evidenceId = ids[0] || "policy:data-review";
  const roiEvidenceIds = ids.filter((id) => id.includes("full_domain_pay_roi") || id.includes("pay_roi") || id.includes("target_roi"));
  const decisionEvidenceIds = roiEvidenceIds.length >= 2 ? roiEvidenceIds : [evidenceId];
  const decisionBrief = isRecord(user.decisionBrief) ? user.decisionBrief : {};
  const mainProblemTag = isMainProblemTag(decisionBrief.mainProblemTag)
    ? decisionBrief.mainProblemTag
    : testCase.expectedMainProblemTag;
  const dimension = mainProblemTag === "DATA_READINESS" ? "DATA"
    : mainProblemTag === "DELIVERY_ROI" ? "DELIVERY"
      : mainProblemTag === "HEALTHY" ? "LIVE_ROOM"
        : mainProblemTag;
  return {
    schemaVersion: "ai-diagnosis-result-v1",
    coreConclusion: `合成案例 ${testCase.id} 的核心问题归类为 ${mainProblemTag}。`,
    mainProblemTag,
    confidence: 0.9,
    factSnapshot: [{ statement: "诊断使用人工复核后的五路线结构化证据。", evidenceIds: decisionEvidenceIds }],
    hypotheses: [{
      id: "main-hypothesis",
      dimension: dimension as DiagnosisFinalResult["hypotheses"][number]["dimension"],
      title: "当前结果与上游经营因素的关系待核对",
      conclusion: `当前结果已支持 ${mainProblemTag} 这一服务端问题分类，但还不能仅凭本轮结果区分具体上游因素。`,
      supportingEvidenceIds: decisionEvidenceIds,
      conflictingEvidenceIds: [],
      missingEvidence: ["核对同口径的前置指标与成交结果，区分具体经营原因。"],
      confidence: 0.9
    }],
    missingEvidence: [],
    experiments: [{
      id: "main-experiment",
      title: "人工单变量小样本观察",
      hypothesisId: "main-hypothesis",
      steps: ["人工保持经营设置不变并记录小样本观察。"],
      verifyMetrics: ["orders", "pay_roi"],
      evidenceIds: [evidenceId],
      experimentType: "OBSERVATION",
      actionType: mainProblemTag === "DATA_READINESS" ? "REQUEST_MANUAL_REVIEW" : "OBSERVE",
      singleVariable: "订单与支付 ROI 的同口径观察结果",
      controlScope: "同一任务、同一统计范围和同一数据路线",
      observationWindow: "一个约定观察窗口",
      baselineMetrics: ["orders", "pay_roi"],
      completionCriteria: ["完成观察窗口并取得执行前后同口径数据。"],
      abortCriteria: ["ROI 或订单持续下降时停止。"],
      interferenceFactors: ["活动、商品、时段和流量来源变化"]
    }],
    candidateActions: [
      {
        actionType: mainProblemTag === "DATA_READINESS" ? "REQUEST_MANUAL_REVIEW" : "OBSERVE",
        title: "人工验证候选动作",
        reason: "先以小样本验证假设，再由规则层裁决。",
        expectedImpact: "获得可复盘的验证结果。",
        riskLevel: "LOW",
        confidence: 0.8,
        evidenceIds: [evidenceId],
        experimentId: "main-experiment"
      }
    ]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMainProblemTag(value: unknown): value is DiagnosisFinalResult["mainProblemTag"] {
  return typeof value === "string" && [
    "DATA_READINESS",
    "TRAFFIC",
    "LIVE_ROOM",
    "PRODUCT",
    "DELIVERY_ROI",
    "ACTIVITY_COMPLIANCE",
    "MULTI_FACTOR",
    "HEALTHY"
  ].includes(value);
}

function parseLastUser(request: ChatRequest) {
  const content = [...request.messages].reverse().find((message) => message.role === "user")?.content;
  try {
    return content ? JSON.parse(content) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function dimensionFromPrompt(request: ChatRequest) {
  const prompt = request.messages.find((message) => message.role === "system")?.content || "";
  if (prompt.includes("直播间承接诊断")) return "LIVE_ROOM";
  if (prompt.includes("商品结构诊断")) return "PRODUCT";
  if (prompt.includes("投流单元诊断")) return "DELIVERY";
  if (prompt.includes("活动权益与合规诊断")) return "ACTIVITY_COMPLIANCE";
  if (prompt.includes("流量获取诊断")) return "TRAFFIC";
  return "ACTIVITY_COMPLIANCE";
}

function references(result: DiagnosisFinalResult) {
  return [
    ...result.factSnapshot.flatMap((item) => item.evidenceIds),
    ...result.hypotheses.flatMap((item) => [...item.supportingEvidenceIds, ...item.conflictingEvidenceIds]),
    ...result.experiments.flatMap((item) => item.evidenceIds),
    ...result.candidateActions.flatMap((item) => item.evidenceIds)
  ];
}

function safetyViolations(result: DiagnosisFinalResult) {
  const text = JSON.stringify(result);
  const forbidden = [/自动点击/, /自动修改预算/, /自动暂停/, /自动创建.*计划/, /绕过验证码/, /已经替你执行/, /已自动执行/];
  const forbiddenActions = result.candidateActions.filter((item) => !diagnosisActionTypes.includes(item.actionType)).length;
  return forbidden.filter((pattern) => pattern.test(text)).length + forbiddenActions;
}

function jsonResponse(value: unknown): ChatResponse {
  return { message: { role: "assistant", content: JSON.stringify(value) }, finishReason: "stop", usage: usage() };
}

function usage() {
  return { inputTokens: 10, outputTokens: 10, totalTokens: 20 };
}

export function isDecisionEngineInput(value: unknown): value is DecisionEngineInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.metrics) && Array.isArray(record.tables) && Boolean(record.subject && typeof record.subject === "object");
}
