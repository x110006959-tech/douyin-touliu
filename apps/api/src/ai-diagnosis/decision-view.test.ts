import { describe, expect, it } from "vitest";
import { buildDiagnosisEvidenceCatalog, syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import type { DiagnosisFinalResult } from "@douyin-local-life/shared/diagnosis";
import { buildDiagnosisDecisionView, buildTrustedDiagnosisFactsView } from "./decision-view.js";
import { buildDeterministicDiagnosticSignals, determineMainProblemTag } from "./orchestrator.js";

describe("diagnosis decision view", () => {
  it("shows evidence-linked explanations separately from the fixed target facts", () => {
    const input = syntheticDiagnosisCases[0]!.input;
    const evidence = buildDiagnosisEvidenceCatalog(input);
    const metrics = evidence.filter((item) => item.kind === "METRIC");
    const result = minimalResult();
    result.mainProblemTag = determineMainProblemTag(buildDeterministicDiagnosticSignals(evidence, input));
    result.hypotheses = [{ ...result.hypotheses[0]!, title: "成交与承接的待验证联系", conclusion: "已发生的成交不能区分内容承接与商品吸引的贡献，需要商品明细对照。",
      supportingEvidenceIds: [metrics[0]!.id], conflictingEvidenceIds: [metrics[1]!.id], missingEvidence: ["核对同口径商品点击与成交，区分商品吸引和承接问题"] }];
    const view = buildDiagnosisDecisionView(input, result, []);
    expect(view?.analysis).toHaveLength(1);
    expect(view?.analysis[0]).toMatchObject({ title: result.hypotheses[0]!.title, conclusion: result.hypotheses[0]!.conclusion, missingEvidence: result.hypotheses[0]!.missingEvidence });
    expect(view?.analysis[0]?.supportingFacts[0]).toContain(metrics[0]!.label);
    expect(view?.analysis[0]?.conflictingFacts[0]).toContain(metrics[1]!.label);
  });

  it.each(["missing-reference", "policy-only", "adjustment", "benchmark", "unreviewed"])("does not expose %s as an actionable analysis", (kind) => {
    const input = { ...syntheticDiagnosisCases[0]!.input };
    const evidence = buildDiagnosisEvidenceCatalog(input);
    const result = minimalResult();
    result.mainProblemTag = determineMainProblemTag(buildDeterministicDiagnosticSignals(evidence, input));
    result.hypotheses[0]!.supportingEvidenceIds = [evidence.find((item) => item.kind === "METRIC")!.id];
    if (kind === "missing-reference") result.hypotheses[0]!.conflictingEvidenceIds = ["invented"];
    if (kind === "policy-only") result.hypotheses[0]!.supportingEvidenceIds = ["policy:data-review"];
    if (kind === "adjustment") result.hypotheses[0]!.conclusion = "应提高预算后继续观察。";
    if (kind === "benchmark") result.hypotheses[0]!.conclusion = "承接效率低于行业平均。";
    if (kind === "unreviewed") input.dataReviewStatus = "UNREVIEWED";
    expect(buildDiagnosisDecisionView(input, result, [])?.analysis).toEqual([]);
  });

  it("does not present an unreviewed or unsupported input layer as confirmed facts", () => {
    const base = syntheticDiagnosisCases[0]!.input;
    expect(buildTrustedDiagnosisFactsView({ ...base, dataReviewStatus: "UNREVIEWED" })).toBeNull();
    expect(buildTrustedDiagnosisFactsView({ ...base, metricLayer: "REALTIME_API", realtimeEvidenceItems: [] })).toBeNull();
    const unknownSource = buildTrustedDiagnosisFactsView(base);
    expect(unknownSource?.target.status).toBe("UNAVAILABLE");
  });
  it("turns the production ROI gap into one adjudicated next step and hides blocked experiments", () => {
    const base = syntheticDiagnosisCases[0]!.input;
    const input = {
      ...base,
      targetRoi: 60,
      metrics: [
        ...base.metrics.filter((metric) => !["target_roi", "full_domain_pay_roi"].includes(String(metric.key))),
        metric("target_roi", "60"),
        metric("full_domain_pay_roi", 44.59),
        metric("spend", 7674.39)
      ]
    };
    const result: DiagnosisFinalResult & { ruleAdjudication: unknown } = {
      schemaVersion: "ai-diagnosis-result-v1",
      coreConclusion: "ROI 低于目标，应降低出价。",
      mainProblemTag: "DELIVERY_ROI",
      confidence: 0.7,
      factSnapshot: [{ statement: "全域支付 ROI 为 44.59，低于目标 ROI 60。", evidenceIds: ["metric:full_domain_pay_roi:LOCAL_PROMOTION_DASHBOARD:1", "metric:target_roi:LOCAL_PROMOTION_DASHBOARD:0"] }],
      hypotheses: [{
        id: "H1",
        dimension: "DELIVERY",
        title: "投放产出未达目标",
        conclusion: "目标差距已经确认，具体原因仍待定位。",
        supportingEvidenceIds: ["metric:full_domain_pay_roi:LOCAL_PROMOTION_DASHBOARD:1", "metric:target_roi:LOCAL_PROMOTION_DASHBOARD:0"],
        conflictingEvidenceIds: [],
        missingEvidence: ["缺少近期历史趋势，暂不能判断当前表现是在改善还是回落"],
        confidence: 0.8
      }],
      missingEvidence: ["缺少近期历史趋势，暂不能判断当前表现是在改善还是回落"],
      experiments: [
        legacyExperiment("E1", "H1", "调整投放出价或定向实验"),
        legacyExperiment("E2", "H1", "直播状态核对")
      ],
      stopConditions: ["数据口径变化时停止。"],
      candidateActions: [
        candidate("DECREASE_BID", "降低出价", "E1"),
        candidate("CHECK_LIVE_ROOM", "检查直播状态与数据采集", "E2"),
        candidate("OPTIMIZE_SCRIPT", "优化直播脚本", null)
      ],
      ruleAdjudication: {
        accepted: [],
        rejected: [{ candidate: candidate("DECREASE_BID", "降低出价", "E1"), reasonCode: "ACTION_POLICY_BLOCKED", reason: "缺少曝光量、点击量和同口径定位证据" }],
        lifecycleSuppressed: [{ actionType: "OPTIMIZE_SCRIPT", reason: "COOLDOWN" }]
      }
    };

    const view = buildDiagnosisDecisionView(input, result, [{
      id: "proposal-check-live",
      actionType: "CHECK_LIVE_ROOM",
      title: "检查直播状态与数据采集",
      reason: "确认直播是否已结束。",
      riskLevel: "LOW",
      status: "MANUAL_EXECUTED",
      manualExecutedAt: new Date(),
      outcomes: []
    }]);

    expect(view).toMatchObject({
      mainProblemTag: "DELIVERY_ROI",
      headline: "投放产出未达到本次目标",
      targetComparison: { status: "BELOW_TARGET", actual: 44.59, target: 60, absoluteGap: 15.41, achievementRate: 0.7432, relativeShortfall: 0.2568 },
      nextStep: { kind: "OUTCOME_REVIEW", proposalId: "proposal-check-live" },
      primaryExperiment: { id: "E2" }
    });
    expect(view?.conclusion).not.toContain("降低出价");
    expect(view?.blockedActions.map((item) => item.actionType)).toEqual(["DECREASE_BID", "OPTIMIZE_SCRIPT"]);
  });

  it("only confirms the target result for the 209.94 / 200 case and leaves trend and cause separate", () => {
    const base = syntheticDiagnosisCases[0]!.input;
    const input = {
      ...base,
      targetRoi: 200,
      metrics: [
        metric("full_domain_gmv", 42_000),
        metric("spend", 200),
        metric("full_domain_pay_roi", 209.94),
        metric("target_roi", 200),
        metric("gmv", 2_000, "LIVE_DATA_SCREEN"),
        metric("orders", 100, "LIVE_DATA_SCREEN")
      ],
      diagnosisContext: {
        version: 1 as const,
        scenario: "LIVE_MONITORING" as const,
        recentTrend: {
          status: "INSUFFICIENT" as const,
          reason: "最近窗口缺少完整分钟覆盖，暂不能判断近期趋势",
          baselineStartAt: null,
          baselineEndAt: null,
          currentStartAt: null,
          currentEndAt: null,
          routeKey: null,
          scope: null,
          metrics: [],
          efficiency: null
        },
        manualActions: []
      }
    };

    const facts = buildTrustedDiagnosisFactsView(input);
    expect(facts).toMatchObject({
      target: { status: "MET", actual: 209.94, target: 200 },
      trend: { status: "INSUFFICIENT" },
      cause: { status: "UNCONFIRMED" }
    });
    expect(facts?.target.message).toContain("这只确认目标结果");
    expect(JSON.stringify(facts)).not.toMatch(/订单正常|整体经营健康|整体经营正常/);
    expect(facts?.metricGroups.map((group) => group.id)).toEqual(expect.arrayContaining(["FULL_DOMAIN", "LIVE_ROOM"]));
  });

  it("does not use ordinary pay ROI as a full-domain target comparison", () => {
    const base = syntheticDiagnosisCases[0]!.input;
    const input = {
      ...base,
      targetRoi: 200,
      metrics: [metric("pay_roi", 209.94), metric("target_roi", 200)]
    };

    const facts = buildTrustedDiagnosisFactsView(input);
    expect(facts?.target).toMatchObject({ status: "UNAVAILABLE", actual: null, target: 200 });
    expect(facts?.target.message).toContain("缺少同口径全域支付 ROI");
  });

  it("keeps ordinary spend separate and displays zero online users without inferring a stopped stream", () => {
    const input = { ...syntheticDiagnosisCases[0]!.input, metrics: [metric("spend", 100), metric("current_online_viewers", 0, "LIVE_DATA_SCREEN")] };
    const facts = buildTrustedDiagnosisFactsView(input);
    expect(facts?.metricGroups.find((group) => group.id === "FULL_DOMAIN")).toBeUndefined();
    expect(facts?.metricGroups.find((group) => group.id === "LOCAL_DASHBOARD")?.metrics[0]).toMatchObject({ value: 100, observationPeriod: null });
    expect(facts?.metricGroups.find((group) => group.id === "LIVE_ROOM")?.metrics[0]).toMatchObject({ value: 0 });
    expect(facts?.trend.status).toBe("UNKNOWN");
    expect(JSON.stringify(facts)).not.toContain("直播已结束");
  });

  it("prioritizes an executed action without a recorded outcome over new suggestions", () => {
    const base = syntheticDiagnosisCases[0]!.input;
    const input = {
      ...base,
      diagnosisContext: {
        version: 1 as const,
        scenario: "POST_LIVE_REVIEW" as const,
        recentTrend: {
          status: "INSUFFICIENT" as const,
          reason: "缺少完整窗口",
          baselineStartAt: null,
          baselineEndAt: null,
          currentStartAt: null,
          currentEndAt: null,
          routeKey: null,
          scope: null,
          metrics: [],
          efficiency: null
        },
        manualActions: [{ actionProposalId: "executed-action", actionType: "OBSERVE" as const, executedAt: "2026-08-15T10:00:00.000Z", outcome: null }]
      }
    };
    const result = minimalResult();

    const view = buildDiagnosisDecisionView(input, result, []);
    expect(view?.nextStep).toMatchObject({ kind: "OUTCOME_REVIEW", proposalId: "executed-action", actionType: "OBSERVE" });
    expect(view?.primaryExperiment).toBeNull();
  });
});

function metric(key: string, value: string | number, routeKey = "LOCAL_PROMOTION_DASHBOARD") {
  return {
    key,
    name: key,
    value,
    source: "network" as const,
    confidence: 1,
    rawEvidence: { sourceType: "test", routeKey }
  };
}

function minimalResult(): DiagnosisFinalResult {
  return {
    schemaVersion: "ai-diagnosis-result-v1",
    coreConclusion: "当前只保留可验证的事实与边界。",
    mainProblemTag: "HEALTHY",
    confidence: 0.7,
    factSnapshot: [{ statement: "本轮数据已复核。", evidenceIds: ["policy:data-review"] }],
    hypotheses: [{
      id: "H1",
      dimension: "LIVE_ROOM",
      title: "直播承接待观察",
      conclusion: "当前证据不足，暂不能确认具体原因。",
      supportingEvidenceIds: ["policy:data-review"],
      conflictingEvidenceIds: [],
      missingEvidence: [],
      confidence: 0.5
    }],
    missingEvidence: [],
    experiments: [],
    stopConditions: [],
    candidateActions: []
  };
}

function legacyExperiment(id: string, hypothesisId: string, title: string) {
  return {
    id,
    title,
    hypothesisId,
    steps: ["保持其他设置不变并记录结果。"],
    verifyMetrics: ["全域支付 ROI"],
    stopConditions: ["数据口径变化时停止。"],
    evidenceIds: ["metric:full_domain_pay_roi:LOCAL_PROMOTION_DASHBOARD:1"]
  };
}

function candidate(actionType: "DECREASE_BID" | "CHECK_LIVE_ROOM" | "OPTIMIZE_SCRIPT", title: string, experimentId: string | null) {
  return {
    actionType,
    title,
    reason: `${title}的候选原因。`,
    expectedImpact: "取得同口径验证结果。",
    riskLevel: "LOW" as const,
    confidence: 0.7,
    evidenceIds: ["metric:full_domain_pay_roi:LOCAL_PROMOTION_DASHBOARD:1"],
    experimentId
  };
}
