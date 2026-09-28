import { Router } from "express";
import { prisma } from "../prisma.js";
import { sendError, sendSuccess } from "../response.js";
import { currentUser } from "../server-utils.js";

export function createCreditsRouter() {
  const router = Router();

  router.get("/credits", async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: currentUser(req).id },
      select: { creditBalance: true }
    });
    if (!user) return sendError(res, 404, "USER_NOT_FOUND", "用户不存在");
    return sendSuccess(res, user);
  });

  return router;
}
