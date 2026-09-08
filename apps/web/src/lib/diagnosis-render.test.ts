import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagnosisComparison } from "../app/tasks/[id]/diagnosis-comparison";
import type { DecisionRun } from "../app/tasks/[id]/task-types";
import type { DiagnosisTrustedFactsView } from "@douyin-local-life/shared/diagnosis";

const facts: DiagnosisTrustedFactsView = {
  version: 1, scenario: "LIVE_MONITORING",
  dataFreshness: { latestCollectedAt: "2026-09-06T02:30:20.000Z", summary: "本次采集时间已确认" },
  target: { status: "MET", actual: 209.94, target: 200, message: "全域支付 ROI 209.94 已达到目标 200；这只确认目标结果。" },
  trend: { status: "INSUFFICIENT", summary: "分钟覆盖不完整，趋势未知", recentTrend: null },
  cause: { status: "UNCONFIRMED", message: "原因尚未确认" },
  metricGroups: [{ id: "FULL_DOMAIN", label: "全域投放口径", sourceLabel: "本地推总览", metrics: [{
    metricKey: "full_domain_pay_roi", metricLabel: "全域支付 ROI", value: 209.94, unit: null,
    sourceLabel: "本地推总览", capturedAt: "2026-09-06T02:30:20.000Z", observationPeriod: "本场", semanticScope: "全域"
  }] }],
  facts: [{ statement: "当前 ROI 已达本次目标", evidenceIds: ["metric:full_domain_pay_roi"] }],
  boundaries: ["趋势未知"], nextCheck: { title: "检查下一完整窗口", detail: "核对同口径成交和消耗，判断近期变化" }
};

function run(status: DecisionRun["status"]): DecisionRun {
  return {
    id: "render-fixture", mode: "AI_SKILL_ORCHESTRATED", status, diagnosis: null,
    riskLevel: null, confidence: 0.9, strategyVersion: "managed-live-growth-skills-v10", provider: "fake", model: "offline",
    promptVersion: "managed-live-growth-prompt-v25", currentStage: status === "FAILED" ? "FAILED:SYNTHESIZING_ACTION_PLAN" : "COMPLETED",
    errorCode: status === "FAILED" ? "DIAGNOSIS_OUTPUT_INVALID" : null, errorMessage: null,
    startedAt: null, completedAt: null, createdAt: "2026-09-06T02:30:30.000Z", skillExecutions: [], actionProposals: [],
    trustedFacts: facts,
    finalResult: {
      schemaVersion: "ai-diagnosis-result-v1", coreConclusion: "MODEL_ONLY_SENTINEL", mainProblemTag: "HEALTHY", confidence: 0.9,
      factSnapshot: [{ statement: "MODEL_ONLY_SENTINEL", evidenceIds: ["metric:full_domain_pay_roi"] }], hypotheses: [],
      missingEvidence: [], experiments: [], stopConditions: [], candidateActions: []
    }
  };
}

function render(decisionRun: DecisionRun) {
  return renderToStaticMarkup(createElement(DiagnosisComparison, {
    busy: "", decisionRun, evidenceAdvisory: null, formalContent: null, formalReady: true,
    onRunFormal: () => undefined, scenario: "LIVE_MONITORING"
  }));
}

describe("rendered diagnosis partial-failure boundary", () => {
  it("renders interpretations with evidence and uses the saved scenario for the report", () => {
    const fixture = run("SUCCEEDED");
    fixture.trustedFacts = { ...facts, scenario: "POST_LIVE_REVIEW" };
    fixture.decisionView = {
      mainProblemTag: "HEALTHY", headline: "本次目标已达成", conclusion: "全域目标结果已确认", conclusionSource: "SERVER_DETERMINISTIC", conclusionConfidence: 0.9,
      problemSeverity: "UNASSESSED", problemSeverityReason: "原因未知", actionRisk: null,
      targetComparison: { metricLabel: "全域支付 ROI", status: "MET", actual: 209.94, target: 200, absoluteGap: -9.94, achievementRate: 1.0497, relativeShortfall: -0.0497 },
      facts: facts.facts, openQuestions: [], nextStep: { kind: "NONE", title: "无需新增调整", reason: "原因待验证", proposalId: null, actionType: null, status: null }, primaryExperiment: null, blockedActions: [],
      analysis: [{ title: "ANALYSIS_TITLE", conclusion: "ANALYSIS_MEANING", supportingFacts: ["VERIFIED_SUPPORT"], conflictingFacts: ["COUNTER_EVIDENCE"], missingEvidence: ["DISTINGUISH_CAUSE"] }]
    };
    const html = render(fixture);
    for (const text of ["本次直播复盘分析", "ANALYSIS_MEANING", "VERIFIED_SUPPORT", "COUNTER_EVIDENCE", "DISTINGUISH_CAUSE", "高于目标"]) expect(html).toContain(text);
    expect(html).not.toContain("-9.94");
    expect(html).not.toContain("当前直播分析");
    expect(render({ ...fixture, status: "FAILED" })).not.toContain("ANALYSIS_MEANING");
    expect(render({ ...fixture, decisionView: { ...fixture.decisionView, analysis: undefined } })).toContain("尚无可展示的有据原因分析");
  });

  it.each(["SUCCEEDED", "FAILED"] as const)("renders trusted target, trend and cause independently for %s", (status) => {
    const html = render(run(status));
    expect(html).toContain("209.94");
    for (const label of ["目标是否达成", "趋势能否判断", "原因是否确认", "期间：本场", "检查下一完整窗口"]) expect(html).toContain(label);
    expect(html).not.toContain("结论置信度");
    if (status === "FAILED") {
      expect(html).toContain("事实已确认，AI 建议未完成");
      expect(html).not.toContain("MODEL_ONLY_SENTINEL");
      expect(html).not.toContain("待人工审批");
    }
  });

  it("does not label old missing input as confirmed facts", () => {
    const html = render({ ...run("FAILED"), trustedFacts: null });
    expect(html).toContain("旧记录没有可独立验证的事实输入");
    expect(html).not.toContain("已确认的可信事实");
    expect(html).not.toContain("MODEL_ONLY_SENTINEL");
  });
});
