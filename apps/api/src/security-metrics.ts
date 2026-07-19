import type { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma.js";
import { sanitizeErrorForLog } from "./http-security.js";

export type SecurityMetricKey =
  | "account_route_mismatches"
  | "backup_runs"
  | "csrf_rejections"
  | "database_errors"
  | "decision_conflicts"
  | "pairing_failures"
  | "rate_limit_rejections"
  | "retention_processed_records"
  | "retention_runs"
  | "restore_verifications"
  | "snapshot_payload_bytes"
  | "sse_active_connections";

type SecurityMetricObservation = {
  key: SecurityMetricKey;
  value?: number;
};

type SecurityMetricAggregate = {
  key: SecurityMetricKey;
  windowStartedAt: Date;
  occurrenceCount: number;
  valueTotal: number;
  lastValue: number;
};

const metricKeyByErrorCode: Readonly<Record<string, SecurityMetricKey | undefined>> = {
  ACCOUNT_MISMATCH: "account_route_mismatches",
  ACCOUNT_UNVERIFIED: "account_route_mismatches",
  CSRF_INVALID: "csrf_rejections",
  DATABASE_NOT_READY: "database_errors",
  DECISION_EVIDENCE_CHANGED: "decision_conflicts",
  EXTENSION_ACCOUNT_MISMATCH: "account_route_mismatches",
  EXTENSION_TASK_ACCOUNT_MISMATCH: "account_route_mismatches",
  PAIRING_CODE_ALREADY_USED: "pairing_failures",
  PAIRING_CODE_INVALID: "pairing_failures",
  PAIRING_CODE_UNAVAILABLE: "pairing_failures",
  RATE_LIMITED: "rate_limit_rejections",
  SNAPSHOT_TASK_MISMATCH: "account_route_mismatches"
};

const pendingMetrics = new Map<string, SecurityMetricAggregate>();
let flushTimer: NodeJS.Timeout | null = null;
let activeFlush: Promise<void> | null = null;

export function observeSecurityMetricResponse(req: Request, res: Response, next: NextFunction) {
  res.once("finish", () => {
    const observations: SecurityMetricObservation[] = [];
    const errorCode = typeof res.locals.errorCode === "string" ? res.locals.errorCode : undefined;
    const errorMetricKey = errorCode ? metricKeyByErrorCode[errorCode] : undefined;
    if (errorMetricKey) observations.push({ key: errorMetricKey });

    const rawBodyBytes = (req as Request & { rawBodyBytes?: unknown }).rawBodyBytes;
    if (req.method === "POST" && /^\/collection-tasks\/[^/]+\/snapshots$/.test(req.path) && typeof rawBodyBytes === "number") {
      observations.push({ key: "snapshot_payload_bytes", value: rawBodyBytes });
    }
    queueSecurityMetrics(observations);
  });
  return next();
}

export async function recordSecurityMetrics(observations: SecurityMetricObservation[], now = new Date()) {
  await persistSecurityMetrics(toAggregates(observations, now));
}

export function queueSecurityMetrics(observations: SecurityMetricObservation[]) {
  const aggregates = toAggregates(observations, new Date());
  for (const aggregate of aggregates) mergeAggregate(pendingMetrics, aggregate);
  if (pendingMetrics.size > 0 && !flushTimer) {
    flushTimer = setTimeout(() => {
      void flushSecurityMetrics().catch((error: unknown) => {
        console.error("Security metric recording failed", sanitizeErrorForLog(error));
      });
    }, 60_000);
    flushTimer.unref();
  }
}

export async function flushSecurityMetrics() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (activeFlush) {
    await activeFlush;
    return flushSecurityMetrics();
  }
  const aggregates = [...pendingMetrics.values()];
  pendingMetrics.clear();
  if (!aggregates.length) return;

  activeFlush = persistSecurityMetrics(aggregates);
  try {
    await activeFlush;
  } catch (error) {
    for (const aggregate of aggregates) mergeAggregate(pendingMetrics, aggregate);
    throw error;
  } finally {
    activeFlush = null;
  }
  if (pendingMetrics.size > 0) await flushSecurityMetrics();
}

function toAggregates(observations: SecurityMetricObservation[], now: Date) {
  const aggregates = new Map<string, SecurityMetricAggregate>();
  const windowStartedAt = startOfUtcHour(now);
  for (const { key, value = 1 } of observations) {
    const aggregate: SecurityMetricAggregate = {
      key,
      windowStartedAt,
      occurrenceCount: 1,
      valueTotal: normalizeMetricValue(value),
      lastValue: normalizeMetricValue(value)
    };
    mergeAggregate(aggregates, aggregate);
  }
  return [...aggregates.values()];
}

async function persistSecurityMetrics(aggregates: SecurityMetricAggregate[]) {
  await Promise.all(aggregates.map(async (aggregate) => {
    await prisma.securityMetric.upsert({
      where: { metricKey_windowStartedAt: { metricKey: aggregate.key, windowStartedAt: aggregate.windowStartedAt } },
      create: {
        metricKey: aggregate.key,
        windowStartedAt: aggregate.windowStartedAt,
        occurrenceCount: aggregate.occurrenceCount,
        valueTotal: BigInt(aggregate.valueTotal),
        lastValue: BigInt(aggregate.lastValue)
      },
      update: {
        occurrenceCount: { increment: aggregate.occurrenceCount },
        valueTotal: { increment: BigInt(aggregate.valueTotal) },
        lastValue: BigInt(aggregate.lastValue)
      }
    });
  }));
}

function mergeAggregate(target: Map<string, SecurityMetricAggregate>, aggregate: SecurityMetricAggregate) {
  const key = `${aggregate.key}\u0000${aggregate.windowStartedAt.toISOString()}`;
  const existing = target.get(key);
  if (!existing) {
    target.set(key, { ...aggregate });
    return;
  }
  existing.occurrenceCount += aggregate.occurrenceCount;
  existing.valueTotal += aggregate.valueTotal;
  existing.lastValue = aggregate.lastValue;
}

function normalizeMetricValue(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER);
}

function startOfUtcHour(date: Date) {
  const windowStartedAt = new Date(date);
  windowStartedAt.setUTCMinutes(0, 0, 0);
  return windowStartedAt;
}
