import {
  diagnosisContextSchema,
  projectHistoryDecisionContextSchema,
  type DiagnosisContext,
  type DiagnosisScenario,
  type ProjectHistoryComparison,
  type ProjectHistoryDecisionContext,
  type ProjectHistoryMetric
} from "@douyin-local-life/shared";
import {
  compareAnalysisWindowPoints,
  compareHistoryMetrics,
  comparePeriodPoints,
  emptyComparison,
  latestMetricsForSession
} from "./project-history-comparison.js";
import {
  historyMetricSetFingerprint,
  minuteMs,
  readHistoryContext,
  readHistoryMetrics,
  recentTrendWindowMs,
  startOfBeijingDay,
  startOfBeijingDayDaysAgo,
  type DiagnosisContextClient,
  type HistoryClient
} from "./project-history-metrics.js";
import { buildRecentFifteenMinuteTrend } from "./project-history-recent-trend.js";

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
    const requestedIds = [input.baselineArchiveId, input.currentArchiveId].filter((id): id is string => Boolean(id));
    const archives = await db.projectAnalysisArchive.findMany({
      where: {
        projectId: input.projectId,
        ...(requestedIds.length ? { id: { in: requestedIds } } : {})
      },
      orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
      take: requestedIds.length ? requestedIds.length : 2
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
  const interval = 15 * minuteMs;
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
