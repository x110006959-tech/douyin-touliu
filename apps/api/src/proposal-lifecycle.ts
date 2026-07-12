import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ActionProposalDTO, ActionType } from "@douyin-local-life/shared";

export const proposalLifecyclePolicy = {
  expiresAfterMs: 30 * 60 * 1000,
  volatileExpiresAfterMs: 90 * 1000,
  tacticalExpiresAfterMs: 5 * 60 * 1000,
  cooldownMs: 30 * 60 * 1000,
  maxActionablePerProjectHour: 3
} as const;

export function proposalExpiresAfterMs(actionType: ActionType) {
  if (["INCREASE_BUDGET", "DECREASE_BUDGET", "DECREASE_BID", "PAUSE_TASK", "ADJUST_ROI_TARGET"].includes(actionType)) {
    return proposalLifecyclePolicy.volatileExpiresAfterMs;
  }
  if (["ADJUST_SERVICE_PROVIDER_SOP", "RENEGOTIATE_SERVICE_FEE", "REPAIR_REPUTATION", "CHECK_INVENTORY_BOOKING"].includes(actionType)) {
    return proposalLifecyclePolicy.expiresAfterMs;
  }
  return proposalLifecyclePolicy.tacticalExpiresAfterMs;
}

const safeActionTypes = new Set<ActionType>([
  "OBSERVE",
  "KEEP_BUDGET",
  "CHECK_LIVE_ROOM",
  "CHECK_CREATIVE",
  "CHECK_AUDIENCE",
  "VERIFY_ACTIVITY",
  "CALIBRATE_SUBJECT",
  "REQUEST_MANUAL_REVIEW"
]);

export function isSafeActionType(actionType: ActionType) {
  return safeActionTypes.has(actionType);
}

export async function prepareActionProposals(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    collectionTaskId: string;
    proposals: ActionProposalDTO[];
    now?: Date;
  }
) {
  const now = input.now || new Date();
  const batchLock = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
    SELECT pg_try_advisory_xact_lock(hashtext(${input.projectId}), hashtext(${input.collectionTaskId})) AS acquired
  `);
  if (!batchLock[0]?.acquired) {
    return {
      accepted: [] as ActionProposalDTO[],
      suppressed: input.proposals.map((proposal) => ({ actionType: proposal.actionType, reason: "COOLDOWN" as const })),
      expiredProposalIds: [] as string[]
    };
  }
  const expiredProposals = await tx.actionProposal.findMany({
    where: {
      projectId: input.projectId,
      status: { in: ["PENDING_APPROVAL", "APPROVED", "OBSERVING"] },
      expiresAt: { lte: now }
    },
    select: { id: true }
  });
  if (expiredProposals.length) await tx.actionProposal.updateMany({
    where: {
      id: { in: expiredProposals.map((proposal) => proposal.id) },
      status: { in: ["PENDING_APPROVAL", "APPROVED", "OBSERVING"] },
      expiresAt: { lte: now }
    },
    data: { status: "EXPIRED" }
  });

  const accepted: ActionProposalDTO[] = [];
  const suppressed: Array<{ actionType: ActionType; reason: "COOLDOWN" | "FREQUENCY_LIMIT" }> = [];

  for (const proposal of input.proposals) {
    const dedupeKey = `${input.projectId}:${input.collectionTaskId}:${proposal.actionType}`;
    const gateId = await reserveProposalGate(tx, input.projectId, input.collectionTaskId, proposal.actionType, now);
    if (!gateId) {
      suppressed.push({ actionType: proposal.actionType, reason: "COOLDOWN" });
      continue;
    }
    if (!isSafeActionType(proposal.actionType)) {
      const quotaReserved = await reserveStrongProposalQuota(tx, input.projectId, now);
      if (!quotaReserved) {
        await tx.actionProposalGate.deleteMany({ where: { id: gateId } });
        suppressed.push({ actionType: proposal.actionType, reason: "FREQUENCY_LIMIT" });
        continue;
      }
    }
    accepted.push(proposal);
    await tx.actionProposal.updateMany({
      where: {
        projectId: input.projectId,
        collectionTaskId: input.collectionTaskId,
        dedupeKey,
        status: { in: ["PENDING_APPROVAL", "APPROVED", "OBSERVING"] }
      },
      data: { status: "SUPERSEDED", supersededAt: now }
    });
  }
  return { accepted, suppressed, expiredProposalIds: expiredProposals.map((proposal) => proposal.id) };
}

async function reserveProposalGate(tx: Prisma.TransactionClient, projectId: string, collectionTaskId: string, actionType: ActionType, now: Date) {
  const nextAllowedAt = new Date(now.getTime() + proposalLifecyclePolicy.cooldownMs);
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "ActionProposalGate" ("id", "projectId", "collectionTaskId", "actionType", "nextAllowedAt", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${projectId}, ${collectionTaskId}, ${actionType}::"ActionType", ${nextAllowedAt}, ${now}, ${now})
    ON CONFLICT ("projectId", "collectionTaskId", "actionType") DO UPDATE
    SET "nextAllowedAt" = EXCLUDED."nextAllowedAt", "updatedAt" = EXCLUDED."updatedAt"
    WHERE "ActionProposalGate"."nextAllowedAt" <= ${now}
    RETURNING "id"
  `);
  return rows[0]?.id || null;
}

async function reserveStrongProposalQuota(tx: Prisma.TransactionClient, projectId: string, now: Date) {
  const windowStart = new Date(now);
  windowStart.setUTCMinutes(0, 0, 0);
  const rows = await tx.$queryRaw<Array<{ strongCount: number }>>(Prisma.sql`
    INSERT INTO "ActionProposalQuota" ("id", "projectId", "windowStart", "strongCount", "version", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${projectId}, ${windowStart}, 1, 1, ${now}, ${now})
    ON CONFLICT ("projectId", "windowStart") DO UPDATE
    SET "strongCount" = "ActionProposalQuota"."strongCount" + 1,
        "version" = "ActionProposalQuota"."version" + 1,
        "updatedAt" = EXCLUDED."updatedAt"
    WHERE "ActionProposalQuota"."strongCount" < ${proposalLifecyclePolicy.maxActionablePerProjectHour}
    RETURNING "strongCount"
  `);
  return rows.length > 0;
}

export async function expireProposalIfNeeded(tx: Prisma.TransactionClient, actionProposalId: string, now = new Date()) {
  const result = await tx.actionProposal.updateMany({
    where: {
      id: actionProposalId,
      status: { in: ["PENDING_APPROVAL", "APPROVED", "OBSERVING"] },
      expiresAt: { lte: now }
    },
    data: { status: "EXPIRED" }
  });
  return result.count > 0;
}
