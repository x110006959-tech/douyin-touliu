import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import type { AuthenticatedRequest } from "./auth.js";

export function currentUser(req: Request) {
  return (req as AuthenticatedRequest).user;
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function readOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1000) : null;
}

export function actionProposalAudit(
  req: Request,
  proposal: { project: { workspaceId: string }; projectId: string; collectionTaskId: string },
  action: string,
  detailJson: unknown
) {
  return {
    action,
    workspaceId: proposal.project.workspaceId,
    projectId: proposal.projectId,
    taskId: proposal.collectionTaskId,
    detailJson,
    ip: req.ip,
    userAgent: req.header("user-agent") || null
  };
}
