import { describe, expect, it } from "vitest";
import { canAutoConfirmMetric, isConfirmableMetricEvidence, qualifyCapturedMetrics, qualifyTableBindings } from "./metric-validation.js";

const labels: Record<string, string> = { spend: "消耗", gmv: "支付金额", pay_roi: "整体支付ROI" };

const binding = (key: string, value: number | string, timeRange: string | null = "今日", displayPrecision = 2) => ({
  key,
  name: key,
  value,
  source: "dom" as const,
  confidence: 0.8,
  rawEvidence: {
    sourceType: "DOM_TEXT",
    bindingKind: "CARD" as const,
    fieldLabel: labels[key] || key,
    displayValue: String(value),
    componentPath: `section:0>span:${key}`,
    calibrationSignature: `${key}|label`,
    validationStatus: "REQUIRES_REVIEW" as const,
    validationReasons: [],
    timeRange,
    timeRangeSource: "COMPONENT" as const,
    timeRangeLocation: `section:0>span:period`,
    displayPrecision,
    normalizedValue: String(value)
  }
});

describe("captured metric qualification", () => {
  it("trusts only an explicitly calibrated binding on the same route fingerprint", async () => {
    const db = { collectionBindingCalibration: { findMany: async (query: { where: { pageFingerprint: string } }) => query.where.pageFingerprint === "fingerprint" ? [{ bindingKind: "METRIC", bindingKey: "pay_roi", bindingSignature: "pay_roi|label" }] : [] } } as never;
    const metrics = await qualifyCapturedMetrics(db, {
      workspaceId: "workspace", routeKey: "LOCAL_PROMOTION_DASHBOARD", captureMeta: { pageFingerprint: "fingerprint" } as never,
      metrics: [binding("pay_roi", 4)]
    });
    expect(metrics[0]?.rawEvidence).toMatchObject({ validationStatus: "TRUSTED" });

    const changed = await qualifyCapturedMetrics(db, {
      workspaceId: "workspace", routeKey: "LOCAL_PROMOTION_DASHBOARD", captureMeta: { pageFingerprint: "changed" } as never,
      metrics: [binding("pay_roi", 4)]
    });
    expect(changed[0]?.rawEvidence).toMatchObject({ validationStatus: "REQUIRES_REVIEW" });
  });

  it("marks mismatched same-period ROI evidence invalid instead of guessing", async () => {
    const db = { collectionBindingCalibration: { findMany: async () => [] } } as never;
    const metrics = await qualifyCapturedMetrics(db, {
      workspaceId: "workspace", routeKey: "LOCAL_PROMOTION_DASHBOARD", captureMeta: { pageFingerprint: "fingerprint" } as never,
      metrics: [binding("spend", 100), binding("gmv", 1000), binding("pay_roi", 4)]
    });
    expect(metrics.map((metric) => metric.rawEvidence?.validationStatus)).toEqual(["INVALID", "INVALID", "INVALID"]);
    expect(metrics[2]?.rawEvidence?.validationReasons).toContain("ROI_CROSS_CHECK_FAILED");
  });

  it("accepts ROI values rounded to the page display precision without floating-point drift", async () => {
    const db = { collectionBindingCalibration: { findMany: async () => [] } } as never;
    const metrics = await qualifyCapturedMetrics(db, {
      workspaceId: "workspace", routeKey: "LOCAL_PROMOTION_DASHBOARD", captureMeta: { pageFingerprint: "fingerprint" } as never,
      metrics: [binding("spend", "3"), binding("gmv", "10"), binding("pay_roi", "3.33", "今日", 2)]
    });
    expect(metrics.map((metric) => metric.rawEvidence?.validationStatus)).toEqual(["REQUIRES_REVIEW", "REQUIRES_REVIEW", "REQUIRES_REVIEW"]);
  });

  it("keeps large precise values out of float conversion during ROI cross-checking", async () => {
    const db = { collectionBindingCalibration: { findMany: async () => [] } } as never;
    const metrics = await qualifyCapturedMetrics(db, {
      workspaceId: "workspace", routeKey: "LOCAL_PROMOTION_DASHBOARD", captureMeta: { pageFingerprint: "fingerprint" } as never,
      metrics: [
        binding("spend", "9007199254740993"),
        binding("gmv", "36028797018963972"),
        binding("pay_roi", "4")
      ]
    });
    expect(metrics.map((metric) => metric.rawEvidence?.validationStatus)).toEqual(["REQUIRES_REVIEW", "REQUIRES_REVIEW", "REQUIRES_REVIEW"]);
  });

  it("invalidates missing or inconsistent periods before diagnosis", async () => {
    const db = { collectionBindingCalibration: { findMany: async () => [] } } as never;
    const missing = await qualifyCapturedMetrics(db, {
      workspaceId: "workspace", routeKey: "LOCAL_PROMOTION_DASHBOARD", captureMeta: { pageFingerprint: "fingerprint" } as never,
      metrics: [binding("pay_roi", "4", null)]
    });
    expect(missing[0]?.rawEvidence).toMatchObject({ validationStatus: "INVALID", validationReasons: expect.arrayContaining(["TIME_RANGE_MISSING"]) });

    const mismatched = await qualifyCapturedMetrics(db, {
      workspaceId: "workspace", routeKey: "LOCAL_PROMOTION_DASHBOARD", captureMeta: { pageFingerprint: "fingerprint" } as never,
      metrics: [binding("spend", "100", "今日"), binding("gmv", "400", "昨天"), binding("pay_roi", "4", "今日")]
    });
    expect(mismatched.map((metric) => metric.rawEvidence?.validationReasons)).toEqual([
      expect.arrayContaining(["TIME_RANGE_MISMATCH"]),
      expect.arrayContaining(["TIME_RANGE_MISMATCH"]),
      expect.arrayContaining(["TIME_RANGE_MISMATCH"])
    ]);
  });

  it("rejects a field label that is not in the route calibration list", async () => {
    const db = { collectionBindingCalibration: { findMany: async () => [] } } as never;
    const metric = binding("pay_roi", "4");
    metric.rawEvidence.fieldLabel = "消耗";
    const metrics = await qualifyCapturedMetrics(db, {
      workspaceId: "workspace", routeKey: "LOCAL_PROMOTION_DASHBOARD", captureMeta: { pageFingerprint: "fingerprint" } as never,
      metrics: [metric]
    });
    expect(metrics[0]?.rawEvidence).toMatchObject({ validationStatus: "INVALID", validationReasons: expect.arrayContaining(["FIELD_LABEL_NOT_ALLOWED"]) });
  });

  it("does not let a manual source override an already invalid binding", async () => {
    const db = { collectionBindingCalibration: { findMany: async () => [] } } as never;
    const invalidManual = {
      ...binding("pay_roi", "4"),
      metricSource: "MANUAL_INPUT" as const,
      rawEvidence: {
        ...binding("pay_roi", "4").rawEvidence,
        sourceType: "MANUAL_INPUT",
        bindingKind: "MANUAL" as const,
        validationStatus: "INVALID" as const,
        validationReasons: ["FIELD_BINDING_AMBIGUOUS"]
      }
    };
    const metrics = await qualifyCapturedMetrics(db, {
      workspaceId: "workspace", routeKey: "LOCAL_PROMOTION_DASHBOARD", captureMeta: { pageFingerprint: "fingerprint" } as never,
      metrics: [invalidManual]
    });

    expect(metrics[0]?.rawEvidence).toMatchObject({ validationStatus: "INVALID" });
    expect(canAutoConfirmMetric(metrics[0]!)).toBe(false);
    expect(isConfirmableMetricEvidence(metrics[0]?.rawEvidence)).toBe(false);
  });

  it("downgrades changed table structures and never trusts legacy evidence without period position", async () => {
    const db = { collectionBindingCalibration: { findMany: async (query: { where: { OR: Array<{ bindingSignature: string }> } }) => (
      query.where.OR.some((item) => item.bindingSignature === "known")
        ? [{ bindingKey: "0", bindingSignature: "known" }]
        : []
    ) } } as never;
    const base = {
      pageFingerprint: "fingerprint",
      tableBindings: [{
        tableIndex: 0,
        headers: ["任务名称", "消耗"],
        identityColumn: "任务名称",
        identityColumnIndex: 0,
        timeRange: "今日",
        timeRangeLocation: "section:0>span:0",
        componentPath: "section:0>table:1",
        bindingSignature: "known",
        validationStatus: "REQUIRES_REVIEW" as const,
        validationReasons: []
      }]
    };
    const trusted = await qualifyTableBindings(db, {
      workspaceId: "workspace", routeKey: "TASK_TABLE", captureMeta: base as never
    });
    expect(trusted?.tableBindings?.[0]?.validationStatus).toBe("TRUSTED");

    const changed = await qualifyTableBindings(db, {
      workspaceId: "workspace",
      routeKey: "TASK_TABLE",
      captureMeta: { ...base, tableBindings: [{ ...base.tableBindings[0], bindingSignature: "shifted" }] } as never
    });
    expect(changed?.tableBindings?.[0]?.validationStatus).toBe("REQUIRES_REVIEW");

    const legacy = await qualifyTableBindings(db, {
      workspaceId: "workspace",
      routeKey: "TASK_TABLE",
      captureMeta: { ...base, tableBindings: [{ ...base.tableBindings[0], timeRange: undefined, timeRangeLocation: undefined }] } as never
    });
    expect(legacy?.tableBindings?.[0]?.validationStatus).toBe("INVALID");
  });

  it("checks table binding metadata against the uploaded rows", async () => {
    const db = { collectionBindingCalibration: { findMany: async () => [] } } as never;
    const captureMeta = {
      pageFingerprint: "fingerprint",
      tableBindings: [{
        tableIndex: 0,
        headers: ["任务名称", "消耗", "ROI"],
        identityColumn: "任务名称",
        identityColumnIndex: 0,
        timeRange: "今日",
        timeRangeLocation: "section:0>span:0",
        componentPath: "section:0>table:1",
        bindingSignature: "signature",
        validationStatus: "REQUIRES_REVIEW" as const,
        validationReasons: []
      }]
    };
    const result = await qualifyTableBindings(db, {
      workspaceId: "workspace",
      routeKey: "TASK_TABLE",
      captureMeta: captureMeta as never,
      rawTableData: [["任务名称", "ROI", "消耗"], ["计划 A", "4", "100"], ["计划 A", "5"]]
    });

    expect(result?.tableBindings?.[0]).toMatchObject({
      validationStatus: "INVALID",
      validationReasons: expect.arrayContaining([
        "TABLE_HEADER_DATA_MISMATCH",
        "TABLE_COLUMN_COUNT_MISMATCH",
        "TABLE_ROW_IDENTITY_DUPLICATED"
      ])
    });
  });
});
