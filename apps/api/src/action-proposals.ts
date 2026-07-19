import type { ActionProposal, ApprovalDecision, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { sanitizeDerivedPersistedJson, sanitizePersistedJson } from "./persisted-input.js";

export type ActionProposalAuditInput = {
  action: string;
  workspaceId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  detailJson?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  actorSnapshotJson?: unknown;
};

type ApprovalTransitionInput = {
  actionProposalId: string;
  userId: string;
  comment: string | null;
  audit: ActionProposalAuditInput;
};

export async function approveActionProposal(input: ApprovalTransitionInput) {
  return transitionApprovalActionProposal(input, "APPROVED", "APPROVED");
}

export async function rejectActionProposal(input: ApprovalTransitionInput) {
  return transitionApprovalActionProposal(input, "REJECTED", "REJECTED");
}

export async function observeActionProposal(input: ApprovalTransitionInput) {
  return transitionApprovalActionProposal(input, "OBSERVING", "OBSERVE");
}

export async function markActionProposalManualExecuted(input: {
  actionProposalId: string;
  projectId: string;
  collectionTaskId: string;
  userId: string;
  note: string;
  audit: ActionProposalAuditInput;
}) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.actionProposal.updateMany({
      where: { id: input.actionProposalId, status: "APPROVED", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: { status: "MANUAL_EXECUTED", manualExecutedAt: now }
    });
    if (updated.count !== 1) return null;

    const actionProposal = await tx.actionProposal.findUniqueOrThrow({ where: { id: input.actionProposalId } });
    await tx.executionLog.create({
      data: {
        actionProposalId: input.actionProposalId,
        projectId: input.projectId,
        collectionTaskId: input.collectionTaskId,
        userId: input.userId,
        mode: "MANUAL",
        status: "MANUAL_EXECUTED",
        note: input.note
      }
    });
    await createAuditLog(tx, input.userId, input.audit);
    return actionProposal;
  });
}

async function transitionApprovalActionProposal(
  input: ApprovalTransitionInput,
  targetStatus: "APPROVED" | "REJECTED" | "OBSERVING",
  decision: ApprovalDecision
): Promise<ActionProposal | null> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.actionProposal.updateMany({
      where: { id: input.actionProposalId, status: "PENDING_APPROVAL", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: approvalUpdateData(targetStatus, now)
    });
    if (updated.count !== 1) return null;

    const actionProposal = await tx.actionProposal.findUniqueOrThrow({ where: { id: input.actionProposalId } });
    await tx.approvalRecord.create({
      data: {
        actionProposalId: input.actionProposalId,
        userId: input.userId,
        decision,
        comment: input.comment
      }
    });
    await createAuditLog(tx, input.userId, input.audit);
    return actionProposal;
  });
}

function approvalUpdateData(targetStatus: "APPROVED" | "REJECTED" | "OBSERVING", now: Date): Prisma.ActionProposalUpdateManyMutationInput {
  if (targetStatus === "APPROVED") return { status: targetStatus, approvedAt: now };
  if (targetStatus === "REJECTED") return { status: targetStatus, rejectedAt: now };
  return { status: targetStatus, observedAt: now };
}

async function createAuditLog(tx: Prisma.TransactionClient, userId: string, audit: ActionProposalAuditInput) {
  await tx.auditLog.create({
    data: {
      userId,
      actorSnapshotJson: toJson(sanitizeDerivedPersistedJson(audit.actorSnapshotJson || { userId })),
      workspaceId: audit.workspaceId || null,
      projectId: audit.projectId || null,
      taskId: audit.taskId || null,
      action: audit.action,
      detailJson: audit.detailJson == null ? undefined : toJson(sanitizePersistedJson(audit.detailJson)),
      ip: audit.ip || null,
      userAgent: audit.userAgent || null
    }
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
