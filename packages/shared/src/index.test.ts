import { describe, expect, it } from "vitest";
import { identifyMetricKey, standardizeMetricKey } from "./index";

describe("metric dictionary", () => {
  it("maps explicit verification ROI aliases to the standard key", () => {
    expect(identifyMetricKey("verify_roi")).toBe("verify_roi");
    expect(identifyMetricKey("核销 ROI")).toBe("verify_roi");
  });

  it("does not guess the meaning of a bare ROI label", () => {
    expect(identifyMetricKey("ROI")).toBe("unknown");
  });

  it("maps metric names when raw keys are not standard", () => {
    expect(standardizeMetricKey({ key: "foo_123", name: "点击率" })).toBe("ctr");
  });

  it("marks unknown metrics as unknown", () => {
    expect(identifyMetricKey("完全未知字段")).toBe("unknown");
    expect(standardizeMetricKey({ key: "random_metric", name: "自定义备注" })).toBe("unknown");
  });
});
