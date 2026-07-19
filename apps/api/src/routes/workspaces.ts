import { Router } from "express";
import { writeAuditLog } from "../audit.js";
import { readSafeOptionalText } from "../persisted-input.js";
import { prisma } from "../prisma.js";
import { sendError, sendSuccess } from "../response.js";
import { currentUser } from "../server-utils.js";

export function createWorkspaceRouter() {
  const router = Router();

  router.get("/workspaces", async (req, res) => {
    const user = currentUser(req);
    const workspaces = await prisma.workspace.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
    return sendSuccess(res, workspaces);
  });

  router.post("/workspaces", async (req, res) => {
    const user = currentUser(req);
    const nameInput = readSafeOptionalText(req.body?.name, 100);
    if (nameInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", nameInput.error);
    const name = nameInput.value || "";
    if (!name) return sendError(res, 400, "VALIDATION_ERROR", "工作区名称必填");
    const workspace = await prisma.workspace.create({ data: { name, ownerId: user.id } });
    await writeAuditLog(req, "workspace.created", { workspaceId: workspace.id, detailJson: { name } });
    return sendSuccess(res, workspace, 201);
  });

  return router;
}
