import { describe, expect, it } from "vitest";
import type { AnalyzeInput } from "@douyin-local-life/shared";
import {
  AGENCY_AGENTS_REVISION,
  agencyAgentSources,
  buildDecisionReferenceBundle,
  buildDecisionReferenceInstructions
} from "./reference-playbooks";

function input(metrics: AnalyzeInput["metrics"] = []): AnalyzeInput {
  return {
    businessType: "DOUYIN_LOCAL_LIFE",
    subject: {
      subjectType: "SERVICE_PROVIDER",
      operatorType: "SERVICE_PROVIDER_LIVE",
      cooperationType: "SERVICE_PROVIDER_CONTRACT",
      controlLevel: "MEDIUM",
      confidence: 0.9
    },
    pageTitle: "巨量本地推服务商诊断",
    sourceUrl: "https://ad.oceanengine.com/local",
    metrics,
    tables: [],
    visibleText: "",
    networkJsonSummary: []
  };
}

describe("curated agency-agents decision references", () => {
  it("pins every source to the reviewed MIT revision", () => {
    expect(AGENCY_AGENTS_REVISION).toMatch(/^[a-f0-9]{40}$/);
    expect(agencyAgentSources).toHaveLength(5);
    expect(agencyAgentSources.every((source) => source.sourceRevision === AGENCY_AGENTS_REVISION)).toBe(true);
    expect(agencyAgentSources.every((source) => source.sourceUrl.includes(AGENCY_AGENTS_REVISION))).toBe(true);
    expect(agencyAgentSources.every((source) => source.license === "MIT")).toBe(true);
  });

  it("returns evidence-bound advisory playbooks without action proposal fields", () => {
    const bundle = buildDecisionReferenceBundle(input([
      { key: "impressions", name: "曝光", value: 20_000, source: "table" },
      { key: "ctr", name: "点击率", value: "0.8%", source: "table" },
      { key: "live_viewers", name: "观看", value: 5_000, source: "table" },
      { key: "orders", name: "订单", value: 1, source: "table" },
      { key: "gpm", name: "GPM", value: 280, source: "table" }
    ]));

    expect(bundle.mode).toBe("ADVISORY_ONLY");
    expect(bundle.insights.length).toBeGreaterThanOrEqual(4);
    expect(bundle.insights.every((insight) => insight.evidence.length > 0)).toBe(true);
    expect(bundle.insights.every((insight) => insight.manualSteps.length > 0)).toBe(true);
    expect(bundle.insights.every((insight) => insight.confidence === "REFERENCE_ONLY")).toBe(true);
    expect(JSON.stringify(bundle.insights)).not.toMatch(/"actionType"|"requiresApproval"/);
  });

  it("filters generic algorithm thresholds and automatic platform operations from the safe prompt", () => {
    const bundle = buildDecisionReferenceBundle(input());
    const instructions = buildDecisionReferenceInstructions(bundle);
    const manualSteps = bundle.insights.flatMap((insight) => insight.manualSteps).join("；");

    expect(instructions).toContain("不是平台官方规则");
    expect(instructions).toContain("decision-engine");
    expect(instructions).not.toMatch(/GPM\s*[><]|ROI\s*[><]|算法优先级|加预算\s*30%|固定出价公式/);
    expect(manualSteps).not.toMatch(/自动|绕过|暂停计划|创建计划|提交平台表单/);
  });
});
