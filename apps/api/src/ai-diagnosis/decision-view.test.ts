import { describe, expect, it } from "vitest";
import { syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import type { DiagnosisFinalResult } from "@douyin-local-life/shared/diagnosis";
import { buildDiagnosisDecisionView } from "./decision-view.js";

describe("diagnosis decision view", () => {
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
      targetComparison: { actual: 44.59, target: 60, absoluteGap: 15.41, achievementRate: 0.7432, relativeShortfall: 0.2568 },
      nextStep: { kind: "OUTCOME_REVIEW", proposalId: "proposal-check-live" },
      primaryExperiment: { id: "E2" }
    });
    expect(view?.conclusion).not.toContain("降低出价");
    expect(view?.blockedActions.map((item) => item.actionType)).toEqual(["DECREASE_BID", "OPTIMIZE_SCRIPT"]);
  });
});

function metric(key: string, value: string | number) {
  return {
    key,
    name: key,
    value,
    source: "network" as const,
    confidence: 1,
    rawEvidence: { sourceType: "test", routeKey: "LOCAL_PROMOTION_DASHBOARD" }
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
