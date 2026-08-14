import { describe, expect, it } from "vitest";
import type { VisibleMetric } from "@douyin-local-life/shared";
import { liveScreenMetricsForMode, mergeLiveScreenMetrics } from "./live-screen-metric-merge";

describe("live screen metric merge", () => {
  it("returns API pulse metrics directly without DOM comparison or merging", () => {
    const api = metric("12", "INTERNAL_API", "key_index");
    const dom = metric("11", "DOM_TEXT");

    expect(liveScreenMetricsForMode("PULSE", [dom], [api])).toEqual([api]);
    expect(liveScreenMetricsForMode("SNAPSHOT", [dom], [api])[0]?.rawEvidence).toMatchObject({
      sourceStatus: "SOURCE_CONFLICT"
    });
  });

  it("keeps valid API evidence when the DOM candidate only found a label or lacks its period", () => {
    const missingDom = metric("", "DOM_TEXT");
    missingDom.value = null;
    missingDom.rawEvidence = {
      ...missingDom.rawEvidence!,
      timeRange: undefined,
      validationStatus: "INVALID",
      validationReasons: ["VALUE_MISSING", "TIME_RANGE_MISSING"]
    };
    const merged = mergeLiveScreenMetrics([missingDom], [metric("12", "INTERNAL_API")]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ value: "12", metricSource: "XHR_JSON" });
    expect(merged[0]?.rawEvidence).toMatchObject({ sourceStatus: "INTERNAL_API" });
  });

  it("still fails closed when complete API and DOM evidence disagree", () => {
    const merged = mergeLiveScreenMetrics(
      [metric("11", "DOM_TEXT")],
      [metric("12", "INTERNAL_API")]
    );
    expect(merged[0]?.rawEvidence).toMatchObject({ sourceStatus: "SOURCE_CONFLICT", validationStatus: "INVALID" });
  });

  it("does not round unsafe integers into a false API/DOM match", () => {
    const merged = mergeLiveScreenMetrics(
      [metric("9007199254740992", "DOM_TEXT")],
      [metric("9007199254740993", "INTERNAL_API")]
    );
    expect(merged[0]?.rawEvidence).toMatchObject({ sourceStatus: "SOURCE_CONFLICT", validationStatus: "INVALID" });
  });

  it("fails closed instead of silently overwriting duplicate API fields", () => {
    const merged = mergeLiveScreenMetrics([], [
      metric("12", "INTERNAL_API", "room_info"),
      metric("13", "INTERNAL_API", "conversion_funnel")
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.every((item) => item.rawEvidence?.validationReasons?.includes("FIELD_BINDING_AMBIGUOUS"))).toBe(true);
  });
});

function metric(value: string, sourceType: "DOM_TEXT" | "INTERNAL_API", endpointKey = "room_info"): VisibleMetric {
  return {
    key: "live_viewers",
    name: "整场累计看播人数",
    value,
    unit: null,
    source: sourceType === "INTERNAL_API" ? "network" : "dom",
    metricSource: sourceType === "INTERNAL_API" ? "XHR_JSON" : "DOM_TEXT",
    rawEvidence: {
      sourceType,
      displayValue: value,
      normalizedValue: value,
      displayPrecision: 0,
      timeRange: "本场",
      componentPath: sourceType === "INTERNAL_API" ? `data.${endpointKey}` : "section:0",
      semanticScope: sourceType === "INTERNAL_API" ? "整场累计看播人数" : undefined,
      endpointKey: sourceType === "INTERNAL_API" ? endpointKey : undefined,
      evidencePurpose: sourceType === "INTERNAL_API" ? "SNAPSHOT_EVIDENCE" : undefined
    }
  };
}
