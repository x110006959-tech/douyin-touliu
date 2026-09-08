import { Router } from "express";
import { getOwnedProject } from "../ownership.js";
import { prisma } from "../prisma.js";
import { getProjectHistoryComparison, getProjectHistoryOverview } from "../project-history.js";
import { sendError, sendSuccess } from "../response.js";
import { currentUser } from "../server-utils.js";

const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/;

export function createProjectHistoryRouter() {
  const router = Router();

  router.get("/projects/:id/history", async (req, res) => {
    const project = await getOwnedProject(currentUser(req).id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    return sendSuccess(res, await getProjectHistoryOverview(prisma, project.id, project.accountProfileId));
  });

  router.get("/projects/:id/history/comparison", async (req, res) => {
    const project = await getOwnedProject(currentUser(req).id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    const mode = typeof req.query.mode === "string" ? req.query.mode : "archives";
    if (!(["archives", "period", "session", "analysis-window"] as const).includes(mode as never)) {
      return sendError(res, 400, "HISTORY_COMPARISON_MODE_INVALID", "对比方式不合法");
    }
    const baselineArchiveId = queryId(req.query.baselineArchiveId);
    const currentArchiveId = queryId(req.query.currentArchiveId);
    const archiveId = queryId(req.query.archiveId);
    const sessionId = queryId(req.query.sessionId);
    if ([baselineArchiveId, currentArchiveId, archiveId, sessionId].some((item) => item === false)) {
      return sendError(res, 400, "HISTORY_COMPARISON_ID_INVALID", "历史记录标识不合法");
    }
    const days = req.query.days === "30" ? 30 : req.query.days === "7" || req.query.days == null ? 7 : null;
    if (days == null) return sendError(res, 400, "HISTORY_COMPARISON_DAYS_INVALID", "周期仅支持最近 7 天或 30 天");
    const minutes = req.query.minutes === "60" ? 60 : req.query.minutes === "30" || req.query.minutes == null ? 30 : null;
    if (minutes == null) return sendError(res, 400, "HISTORY_COMPARISON_WINDOW_INVALID", "分析前后窗口仅支持 30 分钟或 60 分钟");
    const comparison = await getProjectHistoryComparison(prisma, {
      projectId: project.id,
      mode: mode as "archives" | "period" | "session" | "analysis-window",
      baselineArchiveId: baselineArchiveId || null,
      currentArchiveId: currentArchiveId || null,
      archiveId: archiveId || null,
      sessionId: sessionId || null,
      days: days || undefined,
      minutes: minutes || undefined
    });
    return sendSuccess(res, comparison);
  });

  return router;
}

function queryId(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string" || !identifierPattern.test(value)) return false;
  return value;
}
