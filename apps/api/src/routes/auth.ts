import bcrypt from "bcryptjs";
import { Router } from "express";
import { authLoginSchema, authRegisterSchema } from "@douyin-local-life/shared";
import { authMiddleware, clearSessionCookie, setSessionCookie, signToken, type AuthenticatedRequest } from "../auth.js";
import { prisma } from "../prisma.js";
import { checkLoginRateLimit, checkRegisterRateLimit } from "../rate-limit.js";
import { sendError, sendSuccess } from "../response.js";

export function createAuthRouter() {
  const router = Router();

  router.post("/register", async (req, res) => {
    const parsed = authRegisterSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误");

    const rateLimit = checkRegisterRateLimit({ ip: req.ip, email: parsed.data.email });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) return sendError(res, 400, "REGISTER_FAILED", "注册失败，请检查信息或稍后再试。");

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        name: parsed.data.name || parsed.data.email.split("@")[0],
        workspaces: { create: { name: "默认工作区" } }
      },
      include: { workspaces: true }
    });
    const workspaceId = user.workspaces[0]?.id;
    const token = signToken({ id: user.id, email: user.email, workspaceId });
    setSessionCookie(res, token);
    return sendSuccess(res, { token, user: { id: user.id, email: user.email, name: user.name, workspaceId } }, 201);
  });

  router.post("/login", async (req, res) => {
    const parsed = authLoginSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误");

    const rateLimit = checkLoginRateLimit({ ip: req.ip, email: parsed.data.email });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      include: { workspaces: { orderBy: { createdAt: "asc" }, take: 1 } }
    });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "邮箱或密码错误。");
    }
    const workspaceId = user.workspaces[0]?.id;
    const token = signToken({ id: user.id, email: user.email, workspaceId });
    setSessionCookie(res, token);
    return sendSuccess(res, { token, user: { id: user.id, email: user.email, name: user.name, workspaceId } });
  });

  router.get("/me", authMiddleware, async (req, res) => {
    const userId = (req as AuthenticatedRequest).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    if (!user) return sendError(res, 404, "USER_NOT_FOUND", "用户不存在");
    return sendSuccess(res, user);
  });

  router.post("/logout", authMiddleware, (_req, res) => {
    clearSessionCookie(res);
    return sendSuccess(res, { loggedOut: true });
  });

  return router;
}
