import { describe, expect, it } from "vitest";
import { createLlmProvider, mockAnalyze } from "./index";
import type { AnalyzeInput } from "@douyin-local-life/shared";

function input(overrides: Partial<AnalyzeInput> = {}): AnalyzeInput {
  return {
    businessType: "DOUYIN_LOCAL_LIFE",
    subject: {
      subjectType: "SERVICE_PROVIDER",
      operatorType: "SERVICE_PROVIDER_LIVE",
      cooperationType: "SERVICE_PROVIDER_CONTRACT",
      controlLevel: "MEDIUM",
      confidence: 0.9,
      serviceProviderName: "测试服务商",
      serviceMode: "代播",
      serviceFee: 200
    },
    pageTitle: "巨量本地推服务商诊断",
    sourceUrl: "https://ad.oceanengine.com/local",
    metrics: [],
    tables: [],
    visibleText: "",
    networkJsonSummary: [],
    ...overrides
  };
}

describe("mockAnalyze explanation layer", () => {
  it("returns explanation suggestions without creating final action proposals", async () => {
    const result = await mockAnalyze(input());

    expect(result.summary).toContain("本轮数据解读");
    expect(result.summary).toContain("decision-engine");
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(0.7);
    expect(result.decisionReference.mode).toBe("ADVISORY_ONLY");
    expect(result.decisionReference.insights.length).toBeGreaterThan(0);
    expect(result.decisionReference.insights.every((insight) => insight.confidence === "REFERENCE_ONLY")).toBe(true);
  });

  it("keeps subject calibration as a manual check only", async () => {
    const result = await mockAnalyze(
      input({
        subject: {
          subjectType: "SUBJECT_PENDING",
          operatorType: "OPERATOR_PENDING",
          cooperationType: "COOPERATION_PENDING",
          controlLevel: "PENDING",
          confidence: 0.2
        }
      })
    );

    expect(result.summary).toContain("主体待校准");
    expect(result.manualCheckItems.some((item) => item.title.includes("主体识别"))).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.riskLevel).toBe("MEDIUM");
    expect(result.confidence).toBeLessThan(0.6);
  });

  it("marks the provider model as explanation only", () => {
    const provider = createLlmProvider("mock");

    expect(provider.model).toContain("explanation-only");
    expect(provider.model).toContain("agency-reference");
  });
});
