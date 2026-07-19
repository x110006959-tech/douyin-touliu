import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { hash as hashArgon2, verify as verifyArgon2, type Options as Argon2Options } from "@node-rs/argon2";
import { Router } from "express";
import { authLoginSchema, authRegisterSchema, emailVerificationConfirmSchema, emailVerificationResendSchema } from "@douyin-local-life/shared";
import { authMiddleware, clearSessionCookie, createUserSession, hashOpaqueSecret, rotateSessionCsrfToken, setSessionCookie, type AuthenticatedRequest } from "../auth.js";
import { csrfProtection } from "../csrf.js";
import { sendEmailVerification } from "../email-verification.js";
import { readSafeOptionalText } from "../persisted-input.js";
import { prisma } from "../prisma.js";
import { checkEmailVerificationRateLimit, checkLoginRateLimit, checkRegisterRateLimit } from "../rate-limit.js";
import { sendError, sendSuccess, validationErrorOptions } from "../response.js";
import { isSerializableConflict, runSerializableTransaction } from "../transactions.js";

const verificationTokenLifetimeMs = 30 * 60 * 1000;

export function createAuthRouter() {
  const router = Router();

  router.post("/register", async (req, res) => {
    const parsed = authRegisterSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误", validationErrorOptions(parsed.error));
    const nameInput = readSafeOptionalText(parsed.data.name, 100);
    if (nameInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", nameInput.error);
    const name = nameInput.value || parsed.data.email.split("@")[0];

    const rateLimit = await checkRegisterRateLimit({ ip: req.ip, email: parsed.data.email });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const verification = createVerificationToken();
    const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
    if (existingUser) return sendError(res, 400, "REGISTER_FAILED", "注册失败，请检查信息或稍后再试。");

    await prisma.pendingRegistration.upsert({
      where: { email: parsed.data.email },
      create: {
        email: parsed.data.email,
        passwordHash,
        name,
        verificationTokens: { create: verification.record }
      },
      update: {
        passwordHash,
        name,
        status: "PENDING",
        verificationTokens: {
          updateMany: { where: { consumedAt: null }, data: { consumedAt: new Date() } },
          create: verification.record
        }
      }
    });
    await deliverVerificationEmail(parsed.data.email, verification.rawToken, verification.record.expiresAt);
    return sendSuccess(res, { email: parsed.data.email, verificationRequired: true }, 202);
  });

  router.post("/email-verifications/confirm", async (req, res) => {
    const parsed = emailVerificationConfirmSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "验证链接无效或已过期", validationErrorOptions(parsed.error));

    try {
      const result = await runSerializableTransaction(async (tx) => {
        const now = new Date();
        const verification = await tx.emailVerificationToken.findUnique({
          where: { tokenHash: hashOpaqueSecret(parsed.data.token) },
          include: { pendingRegistration: true }
        });
        if (!verification || verification.consumedAt || verification.expiresAt <= now || verification.pendingRegistration.status !== "PENDING") {
          return { error: { status: 400, code: "EMAIL_VERIFICATION_INVALID", message: "验证链接无效或已过期，请重新发送验证邮件。" } } as const;
        }
        const existingUser = await tx.user.findUnique({ where: { email: verification.pendingRegistration.email }, select: { id: true } });
        if (existingUser) {
          return { error: { status: 400, code: "EMAIL_VERIFICATION_INVALID", message: "验证链接无效或已过期，请重新发送验证邮件。" } } as const;
        }
        const claimed = await tx.emailVerificationToken.updateMany({
          where: {
            id: verification.id,
            consumedAt: null,
            expiresAt: { gt: now },
            pendingRegistration: { status: "PENDING" }
          },
          data: { consumedAt: now }
        });
        if (claimed.count !== 1) {
          return { error: { status: 400, code: "EMAIL_VERIFICATION_INVALID", message: "验证链接无效或已过期，请重新发送验证邮件。" } } as const;
        }
        const user = await tx.user.create({
          data: {
            email: verification.pendingRegistration.email,
            passwordHash: verification.pendingRegistration.passwordHash,
            name: verification.pendingRegistration.name,
            emailVerifiedAt: now,
            workspaces: { create: { name: "默认工作区" } }
          },
          include: { workspaces: true }
        });
        await tx.pendingRegistration.update({ where: { id: verification.pendingRegistrationId }, data: { status: "VERIFIED" } });
        await tx.emailVerificationToken.updateMany({
          where: { pendingRegistrationId: verification.pendingRegistrationId, consumedAt: null },
          data: { consumedAt: now }
        });
        const session = await createUserSession(user.id, now, tx);
        return {
          data: {
            session,
            user: { id: user.id, email: user.email, name: user.name, workspaceId: user.workspaces[0]?.id }
          }
        } as const;
      });
      if (result.error) return sendError(res, result.error.status, result.error.code, result.error.message);
      setSessionCookie(res, result.data.session.token);
      return sendSuccess(res, {
        user: result.data.user,
        csrfToken: result.data.session.csrfToken,
        sessionExpiresAt: result.data.session.expiresAt.toISOString()
      });
    } catch (error) {
      if (isSerializableConflict(error)) return sendError(res, 409, "EMAIL_VERIFICATION_CONFLICT", "验证状态已变化，请重新打开验证链接后重试。");
      throw error;
    }
  });

  router.post("/email-verifications/resend", async (req, res) => {
    const parsed = emailVerificationResendSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误", validationErrorOptions(parsed.error));
    const rateLimit = await checkEmailVerificationRateLimit({ ip: req.ip, email: parsed.data.email });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
    }

    const pending = await prisma.pendingRegistration.findUnique({ where: { email: parsed.data.email }, select: { id: true, status: true } });
    if (pending?.status === "PENDING") {
      const verification = createVerificationToken();
      await prisma.$transaction([
        prisma.emailVerificationToken.updateMany({ where: { pendingRegistrationId: pending.id, consumedAt: null }, data: { consumedAt: new Date() } }),
        prisma.emailVerificationToken.create({ data: { pendingRegistrationId: pending.id, ...verification.record } })
      ]);
      await deliverVerificationEmail(parsed.data.email, verification.rawToken, verification.record.expiresAt);
    }
    return sendSuccess(res, { email: parsed.data.email, verificationRequired: true }, 202);
  });

  router.post("/login", async (req, res) => {
    const parsed = authLoginSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误", validationErrorOptions(parsed.error));

    const rateLimit = await checkLoginRateLimit({ ip: req.ip, email: parsed.data.email });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      include: { workspaces: { orderBy: { createdAt: "asc" }, take: 1 } }
    });
    if (!user) {
      const pending = await prisma.pendingRegistration.findUnique({ where: { email: parsed.data.email } });
      if (pending?.status === "PENDING" && await verifyPassword(pending.passwordHash, parsed.data.password)) {
        return sendError(res, 403, "EMAIL_NOT_VERIFIED", "请先完成邮箱验证后再登录。");
      }
      return sendError(res, 401, "INVALID_CREDENTIALS", "邮箱或密码错误。");
    }
    if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "邮箱或密码错误。");
    }
    if (!isArgon2Hash(user.passwordHash)) {
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
    }
    const workspaceId = user.workspaces[0]?.id;
    const session = await createUserSession(user.id);
    setSessionCookie(res, session.token);
    return sendSuccess(res, { user: { id: user.id, email: user.email, name: user.name, workspaceId }, csrfToken: session.csrfToken, sessionExpiresAt: session.expiresAt.toISOString() });
  });

  router.get("/me", authMiddleware, async (req, res) => {
    const userId = (req as AuthenticatedRequest).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    if (!user) return sendError(res, 404, "USER_NOT_FOUND", "用户不存在");
    const session = (req as AuthenticatedRequest).session;
    if (!session) return sendError(res, 401, "UNAUTHORIZED", "登录状态已失效，请重新登录");
    const csrfToken = await rotateSessionCsrfToken(session.id);
    return sendSuccess(res, { ...user, csrfToken, sessionExpiresAt: session.expiresAt.toISOString() });
  });

  router.post("/logout", authMiddleware, csrfProtection, async (req, res) => {
    const sessionId = (req as AuthenticatedRequest).session?.id;
    if (sessionId) await prisma.userSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    clearSessionCookie(res);
    return sendSuccess(res, { loggedOut: true });
  });

  return router;
}

const argon2Options: Argon2Options = { algorithm: 2, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

async function hashPassword(password: string) {
  return hashArgon2(password, argon2Options);
}

async function verifyPassword(passwordHash: string, password: string) {
  return isArgon2Hash(passwordHash) ? verifyArgon2(passwordHash, password) : bcrypt.compare(password, passwordHash);
}

function isArgon2Hash(value: string) {
  return value.startsWith("$argon2id$");
}

function createVerificationToken() {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    record: {
      tokenHash: hashOpaqueSecret(rawToken),
      expiresAt: new Date(Date.now() + verificationTokenLifetimeMs)
    }
  };
}

async function deliverVerificationEmail(email: string, token: string, expiresAt: Date) {
  try {
    await sendEmailVerification({ email, token, expiresAt });
  } catch {
    throw Object.assign(new Error("EMAIL_DELIVERY_FAILED"), { statusCode: 503, code: "EMAIL_DELIVERY_FAILED", publicMessage: "验证邮件暂时无法发送，请稍后重试。" });
  }
}
