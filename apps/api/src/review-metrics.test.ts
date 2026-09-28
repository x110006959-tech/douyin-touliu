import { describe, expect, it } from "vitest";
import {
  isSourceConflictMetric,
  resolveSourceConflictReview,
  sourceConflictReviewPersistence,
  taskLevelConfirmableReviewedMetrics
} from "./review-metrics.js";

const conflictMetric = {
  rawEvidence: {
    sourceType: "INTERNAL_API",
    sourceStatus: "SOURCE_CONFLICT",
    apiCandidate: { value: "12", displayValue: "12", unit: null, timeRange: "实时", displayPrecision: 0, fieldPath: "data.a", fieldLabel: "API" },
    domCandidate: { value: "10", displayValue: "10", unit: null, timeRange: "实时", displayPrecision: 0, fieldPath: "dom", fieldLabel: "DOM" }
  }
} as never;

const ordinaryMetric = {
  rawEvidence: {
    sourceType: "DOM_TEXT",
    sourceStatus: "DOM_TEXT",
    validationStatus: "TRUSTED",
    validationReasons: [],
    timeRange: "今日"
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

  it("rejects source selection on metrics that are not in source conflict", () => {
    expect(resolveSourceConflictReview(ordinaryMetric, { reviewStatus: "CONFIRMED", sourceSelection: "DOM" })).toMatchObject({ ok: false, error: "SOURCE_CONFLICT_SELECTION_INVALID" });
    expect(resolveSourceConflictReview(ordinaryMetric, { reviewStatus: "CONFIRMED", reviewedValue: "10" })).toMatchObject({ ok: true, patch: null });
    expect(sourceConflictReviewPersistence(ordinaryMetric, { sourceSelection: "DOM" })).toBeNull();
  });

  it("excludes unresolved source conflicts from task-level confirmation", () => {
    const conflict = { id: "conflict", originalValue: null, reviewStatus: "PENDING" as const, rawEvidence: conflictMetric.rawEvidence };
    const invalid = { id: "invalid", originalValue: "12", reviewStatus: "PENDING" as const, rawEvidence: { sourceType: "DOM_TEXT", validationStatus: "INVALID" } };
    const manual = { id: "manual", originalValue: "12", reviewStatus: "PENDING" as const, rawEvidence: { sourceType: "MANUAL_INPUT", bindingKind: "MANUAL", validationStatus: "TRUSTED" } };
    expect(taskLevelConfirmableReviewedMetrics([conflict, invalid, manual])).toEqual([manual]);
  });

  it("uses the selected candidate unit without inheriting the conflict metric unit", () => {
    const metric = {
      metricUnit: "元",
      scope: "API_SCOPE",
      rawEvidence: {
        sourceType: "INTERNAL_API",
        sourceStatus: "SOURCE_CONFLICT",
        semanticScope: "API_SCOPE",
        apiCandidate: { value: "12", displayValue: "12元", unit: "元", unitSource: "DEFAULT", scope: "API_SCOPE", scopeExplicit: true, timeRange: "今日", displayPrecision: 0, fieldPath: "data.a", fieldLabel: "API" },
        domCandidate: { value: "10", displayValue: "10", unit: null, unitSource: "NONE", scope: "DOM_SCOPE", scopeExplicit: true, timeRange: "今日", displayPrecision: 0, fieldPath: "dom", fieldLabel: "DOM" }
      }
    } as never;
    const apiPersistence = sourceConflictReviewPersistence(metric, { sourceSelection: "API" });
    expect(apiPersistence?.metricSource).toBe("XHR_JSON");
    expect(apiPersistence?.metricUnit).toBe("元");
    expect(apiPersistence?.scope).toBe("API_SCOPE");
    expect(apiPersistence?.confidence).toBe(1);
    expect((apiPersistence?.rawEvidence as Record<string, unknown>).sourceType).toBe("INTERNAL_API");
    expect((apiPersistence?.rawEvidence as Record<string, unknown>).unitSource).toBe("DEFAULT");
    expect((apiPersistence?.rawEvidence as Record<string, unknown>).semanticScope).toBe("API_SCOPE");

    const domPersistence = sourceConflictReviewPersistence(metric, { sourceSelection: "DOM" });
    expect(domPersistence?.metricSource).toBe("DOM_TEXT");
    expect(domPersistence?.metricUnit).toBeNull();
    expect(domPersistence?.scope).toBe("DOM_SCOPE");
    expect(domPersistence?.confidence).toBe(1);
    expect((domPersistence?.rawEvidence as Record<string, unknown>).sourceType).toBe("DOM_TEXT");
    expect((domPersistence?.rawEvidence as Record<string, unknown>).unitSource).toBe("NONE");
    expect((domPersistence?.rawEvidence as Record<string, unknown>).semanticScope).toBe("DOM_SCOPE");
  });

  it("does not promote an inferred candidate scope into the selected evidence", () => {
    const metric = {
      metricUnit: null,
      scope: "UNKNOWN",
      rawEvidence: {
        sourceType: "INTERNAL_API",
        sourceStatus: "SOURCE_CONFLICT",
        semanticScope: "API_SCOPE",
        apiCandidate: {
          value: "12",
          displayValue: "12元",
          unit: "元",
          unitSource: "DEFAULT",
          scope: "API_SCOPE",
          scopeExplicit: true,
          timeRange: "今日",
          displayPrecision: 0,
          fieldPath: "data.spend",
          fieldLabel: "消耗"
        },
        domCandidate: {
          value: "10",
          displayValue: "10元",
          unit: "元",
          unitSource: "VALUE",
          scope: "spend",
          scopeExplicit: false,
          timeRange: "今日",
          displayPrecision: 0,
          fieldPath: "section:0>span:0",
          fieldLabel: "消耗"
        }
      }
    } as never;

    const persistence = sourceConflictReviewPersistence(metric, { sourceSelection: "DOM" });
    expect(persistence?.scope).toBe("UNKNOWN");
    expect((persistence?.rawEvidence as Record<string, unknown>).semanticScope).toBeNull();
  });
});
