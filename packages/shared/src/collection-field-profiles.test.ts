import { describe, expect, it } from "vitest";
import {
  collectionFieldProfiles,
  isAllowedCollectionMetricLabel,
  tableFieldForHeader
} from "./collection-field-profiles";

describe("collection field profiles", () => {
  it("defines explicit metric and period rules for all five collection routes", () => {
    const routes = ["LIVE_DATA_SCREEN", "LIVE_PRODUCT_TAB", "LIVE_TRAFFIC_TAB", "LOCAL_PROMOTION_DASHBOARD", "TASK_TABLE"] as const;
    expect(routes.map((route) => collectionFieldProfiles[route]?.periodRequired)).toEqual([true, true, true, true, true]);
    expect(routes.every((route) => (collectionFieldProfiles[route]?.metricKeys.length || 0) > 0)).toBe(true);
  });

  it("accepts only exact calibrated labels and explicit synonyms", () => {
    expect(isAllowedCollectionMetricLabel("LOCAL_PROMOTION_DASHBOARD", "pay_roi", "整体支付 ROI")).toBe(true);
    expect(isAllowedCollectionMetricLabel("LOCAL_PROMOTION_DASHBOARD", "pay_roi", "消耗")).toBe(false);
    expect(isAllowedCollectionMetricLabel("LOCAL_PROMOTION_DASHBOARD", "pay_roi", "整体支付 ROI 预测")).toBe(false);
    expect(tableFieldForHeader("TASK_TABLE", "整体支付ROI")?.key).toBe("roi");
    expect(tableFieldForHeader("TASK_TABLE", "整体支付ROI预测")).toBeNull();
  });
});
