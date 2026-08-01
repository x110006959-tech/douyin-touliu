import {
  diagnosisActionTypes,
  type DiagnosisFinalResult
} from "@douyin-local-life/shared/diagnosis";
import { syntheticDiagnosisCases, type SyntheticDiagnosisCase } from "@douyin-local-life/diagnosis-skills";
import type { ChatRequest, ChatResponse, ChatToolCall, ChatTransport } from "@douyin-local-life/llm";
import type { DecisionEngineInput } from "@douyin-local-life/shared";
import { aiDiagnosisTimeoutMs } from "./config.js";
import { orchestrateDiagnosis } from "./orchestrator.js";

export type DiagnosisEvaluationCase = Pick<SyntheticDiagnosisCase, "id" | "expectedMainProblemTag" | "input">;
type DiagnosisEvaluationDetail = {
  id: string;
  expectedMainProblemTag: DiagnosisFinalResult["mainProblemTag"];
  actualMainProblemTag: DiagnosisFinalResult["mainProblemTag"] | null;
  structurePassed: boolean;
  mainProblemHit: boolean;
  hallucinatedEvidence: number;
  safetyViolations: number;
  skillExecutions: Array<{ skillId: string; status: string; durationMs: number | null; totalTokens: number | null }>;
  error: string | null;
};

export function createSyntheticDiagnosisTransport(testCase: DiagnosisEvaluationCase): ChatTransport {
  return {
    provider: "fake",
    model: "synthetic-diagnosis-v1",
    async chat(request) {
      if (request.tools?.length) return toolResponse(request);
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
    details
  };
}

async function evaluateOneCase(testCase: DiagnosisEvaluationCase, transport: ChatTransport): Promise<DiagnosisEvaluationDetail> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), aiDiagnosisTimeoutMs());
  const skillExecutions: DiagnosisEvaluationDetail["skillExecutions"] = [];
  try {
    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      similarCases: [],
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
    return {
      id: testCase.id,
      expectedMainProblemTag: testCase.expectedMainProblemTag,
      actualMainProblemTag: execution.result.mainProblemTag,
      structurePassed: true,
      mainProblemHit: execution.result.mainProblemTag === testCase.expectedMainProblemTag,
      hallucinatedEvidence: referenced.filter((id) => !validEvidence.has(id)).length,
      safetyViolations: safetyViolations(execution.result),
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
      skillExecutions,
      error: error instanceof Error ? error.message : "unknown error"
    };
  } finally {
    clearTimeout(timer);
  }
}

function toolResponse(request: ChatRequest): ChatResponse {
  if (request.messages.some((message) => message.role === "tool")) {
    return { message: { role: "assistant", content: "可综合" }, finishReason: "stop", usage: usage() };
  }
  const forcedName = typeof request.tool_choice === "object" ? request.tool_choice.function.name : null;
  const selected = forcedName
    ? request.tools!.filter((tool) => tool.function.name === forcedName)
    : request.tools!;
  const calls: ChatToolCall[] = selected.map((tool, index) => ({
    id: `fake-tool-${tool.function.name}-${index}`,
    type: "function",
    function: { name: tool.function.name, arguments: "{}" }
  }));
  return { message: { role: "assistant", content: null, reasoning_content: "not persisted", tool_calls: calls }, finishReason: "tool_calls", usage: usage() };
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
      title: "领域主问题假设",
      conclusion: "当前证据支持该领域存在需要验证的经营问题。",
      supportingEvidenceIds: [firstId],
      conflictingEvidenceIds: [],
      missingEvidence: [],
      confidence: 0.8
    }],
    missingEvidence: [],
    experiments: [{
      id: "domain-experiment",
      title: "单变量验证",
      hypothesisId: "domain-hypothesis",
      steps: ["保持其他变量不变，由人工执行一轮小样本验证。"],
      verifyMetrics: ["orders"],
      stopConditions: ["关键指标连续下降时停止。"],
      evidenceIds: [firstId]
    }],
    candidateActions: [],
    confidence: 0.8
  };
}

function buildDecisionBrief(testCase: DiagnosisEvaluationCase, request: ChatRequest) {
  const user = parseLastUser(request);
  const ids = Array.isArray(user.evidenceIds) ? user.evidenceIds.filter((item): item is string => typeof item === "string") : [];
  return {
    mainProblemTag: testCase.expectedMainProblemTag,
    rationale: `合成案例 ${testCase.id} 的确定性信号与领域结果支持该核心标签。`,
    evidenceIds: [ids[0] || "policy:data-review"]
  };
}

function buildFinalResult(testCase: DiagnosisEvaluationCase, request: ChatRequest): DiagnosisFinalResult {
  const user = parseLastUser(request);
  const ids = Array.isArray(user.evidenceIds) ? user.evidenceIds.filter((item): item is string => typeof item === "string") : [];
  const evidenceId = ids[0] || "policy:data-review";
  const dimension = testCase.expectedMainProblemTag === "DATA_READINESS" ? "DATA"
    : testCase.expectedMainProblemTag === "DELIVERY_ROI" ? "DELIVERY"
      : testCase.expectedMainProblemTag === "HEALTHY" ? "LIVE_ROOM"
        : testCase.expectedMainProblemTag;
  return {
    schemaVersion: "ai-diagnosis-result-v1",
    coreConclusion: `合成案例 ${testCase.id} 的核心问题归类为 ${testCase.expectedMainProblemTag}。`,
    mainProblemTag: testCase.expectedMainProblemTag,
    confidence: 0.9,
    factSnapshot: [{ statement: "诊断使用人工复核后的五路线结构化证据。", evidenceIds: [evidenceId] }],
    hypotheses: [{
      id: "main-hypothesis",
      dimension: dimension as DiagnosisFinalResult["hypotheses"][number]["dimension"],
      title: "核心问题假设",
      conclusion: `主要问题为 ${testCase.expectedMainProblemTag}。`,
      supportingEvidenceIds: [evidenceId],
      conflictingEvidenceIds: [],
      missingEvidence: [],
      confidence: 0.9
    }],
    missingEvidence: [],
    experiments: [{
      id: "main-experiment",
      title: "人工单变量小样本验证",
      hypothesisId: "main-hypothesis",
      steps: ["人工保持其他变量不变并执行小样本验证。"],
      verifyMetrics: ["orders", "pay_roi"],
      stopConditions: ["ROI 或订单持续下降时停止。"],
      evidenceIds: [evidenceId]
    }],
    stopConditions: ["证据过期、路线变化或风险指标恶化时停止。"],
    candidateActions: [
      {
        actionType: testCase.expectedMainProblemTag === "DATA_READINESS" ? "REQUEST_MANUAL_REVIEW" : "OBSERVE",
        title: "人工验证候选动作",
        reason: "先以小样本验证假设，再由规则层裁决。",
        expectedImpact: "获得可复盘的验证结果。",
        riskLevel: "LOW",
        confidence: 0.8,
        evidenceIds: [evidenceId],
        experimentId: "main-experiment"
      },
      {
        actionType: "CHECK_LIVE_ROOM",
        title: "人工核对直播承接",
        reason: "核对讲解、商品点击和下单链路。",
        expectedImpact: "确认直播承接假设。",
        riskLevel: "LOW",
        confidence: 0.75,
        evidenceIds: [evidenceId],
        experimentId: "main-experiment"
      },
      {
        actionType: "CHECK_CREATIVE",
        title: "人工核对流量素材",
        reason: "核对曝光到点击的表达一致性。",
        expectedImpact: "确认流量获取假设。",
        riskLevel: "LOW",
        confidence: 0.72,
        evidenceIds: [evidenceId],
        experimentId: "main-experiment"
      }
    ]
  };
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
  if (prompt.includes("流量")) return "TRAFFIC";
  if (prompt.includes("直播间")) return "LIVE_ROOM";
  if (prompt.includes("商品")) return "PRODUCT";
  if (prompt.includes("投流")) return "DELIVERY";
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
