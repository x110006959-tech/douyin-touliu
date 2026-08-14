import { describe, expect, it } from "vitest";
import { metricValueSemantic, metricValueText, metricValueToRuleNumber, parseDisplayedMetricValue } from "./metric-value";

describe("displayed metric value parsing", () => {
  it("keeps the page display while normalizing Chinese quantity units", () => {
    expect(parseDisplayedMetricValue("4万", "CURRENCY", "yuan")).toMatchObject({
      displayValue: "4万", normalizedText: "40000", multiplier: 10_000
    });
    expect(parseDisplayedMetricValue("4千", "COUNT")).toMatchObject({
      normalizedText: "4000", multiplier: 1_000
    });
  });

  it("distinguishes percentage values from ROI multiples", () => {
    expect(parseDisplayedMetricValue("4%", "PERCENTAGE", "%")).toMatchObject({ normalizedText: "0.04" });
    expect(parseDisplayedMetricValue("4", "ROI")).toMatchObject({ normalizedText: "4", status: "REQUIRES_REVIEW" });
    expect(parseDisplayedMetricValue("4倍", "ROI")).toMatchObject({ normalizedText: "4", status: "REQUIRES_REVIEW" });
    expect(parseDisplayedMetricValue("4%", "ROI")).toMatchObject({ status: "INVALID", reasons: ["ROI_CANNOT_USE_PERCENT_UNIT"] });
    expect(parseDisplayedMetricValue("4万", "ROI")).toMatchObject({ status: "INVALID", reasons: ["ROI_CANNOT_USE_QUANTITY_UNIT"] });
    expect(parseDisplayedMetricValue("4元", "ROI")).toMatchObject({ status: "INVALID", reasons: ["ROI_UNIT_MISMATCH"] });
    expect(parseDisplayedMetricValue("4倍", "COUNT")).toMatchObject({ status: "INVALID", reasons: ["COUNT_UNIT_MISMATCH"] });
  });

  it("keeps zero distinct from a missing page value", () => {
    expect(parseDisplayedMetricValue("0.00", "CURRENCY", "yuan")).toMatchObject({ normalizedText: "0", displayPrecision: 2 });
    expect(parseDisplayedMetricValue("--", "CURRENCY", "yuan")).toMatchObject({ normalizedText: null, reasons: ["VALUE_MISSING"] });
  });

  it("maps metric semantics without inferring ROI as a percentage", () => {
    expect(metricValueSemantic("pay_roi")).toBe("ROI");
    expect(metricValueSemantic("ctr")).toBe("PERCENTAGE");
    expect(metricValueSemantic("product_conversion_rate")).toBe("PERCENTAGE");
  });

  it("preserves exact normalized text and constrains rule-number conversion", () => {
    const metric = { value: "9007199254740993", rawEvidence: { normalizedValue: "9007199254740993" } };
    expect(metricValueText(metric)).toBe("9007199254740993");
    expect(metricValueToRuleNumber(metric)).toBeNull();
    expect(metricValueToRuleNumber({ value: "4万" })).toBe(40_000);
  });
});
