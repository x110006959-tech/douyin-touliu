import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  metricKeyLabels,
  metricValueSemantic,
  metricValueToRuleNumber,
  projectHistoryDecisionContextSchema,
  projectHistoryMetricSchema,
  standardizeMetricKey,
  type CollectionRouteKey,
  type DecisionEngineInput,
  type ProjectHistoryComparison,
  type ProjectHistoryMetric,
  type VisibleMetric
} from "@douyin-local-life/shared";

export const projectHistoryInactivityMs = 3 * 60 * 60 * 1_000;
export const minuteMs = 60_000;
export const recentTrendWindowMinutes = 15;
export const recentTrendWindowMs = recentTrendWindowMinutes * minuteMs;
export const minutesPerDay = 24 * 60;
export const analysisWindowToleranceMs = 15 * minuteMs;
export const beijingOffsetMs = 8 * 60 * 60 * 1_000;

export type HistoryClient = Prisma.TransactionClient | PrismaClient;
export type DiagnosisContextClient = Pick<PrismaClient, "projectHistoryMetricPoint" | "actionProposal"> | Prisma.TransactionClient;
export type ProjectHistoryComparisonPoint = {
  id: string;
  routeKey: string;
  observedAt: Date;
  metricsJson: unknown;
  sessionId: string;
};

export function sanitizeProjectHistoryMetrics(metrics: VisibleMetric[], routeKey: CollectionRouteKey): ProjectHistoryMetric[] {
  const byMetric = new Map<string, ProjectHistoryMetric>();
  for (const metric of metrics) {
    const metricKey = standardizeMetricKey(metric);
    if (metricKey === "unknown") continue;
    const value = metricValueToRuleNumber(metric, metricValueSemantic(metricKey));
    if (value == null) continue;
    const trustedInternalPulse = metric.source === "network"
      && metric.metricSource === "XHR_JSON"
      && metric.rawEvidence?.sourceType === "INTERNAL_API"
      && metric.rawEvidence?.sourceStatus === "INTERNAL_API"
      && metric.rawEvidence?.evidencePurpose === "PULSE_ONLY";
    const quality = metric.rawEvidence?.validationStatus === "TRUSTED" || metric.metricSource === "MANUAL_INPUT" || trustedInternalPulse
      ? "TRUSTED" as const
      : "REVIEW_REQUIRED" as const;
    const scopeFingerprint = historyScopeFingerprint({
      routeKey,
      semanticScope: normalizedHistoryMetricScope(metricKey, metric.rawEvidence?.semanticScope || null),
      timeRange: metric.rawEvidence?.timeRange || null
    });
    const item = projectHistoryMetricSchema.parse({
      routeKey,
      metricKey,
      metricName: metricKeyLabels[metricKey],
      value,
      unit: metric.unit || null,
      scopeFingerprint,
      quality
    });
    byMetric.set(`${item.metricKey}:${item.scopeFingerprint}`, item);
  }
  return [...byMetric.values()].sort((left, right) => left.metricKey.localeCompare(right.metricKey) || left.scopeFingerprint.localeCompare(right.scopeFingerprint));
}

export function archiveMetricsFromDecisionInput(input: DecisionEngineInput): ProjectHistoryMetric[] {
  const byRoute = new Map<CollectionRouteKey, VisibleMetric[]>();
  for (const metric of input.metrics) {
    const routeKey = metric.rawEvidence?.routeKey;
    if (routeKey !== "LIVE_DATA_SCREEN" && routeKey !== "LOCAL_PROMOTION_DASHBOARD") continue;
    byRoute.set(routeKey, [...(byRoute.get(routeKey) || []), metric]);
  }
  return [...byRoute.entries()].flatMap(([routeKey, metrics]) => sanitizeProjectHistoryMetrics(metrics, routeKey));
}

export function projectHistoryInputFingerprint(
  evidenceFingerprint: string,
  historyContext: {
    archiveComparison: ProjectHistoryComparison;
    periodComparison: ProjectHistoryComparison;
  },
  diagnosisContext?: unknown
) {
  return createHash("sha256")
    .update(JSON.stringify({
      evidenceFingerprint,
      archiveComparison: fingerprintComparison(historyContext.archiveComparison),
      periodComparison: fingerprintComparison(historyContext.periodComparison),
      diagnosisContext: diagnosisContext || null
    }), "utf8")
    .digest("hex");
}

export function readHistoryMetrics(value: unknown): ProjectHistoryMetric[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = projectHistoryMetricSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function readHistoryContext(value: unknown) {
  const parsed = projectHistoryDecisionContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function historyMetricSetFingerprint(metrics: ProjectHistoryMetric[]) {
  return createHash("sha256")
    .update(JSON.stringify([...metrics].sort((left, right) => metricComparisonKey(left).localeCompare(metricComparisonKey(right)))), "utf8")
    .digest("hex");
}

export function fingerprintComparison(comparison: ProjectHistoryComparison) {
  return {
    kind: comparison.kind,
    status: comparison.status,
    baselineAt: comparison.baselineAt,
    rows: comparison.rows.map((row) => ({
      routeKey: row.routeKey,
      metricKey: row.metricKey,
      baselineValue: row.baselineValue,
      currentValue: row.currentValue,
      delta: row.delta,
      conclusion: row.conclusion
    })),
    notices: comparison.notices
  };
}

export function metricComparisonKey(metric: ProjectHistoryMetric) {
  return `${metric.routeKey}:${metric.metricKey}:${metric.scopeFingerprint}`;
}

export function isRatioMetric(metricKey: string) {
  return ["verify_roi", "gross_profit_roi", "pay_roi", "full_domain_pay_roi", "ctr", "product_click_rate", "product_conversion_rate", "live_room_click_rate"].includes(metricKey);
}

export function isCumulativeMetric(metricKey: string) {
  return ["spend", "gmv", "orders", "full_domain_gmv", "full_domain_orders", "full_domain_product_clicks", "impressions", "clicks", "live_viewers", "exposure_users", "click_users", "transaction_users", "shelf_gmv", "search_gmv", "poi_visits", "store_searches"].includes(metricKey);
}

export function startOfBeijingDay(now: Date) {
  const shifted = new Date(now.getTime() + beijingOffsetMs);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - beijingOffsetMs);
}

export function startOfBeijingDayDaysAgo(now: Date, days: number) {
  return new Date(startOfBeijingDay(now).getTime() - days * 24 * 60 * 60 * 1_000);
}

export function beijingDayKey(value: Date) {
  return new Date(value.getTime() + beijingOffsetMs).toISOString().slice(0, 10);
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function historyScopeFingerprint(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function normalizedHistoryMetricScope(metricKey: string, semanticScope: string | null) {
  if (metricKey === "full_domain_gmv" || metricKey === "full_domain_orders" || metricKey === "full_domain_product_clicks" || metricKey === "full_domain_pay_roi") {
    return "FULL_DOMAIN";
  }
  if (metricKey === "spend" && semanticScope?.includes("全域")) return "FULL_DOMAIN";
  if (semanticScope?.includes("整体")) return "OVERALL";
  return semanticScope;
}
