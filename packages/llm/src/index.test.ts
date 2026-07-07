import { describe, expect, it } from "vitest";
import { mockAnalyze } from "./index";
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

describe("mockAnalyze", () => {
  it("requires subject calibration before specific algorithms", async () => {
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
    expect(result.suggestions[0]?.action).toBe("主体识别校准");
    expect(result.confidence).toBeLessThan(0.6);
  });

  it("does not add budget when verification ROI is missing", async () => {
    const result = await mockAnalyze(input({ metrics: [{ key: "pay_roi", name: "支付 ROI", value: 2.3, source: "dom" }] }));

    expect(result.summary).toContain("核销 ROI 缺失");
    expect(result.suggestions.some((suggestion) => suggestion.action === "稳预算")).toBe(true);
    expect(result.suggestions.some((suggestion) => suggestion.action === "加预算")).toBe(false);
  });

  it("prioritizes service provider cost after fee", async () => {
    const result = await mockAnalyze(
      input({
        metrics: [
          { key: "verify_roi", name: "核销 ROI", value: 2.1, source: "manual" },
          { key: "gross_profit", name: "核销毛利", value: 500, source: "manual" },
          { key: "spend", name: "消耗", value: 600, source: "manual" },
          { key: "merchant_subsidy", name: "商家补贴", value: 200, source: "manual" }
        ]
      })
    );

    expect(result.riskLevel).toBe("HIGH");
    expect(result.summary).toContain("服务商后毛利ROI");
    expect(result.suggestions.some((suggestion) => suggestion.action === "重谈服务费用")).toBe(true);
  });

  it("keeps plan when service execution is the issue", async () => {
    const result = await mockAnalyze(
      input({
        visibleText: "服务商执行差，排班异常，脚本偏离",
        metrics: [
          { key: "verify_roi", name: "核销 ROI", value: 1.6, source: "manual" },
          { key: "gross_profit_roi", name: "毛利 ROI", value: 1.3, source: "manual" }
        ]
      })
    );

    expect(result.suggestions.some((suggestion) => suggestion.action === "调整服务商 SOP")).toBe(true);
    expect(result.suggestions.some((suggestion) => suggestion.action === "暂停跑量")).toBe(false);
  });

  it("does not pause when full-domain ROI is good but live ROI is weak", async () => {
    const result = await mockAnalyze(
      input({
        metrics: [
          { key: "verify_roi", name: "核销 ROI", value: 1.1, source: "manual" },
          { key: "pay_roi", name: "支付 ROI", value: 0.6, source: "manual" },
          { key: "spend", name: "消耗", value: 1000, source: "manual" },
          { key: "shelf_gmv", name: "货架成交 GMV", value: 800, source: "manual" },
          { key: "search_gmv", name: "搜索成交 GMV", value: 700, source: "manual" }
        ]
      })
    );

    expect(result.summary).toContain("全域ROI");
    expect(result.suggestions.some((suggestion) => suggestion.action === "优化 POI/搜索承接")).toBe(true);
    expect(result.suggestions.some((suggestion) => suggestion.action === "暂停跑量")).toBe(false);
  });

  it("risk signals override service provider ROI", async () => {
    const result = await mockAnalyze(
      input({
        visibleText: "出现错价和虚假承诺，客诉增加",
        metrics: [
          { key: "verify_roi", name: "核销 ROI", value: 2.4, source: "manual" },
          { key: "gross_profit_roi", name: "毛利 ROI", value: 1.8, source: "manual" }
        ]
      })
    );

    expect(result.riskLevel).toBe("HIGH");
    expect(result.suggestions[0]?.action).toBe("暂停跑量");
  });
});
