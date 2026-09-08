import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  diagnosisContextSchema,
  metricKeyLabels,
  metricValueSemantic,
  metricValueToRuleNumber,
  projectHistoryComparisonSchema,
  projectHistoryDecisionContextSchema,
  projectHistoryMetricSchema,
  standardizeMetricKey,
  type CollectionRouteKey,
  type DiagnosisContext,
  type DiagnosisRecentTrend,
  type DiagnosisScenario,
  type DecisionEngineInput,
  type ProjectHistoryComparison,
  type ProjectHistoryDecisionContext,
  type ProjectHistoryMetric,
  type VisibleMetric
} from "@douyin-local-life/shared";

export const projectHistoryInactivityMs = 3 * 60 * 60 * 1_000;
const minuteMs = 60_000;
const recentTrendWindowMinutes = 15;
const recentTrendWindowMs = recentTrendWindowMinutes * minuteMs;
const minutesPerDay = 24 * 60;
const analysisWindowToleranceMs = 15 * minuteMs;
const beijingOffsetMs = 8 * 60 * 60 * 1_000;

type HistoryClient = Prisma.TransactionClient | PrismaClient;
type DiagnosisContextClient = Pick<PrismaClient, "projectHistoryMetricPoint" | "actionProposal"> | Prisma.TransactionClient;
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

export async function recordProjectHistoryObservation(
  db: HistoryClient,
  input: {
    projectId: string;
    collectionTaskId: string;
    routeKey: CollectionRouteKey;
    pageType: string;
    observedAt: Date;
    sourceKind: "PULSE" | "SNAPSHOT" | "MANUAL";
    metrics: VisibleMetric[];
    now?: Date;
  }
) {
  const now = input.now || new Date();
  const session = await activeProjectHistorySession(db, input.projectId, now);
  const bucketAt = new Date(Math.floor(input.observedAt.getTime() / minuteMs) * minuteMs);
  const metrics = sanitizeProjectHistoryMetrics(input.metrics, input.routeKey);
  await db.projectHistoryMetricPoint.upsert({
    where: { sessionId_routeKey_bucketAt: { sessionId: session.id, routeKey: input.routeKey, bucketAt } },
    create: {
      projectId: input.projectId,
      collectionTaskId: input.collectionTaskId,
      sessionId: session.id,
      routeKey: input.routeKey,
      pageType: input.pageType,
      observedAt: input.observedAt,
      bucketAt,
      sourceKind: input.sourceKind,
      metricsJson: toJson(metrics)
    },
    update: {
      collectionTaskId: input.collectionTaskId,
      pageType: input.pageType,
      observedAt: input.observedAt,
      sourceKind: input.sourceKind,
      metricsJson: toJson(metrics)
    }
  });
  return session;
}

export async function createProjectAnalysisArchive(
  db: HistoryClient,
  input: {
    archiveKey: string;
    projectId: string;
    collectionTaskId: string;
    decisionRunId: string;
    status: "QUEUED" | "REUSED";
    metrics: ProjectHistoryMetric[];
    historyContext: ProjectHistoryDecisionContext;
    now?: Date;
  }
) {
  const now = input.now || new Date();
  const session = await activeProjectHistorySession(db, input.projectId, now);
  return db.projectAnalysisArchive.create({
    data: {
      archiveKey: input.archiveKey,
      projectId: input.projectId,
      collectionTaskId: input.collectionTaskId,
      sessionId: session.id,
      decisionRunId: input.decisionRunId,
      status: input.status,
      archivedAt: now,
      metricsJson: toJson(input.metrics),
      historyContextJson: toJson(input.historyContext)
    }
  });
}

export async function markProjectAnalysisArchiveRunStatus(
  db: Pick<PrismaClient, "projectAnalysisArchive"> | Prisma.TransactionClient,
  decisionRunId: string,
  status: "SUCCEEDED" | "FAILED"
) {
  return db.projectAnalysisArchive.updateMany({ where: { decisionRunId, status: "QUEUED" }, data: { status } });
}

export async function buildProjectHistoryDecisionContext(
  db: HistoryClient,
  projectId: string,
  currentMetrics: ProjectHistoryMetric[],
  now = new Date()
): Promise<ProjectHistoryDecisionContext> {
  const [archives, periodPoints] = await Promise.all([
    db.projectAnalysisArchive.findMany({ where: { projectId }, orderBy: [{ archivedAt: "desc" }, { id: "desc" }], take: 20 }),
    db.projectHistoryMetricPoint.findMany({
      where: { projectId, observedAt: { gte: startOfBeijingDayDaysAgo(now, 14), lt: startOfBeijingDay(now) } },
      orderBy: [{ observedAt: "asc" }, { id: "asc" }]
    })
  ]);
  const currentMetricsFingerprint = historyMetricSetFingerprint(currentMetrics);
  const latestArchive = archives.find((archive) => historyMetricSetFingerprint(readHistoryMetrics(archive.metricsJson)) !== currentMetricsFingerprint) || null;
  const baselineMetrics = latestArchive ? readHistoryMetrics(latestArchive.metricsJson) : [];
  return projectHistoryDecisionContextSchema.parse({
    version: 1,
    capturedAt: now.toISOString(),
    archiveComparison: compareHistoryMetrics({
      kind: "ANALYSIS_ARCHIVE",
      label: "本次与上次分析",
      baselineLabel: latestArchive ? "上次分析" : "暂无上次分析",
      currentLabel: "本次分析",
      baselineAt: latestArchive?.archivedAt || null,
      currentAt: now,
      baseline: baselineMetrics,
      current: currentMetrics
    }),
    periodComparison: comparePeriodPoints(periodPoints, 7, now)
  });
}

/**
 * Builds the server-owned context for one diagnosis. The request may select a
 * scenario but cannot supply trend or execution data. Both are frozen into the
 * saved DecisionRun input before any model request is made.
 */
export async function buildDiagnosisContext(
  db: DiagnosisContextClient,
  input: {
    projectId: string;
    collectionTaskId: string;
    scenario: DiagnosisScenario;
    now?: Date;
  }
): Promise<DiagnosisContext> {
  const now = input.now || new Date();
  const end = new Date(Math.floor(now.getTime() / recentTrendWindowMs) * recentTrendWindowMs);
  const start = new Date(end.getTime() - recentTrendWindowMs * 2);
  const [points, proposals] = await Promise.all([
    db.projectHistoryMetricPoint.findMany({
      where: {
        projectId: input.projectId,
        observedAt: { gte: start, lt: new Date(end.getTime() + minuteMs), lte: now }
      },
      orderBy: [{ observedAt: "asc" }, { id: "asc" }]
    }),
    db.actionProposal.findMany({
      where: {
        collectionTaskId: input.collectionTaskId,
        manualExecutedAt: { not: null }
      },
      orderBy: [{ manualExecutedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true,
        actionType: true,
        title: true,
        manualExecutedAt: true,
        outcomes: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { result: true, createdAt: true }
        }
      }
    })
  ]);

  const manualActions = proposals.flatMap((proposal) => {
    if (!proposal.manualExecutedAt) return [];
    const outcome = proposal.outcomes[0];
    return [{
      actionProposalId: proposal.id,
      actionType: proposal.actionType,
      ...(proposal.title ? { actionTitle: proposal.title.slice(0, 200) } : {}),
      executedAt: proposal.manualExecutedAt.toISOString(),
      outcome: outcome ? { result: outcome.result, recordedAt: outcome.createdAt.toISOString() } : null
    }];
  });

  return diagnosisContextSchema.parse({
    version: 1,
    scenario: input.scenario,
    recentTrend: buildRecentFifteenMinuteTrend(points, now),
    manualActions
  });
}

/**
 * Compares the two most recent *completed* 15-minute windows. Cumulative
 * metrics are converted to window deltas only after every minute and both
 * boundaries are present in one project, route, scope and collection session.
 */
export function buildRecentFifteenMinuteTrend(
  points: ProjectHistoryComparisonPoint[],
  now = new Date()
): DiagnosisRecentTrend {
  const end = new Date(Math.floor(now.getTime() / recentTrendWindowMs) * recentTrendWindowMs);
  const currentStart = new Date(end.getTime() - recentTrendWindowMs);
  const baselineStart = new Date(currentStart.getTime() - recentTrendWindowMs);
  const expectedBuckets = Array.from(
    { length: recentTrendWindowMinutes * 2 + 1 },
    (_, index) => baselineStart.getTime() + index * minuteMs
  );
  const seriesByScope = new Map<string, Map<string, CumulativeMetricSeries>>();
  let hasCandidatePoint = false;
  let hasUntrustedMetric = false;

  for (const point of points) {
    const bucketAt = Math.floor(point.observedAt.getTime() / minuteMs) * minuteMs;
    if (point.observedAt > now || bucketAt < baselineStart.getTime() || bucketAt > end.getTime()) continue;
    for (const metric of readHistoryMetrics(point.metricsJson)) {
      if (!isCumulativeMetric(metric.metricKey)) continue;
      hasCandidatePoint = true;
      if (metric.quality !== "TRUSTED") {
        hasUntrustedMetric = true;
        continue;
      }
      const scopeKey = `${point.sessionId}:${metric.routeKey}:${metric.scopeFingerprint}`;
      const metricSeries = seriesByScope.get(scopeKey) || new Map<string, CumulativeMetricSeries>();
      const series = metricSeries.get(metric.metricKey) || {
        metric,
        routeKey: metric.routeKey,
        sessionId: point.sessionId,
        samples: new Map<number, number>(),
        duplicateBucket: false
      };
      if (series.samples.has(bucketAt)) series.duplicateBucket = true;
      series.samples.set(bucketAt, metric.value);
      metricSeries.set(metric.metricKey, series);
      seriesByScope.set(scopeKey, metricSeries);
    }
  }

  const preference: Array<{ gmvMetricKey: "full_domain_gmv" | "gmv"; scope: "FULL_DOMAIN" | "PAYMENT"; label: string }> = [
    { gmvMetricKey: "full_domain_gmv", scope: "FULL_DOMAIN", label: "区间全域支付 ROI（按全域成交额/全域消耗重算）" },
    { gmvMetricKey: "gmv", scope: "PAYMENT", label: "区间支付 ROI（按同口径成交额/消耗重算）" }
  ];

  for (const preferred of preference) {
    for (const metrics of seriesByScope.values()) {
      const spend = metrics.get("spend");
      const gmv = metrics.get(preferred.gmvMetricKey);
      if (!spend || !gmv) continue;
      const spendWindows = completeTrendWindows(spend, expectedBuckets, baselineStart, currentStart, end);
      const gmvWindows = completeTrendWindows(gmv, expectedBuckets, baselineStart, currentStart, end);
      if (!spendWindows || !gmvWindows) continue;
      const rows = [spendWindows.row, gmvWindows.row];
      for (const key of preferred.scope === "FULL_DOMAIN" ? ["full_domain_orders", "orders"] : ["orders"]) {
        const candidate = metrics.get(key);
        const windows = candidate && completeTrendWindows(candidate, expectedBuckets, baselineStart, currentStart, end);
        if (windows) rows.push(windows.row);
      }
      const efficiency = spendWindows.currentDelta > 0 && spendWindows.baselineDelta > 0
        ? {
            metricLabel: preferred.label,
            gmvMetricKey: preferred.gmvMetricKey,
            spendMetricKey: "spend" as const,
            baselineValue: roundTrend(gmvWindows.baselineDelta / spendWindows.baselineDelta),
            currentValue: roundTrend(gmvWindows.currentDelta / spendWindows.currentDelta),
            delta: roundTrend(gmvWindows.currentDelta / spendWindows.currentDelta - gmvWindows.baselineDelta / spendWindows.baselineDelta)
          }
        : null;
      return {
        status: "AVAILABLE",
        reason: efficiency
          ? "已使用同一项目、路线、口径和采集轮次的两个完整 15 分钟窗口计算区间变化；区间产出比不表示广告因果增量。"
          : "两个完整 15 分钟窗口的累计量可比较，但存在零消耗窗口，未生成区间产出比结论。",
        baselineStartAt: baselineStart.toISOString(),
        baselineEndAt: currentStart.toISOString(),
        currentStartAt: currentStart.toISOString(),
        currentEndAt: end.toISOString(),
        routeKey: spend.routeKey,
        scope: preferred.scope,
        metrics: rows,
        efficiency
      };
    }
  }

  const reason = !hasCandidatePoint
    ? "缺少最近两个已结束的 15 分钟窗口数据，暂不能判断近期趋势"
    : hasUntrustedMetric
      ? "最近窗口包含未通过可信校验的历史指标，暂不能判断近期趋势"
      : "最近两个 15 分钟窗口缺少完整分钟覆盖、边界数据、同一采集轮次或同口径累计指标，暂不能判断近期趋势";
  return {
    status: "INSUFFICIENT",
    reason,
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

export function projectHistoryInputFingerprint(
  evidenceFingerprint: string,
  historyContext: ProjectHistoryDecisionContext,
  diagnosisContext?: DiagnosisContext
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

export async function getProjectHistoryOverview(db: HistoryClient, projectId: string, accountId: string, now = new Date()) {
  const [sessions, archives, periodPoints] = await Promise.all([
    db.projectHistorySession.findMany({
      where: { projectId },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: 60,
      include: { _count: { select: { metricPoints: true, analysisArchives: true } } }
    }),
    db.projectAnalysisArchive.findMany({ where: { projectId }, orderBy: [{ archivedAt: "desc" }, { id: "desc" }], take: 80 }),
    db.projectHistoryMetricPoint.findMany({
      where: { projectId, observedAt: { gte: startOfBeijingDayDaysAgo(now, 14), lt: startOfBeijingDay(now) } },
      orderBy: [{ observedAt: "asc" }, { id: "asc" }]
    })
  ]);
  const archiveComparison = archives.length >= 2
    ? compareHistoryMetrics({
        kind: "ANALYSIS_ARCHIVE",
        label: "最近两次分析对比",
        baselineLabel: "上次分析",
        currentLabel: "最近分析",
        baselineAt: archives[1]!.archivedAt,
        currentAt: archives[0]!.archivedAt,
        baseline: readHistoryMetrics(archives[1]!.metricsJson),
        current: readHistoryMetrics(archives[0]!.metricsJson)
      })
    : emptyComparison("ANALYSIS_ARCHIVE", "最近两次分析对比", "暂无上次分析", "最近分析", "至少完成两次新分析后才能比较");
  return {
    projectId,
    accountId,
    sessions: sessions.map((session) => ({
      id: session.id,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      archivedAt: session.archivedAt?.toISOString() || null,
      archiveReason: session.archiveReason === "INACTIVITY" ? "INACTIVITY" as const : null,
      pointCount: session._count.metricPoints,
      archiveCount: session._count.analysisArchives
    })),
    archives: archives.map((archive) => ({
      id: archive.id,
      collectionTaskId: archive.collectionTaskId,
      decisionRunId: archive.decisionRunId,
      status: archive.status,
      createdAt: archive.archivedAt.toISOString(),
      sessionId: archive.sessionId,
      comparison: readHistoryContext(archive.historyContextJson)?.archiveComparison
        || emptyComparison("ANALYSIS_ARCHIVE", "本次与上次分析", "上次分析", "本次分析", "历史上下文不可用")
    })),
    defaultArchiveComparison: archiveComparison,
    defaultPeriodComparison: comparePeriodPoints(periodPoints, 7, now)
  };
}

export async function getProjectHistoryComparison(
  db: HistoryClient,
  input: {
    projectId: string;
    mode: "archives" | "period" | "session" | "analysis-window";
    baselineArchiveId?: string | null;
    currentArchiveId?: string | null;
    sessionId?: string | null;
    archiveId?: string | null;
    days?: number;
    minutes?: 30 | 60;
    now?: Date;
  }
): Promise<ProjectHistoryComparison> {
  const now = input.now || new Date();
  if (input.mode === "period") {
    const days = input.days === 30 ? 30 : 7;
    const points = await db.projectHistoryMetricPoint.findMany({
      where: { projectId: input.projectId, observedAt: { gte: startOfBeijingDayDaysAgo(now, days * 2), lt: startOfBeijingDay(now) } },
      orderBy: [{ observedAt: "asc" }, { id: "asc" }]
    });
    return comparePeriodPoints(points, days, now);
  }
  if (input.mode === "archives") {
    const archives = await db.projectAnalysisArchive.findMany({
      where: {
        projectId: input.projectId,
        ...(input.baselineArchiveId || input.currentArchiveId ? { id: { in: [input.baselineArchiveId, input.currentArchiveId].filter((id): id is string => Boolean(id)) } } : {})
      },
      orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
      take: input.baselineArchiveId || input.currentArchiveId ? 2 : 2
    });
    const current = input.currentArchiveId ? archives.find((archive) => archive.id === input.currentArchiveId) : archives[0];
    const baseline = input.baselineArchiveId ? archives.find((archive) => archive.id === input.baselineArchiveId) : archives.find((archive) => archive.id !== current?.id);
    if (!current || !baseline) return emptyComparison("ANALYSIS_ARCHIVE", "分析存档对比", "上次分析", "本次分析", "请选择同一项目中的两次分析存档");
    return compareHistoryMetrics({
      kind: "ANALYSIS_ARCHIVE",
      label: "分析存档对比",
      baselineLabel: "基准分析",
      currentLabel: "当前分析",
      baselineAt: baseline.archivedAt,
      currentAt: current.archivedAt,
      baseline: readHistoryMetrics(baseline.metricsJson),
      current: readHistoryMetrics(current.metricsJson)
    });
  }
  if (input.mode === "session") {
    const sessions = await db.projectHistorySession.findMany({
      where: { projectId: input.projectId, status: "ARCHIVED" },
      orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
      take: 2
    });
    if (sessions.length < 2) return emptyComparison("SESSION", "最近两轮采集对比", "上一轮", "最近一轮", "至少需要两轮已归档的采集数据");
    const points = await db.projectHistoryMetricPoint.findMany({ where: { sessionId: { in: sessions.map((session) => session.id) } }, orderBy: [{ observedAt: "asc" }, { id: "asc" }] });
    const current = latestMetricsForSession(points, sessions[0]!.id);
    const baseline = latestMetricsForSession(points, sessions[1]!.id);
    return compareHistoryMetrics({
      kind: "SESSION",
      label: "最近两轮采集对比",
      baselineLabel: "上一轮采集",
      currentLabel: "最近一轮采集",
      baselineAt: sessions[1]!.archivedAt,
      currentAt: sessions[0]!.archivedAt,
      baseline,
      current
    });
  }
  const minutes = input.minutes === 60 ? 60 : 30;
  const archive = input.archiveId
    ? await db.projectAnalysisArchive.findFirst({ where: { id: input.archiveId, projectId: input.projectId } })
    : await db.projectAnalysisArchive.findFirst({ where: { projectId: input.projectId }, orderBy: [{ archivedAt: "desc" }, { id: "desc" }] });
  if (!archive) return emptyComparison("ANALYSIS_WINDOW", `分析前后 ${minutes} 分钟`, "分析前", "分析后", "尚无分析存档");
  const interval = analysisWindowToleranceMs;
  const points = await db.projectHistoryMetricPoint.findMany({
    where: {
      sessionId: archive.sessionId,
      observedAt: {
        gte: new Date(archive.archivedAt.getTime() - minutes * minuteMs - interval),
        lte: new Date(archive.archivedAt.getTime() + minutes * minuteMs + interval)
      }
    },
    orderBy: [{ observedAt: "asc" }, { id: "asc" }]
  });
  return compareAnalysisWindowPoints(points, archive.archivedAt, minutes, now);
}

export function compareAnalysisWindowPoints(points: ProjectHistoryComparisonPoint[], analyzedAt: Date, minutes: 30 | 60, now: Date): ProjectHistoryComparison {
  const afterTarget = new Date(analyzedAt.getTime() + minutes * minuteMs);
  if (now < afterTarget) {
    return emptyComparison("ANALYSIS_WINDOW", `分析前后 ${minutes} 分钟`, "分析前", "分析后", "分析后观察窗口尚未结束，请在窗口结束并采集到可比数据后查看");
  }
  const before = nearestMetricsByRoute(
    points.filter((point) => point.observedAt < analyzedAt),
    new Date(analyzedAt.getTime() - minutes * minuteMs)
  );
  const after = nearestMetricsByRoute(
    points.filter((point) => point.observedAt > analyzedAt && point.observedAt <= now),
    afterTarget
  );
  return compareHistoryMetrics({
    kind: "ANALYSIS_WINDOW",
    label: `分析前后 ${minutes} 分钟`,
    baselineLabel: `分析前约 ${minutes} 分钟`,
    currentLabel: `分析后约 ${minutes} 分钟`,
    baselineAt: before.at,
    currentAt: after.at,
    baseline: before.metrics,
    current: after.metrics
  });
}

export async function archiveInactiveProjectHistorySessions(db: HistoryClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - projectHistoryInactivityMs);
  const candidates = await db.projectHistorySession.findMany({
    where: { status: "ACTIVE", lastActivityAt: { lt: cutoff } },
    select: { id: true, lastActivityAt: true }
  });
  let archived = 0;
  for (const candidate of candidates) {
    const result = await db.projectHistorySession.updateMany({
      where: { id: candidate.id, status: "ACTIVE", lastActivityAt: { lt: cutoff } },
      data: { status: "ARCHIVED", archivedAt: candidate.lastActivityAt, archiveReason: "INACTIVITY" }
    });
    archived += result.count;
  }
  return archived;
}

export function startProjectHistoryLifecycle(options: { intervalMs?: number; onError?: (error: unknown) => void } = {}) {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const { prisma } = await import("./prisma.js");
      await archiveInactiveProjectHistorySessions(prisma);
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), options.intervalMs || minuteMs);
  void tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 25));
  };
}

async function activeProjectHistorySession(db: HistoryClient, projectId: string, now: Date) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}), hashtext('project-history-session'))`;
  const active = await db.projectHistorySession.findFirst({ where: { projectId, status: "ACTIVE" }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] });
  if (active && now.getTime() - active.lastActivityAt.getTime() < projectHistoryInactivityMs) {
    return db.projectHistorySession.update({ where: { id: active.id }, data: { lastActivityAt: now } });
  }
  if (active) {
    await db.projectHistorySession.updateMany({
      where: { id: active.id, status: "ACTIVE" },
      data: { status: "ARCHIVED", archivedAt: active.lastActivityAt, archiveReason: "INACTIVITY" }
    });
  }
  return db.projectHistorySession.create({ data: { projectId, startedAt: now, lastActivityAt: now } });
}

export function compareHistoryMetrics(input: {
  kind: ProjectHistoryComparison["kind"];
  label: string;
  baselineLabel: string;
  currentLabel: string;
  baselineAt: Date | null | undefined;
  currentAt: Date | null | undefined;
  baseline: ProjectHistoryMetric[];
  current: ProjectHistoryMetric[];
}): ProjectHistoryComparison {
  if (!input.baseline.length || !input.current.length) {
    return emptyComparison(input.kind, input.label, input.baselineLabel, input.currentLabel, "缺少同项目、同路线的可比指标");
  }
  const baseline = new Map(input.baseline.map((metric) => [metricComparisonKey(metric), metric]));
  const current = new Map(input.current.map((metric) => [metricComparisonKey(metric), metric]));
  const rows = [...current.entries()].flatMap(([key, currentMetric]) => {
    const baselineMetric = baseline.get(key);
    if (!baselineMetric) return [];
    const delta = currentMetric.value - baselineMetric.value;
    const ratio = isRatioMetric(currentMetric.metricKey);
    return [{
      routeKey: currentMetric.routeKey,
      metricKey: currentMetric.metricKey,
      metricName: currentMetric.metricName,
      unit: currentMetric.unit,
      baselineValue: baselineMetric.value,
      currentValue: currentMetric.value,
      delta,
      conclusion: Math.abs(delta) < 1e-9 ? "NO_CHANGE" as const : ratio ? "RAW_CHANGE" as const : "RAW_CHANGE" as const,
      note: ratio
        ? "比例指标仅展示同口径原始变化；没有同口径分子和分母时不判定好坏。"
        : "按同一路线和口径展示原始变化，不与其他路线合并。"
    }];
  });
  const roiRows = recomputedRoiRows(input.baseline, input.current);
  const combinedRows = [...roiRows, ...rows].sort((left, right) => left.routeKey.localeCompare(right.routeKey) || left.metricKey.localeCompare(right.metricKey));
  const derivedDirections = roiRows.map((row) => row.conclusion).filter((value) => value === "IMPROVED" || value === "WORSENED" || value === "NO_CHANGE");
  const status = derivedDirections.length
    ? summaryStatus(derivedDirections)
    : "INSUFFICIENT" as const;
  return projectHistoryComparisonSchema.parse({
    kind: input.kind,
    status,
    label: input.label,
    baselineLabel: input.baselineLabel,
    currentLabel: input.currentLabel,
    baselineAt: input.baselineAt?.toISOString() || null,
    currentAt: input.currentAt?.toISOString() || null,
    rows: combinedRows.slice(0, 80),
    notices: [
      "只比较同一项目内、同一路线且同口径的指标，不会把直播与本地推相加或平均。",
      ...(status === "INSUFFICIENT" ? ["当前缺少能够重新计算效率的同口径指标，因此暂不判断整体变好或变差。"] : [])
    ]
  });
}

export function comparePeriodPoints(points: ProjectHistoryComparisonPoint[], days: number, now: Date): ProjectHistoryComparison {
  const currentStart = startOfBeijingDayDaysAgo(now, days);
  const baselineStart = startOfBeijingDayDaysAgo(now, days * 2);
  const baseline = aggregatePeriodMetrics(
    points.filter((point) => point.observedAt >= baselineStart && point.observedAt < currentStart),
    days
  );
  const current = aggregatePeriodMetrics(
    points.filter((point) => point.observedAt >= currentStart && point.observedAt < startOfBeijingDay(now)),
    days
  );
  const comparison = compareHistoryMetrics({
    kind: "PERIOD",
    label: `最近 ${days} 个完整自然日与前 ${days} 个完整自然日`,
    baselineLabel: `前 ${days} 个完整自然日`,
    currentLabel: `最近 ${days} 个完整自然日`,
    baselineAt: baselineStart,
    currentAt: new Date(startOfBeijingDay(now).getTime() - 1),
    baseline,
    current
  });
  return {
    ...comparison,
    notices: [
      ...comparison.notices,
      "周期排除北京时间当天；只有每天每分钟都有采集记录、同日属于同一轮采集且累计数值未重置，才按每日首末差额汇总，否则暂不能判断。",
      "比例仅在同口径分子分母齐全时重新计算；原始比例、平均值和瞬时值不作跨日加总。"
    ]
  };
}

function aggregatePeriodMetrics(points: ProjectHistoryComparisonPoint[], expectedDays: number) {
  const grouped = new Map<string, Array<{ at: Date; sessionId: string; metric: ProjectHistoryMetric }>>();
  for (const point of points) {
    for (const metric of readHistoryMetrics(point.metricsJson)) {
      if (!isCumulativeMetric(metric.metricKey)) continue;
      const key = `${beijingDayKey(point.observedAt)}:${metricComparisonKey(metric)}`;
      const entries = grouped.get(key) || [];
      entries.push({ at: point.observedAt, sessionId: point.sessionId, metric });
      grouped.set(key, entries);
    }
  }
  const total = new Map<string, { metric: ProjectHistoryMetric; value: number; days: number }>();
  for (const entries of grouped.values()) {
    const ordered = [...entries].sort((left, right) => left.at.getTime() - right.at.getTime());
    const first = ordered[0]!;
    const last = ordered.at(-1)!;
    // Minute buckets match the persistence resolution. Sparse samples cannot
    // establish day coverage, and separate rounds must never be subtracted.
    const coveredMinutes = new Set(ordered.map((entry) => Math.floor(entry.at.getTime() / minuteMs)));
    const continuousCounter = ordered.every((entry, index) => entry.sessionId === first.sessionId
      && entry.metric.value >= 0
      && (index === 0 || entry.metric.value >= ordered[index - 1]!.metric.value));
    if (coveredMinutes.size !== minutesPerDay || !continuousCounter) continue;
    const value = last.metric.value - first.metric.value;
    if (!Number.isFinite(value)) continue;
    const key = metricComparisonKey(first.metric);
    const metric = {
      ...first.metric,
      quality: ordered.every((entry) => entry.metric.quality === "TRUSTED") ? "TRUSTED" as const : "REVIEW_REQUIRED" as const
    };
    const existing = total.get(key) || { metric, value: 0, days: 0 };
    total.set(key, {
      metric: existing.metric.quality === "TRUSTED" && metric.quality === "TRUSTED"
        ? existing.metric
        : { ...existing.metric, quality: "REVIEW_REQUIRED" as const },
      value: existing.value + value,
      days: existing.days + 1
    });
  }
  return [...total.values()]
    .filter(({ days }) => days === expectedDays)
    .map(({ metric, value }) => ({ ...metric, value }));
}

function recomputedRoiRows(baseline: ProjectHistoryMetric[], current: ProjectHistoryMetric[]) {
  const baselineByRoute = metricsByRouteScope(baseline);
  const currentByRoute = metricsByRouteScope(current);
  const rows: Array<ReturnType<typeof projectHistoryComparisonSchema.parse>["rows"][number]> = [];
  for (const [key, currentMetrics] of currentByRoute) {
    const baselineMetrics = baselineByRoute.get(key);
    if (!baselineMetrics) continue;
    for (const pair of [
      { gmvKey: "full_domain_gmv", roiKey: "full_domain_pay_roi", label: "全域支付 ROI（按同口径全域成交额/消耗重算）" },
      { gmvKey: "gmv", roiKey: "pay_roi", label: "支付 ROI（按同口径成交额/消耗重算）" }
    ] as const) {
      const currentSpend = currentMetrics.get("spend");
      const currentGmv = currentMetrics.get(pair.gmvKey);
      const baselineSpend = baselineMetrics.get("spend");
      const baselineGmv = baselineMetrics.get(pair.gmvKey);
      if (!currentSpend || !currentGmv || !baselineSpend || !baselineGmv || currentSpend.value <= 0 || baselineSpend.value <= 0) continue;
      if (currentSpend.quality !== "TRUSTED" || currentGmv.quality !== "TRUSTED" || baselineSpend.quality !== "TRUSTED" || baselineGmv.quality !== "TRUSTED") continue;
      const baselineValue = baselineGmv.value / baselineSpend.value;
      const currentValue = currentGmv.value / currentSpend.value;
      const delta = currentValue - baselineValue;
      rows.push({
        routeKey: currentSpend.routeKey,
        metricKey: pair.roiKey,
        metricName: pair.label,
        unit: null,
        baselineValue,
        currentValue,
        delta,
        conclusion: Math.abs(delta) < 1e-9 ? "NO_CHANGE" as const : delta > 0 ? "IMPROVED" as const : "WORSENED" as const,
        note: "由同一路线、同口径的累计成交额与消耗重新计算，不直接平均历史 ROI。"
      });
    }
  }
  return rows;
}

function metricsByRouteScope(metrics: ProjectHistoryMetric[]) {
  const grouped = new Map<string, Map<string, ProjectHistoryMetric>>();
  for (const metric of metrics) {
    const key = `${metric.routeKey}:${metric.scopeFingerprint}`;
    const current = grouped.get(key) || new Map<string, ProjectHistoryMetric>();
    current.set(metric.metricKey, metric);
    grouped.set(key, current);
  }
  return grouped;
}

type CumulativeMetricSeries = {
  metric: ProjectHistoryMetric;
  routeKey: CollectionRouteKey;
  sessionId: string;
  samples: Map<number, number>;
  duplicateBucket: boolean;
};

function completeTrendWindows(
  series: CumulativeMetricSeries,
  expectedBuckets: number[],
  baselineStart: Date,
  currentStart: Date,
  end: Date
) {
  if (series.duplicateBucket || expectedBuckets.some((bucket) => !series.samples.has(bucket))) return null;
  const values = expectedBuckets.map((bucket) => series.samples.get(bucket)!);
  if (values.some((value, index) => index > 0 && value < values[index - 1]!)) return null;
  const baselineStartValue = series.samples.get(baselineStart.getTime());
  const middleValue = series.samples.get(currentStart.getTime());
  const endValue = series.samples.get(end.getTime());
  if (baselineStartValue == null || middleValue == null || endValue == null) return null;
  const baselineDelta = middleValue - baselineStartValue;
  const currentDelta = endValue - middleValue;
  return {
    baselineDelta,
    currentDelta,
    row: {
      metricKey: series.metric.metricKey,
      metricName: series.metric.metricName,
      unit: series.metric.unit,
      baselineValue: baselineDelta,
      currentValue: currentDelta,
      delta: currentDelta - baselineDelta
    }
  };
}

function roundTrend(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function latestMetricsForSession(points: ProjectHistoryComparisonPoint[], sessionId: string) {
  const latest = new Map<string, ProjectHistoryComparisonPoint>();
  for (const point of points.filter((candidate) => candidate.sessionId === sessionId)) {
    const current = latest.get(point.routeKey);
    if (!current || current.observedAt < point.observedAt) latest.set(point.routeKey, point);
  }
  return [...latest.values()].flatMap((point) => readHistoryMetrics(point.metricsJson));
}

function nearestMetricsByRoute(points: ProjectHistoryComparisonPoint[], target: Date) {
  const nearest = new Map<string, ProjectHistoryComparisonPoint>();
  for (const point of points) {
    if (Math.abs(point.observedAt.getTime() - target.getTime()) > analysisWindowToleranceMs) continue;
    const current = nearest.get(point.routeKey);
    if (!current || Math.abs(point.observedAt.getTime() - target.getTime()) < Math.abs(current.observedAt.getTime() - target.getTime())) {
      nearest.set(point.routeKey, point);
    }
  }
  const selected = [...nearest.values()];
  return {
    at: selected.length ? new Date(Math.round(selected.reduce((sum, point) => sum + point.observedAt.getTime(), 0) / selected.length)) : null,
    metrics: selected.flatMap((point) => readHistoryMetrics(point.metricsJson))
  };
}

function readHistoryMetrics(value: unknown): ProjectHistoryMetric[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = projectHistoryMetricSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function readHistoryContext(value: unknown) {
  const parsed = projectHistoryDecisionContextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function emptyComparison(
  kind: ProjectHistoryComparison["kind"],
  label: string,
  baselineLabel: string,
  currentLabel: string,
  notice: string
): ProjectHistoryComparison {
  return {
    kind,
    status: "INSUFFICIENT",
    label,
    baselineLabel,
    currentLabel,
    baselineAt: null,
    currentAt: null,
    rows: [],
    notices: [notice]
  };
}

function summaryStatus(directions: Array<"IMPROVED" | "WORSENED" | "NO_CHANGE">) {
  const unique = new Set(directions);
  if (unique.size === 1) return directions[0]!;
  if (unique.size === 2 && unique.has("NO_CHANGE")) return unique.has("IMPROVED") ? "IMPROVED" as const : "WORSENED" as const;
  return "MIXED" as const;
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

function historyMetricSetFingerprint(metrics: ProjectHistoryMetric[]) {
  return createHash("sha256")
    .update(JSON.stringify([...metrics].sort((left, right) => metricComparisonKey(left).localeCompare(metricComparisonKey(right)))), "utf8")
    .digest("hex");
}

function fingerprintComparison(comparison: ProjectHistoryComparison) {
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

function metricComparisonKey(metric: ProjectHistoryMetric) {
  return `${metric.routeKey}:${metric.metricKey}:${metric.scopeFingerprint}`;
}

function isRatioMetric(metricKey: string) {
  return ["verify_roi", "gross_profit_roi", "pay_roi", "full_domain_pay_roi", "ctr", "product_click_rate", "product_conversion_rate", "live_room_click_rate"].includes(metricKey);
}

function isCumulativeMetric(metricKey: string) {
  return ["spend", "gmv", "orders", "full_domain_gmv", "full_domain_orders", "full_domain_product_clicks", "impressions", "clicks", "live_viewers", "exposure_users", "click_users", "transaction_users", "shelf_gmv", "search_gmv", "poi_visits", "store_searches"].includes(metricKey);
}

function startOfBeijingDay(now: Date) {
  const shifted = new Date(now.getTime() + beijingOffsetMs);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - beijingOffsetMs);
}

function startOfBeijingDayDaysAgo(now: Date, days: number) {
  return new Date(startOfBeijingDay(now).getTime() - days * 24 * 60 * 60 * 1_000);
}

function beijingDayKey(value: Date) {
  return new Date(value.getTime() + beijingOffsetMs).toISOString().slice(0, 10);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
