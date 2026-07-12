import type { Prisma } from "@prisma/client";
import type { ActionProposalDTO, ActionType } from "@douyin-local-life/shared";

export const proposalLifecyclePolicy = {
  expiresAfterMs: 15 * 60 * 1000,
  cooldownMs: 30 * 60 * 1000,
  maxActionablePerProjectHour: 3
} as const;

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
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.projectId})) IS NULL AS locked`;
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

  const recentSince = new Date(now.getTime() - proposalLifecyclePolicy.cooldownMs);
  const hourSince = new Date(now.getTime() - 60 * 60 * 1000);
  const recent = await tx.actionProposal.findMany({
    where: {
      projectId: input.projectId,
      collectionTaskId: input.collectionTaskId,
      createdAt: { gte: recentSince },
      status: { notIn: ["REJECTED", "EXPIRED", "SUPERSEDED"] }
    },
    select: { dedupeKey: true, actionType: true }
  });
  const recentKeys = new Set(recent.map((proposal) => proposal.dedupeKey || `${input.projectId}:${input.collectionTaskId}:${proposal.actionType}`));
  const actionableLastHour = await tx.actionProposal.count({
    where: {
      projectId: input.projectId,
      createdAt: { gte: hourSince },
      actionType: { notIn: [...safeActionTypes] }
    }
  });
  let actionableSlots = Math.max(0, proposalLifecyclePolicy.maxActionablePerProjectHour - actionableLastHour);
  const accepted: ActionProposalDTO[] = [];
  const suppressed: Array<{ actionType: ActionType; reason: "COOLDOWN" | "FREQUENCY_LIMIT" }> = [];

  for (const proposal of input.proposals) {
    const dedupeKey = `${input.projectId}:${input.collectionTaskId}:${proposal.actionType}`;
    if (recentKeys.has(dedupeKey)) {
      suppressed.push({ actionType: proposal.actionType, reason: "COOLDOWN" });
      continue;
    }
    if (!isSafeActionType(proposal.actionType)) {
      if (actionableSlots <= 0) {
        suppressed.push({ actionType: proposal.actionType, reason: "FREQUENCY_LIMIT" });
        continue;
      }
      actionableSlots -= 1;
    }
    accepted.push(proposal);
    recentKeys.add(dedupeKey);
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
