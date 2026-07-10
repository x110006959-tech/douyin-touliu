import { Prisma, type ActionOutcome, type OutcomeObservationWindow } from "@prisma/client";
import type { ActionOutcomeDTO, CreateActionOutcomeInput, ObservationWindow, ProjectOutcomeSummary } from "@douyin-local-life/shared";
import { prisma } from "./prisma.js";
import { cursorArgs } from "./pagination.js";

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
  idempotencyKey?: string | null;
}, db: Pick<Prisma.TransactionClient, "actionOutcome"> = prisma) {
  return db.actionOutcome.create({
    data: {
      actionProposalId: input.actionProposalId,
      idempotencyKey: input.idempotencyKey || null,
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

export async function listActionOutcomes(actionProposalId: string, pagination: { take: number; cursor: string | null }) {
  const outcomes = await prisma.actionOutcome.findMany({
    where: { actionProposalId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pagination.take,
    ...cursorArgs(pagination.cursor)
  });
  return outcomes.map(toActionOutcomeDTO);
}

export async function getProjectOutcomeSummary(projectId: string): Promise<ProjectOutcomeSummary> {
  const [resultRows, actionRows] = await Promise.all([
    prisma.actionOutcome.groupBy({ by: ["result"], where: { projectId }, _count: { _all: true } }),
    prisma.$queryRaw<Array<{ actionType: string; result: string; total: bigint }>>(Prisma.sql`
      SELECT ap."actionType"::text AS "actionType", ao."result"::text AS "result", COUNT(*)::bigint AS total
      FROM "ActionOutcome" ao
      INNER JOIN "ActionProposal" ap ON ap.id = ao."actionProposalId"
      WHERE ao."projectId" = ${projectId}
      GROUP BY ap."actionType", ao."result"
    `)
  ]);

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

  for (const row of resultRows) byResult[row.result] = row._count._all;

  for (const row of actionRows) {
    const actionType = row.actionType as ProjectOutcomeSummary["byActionType"][number]["actionType"];
    const total = Number(row.total);
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
    bucket.total += total;
    if (row.result === "IMPROVED") bucket.improved += total;
    if (row.result === "WORSENED") bucket.worsened += total;
    if (row.result === "NO_CHANGE") bucket.noChange += total;
    if (row.result === "UNCLEAR") bucket.unclear += total;
    byActionType.set(actionType, bucket);
  }

  return {
    projectId,
    total: resultRows.reduce((sum, row) => sum + row._count._all, 0),
    byResult,
    byActionType: [...byActionType.values()].sort((a, b) => b.total - a.total)
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
