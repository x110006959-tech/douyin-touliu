import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { AuthenticatedRequest } from "./auth.js";
import { sanitizePersistedJson } from "./persisted-input.js";

type AuditLogDetail = {
  workspaceId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  detailJson?: unknown;
};

export async function writeAuditLog(
  req: Request,
  action: string,
  detail: AuditLogDetail = {},
  db: Pick<Prisma.TransactionClient, "auditLog"> = prisma
) {
  const user = (req as unknown as AuthenticatedRequest).user;
  await db.auditLog.create({
    data: {
      userId: user.id,
      workspaceId: detail.workspaceId || null,
      projectId: detail.projectId || null,
      taskId: detail.taskId || null,
      action,
      detailJson: detail.detailJson == null ? undefined : toJson(sanitizePersistedJson(detail.detailJson)),
      ip: req.ip,
      userAgent: req.header("user-agent") || null
    }
  });
}

export async function writeAuditLogs(
  req: Request,
  entries: Array<{ action: string; detail?: AuditLogDetail }>,
  db: Pick<Prisma.TransactionClient, "auditLog"> = prisma
) {
  if (!entries.length) return;
  const user = (req as unknown as AuthenticatedRequest).user;
  await db.auditLog.createMany({
    data: entries.map(({ action, detail = {} }) => ({
      userId: user.id,
      workspaceId: detail.workspaceId || null,
      projectId: detail.projectId || null,
      taskId: detail.taskId || null,
      action,
      detailJson: detail.detailJson == null ? undefined : toJson(sanitizePersistedJson(detail.detailJson)),
      ip: req.ip,
      userAgent: req.header("user-agent") || null
    }))
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
