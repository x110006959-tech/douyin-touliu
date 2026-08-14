import { describe, expect, it } from "vitest";
import { isSourceConflictMetric, resolveSourceConflictReview } from "./review-metrics.js";

const conflictMetric = {
  rawEvidence: {
    sourceType: "INTERNAL_API",
    sourceStatus: "SOURCE_CONFLICT",
    apiCandidate: { value: "12", displayValue: "12", unit: null, timeRange: "实时", displayPrecision: 0, fieldPath: "data.a", fieldLabel: "API" },
    domCandidate: { value: "10", displayValue: "10", unit: null, timeRange: "实时", displayPrecision: 0, fieldPath: "dom", fieldLabel: "DOM" }
  }
} as never;

describe("source conflict review", () => {
  it("allows only the persisted API or DOM candidate", () => {
    expect(isSourceConflictMetric(conflictMetric)).toBe(true);
    expect(resolveSourceConflictReview(conflictMetric, { reviewStatus: "CONFIRMED", sourceSelection: "API" })).toMatchObject({ ok: true, patch: { reviewedValue: "12" } });
    expect(resolveSourceConflictReview(conflictMetric, { reviewStatus: "CONFIRMED", sourceSelection: "DOM", reviewedValue: "9" })).toMatchObject({ ok: false, error: "SOURCE_CONFLICT_VALUE_MISMATCH" });
  });

  it("allows an explicit ignore but no free-form modification", () => {
    expect(resolveSourceConflictReview(conflictMetric, { reviewStatus: "IGNORED", sourceSelection: "IGNORE" })).toMatchObject({ ok: true, patch: { reviewStatus: "IGNORED" } });
    expect(resolveSourceConflictReview(conflictMetric, { reviewStatus: "MODIFIED", sourceSelection: "API", reviewedValue: "12" })).toMatchObject({ ok: false, error: "SOURCE_CONFLICT_SELECTION_INVALID" });
  });
});
