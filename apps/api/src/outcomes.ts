import { Prisma, type ActionOutcome, type OutcomeObservationWindow } from "@prisma/client";
import type { ActionOutcomeDTO, CreateActionOutcomeInput, ObservationWindow, ProjectOutcomeSummary } from "@douyin-local-life/shared";
import { prisma } from "./prisma.js";

const apiToDbWindow: Record<ObservationWindow, OutcomeObservationWindow> = {
  "30m": "THIRTY_MINUTES",
  "2h": "TWO_HOURS",
  "1d": "ONE_DAY",
  custom: "CUSTOM"
};

const dbToApiWindow: Record<OutcomeObservationWindow, ObservationWindow> = {
  THIRTY_MINUTES: "30m",
  TWO_HOURS: "2h",
  ONE_DAY: "1d",
  CUSTOM: "custom"
};

export function toActionOutcomeDTO(outcome: ActionOutcome): ActionOutcomeDTO {
  return {
    id: outcome.id,
    actionProposalId: outcome.actionProposalId,
    projectId: outcome.projectId,
    collectionTaskId: outcome.collectionTaskId,
    observationWindow: dbToApiWindow[outcome.observationWindow],
    customWindow: outcome.customWindow,
    beforeMetrics: outcome.beforeMetricsJson,
    afterMetrics: outcome.afterMetricsJson,
    result: outcome.result,
    note: outcome.note,
    conclusion: outcome.conclusion,
    createdAt: outcome.createdAt.toISOString(),
    updatedAt: outcome.updatedAt.toISOString()
  };
}

export async function createActionOutcome(input: {
  actionProposalId: string;
  projectId: string;
  collectionTaskId: string;
  userId: string;
  body: CreateActionOutcomeInput;
}) {
  return prisma.actionOutcome.create({
    data: {
      actionProposalId: input.actionProposalId,
      projectId: input.projectId,
      collectionTaskId: input.collectionTaskId,
      userId: input.userId,
      observationWindow: apiToDbWindow[input.body.observationWindow],
      customWindow: input.body.observationWindow === "custom" ? input.body.customWindow || null : null,
      beforeMetricsJson: input.body.beforeMetrics === undefined ? undefined : toJson(input.body.beforeMetrics),
      afterMetricsJson: input.body.afterMetrics === undefined ? undefined : toJson(input.body.afterMetrics),
      result: input.body.result,
      note: input.body.note || null,
      conclusion: input.body.conclusion || null
    }
  });
}

export async function listActionOutcomes(actionProposalId: string) {
  const outcomes = await prisma.actionOutcome.findMany({
    where: { actionProposalId },
    orderBy: { createdAt: "desc" }
  });
  return outcomes.map(toActionOutcomeDTO);
}

export async function getProjectOutcomeSummary(projectId: string): Promise<ProjectOutcomeSummary> {
  const outcomes = await prisma.actionOutcome.findMany({
    where: { projectId },
    include: { actionProposal: { select: { actionType: true } } },
    orderBy: { createdAt: "desc" }
  });

  const byResult: ProjectOutcomeSummary["byResult"] = {
    IMPROVED: 0,
    WORSENED: 0,
    NO_CHANGE: 0,
    UNCLEAR: 0
  };
  const byActionType = new Map<
    string,
    { actionType: ProjectOutcomeSummary["byActionType"][number]["actionType"]; total: number; improved: number; worsened: number; noChange: number; unclear: number }
  >();

  for (const outcome of outcomes) {
    byResult[outcome.result] += 1;
    const actionType = outcome.actionProposal.actionType as ProjectOutcomeSummary["byActionType"][number]["actionType"];
    const bucket =
      byActionType.get(actionType) ||
      {
        actionType,
        total: 0,
        improved: 0,
        worsened: 0,
        noChange: 0,
        unclear: 0
      };
    bucket.total += 1;
    if (outcome.result === "IMPROVED") bucket.improved += 1;
    if (outcome.result === "WORSENED") bucket.worsened += 1;
    if (outcome.result === "NO_CHANGE") bucket.noChange += 1;
    if (outcome.result === "UNCLEAR") bucket.unclear += 1;
    byActionType.set(actionType, bucket);
  }

  return {
    projectId,
    total: outcomes.length,
    byResult,
    byActionType: [...byActionType.values()].sort((a, b) => b.total - a.total)
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
