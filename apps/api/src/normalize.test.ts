import { describe, expect, it } from "vitest";
import { normalizeMetrics } from "./normalize.js";

describe("metric normalization", () => {
  it("fails closed when one capture contains duplicate standardized metric keys", () => {
    const metrics = normalizeMetrics({
      pageType: "LOCAL_PROMOTION_DASHBOARD",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      pageTitle: "巨量本地推数据总览",
      rawDomText: "",
      rawNetworkJson: [],
      rawTableData: [],
      localCollectedAt: new Date().toISOString(),
      visibleMetricsJson: [
        metric("整体支付ROI", "4", "section:0>span:0"),
        metric("整体支付 ROI", "5", "section:1>span:0")
      ]
    });

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      key: "pay_roi",
      value: null,
      confidence: 0.1,
      rawEvidence: {
        validationStatus: "INVALID",
        validationReasons: expect.arrayContaining(["FIELD_BINDING_AMBIGUOUS"])
      }
    });
  });
});

function metric(label: string, value: string, componentPath: string) {
  return {
    key: "pay_roi",
    name: label,
    value,
    source: "dom" as const,
    metricSource: "DOM_TEXT" as const,
    confidence: 0.8,
    rawEvidence: {
      sourceType: "DOM_TEXT",
      bindingKind: "CARD" as const,
      fieldLabel: label,
      displayValue: value,
      timeRange: "今日",
      timeRangeLocation: "section:0>span:2",
      componentPath,
      calibrationSignature: `${label}:${componentPath}`,
      validationStatus: "REQUIRES_REVIEW" as const,
      validationReasons: []
    }
  };
}
