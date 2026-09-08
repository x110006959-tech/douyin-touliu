import { describe, expect, it } from "vitest";
import {
  buildDiagnosisContext,
  buildRecentFifteenMinuteTrend,
  compareAnalysisWindowPoints,
  compareHistoryMetrics,
  comparePeriodPoints,
  projectHistoryInputFingerprint,
  sanitizeProjectHistoryMetrics
} from "./project-history.js";

describe("project history comparison", () => {
  it("stores a small route-scoped projection instead of raw metric evidence", () => {
    const metrics = sanitizeProjectHistoryMetrics([
      metric("spend", 100, "消耗"),
      metric("gmv", 300, "支付金额")
    ], "LOCAL_PROMOTION_DASHBOARD");

    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ routeKey: "LOCAL_PROMOTION_DASHBOARD", metricKey: "spend", value: 100, quality: "TRUSTED" }),
      expect.objectContaining({ routeKey: "LOCAL_PROMOTION_DASHBOARD", metricKey: "gmv", value: 300, quality: "TRUSTED" })
    ]));
    expect(JSON.stringify(metrics)).not.toContain("secret-cookie");
    expect(JSON.stringify(metrics)).not.toContain("https://platform.example");
  });

  it("only judges efficiency after it can recompute same-route ROI from matching inputs", () => {
    const baseline = sanitizeProjectHistoryMetrics([metric("spend", 100, "消耗"), metric("gmv", 200, "支付金额")], "LOCAL_PROMOTION_DASHBOARD");
    const current = sanitizeProjectHistoryMetrics([metric("spend", 100, "消耗"), metric("gmv", 300, "支付金额")], "LOCAL_PROMOTION_DASHBOARD");

    const comparison = compareHistoryMetrics({
      kind: "ANALYSIS_ARCHIVE",
      label: "测试",
      baselineLabel: "基准",
      currentLabel: "当前",
      baselineAt: new Date("2026-09-01T00:00:00.000Z"),
      currentAt: new Date("2026-09-01T01:00:00.000Z"),
      baseline,
      current
    });

    expect(comparison.status).toBe("IMPROVED");
    expect(comparison.rows).toContainEqual(expect.objectContaining({ metricKey: "pay_roi", baselineValue: 2, currentValue: 3, conclusion: "IMPROVED" }));
  });

  it("does not merge different collection routes into one ROI", () => {
    const baseline = sanitizeProjectHistoryMetrics([metric("spend", 100, "消耗")], "LOCAL_PROMOTION_DASHBOARD");
    const current = sanitizeProjectHistoryMetrics([metric("gmv", 300, "支付金额")], "LIVE_DATA_SCREEN");

    const comparison = compareHistoryMetrics({
      kind: "ANALYSIS_ARCHIVE",
      label: "测试",
      baselineLabel: "基准",
      currentLabel: "当前",
      baselineAt: new Date("2026-09-01T00:00:00.000Z"),
      currentAt: new Date("2026-09-01T01:00:00.000Z"),
      baseline,
      current
    });

    expect(comparison.status).toBe("INSUFFICIENT");
    expect(comparison.rows.some((row) => row.metricKey === "pay_roi")).toBe(false);
  });

  it("does not label a raw ratio movement as improvement without recomputable inputs", () => {
    const baseline = sanitizeProjectHistoryMetrics([metric("pay_roi", 2, "支付 ROI")], "LOCAL_PROMOTION_DASHBOARD");
    const current = sanitizeProjectHistoryMetrics([metric("pay_roi", 3, "支付 ROI")], "LOCAL_PROMOTION_DASHBOARD");

    const comparison = compareHistoryMetrics({
      kind: "ANALYSIS_ARCHIVE",
      label: "测试",
      baselineLabel: "基准",
      currentLabel: "当前",
      baselineAt: null,
      currentAt: null,
      baseline,
      current
    });

    expect(comparison.status).toBe("INSUFFICIENT");
    expect(comparison.rows).toContainEqual(expect.objectContaining({ metricKey: "pay_roi", conclusion: "RAW_CHANGE" }));
  });

  it("does not treat an unchanged raw ratio as an overall conclusion", () => {
    const baseline = sanitizeProjectHistoryMetrics([metric("pay_roi", 2, "支付 ROI")], "LOCAL_PROMOTION_DASHBOARD");
    const current = sanitizeProjectHistoryMetrics([metric("pay_roi", 2, "支付 ROI")], "LOCAL_PROMOTION_DASHBOARD");

    const comparison = compareHistoryMetrics({
      kind: "ANALYSIS_ARCHIVE",
      label: "测试",
      baselineLabel: "基准",
      currentLabel: "当前",
      baselineAt: null,
      currentAt: null,
      baseline,
      current
    });

    expect(comparison.status).toBe("INSUFFICIENT");
    expect(comparison.rows).toContainEqual(expect.objectContaining({ metricKey: "pay_roi", conclusion: "NO_CHANGE" }));
  });

  it("does not judge a period when either side lacks every complete day", () => {
    const scopeFingerprint = "a".repeat(64);
    const points = [
      historyPoint("2026-09-06T00:00:00.000Z", 10, 20, scopeFingerprint),
      historyPoint("2026-09-06T01:00:00.000Z", 20, 60, scopeFingerprint),
      historyPoint("2026-09-08T00:00:00.000Z", 10, 20, scopeFingerprint),
      historyPoint("2026-09-08T01:00:00.000Z", 20, 80, scopeFingerprint)
    ];

    const comparison = comparePeriodPoints(points, 2, new Date("2026-09-10T00:00:00.000Z"));

    expect(comparison.status).toBe("INSUFFICIENT");
    expect(comparison.rows).toEqual([]);
  });
});

describe("analysis window evidence coverage", () => {
  const analyzedAt = new Date("2026-08-15T10:00:00Z");
  const scope = "a".repeat(64);
  const at = (time: string, spend = 100, gmv = 200) => historyPoint(`2026-08-15T${time}Z`, spend, gmv, scope);

  it("does not call the analysis-time point an after sample", () => {
    const result = compareAnalysisWindowPoints([at("09:30:00"), at("10:00:00", 200, 600)], analyzedAt, 30, new Date("2026-08-15T11:00:00Z"));
    expect(result.status).toBe("INSUFFICIENT");
    expect(result.rows).toEqual([]);
  });

  it.each([30, 60] as const)("waits until the %i minute observation window has ended", (minutes) => {
    const result = compareAnalysisWindowPoints([at("09:00:00"), at("09:30:00"), at("10:30:00", 200, 600), at("11:00:00", 200, 600)], analyzedAt, minutes, new Date(analyzedAt.getTime() + minutes * 60_000 - 1));
    expect(result.status).toBe("INSUFFICIENT");
    expect(result.notices[0]).toContain("尚未结束");
  });

  it("requires samples within the tolerance on both sides", () => {
    for (const points of [[at("09:14:00"), at("10:30:00")], [at("09:30:00"), at("10:46:00")], [at("10:30:00")]]) {
      expect(compareAnalysisWindowPoints(points, analyzedAt, 30, new Date("2026-08-15T11:00:00Z")).status).toBe("INSUFFICIENT");
    }
  });

  it("excludes future-dated samples even when they are near the target", () => {
    expect(compareAnalysisWindowPoints([at("09:30:00"), at("10:31:00")], analyzedAt, 30, new Date("2026-08-15T10:30:00Z")).status).toBe("INSUFFICIENT");
  });

  it.each([30, 60] as const)("compares real samples on both sides of a completed %i minute window", (minutes) => {
    const points = [historyPoint(new Date(analyzedAt.getTime() - minutes * 60_000).toISOString(), 100, 200, scope), historyPoint(new Date(analyzedAt.getTime() + minutes * 60_000).toISOString(), 200, 600, scope)];
    const result = compareAnalysisWindowPoints(points, analyzedAt, minutes, new Date("2026-08-15T11:00:00Z"));
    expect(result.status).toBe("IMPROVED");
    expect(result.currentAt).toBe(points[1]!.observedAt.toISOString());
  });
});

describe("frozen 15-minute recent trend", () => {
  const now = new Date("2026-08-15T10:30:00.000Z");

  it("uses two complete same-session full-domain windows and recomputes only window deltas", () => {
    const trend = buildRecentFifteenMinuteTrend(completeRecentTrendPoints(), now);

    expect(trend).toMatchObject({
      status: "AVAILABLE",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      scope: "FULL_DOMAIN",
      efficiency: { baselineValue: 2, currentValue: 3, delta: 1 }
    });
    expect(trend.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ metricKey: "spend", baselineValue: 150, currentValue: 300 }),
      expect.objectContaining({ metricKey: "full_domain_gmv", baselineValue: 300, currentValue: 900 })
    ]));
    expect(trend.reason).toContain("不表示广告因果增量");
  });

  it.each(["missing-minute", "cross-session", "counter-reset", "scope-mismatch"])("does not create an efficiency conclusion for %s", (problem) => {
    const points = completeRecentTrendPoints();
    if (problem === "missing-minute") points.splice(8, 1);
    if (problem === "cross-session") points[8]!.sessionId = "another-collection-round";
    if (problem === "counter-reset") (points[20]!.metricsJson as Array<{ metricKey: string; value: number }>).find((metric) => metric.metricKey === "full_domain_gmv")!.value = 1;
    if (problem === "scope-mismatch") {
      for (const point of points) {
        const spend = (point.metricsJson as Array<{ metricKey: string; scopeFingerprint: string }>).find((metric) => metric.metricKey === "spend");
        if (spend) spend.scopeFingerprint = "b".repeat(64);
      }
    }

    const trend = buildRecentFifteenMinuteTrend(points, now);
    expect(trend.status).toBe("INSUFFICIENT");
    expect(trend.efficiency).toBeNull();
  });

  it("retains comparable cumulative amounts but suppresses ROI when either window has zero spend", () => {
    const points = completeRecentTrendPoints();
    for (const point of points) {
      const spend = (point.metricsJson as Array<{ metricKey: string; value: number }>).find((metric) => metric.metricKey === "spend");
      if (spend) spend.value = 100;
    }

    const trend = buildRecentFifteenMinuteTrend(points, now);
    expect(trend.status).toBe("AVAILABLE");
    expect(trend.efficiency).toBeNull();
    expect(trend.reason).toContain("零消耗窗口");
  });

  it("includes an observed ending-minute boundary but never a future sample", () => {
    const points = completeRecentTrendPoints();
    points[30]!.observedAt = new Date("2026-08-15T10:30:20.000Z");
    expect(buildRecentFifteenMinuteTrend(points, new Date("2026-08-15T10:30:25.000Z")).status).toBe("AVAILABLE");
    expect(buildRecentFifteenMinuteTrend(points, now).status).toBe("INSUFFICIENT");
  });
});

describe("diagnosis context freezing", () => {
  it("freezes only this task's manually executed actions, their latest outcomes and the chosen scenario", async () => {
    let proposalWhere: unknown;
    const db = {
      projectHistoryMetricPoint: { findMany: async () => [] },
      actionProposal: {
        findMany: async (args: { where: unknown }) => {
          proposalWhere = args.where;
          return [
            { id: "executed-without-outcome", actionType: "OBSERVE", manualExecutedAt: new Date("2026-08-15T10:00:00.000Z"), outcomes: [] },
            { id: "executed-with-outcome", actionType: "CHECK_LIVE_ROOM", manualExecutedAt: new Date("2026-08-15T09:00:00.000Z"), outcomes: [{ result: "IMPROVED", createdAt: new Date("2026-08-15T09:20:00.000Z") }] }
          ];
        }
      }
    } as unknown as Parameters<typeof buildDiagnosisContext>[0];

    const context = await buildDiagnosisContext(db, {
      projectId: "project-a",
      collectionTaskId: "task-a",
      scenario: "LIVE_MONITORING",
      now: new Date("2026-08-15T10:30:00.000Z")
    });

    expect(context.scenario).toBe("LIVE_MONITORING");
    expect(context.manualActions).toEqual([
      expect.objectContaining({ actionProposalId: "executed-without-outcome", outcome: null }),
      expect.objectContaining({ actionProposalId: "executed-with-outcome", outcome: { result: "IMPROVED", recordedAt: "2026-08-15T09:20:00.000Z" } })
    ]);
    expect(proposalWhere).toEqual({ collectionTaskId: "task-a", manualExecutedAt: { not: null } });
  });

  it("changes the input fingerprint when the frozen scenario, trend or execution record changes", () => {
    const historyContext = {
      version: 1 as const,
      capturedAt: "2026-08-15T10:30:00.000Z",
      archiveComparison: emptyHistoryComparison("ANALYSIS_ARCHIVE"),
      periodComparison: emptyHistoryComparison("PERIOD")
    };
    const baseContext = {
      version: 1 as const,
      scenario: "UNSPECIFIED" as const,
      recentTrend: emptyRecentTrend(),
      manualActions: []
    };
    const fingerprint = projectHistoryInputFingerprint("evidence", historyContext, baseContext);
    expect(projectHistoryInputFingerprint("evidence", historyContext, {
      ...baseContext, recentTrend: buildRecentFifteenMinuteTrend(completeRecentTrendPoints(), new Date("2026-08-15T10:30:00.000Z"))
    })).not.toBe(fingerprint);
    expect(projectHistoryInputFingerprint("evidence", historyContext, { ...baseContext, scenario: "POST_LIVE_REVIEW" })).not.toBe(fingerprint);
    expect(projectHistoryInputFingerprint("evidence", historyContext, { ...baseContext, manualActions: [{ actionProposalId: "action-a", actionType: "OBSERVE" as const, executedAt: "2026-08-15T10:00:00.000Z", outcome: null }] })).not.toBe(fingerprint);
  });
});

describe("period aggregation semantics", () => {
  it.each([7, 30])("recomputes ROI for %i fully covered days without adding ratios or gauges", (days) => {
    const { points, now } = completePeriod(days);
    const result = comparePeriodPoints(points, days, now);
    expect(result.status).toBe("IMPROVED");
    expect(result.rows.filter((row) => row.metricKey === "pay_roi")).toEqual([
      expect.objectContaining({ baselineValue: 2, currentValue: 3, conclusion: "IMPROVED" })
    ]);
    expect(result.rows.some((row) => ["ctr", "average_watch_duration_seconds", "current_online_viewers"].includes(row.metricKey))).toBe(false);
  });

  it("rejects daily one-minute samples even when every date is present", () => {
    const { points, now } = completePeriod(7);
    const sparse = points.filter((_, index) => index % 1440 === 480 || index % 1440 === 481);
    const result = comparePeriodPoints(sparse, 7, now);
    expect(result.status).toBe("INSUFFICIENT");
    expect(result.rows).toEqual([]);
  });

  it("does not add raw ratios when their denominators are missing", () => {
    const { points, now } = completePeriod(2);
    for (const point of points) point.metricsJson = point.metricsJson.filter((metric) => metric.metricKey !== "spend");
    const result = comparePeriodPoints(points, 2, now);
    expect(result.status).toBe("INSUFFICIENT");
    expect(result.rows.some((row) => row.metricKey === "pay_roi")).toBe(false);
  });

  it.each(["missing-minute", "reset", "different-session", "untrusted"])("does not assert efficiency for %s in an otherwise covered day", (problem) => {
    const { points, now } = completePeriod(2);
    const point = points[700]!;
    if (problem === "missing-minute") points.splice(700, 1);
    if (problem === "reset") point.metricsJson[0]!.value = 1;
    if (problem === "different-session") point.sessionId = "another-round";
    if (problem === "untrusted") point.metricsJson[0]!.quality = "REVIEW_REQUIRED";
    expect(comparePeriodPoints(points, 2, now).status).toBe("INSUFFICIENT");
  });
});

function completePeriod(days: number) {
  const firstDay = Date.parse("2026-06-01T16:00:00Z");
  const points = Array.from({ length: days * 2 * 1440 }, (_, index) => {
    const day = Math.floor(index / 1440);
    const minute = index % 1440;
    const point = historyPoint(new Date(firstDay + index * 60_000).toISOString(), minute + 1, (minute + 1) * (day < days ? 2 : 3), "a".repeat(64));
    point.sessionId = `round-${day}`;
    const template = point.metricsJson[0]!;
    point.metricsJson.push(...["pay_roi", "ctr", "average_watch_duration_seconds", "current_online_viewers"].map((metricKey) => ({ ...template, metricKey, metricName: metricKey, value: 2 })));
    return point;
  });
  return { points, now: new Date(firstDay + days * 2 * 1440 * 60_000) };
}

function metric(key: "spend" | "gmv" | "pay_roi", value: number, name: string) {
  return {
    key,
    name,
    value,
    unit: null,
    source: "network" as const,
    metricSource: "XHR_JSON" as const,
    rawEvidence: {
      sourceType: "INTERNAL_API",
      routeKey: "LOCAL_PROMOTION_DASHBOARD" as const,
      timeRange: "实时",
      validationStatus: "TRUSTED" as const,
      url: "https://platform.example/secret-cookie"
    }
  };
}

function historyPoint(at: string, spend: number, gmv: number, scopeFingerprint: string) {
  return {
    id: at,
    sessionId: "session-1",
    routeKey: "LOCAL_PROMOTION_DASHBOARD",
    observedAt: new Date(at),
    metricsJson: [
      { routeKey: "LOCAL_PROMOTION_DASHBOARD", metricKey: "spend", metricName: "消耗", value: spend, unit: "元", scopeFingerprint, quality: "TRUSTED" },
      { routeKey: "LOCAL_PROMOTION_DASHBOARD", metricKey: "gmv", metricName: "支付金额", value: gmv, unit: "元", scopeFingerprint, quality: "TRUSTED" }
    ]
  };
}

function completeRecentTrendPoints() {
  const start = Date.parse("2026-08-15T10:00:00.000Z");
  const scopeFingerprint = "a".repeat(64);
  return Array.from({ length: 31 }, (_, index) => {
    const baseline = index <= 15;
    const spend = baseline ? 100 + index * 10 : 250 + (index - 15) * 20;
    const gmv = baseline ? 200 + index * 20 : 500 + (index - 15) * 60;
    return {
      id: `recent-${index}`,
      sessionId: "collection-round-a",
      routeKey: "LOCAL_PROMOTION_DASHBOARD",
      observedAt: new Date(start + index * 60_000),
      metricsJson: [
        { routeKey: "LOCAL_PROMOTION_DASHBOARD", metricKey: "spend", metricName: "全域消耗", value: spend, unit: "元", scopeFingerprint, quality: "TRUSTED" },
        { routeKey: "LOCAL_PROMOTION_DASHBOARD", metricKey: "full_domain_gmv", metricName: "全域成交金额", value: gmv, unit: "元", scopeFingerprint, quality: "TRUSTED" },
        { routeKey: "LOCAL_PROMOTION_DASHBOARD", metricKey: "full_domain_orders", metricName: "全域成交订单数", value: index, unit: null, scopeFingerprint, quality: "TRUSTED" }
      ]
    };
  });
}

function emptyHistoryComparison(kind: "ANALYSIS_ARCHIVE" | "PERIOD") {
  return {
    kind,
    status: "INSUFFICIENT" as const,
    label: "无可比历史",
    baselineLabel: "无",
    currentLabel: "当前",
    baselineAt: null,
    currentAt: null,
    rows: [],
    notices: ["无可比历史"]
  };
}

function emptyRecentTrend() {
  return {
    status: "INSUFFICIENT" as const,
    reason: "缺少完整窗口",
    baselineStartAt: null,
    baselineEndAt: null,
    currentStartAt: null,
    currentEndAt: null,
    routeKey: null,
    scope: null,
    metrics: [],
    efficiency: null
  };
}
