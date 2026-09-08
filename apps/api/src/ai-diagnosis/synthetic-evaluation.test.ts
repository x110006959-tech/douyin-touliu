import { describe, expect, it, vi } from "vitest";
import { buildDiagnosisEvidenceCatalog, createDiagnosisSkillPlan, syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import type { DecisionEngineInput } from "@douyin-local-life/shared";
import { createSyntheticDiagnosisTransport, evaluateSyntheticDiagnosisSuite, evaluateSyntheticFailureDisplaySuite } from "./synthetic-evaluation.js";
import {
  buildDecisionRunDeterministicReview,
  buildDeterministicDiagnosticSignals,
  determineMainProblemTag,
  normalizeDiagnosisModelOutput,
  orchestrateDiagnosis
} from "./orchestrator.js";

describe("24-case synthetic diagnosis evaluation", () => {
  it("passes structure, hit-rate, evidence and safety gates with the scripted provider", async () => {
    const report = await evaluateSyntheticDiagnosisSuite(createSyntheticDiagnosisTransport);
    expect(report.total).toBe(24);
    expect(report.structurePassRate).toBe(1);
    expect(report.mainProblemHitRate).toBeGreaterThanOrEqual(0.8);
    expect(report.hallucinatedEvidence).toBe(0);
    expect(report.safetyViolations).toBe(0);
    expect(report.factsAvailable).toBe(24);
    expect(report.groundedConclusions).toBe(24);
    expect(report.policyAccepted + report.policyRejected).toBe(24);
  });

  it("preserves independent facts when final synthesis fails after domain analysis", async () => {
    const report = await evaluateSyntheticFailureDisplaySuite();
    expect(report.structurePassed).toBe(0);
    expect(report.partialFailureFactsPreserved).toBe(24);
    expect(report.policyAccepted).toBe(0);
    expect(report.details.every((item) => item.actualMainProblemTag === null && item.error !== null)).toBe(true);
  });

  it("executes the server-fixed plan once without exposing Skill planning tools or cases to the model", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const skillPlan = createDiagnosisSkillPlan(testCase.input);
    const base = createSyntheticDiagnosisTransport(testCase);
    const requests: Array<{ tools?: unknown; tool_choice?: unknown }> = [];
    const completedSkills: string[] = [];
    const retrieveSimilarCases = vi.fn(async () => [{
      id: "eligible-case",
      mainProblemTag: "HEALTHY",
      summary: "同类任务保持稳定",
      actionTypes: ["OBSERVE" as const],
      outcome: "IMPROVED",
      score: 0.9
    }]);
    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      skillPlan,
      similarCases: [{
        id: "legacy-case",
        mainProblemTag: "HEALTHY",
        summary: "兼容参数不参与第一阶段正式诊断",
        actionTypes: ["OBSERVE"],
        outcome: "IMPROVED",
        score: 0.9
      }],
      retrieveSimilarCases,
      transport: {
        ...base,
        async chat(request) {
          requests.push(request);
          return base.chat(request);
        }
      },
      onSkillEvent: async (event) => {
        if (event.status === "SUCCEEDED") completedSkills.push(event.skillId);
      }
    });
    expect(completedSkills).toEqual([skillPlan.auditSkillId, ...skillPlan.domainSkillIds]);
    expect(new Set(completedSkills).size).toBe(completedSkills.length);
    expect(requests).not.toHaveLength(0);
    expect(requests.every((request) => request.tools === undefined && request.tool_choice === undefined)).toBe(true);
    expect(retrieveSimilarCases).not.toHaveBeenCalled();
    expect(execution.skillOutputs.some((output) => output.skillId === "retrieve_similar_cases")).toBe(false);
    expect(execution.evidenceCatalog.some((item) => item.kind === "CASE")).toBe(false);
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

  it("normalizes metric objects and fills an omitted experiment baseline from verify metrics", () => {
    expect(normalizeDiagnosisModelOutput({
      experiments: [{
        verifyMetrics: [{ name: "商品点击次数" }, { metricKey: "transaction_users" }],
        baselineMetrics: []
      }]
    })).toEqual({
      experiments: [{
        verifyMetrics: ["商品点击次数", "transaction_users"],
        baselineMetrics: ["商品点击次数", "transaction_users"]
      }]
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

  it("does not require traffic-tab fields from the released two-route evidence layer", () => {
    const base = syntheticDiagnosisCases[0]!;
    const capturedAt = new Date().toISOString();
    const input: DecisionEngineInput = {
      ...base.input,
      metrics: [
        ...base.input.metrics.filter((item) => ["live_viewers", "orders", "gpm", "spend"].includes(String(item.key))),
        { key: "full_domain_pay_roi" as const, name: "全域支付 ROI", value: 35.1, source: "table" as const, confidence: 1 }
      ],
      tables: [],
      collectionQuality: {
        requiredRoutes: ["LIVE_DATA_SCREEN", "LOCAL_PROMOTION_DASHBOARD"],
        routes: [
          { routeKey: "LIVE_DATA_SCREEN" as const, state: "FRESH" as const, lastCollectedAt: capturedAt, ageMs: 0 },
          { routeKey: "LOCAL_PROMOTION_DASHBOARD" as const, state: "FRESH" as const, lastCollectedAt: capturedAt, ageMs: 0 }
        ],
        completeness: 1,
        missingRoutes: [],
        staleRoutes: [],
        blocksStrongActions: false
      }
    };

    const signals = buildDeterministicDiagnosticSignals(buildDiagnosisEvidenceCatalog(input));
    expect(signals.missingCoreMetrics).toEqual([]);
    expect(signals.delivery.payRoi).toBe(35.1);
    expect(signals.comparisonGaps).toContain("缺少本场明确的投放目标 ROI，当前只能展示实际产出，不能判定是否达标");
    expect(signals.comparisonGaps.some((item) => item.includes("近期") && item.includes("趋势"))).toBe(true);
    expect(signals.comparisonGaps.join(" ")).not.toContain("同直播类型");
  });

  it("uses the task target ROI to judge whether full-domain delivery reached the goal", () => {
    const base = syntheticDiagnosisCases[0]!;
    const input: DecisionEngineInput = {
      ...base.input,
      targetRoi: 50,
      metrics: [
        ...base.input.metrics.filter((item) => String(item.key) !== "target_roi" && String(item.key) !== "full_domain_pay_roi"),
        { key: "full_domain_pay_roi", name: "全域支付 ROI", value: 44.54, source: "network", confidence: 1 },
        { key: "target_roi", name: "目标 ROI", value: 50, source: "manual", metricSource: "MANUAL_INPUT", confidence: 1 }
      ]
    };

    const signals = buildDeterministicDiagnosticSignals(buildDiagnosisEvidenceCatalog(input));
    expect(signals.delivery).toMatchObject({ payRoi: 44.54, targetRoi: 50, weak: true });
    expect(determineMainProblemTag(signals)).toBe("DELIVERY_ROI");
    expect(signals.comparisonGaps.join(" ")).not.toContain("缺少本场明确的投放目标 ROI");
  });

  it("parses a stored numeric-string target on the local-promotion route and corrects a conflicting historical presentation", () => {
    const base = syntheticDiagnosisCases[0]!;
    const input: DecisionEngineInput = {
      ...base.input,
      targetRoi: 60,
      metrics: [
        ...base.input.metrics.filter((item) => String(item.key) !== "target_roi" && String(item.key) !== "full_domain_pay_roi"),
        { key: "target_roi", name: "错误路线目标", value: 999, source: "network", confidence: 1, rawEvidence: { sourceType: "test", routeKey: "LIVE_DATA_SCREEN" } },
        { key: "full_domain_pay_roi", name: "全域支付 ROI", value: 44.59, source: "network", confidence: 1, rawEvidence: { sourceType: "test", routeKey: "LOCAL_PROMOTION_DASHBOARD" } },
        { key: "target_roi", name: "目标 ROI", value: "60", source: "manual", metricSource: "MANUAL_INPUT", confidence: 1, rawEvidence: { sourceType: "test", routeKey: "LOCAL_PROMOTION_DASHBOARD" } }
      ]
    };
    const signals = buildDeterministicDiagnosticSignals(buildDiagnosisEvidenceCatalog(input));
    const conflictingResult = {
      schemaVersion: "ai-diagnosis-result-v1" as const,
      coreConclusion: "当前未发现明确异常，缺少目标 ROI。",
      mainProblemTag: "HEALTHY" as const,
      confidence: 0.7,
      factSnapshot: [{ statement: "已有经营数据。", evidenceIds: ["policy:data-review"] }],
      hypotheses: [{
        id: "H1",
        dimension: "LIVE_ROOM" as const,
        title: "直播承接待观察",
        conclusion: "缺少历史趋势。",
        supportingEvidenceIds: ["policy:data-review"],
        conflictingEvidenceIds: [],
        missingEvidence: [],
        confidence: 0.5
      }],
      missingEvidence: [],
      experiments: [],
      stopConditions: ["证据不足时停止。"],
      candidateActions: []
    };

    expect(signals.delivery).toMatchObject({ payRoi: 44.59, targetRoi: 60, weak: true });
    expect(determineMainProblemTag(signals)).toBe("DELIVERY_ROI");
    expect(buildDecisionRunDeterministicReview(input, conflictingResult)).toEqual({
      status: "CONFLICT",
      expectedMainProblemTag: "DELIVERY_ROI",
      conclusion: "服务端复核确认：全域支付 ROI 为 44.59，低于本次目标 ROI 60，应优先检查投放产出。原 AI 核心结论与已知目标冲突，本轮动作建议已暂停。"
    });
  });

  it("repairs a final result that ignores the known ROI and target pair", async () => {
    const sourceCase = syntheticDiagnosisCases[0]!;
    const input: DecisionEngineInput = {
      ...sourceCase.input,
      targetRoi: 60,
      metrics: [
        ...sourceCase.input.metrics.filter((item) => String(item.key) !== "target_roi" && String(item.key) !== "full_domain_pay_roi"),
        { key: "full_domain_pay_roi", name: "全域支付 ROI", value: 44.59, source: "network", confidence: 1, rawEvidence: { sourceType: "test", routeKey: "LOCAL_PROMOTION_DASHBOARD" } },
        { key: "target_roi", name: "目标 ROI", value: 60, source: "manual", metricSource: "MANUAL_INPUT", confidence: 1, rawEvidence: { sourceType: "test", routeKey: "LOCAL_PROMOTION_DASHBOARD" } }
      ]
    };
    const testCase = { id: "roi-below-explicit-target", expectedMainProblemTag: "DELIVERY_ROI" as const, input };
    const base = createSyntheticDiagnosisTransport(testCase);
    let invalidInjected = false;
    let repairRequestContent = "";
    let validFinalResponse: Awaited<ReturnType<typeof base.chat>> | null = null;

    const execution = await orchestrateDiagnosis({
      decisionInput: input,
      skillPlan: createDiagnosisSkillPlan(input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          if (!system.includes("诊断综合器")) return base.chat(request);
          const isRepair = request.messages.some((message) => message.role === "user"
            && typeof message.content === "string"
            && message.content.includes("repairInstruction"));
          if (isRepair && validFinalResponse) {
            repairRequestContent = request.messages.at(-1)?.content || "";
            return validFinalResponse;
          }
          const response = await base.chat(request);
          if (invalidInjected || !response.message.content) return response;
          invalidInjected = true;
          validFinalResponse = response;
          const value = JSON.parse(response.message.content) as Record<string, unknown>;
          value.coreConclusion = "缺少支付金额和客单价，无法计算实际 ROI 是否达到目标 60。";
          value.missingEvidence = ["缺少支付金额或客单价数据，无法计算实际 ROI"];
          return { ...response, message: { ...response.message, content: JSON.stringify(value) } };
        }
      }
    });

    expect(invalidInjected).toBe(true);
    expect(repairRequestContent).toContain("DIAGNOSIS_DETERMINISTIC_CONFLICT");
    expect(repairRequestContent).toContain("全域支付 ROI 为 44.59，目标 ROI 为 60");
    expect(execution.result.mainProblemTag).toBe("DELIVERY_ROI");
    expect(JSON.stringify(execution.result)).not.toContain("缺少支付金额");
  });

  it("accepts an explicit inability to judge funnel loss without treating it as an affirmative claim", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const base = createSyntheticDiagnosisTransport(testCase);
    let synthesisCalls = 0;

    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      skillPlan: createDiagnosisSkillPlan(testCase.input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          const response = await base.chat(request);
          if (!system.includes("诊断综合器") || !response.message.content) return response;
          synthesisCalls += 1;
          const value = JSON.parse(response.message.content) as Record<string, unknown>;
          const hypotheses = value.hypotheses as Array<Record<string, unknown>>;
          hypotheses[0]!.title = "直播承接暂时无法判断";
          hypotheses[0]!.conclusion = "缺少可比的观看与点击前置数据，无法判断承接漏斗是否存在流失。";
          return { ...response, message: { ...response.message, content: JSON.stringify(value) } };
        }
      }
    });

    expect(synthesisCalls).toBe(1);
    expect(execution.result.hypotheses[0]?.conclusion).toContain("无法判断承接漏斗是否存在流失");
  });

  it("drops a cross-domain live-room hypothesis without spending a repair request", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const input: DecisionEngineInput = {
      ...testCase.input,
      metrics: testCase.input.metrics.map((metric) => ({
        ...metric,
        rawEvidence: {
          sourceType: "test",
          routeKey: ["live_viewers", "orders", "gpm"].includes(String(metric.key))
            ? "LIVE_DATA_SCREEN"
            : ["spend", "pay_roi", "target_roi"].includes(String(metric.key))
              ? "LOCAL_PROMOTION_DASHBOARD"
              : "LIVE_TRAFFIC_TAB"
        }
      }))
    };
    const routedCase = { ...testCase, input };
    const base = createSyntheticDiagnosisTransport(routedCase);
    let liveSkillCalls = 0;
    let crossDomainInjected = false;

    const execution = await orchestrateDiagnosis({
      decisionInput: input,
      skillPlan: createDiagnosisSkillPlan(input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          if (!system.includes("直播间承接诊断")) return base.chat(request);
          liveSkillCalls += 1;
          const response = await base.chat(request);
          if (crossDomainInjected || !response.message.content) return response;
          crossDomainInjected = true;
          const value = JSON.parse(response.message.content) as Record<string, unknown>;
          const hypotheses = value.hypotheses as Array<Record<string, unknown>>;
          hypotheses[0]!.dimension = "DELIVERY";
          return { ...response, message: { ...response.message, content: JSON.stringify(value) } };
        }
      }
    });

    const liveOutput = execution.skillOutputs.find((item) => item.skillId === "diagnose_live_room_conversion");
    expect(crossDomainInjected).toBe(true);
    expect(liveSkillCalls).toBe(1);
    expect(liveOutput?.hypotheses.every((item) => item.dimension === "LIVE_ROOM")).toBe(true);
    expect(JSON.stringify(liveOutput)).not.toContain('"dimension":"DELIVERY"');
  });

  it("repairs a live-room domain result with an unsupported derived metric", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const input: DecisionEngineInput = {
      ...testCase.input,
      metrics: testCase.input.metrics.map((metric) => ({
        ...metric,
        rawEvidence: {
          sourceType: "test",
          routeKey: ["live_viewers", "orders", "gpm"].includes(String(metric.key))
            ? "LIVE_DATA_SCREEN"
            : ["spend", "pay_roi", "target_roi"].includes(String(metric.key))
              ? "LOCAL_PROMOTION_DASHBOARD"
              : "LIVE_TRAFFIC_TAB"
        }
      }))
    };
    const routedCase = { ...testCase, input };
    const base = createSyntheticDiagnosisTransport(routedCase);
    let invalidInjected = false;
    let repairRequestContent = "";
    let validResponse: Awaited<ReturnType<typeof base.chat>> | null = null;

    await orchestrateDiagnosis({
      decisionInput: input,
      skillPlan: createDiagnosisSkillPlan(input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          if (!system.includes("直播间承接诊断")) return base.chat(request);
          const isRepair = request.messages.some((message) => message.role === "user"
            && typeof message.content === "string"
            && message.content.includes("repairInstruction"));
          if (isRepair && validResponse) {
            repairRequestContent = request.messages.at(-1)?.content || "";
            return validResponse;
          }
          const response = await base.chat(request);
          if (invalidInjected || !response.message.content) return response;
          invalidInjected = true;
          validResponse = response;
          const value = JSON.parse(response.message.content) as Record<string, unknown>;
          const hypotheses = value.hypotheses as Array<Record<string, unknown>>;
          hypotheses[0]!.conclusion = "推测客单价约35.68元（342508/9600），仅供参考。";
          return { ...response, message: { ...response.message, content: JSON.stringify(value) } };
        }
      }
    });

    expect(invalidInjected).toBe(true);
    expect(repairRequestContent).toContain("DIAGNOSIS_DERIVED_METRIC_UNSUPPORTED");
  });

  it("repairs unsupported universal benchmark wording before accepting a diagnosis", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const base = createSyntheticDiagnosisTransport(testCase);
    let invalidInjected = false;
    let repairRequestSeen = false;
    let repairRequestContent = "";
    let validFinalResponse: Awaited<ReturnType<typeof base.chat>> | null = null;

    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      skillPlan: createDiagnosisSkillPlan(testCase.input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          if (!system.includes("诊断综合器")) return base.chat(request);
          const isRepair = request.messages.some((message) => message.role === "user"
            && typeof message.content === "string"
            && message.content.includes("repairInstruction"));
          if (isRepair && validFinalResponse) {
            repairRequestSeen = true;
            repairRequestContent = request.messages.at(-1)?.content || "";
            return validFinalResponse;
          }
          const response = await base.chat(request);
          if (invalidInjected || !response.message.content) return response;
          invalidInjected = true;
          validFinalResponse = response;
          const value = JSON.parse(response.message.content) as Record<string, unknown>;
          value.coreConclusion = "当前转化低于行业平均和健康水平，通常应达到 35% 以上。";
          return { ...response, message: { ...response.message, content: JSON.stringify(value) } };
        }
      }
    });

    expect(invalidInjected).toBe(true);
    expect(repairRequestSeen).toBe(true);
    expect(repairRequestContent).toContain("DIAGNOSIS_BENCHMARK_UNSUPPORTED");
    expect(repairRequestContent).toContain("未经本轮证据支持的行业阈值");
    expect(JSON.stringify(execution.result)).not.toContain("行业平均");
    expect(JSON.stringify(execution.result)).not.toContain("健康水平");
  });

  it("repairs qualitative good-or-bad wording when no target, history, or benchmark supports it", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const base = createSyntheticDiagnosisTransport(testCase);
    let repairRequestContent = "";
    let validFinalResponse: Awaited<ReturnType<typeof base.chat>> | null = null;

    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      skillPlan: createDiagnosisSkillPlan(testCase.input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          if (!system.includes("诊断综合器")) return base.chat(request);
          const isRepair = request.messages.some((message) => message.role === "user"
            && typeof message.content === "string"
            && message.content.includes("repairInstruction"));
          if (isRepair && validFinalResponse) {
            repairRequestContent = request.messages.at(-1)?.content || "";
            return validFinalResponse;
          }
          const response = await base.chat(request);
          if (validFinalResponse || !response.message.content) return response;
          validFinalResponse = response;
          const value = JSON.parse(response.message.content) as Record<string, unknown>;
          value.coreConclusion = "当前直播间成交表现良好，但人均观看时长有限。";
          return { ...response, message: { ...response.message, content: JSON.stringify(value) } };
        }
      }
    });

    expect(repairRequestContent).toContain("DIAGNOSIS_BENCHMARK_UNSUPPORTED");
    expect(repairRequestContent).toContain("比较性好坏判断");
    expect(JSON.stringify(execution.result)).not.toContain("成交表现良好");
    expect(JSON.stringify(execution.result)).not.toContain("观看时长有限");
  });

  it("repairs qualitative good-or-bad wording returned by a domain Skill", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const base = createSyntheticDiagnosisTransport(testCase);
    let domainResponse: Awaited<ReturnType<typeof base.chat>> | null = null;
    let domainInvalidInjected = false;
    let domainRepairRequest = "";

    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      skillPlan: createDiagnosisSkillPlan(testCase.input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          const isDomain = system.includes("业务诊断 Skill");
          const isRepair = request.messages.some((message) => message.role === "user"
            && typeof message.content === "string"
            && message.content.includes("repairInstruction"));
          if (isDomain && isRepair && domainResponse) {
            domainRepairRequest = request.messages.at(-1)?.content || "";
            return domainResponse;
          }
          const response = await base.chat(request);
          if (!isDomain || domainInvalidInjected) return response;
          domainResponse = response;
          domainInvalidInjected = true;
          const value = JSON.parse(response.message.content!) as Record<string, unknown>;
          const facts = value.facts as Array<Record<string, unknown>>;
          facts[0]!.statement = "当前直播间成交表现良好，但人均观看时长有限。";
          return { ...response, message: { ...response.message, content: JSON.stringify(value) } };
        }
      }
    });

    expect(domainInvalidInjected).toBe(true);
    expect(domainRepairRequest).toContain("DIAGNOSIS_BENCHMARK_UNSUPPORTED");
    expect(domainRepairRequest).toContain("暂不能判断");
    expect(JSON.stringify(execution.skillOutputs)).not.toContain("成交表现良好");
    expect(JSON.stringify(execution.skillOutputs)).not.toContain("观看时长有限");
  });

  it("neutralizes a repeated domain comparison violation without bypassing validation", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const base = createSyntheticDiagnosisTransport(testCase);
    let domainCalls = 0;
    let repeatedInvalidResponse: Awaited<ReturnType<typeof base.chat>> | null = null;
    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      skillPlan: createDiagnosisSkillPlan(testCase.input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          const isDomain = system.includes("业务诊断 Skill");
          const isRepair = request.messages.some((message) => message.role === "user"
            && typeof message.content === "string"
            && message.content.includes("repairInstruction"));
          if (isDomain && isRepair && repeatedInvalidResponse) {
            domainCalls += 1;
            return repeatedInvalidResponse;
          }
          const response = await base.chat(request);
          if (!isDomain || repeatedInvalidResponse) return response;
          domainCalls += 1;
          const value = JSON.parse(response.message.content!) as Record<string, unknown>;
          const facts = value.facts as Array<Record<string, unknown>>;
          facts[0]!.statement = "当前直播间成交表现良好，但人均观看时长有限。";
          repeatedInvalidResponse = { ...response, message: { ...response.message, content: JSON.stringify(value) } };
          return repeatedInvalidResponse;
        }
      }
    });

    expect(domainCalls).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(execution.skillOutputs)).not.toContain("成交表现良好");
    expect(JSON.stringify(execution.skillOutputs)).not.toContain("观看时长有限");
    expect(JSON.stringify(execution.skillOutputs)).toContain("暂不能判断");
  });

  it.each([
    {
      stage: "领域 Skill",
      marker: "业务诊断 Skill",
      invalidate(value: Record<string, unknown>) {
        value.facts = [{ statement: "引用了拼写错误的证据", evidenceIds: ["metric:invented"] }];
      }
    },
    {
      stage: "核心裁决",
      marker: "核心问题裁决器",
      invalidate(value: Record<string, unknown>) {
        value.evidenceIds = ["metric:invented"];
      }
    },
    {
      stage: "最终综合",
      marker: "诊断综合器",
      invalidate(value: Record<string, unknown>) {
        value.factSnapshot = [{ statement: "引用了拼写错误的证据", evidenceIds: ["metric:invented"] }];
      }
    }
  ])("repairs a typoed evidence id in $stage before accepting the output", async ({ marker, invalidate }) => {
    const testCase = syntheticDiagnosisCases[0]!;
    const base = createSyntheticDiagnosisTransport(testCase);
    let invalidInjected = false;
    let repairRequestSeen = false;
    let validTargetResponse: Awaited<ReturnType<typeof base.chat>> | null = null;

    const execution = await orchestrateDiagnosis({
      decisionInput: testCase.input,
      skillPlan: createDiagnosisSkillPlan(testCase.input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          const isRepair = request.messages.some((message) => message.role === "user"
            && typeof message.content === "string"
            && message.content.includes("repairInstruction"));
          if (!system.includes(marker)) return base.chat(request);
          if (isRepair && validTargetResponse) {
            repairRequestSeen = true;
            return validTargetResponse;
          }
          const response = await base.chat(request);
          if (invalidInjected || !response.message.content) return response;
          invalidInjected = true;
          validTargetResponse = response;
          const value = JSON.parse(response.message.content) as Record<string, unknown>;
          invalidate(value);
          return { ...response, message: { ...response.message, content: JSON.stringify(value) } };
        }
      }
    });

    expect(invalidInjected).toBe(true);
    expect(repairRequestSeen).toBe(true);
    expect(JSON.stringify(execution.result)).not.toContain("metric:invented");
    expect(JSON.stringify(execution.skillOutputs)).not.toContain("metric:invented");
  });

  it("rejects Skill output when the one repair still cites evidence outside the selected catalog", async () => {
    const testCase = syntheticDiagnosisCases[0]!;
    const base = createSyntheticDiagnosisTransport(testCase);
    let domainCallCount = 0;
    const failedSkillEvents: Array<{ errorCode?: string; errorMessage?: string }> = [];
    await expect(orchestrateDiagnosis({
      decisionInput: testCase.input,
      skillPlan: createDiagnosisSkillPlan(testCase.input),
      transport: {
        ...base,
        async chat(request) {
          const system = request.messages.find((message) => message.role === "system")?.content || "";
          if (!system.includes("业务诊断 Skill")) return base.chat(request);
          domainCallCount += 1;
          return {
            message: {
              role: "assistant" as const,
              content: JSON.stringify({
                applicable: true,
                refused: false,
                refusalReason: null,
                facts: [{ statement: "引用了不存在的证据", evidenceIds: ["metric:invented"] }],
                hypotheses: [],
                missingEvidence: [],
                confidence: 0.8
              })
            },
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
          };
        }
      },
      onSkillEvent: async (event) => {
        if (event.status === "FAILED") failedSkillEvents.push(event);
      }
    })).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID" });
    expect(domainCallCount).toBe(2);
    expect(failedSkillEvents).toEqual([expect.objectContaining({
      errorCode: "DIAGNOSIS_OUTPUT_INVALID",
      errorMessage: expect.stringContaining("DIAGNOSIS_EVIDENCE_INVALID")
    })]);
  });
});
