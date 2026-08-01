import { Prisma, type DiagnosisCase, type PrismaClient } from "@prisma/client";
import type { ActionType, DecisionEngineInput } from "@douyin-local-life/shared";
import type { DiagnosisFinalResult, SimilarDiagnosisCase } from "@douyin-local-life/shared/diagnosis";
import { prisma } from "./prisma.js";
import { sanitizeDerivedPersistedJson } from "./persisted-input.js";

type CaseClient = Pick<Prisma.TransactionClient, "diagnosisCase" | "diagnosisFeedback"> | PrismaClient;

export type DiagnosisCaseRetrievalHints = {
  mainProblemTags: string[];
  actionTypes: ActionType[];
};

export async function findSimilarDiagnosisCases(
  workspaceId: string,
  input: DecisionEngineInput,
  hints: DiagnosisCaseRetrievalHints = { mainProblemTags: [], actionTypes: [] },
  db: CaseClient = prisma
): Promise<SimilarDiagnosisCase[]> {
  const candidates = await db.diagnosisCase.findMany({
    where: { workspaceId, businessMode: "MANAGED_LIVE_GROWTH", status: "ELIGIBLE" },
    orderBy: { updatedAt: "desc" },
    take: 100
  });
  const currentRanges = metricRanges(input);
  const currentRoutes = new Set(routeCoverage(input));
  return candidates
    .map((item) => ({ item, score: caseSimilarity(item, currentRanges, currentRoutes, hints) }))
    .sort((left, right) => right.score - left.score || right.item.updatedAt.getTime() - left.item.updatedAt.getTime())
    .slice(0, 3)
    .map(({ item, score }) => toSimilarCase(item, score));
}

export async function upsertDraftDiagnosisCase(input: {
  workspaceId: string;
  projectId: string;
  collectionTaskId: string;
  decisionRunId: string;
  decisionInput: DecisionEngineInput;
  result: DiagnosisFinalResult;
}, db: CaseClient = prisma) {
  const summary = sanitizeDerivedPersistedJson({
    coreConclusion: input.result.coreConclusion,
    mainProblemTag: input.result.mainProblemTag,
    confidence: input.result.confidence,
    hypotheses: input.result.hypotheses.map((item) => ({ title: item.title, conclusion: item.conclusion, confidence: item.confidence }))
  });
  return db.diagnosisCase.upsert({
    where: { decisionRunId: input.decisionRunId },
    create: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      collectionTaskId: input.collectionTaskId,
      decisionRunId: input.decisionRunId,
      businessMode: "MANAGED_LIVE_GROWTH",
      status: "DRAFT",
      mainProblemTag: input.result.mainProblemTag,
      summaryJson: toJson(summary),
      metricRangesJson: toJson(metricRanges(input.decisionInput)),
      routeCoverageJson: toJson(routeCoverage(input.decisionInput)),
      actionTypesJson: toJson([...new Set(input.result.candidateActions.map((item) => item.actionType))])
    },
    update: {
      mainProblemTag: input.result.mainProblemTag,
      summaryJson: toJson(summary),
      metricRangesJson: toJson(metricRanges(input.decisionInput)),
      routeCoverageJson: toJson(routeCoverage(input.decisionInput)),
      actionTypesJson: toJson([...new Set(input.result.candidateActions.map((item) => item.actionType))])
    }
  });
}

export async function attachOutcomeToDiagnosisCase(input: {
  decisionRunId: string;
  result: string;
  beforeMetrics: unknown;
  afterMetrics: unknown;
  conclusion: string | null;
}, db: CaseClient = prisma) {
  return db.diagnosisCase.updateMany({
    where: { decisionRunId: input.decisionRunId },
    data: {
      outcomeJson: toJson(sanitizeDerivedPersistedJson({
        result: input.result,
        beforeMetrics: input.beforeMetrics,
        afterMetrics: input.afterMetrics,
        conclusion: input.conclusion
      }))
    }
  });
}

export async function caseCanBecomeEligible(caseRecord: DiagnosisCase, db: CaseClient = prisma) {
  const feedback = caseRecord.decisionRunId
    ? await db.diagnosisFeedback.findFirst({
        where: { decisionRunId: caseRecord.decisionRunId, mainProblemCorrect: true, usefulnessScore: { gte: 4 } },
        select: { id: true }
      })
    : null;
  if (feedback) return true;
  const outcome = jsonRecord(caseRecord.outcomeJson);
  return Boolean(
    outcome
    && ["IMPROVED", "WORSENED", "NO_CHANGE"].includes(String(outcome.result))
    && Array.isArray(outcome.beforeMetrics)
    && outcome.beforeMetrics.length > 0
    && Array.isArray(outcome.afterMetrics)
    && outcome.afterMetrics.length > 0
  );
}

function caseSimilarity(
  item: DiagnosisCase,
  currentRanges: Record<string, string>,
  currentRoutes: Set<string>,
  hints: DiagnosisCaseRetrievalHints
) {
  const storedRanges = jsonRecord(item.metricRangesJson) || {};
  const storedRoutes = new Set(jsonArray(item.routeCoverageJson));
  const rangeKeys = Object.keys(currentRanges);
  const matchedRanges = rangeKeys.filter((key) => storedRanges[key] === currentRanges[key]).length;
  const routeUnion = new Set([...currentRoutes, ...storedRoutes]);
  const routeIntersection = [...currentRoutes].filter((route) => storedRoutes.has(route)).length;
  const rangeScore = rangeKeys.length ? matchedRanges / rangeKeys.length : 0;
  const routeScore = routeUnion.size ? routeIntersection / routeUnion.size : 0;
  const problemScore = item.mainProblemTag && hints.mainProblemTags.includes(item.mainProblemTag) ? 1 : 0;
  const storedActions = new Set(jsonArray(item.actionTypesJson));
  const hintedActions = new Set(hints.actionTypes);
  const actionUnion = new Set([...storedActions, ...hintedActions]);
  const actionIntersection = [...hintedActions].filter((actionType) => storedActions.has(actionType)).length;
  const actionScore = actionUnion.size ? actionIntersection / actionUnion.size : 0;
  const outcome = jsonRecord(item.outcomeJson);
  const outcomeScore = outcome && ["IMPROVED", "WORSENED", "NO_CHANGE"].includes(String(outcome.result)) ? 1 : 0;
  return Math.min(1, 0.1 + problemScore * 0.25 + rangeScore * 0.25 + routeScore * 0.15 + actionScore * 0.15 + outcomeScore * 0.1);
}

function toSimilarCase(item: DiagnosisCase, score: number): SimilarDiagnosisCase {
  const summary = jsonRecord(item.summaryJson);
  const outcome = jsonRecord(item.outcomeJson);
  return {
    id: item.id,
    mainProblemTag: item.mainProblemTag,
    summary: typeof summary?.coreConclusion === "string" ? summary.coreConclusion : "历史诊断案例",
    actionTypes: jsonArray(item.actionTypesJson) as SimilarDiagnosisCase["actionTypes"],
    outcome: typeof outcome?.result === "string" ? outcome.result : null,
    score
  };
}

function metricRanges(input: DecisionEngineInput) {
  return Object.fromEntries(input.metrics.flatMap((metric) => {
    const value = typeof metric.value === "number" ? metric.value : Number(metric.value);
    if (!Number.isFinite(value)) return [];
    const magnitude = value === 0 ? "0" : value < 0 ? "NEGATIVE" : value < 1 ? "0_1" : value < 10 ? "1_10" : value < 100 ? "10_100" : value < 1_000 ? "100_1K" : value < 10_000 ? "1K_10K" : "10K_PLUS";
    return [[String(metric.key), magnitude]];
  }));
}

function routeCoverage(input: DecisionEngineInput) {
  return [...new Set([
    ...(input.collectionQuality?.routes.filter((item) => item.state === "FRESH" || item.state === "AGING").map((item) => item.routeKey) || []),
    ...input.tables.flatMap((table) => table.routeKey ? [table.routeKey] : [])
  ])];
}

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function jsonArray(value: Prisma.JsonValue | null) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
