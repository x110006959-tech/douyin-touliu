import type { NextFunction, Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { sendError } from "./response.js";
import { prisma } from "./prisma.js";

export type AuthUser = {
  id: string;
  email: string;
  workspaceId?: string;
  authKind?: "USER_SESSION" | "EXTENSION";
  extensionCredentialId?: string;
  extensionAccountProfileId?: string;
  extensionScopes?: Array<"COLLECT" | "READ_DIAGNOSIS">;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
  session?: { id: string; csrfTokenHash: string; expiresAt: Date };
};

const FORBIDDEN_SECURITY_SECRETS = new Set(["dev-only-change-me", "test-only-change-me", "change-me", "secret", "password"]);
const MIN_SECURITY_SECRET_LENGTH = 32;
const sessionIdleMs = 60 * 60 * 1000;
const sessionAbsoluteMs = 24 * 60 * 60 * 1000;

export function resolveSecuritySecret(
  nodeEnv = process.env.NODE_ENV,
  configuredSecret = process.env.SECURITY_SECRET || process.env.JWT_SECRET
) {
  if (nodeEnv === "test") {
    const testSecret = configuredSecret?.trim();
    if (!testSecret || testSecret.length < MIN_SECURITY_SECRET_LENGTH || FORBIDDEN_SECURITY_SECRETS.has(testSecret)) return "test-only-security-secret-at-least-32-chars";
    return testSecret;
  }

  const secret = configuredSecret?.trim();
  if (!secret) {
    throw new Error("SECURITY_SECRET is required outside test environment");
  }
  if (secret.length < MIN_SECURITY_SECRET_LENGTH) {
    throw new Error(`SECURITY_SECRET must be at least ${MIN_SECURITY_SECRET_LENGTH} characters`);
  }
  if (FORBIDDEN_SECURITY_SECRETS.has(secret)) {
    throw new Error("SECURITY_SECRET is not allowed to use an insecure default value");
  }
  return secret;
}

export function securitySecret() {
  return resolveSecuritySecret();
}

export function ensureSecurityConfiguration() {
  resolveSecuritySecret();
  if (process.env.NODE_ENV === "production" && !resolveSessionCookieSecure()) {
    throw new Error("SESSION_COOKIE_SECURE must be true in production");
  }
}

export function resolveSessionCookieSecure(
  nodeEnv = process.env.NODE_ENV,
  configured = process.env.SESSION_COOKIE_SECURE
) {
  const normalized = configured?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return nodeEnv === "production";
}

export function sessionCookieName(nodeEnv = process.env.NODE_ENV) {
  return resolveSessionCookieSecure(nodeEnv) ? "__Host-pxxis_session" : "pxxis_session";
}

export async function createUserSession(
  userId: string,
  now = new Date(),
  db: Pick<Prisma.TransactionClient, "userSession"> = prisma
) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = `csrf_${randomBytes(32).toString("base64url")}`;
  const absoluteExpiresAt = new Date(now.getTime() + sessionAbsoluteMs);
  const idleExpiresAt = new Date(now.getTime() + sessionIdleMs);
  const session = await db.userSession.create({
    data: {
      userId,
      tokenHash: hashOpaqueSecret(token),
      csrfTokenHash: hashOpaqueSecret(csrfToken),
      idleExpiresAt,
      absoluteExpiresAt,
      lastSeenAt: now
    }
  });
  return { token, csrfToken, expiresAt: earliestExpiry(idleExpiresAt, absoluteExpiresAt), sessionId: session.id };
}

export async function rotateSessionCsrfToken(sessionId: string) {
  const csrfToken = `csrf_${randomBytes(32).toString("base64url")}`;
  await prisma.userSession.update({ where: { id: sessionId }, data: { csrfTokenHash: hashOpaqueSecret(csrfToken) } });
  return csrfToken;
}

export function setSessionCookie(res: Response, token: string, nodeEnv = process.env.NODE_ENV) {
  res.setHeader("Set-Cookie", serializeSessionCookie(token, { secure: resolveSessionCookieSecure(nodeEnv), maxAge: Math.floor(sessionIdleMs / 1000), name: sessionCookieName(nodeEnv) }));
  res.setHeader("Cache-Control", "no-store");
}

export function clearSessionCookie(res: Response, nodeEnv = process.env.NODE_ENV) {
  res.setHeader("Set-Cookie", serializeSessionCookie("", { secure: resolveSessionCookieSecure(nodeEnv), maxAge: 0, name: sessionCookieName(nodeEnv) }));
  res.setHeader("Cache-Control", "no-store");
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (bearerToken?.startsWith("pxx_ext_")) {
    const credential = await prisma.extensionCredential.findUnique({
      where: { tokenHash: hashExtensionSecret(bearerToken) },
      include: { user: true }
    });
    if (!credential || credential.revokedAt || credential.expiresAt <= new Date()) {
      return sendError(res, 401, "EXTENSION_CREDENTIAL_INVALID", "插件授权无效、已过期或已撤销，请重新配对");
    }
    (req as AuthenticatedRequest).user = {
      id: credential.userId,
      email: credential.user.email,
      workspaceId: credential.workspaceId,
      authKind: "EXTENSION",
      extensionCredentialId: credential.id,
      extensionAccountProfileId: credential.accountProfileId,
      extensionScopes: credential.scopes
    };
    if (!credential.lastUsedAt || Date.now() - credential.lastUsedAt.getTime() > 60_000) {
      void prisma.extensionCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    return next();
  }

  if (bearerToken) return sendError(res, 401, "UNAUTHORIZED", "登录状态已失效，请重新登录");
  const token = readCookie(req.header("cookie") || "", sessionCookieName());
  if (!token) return sendError(res, 401, "UNAUTHORIZED", "登录状态已失效，请重新登录");
  const now = new Date();
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashOpaqueSecret(token) },
    include: { user: { include: { workspaces: { orderBy: { createdAt: "asc" }, take: 1 } } } }
  });
  if (!session || session.revokedAt || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
    if (session && !session.revokedAt) {
      await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: now } }).catch(() => undefined);
    }
    return sendError(res, 401, "UNAUTHORIZED", "登录状态已失效，请重新登录");
  }
  const idleExpiresAt = new Date(Math.min(now.getTime() + sessionIdleMs, session.absoluteExpiresAt.getTime()));
  void prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: now, idleExpiresAt } }).catch(() => undefined);
  const request = req as AuthenticatedRequest;
  request.user = {
    id: session.userId,
    email: session.user.email,
    workspaceId: session.user.workspaces[0]?.id,
    authKind: "USER_SESSION"
  };
  request.session = { id: session.id, csrfTokenHash: session.csrfTokenHash, expiresAt: earliestExpiry(idleExpiresAt, session.absoluteExpiresAt) };
  return next();
}

export function hashExtensionSecret(value: string) {
  return hashOpaqueSecret(value);
}

export function hashOpaqueSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function requireHumanSession(req: Request, res: Response, next: NextFunction) {
  if ((req as AuthenticatedRequest).user.authKind === "EXTENSION") {
    return sendError(res, 403, "EXTENSION_SCOPE_FORBIDDEN", "插件授权不能执行该操作，请在网页工作台中完成");
  }
  return next();
}

export async function extensionScopeGuard(req: Request, res: Response, next: NextFunction) {
  const user = (req as AuthenticatedRequest).user;
  if (user.authKind !== "EXTENSION") return next();

  const allowed = extensionAllowedRoute(req.method, req.path);
  if (!allowed) return sendError(res, 403, "EXTENSION_SCOPE_FORBIDDEN", "插件授权仅可采集和读取诊断，请在网页工作台中完成其他操作");
  if (allowed.scope && !user.extensionScopes?.includes(allowed.scope)) {
    return sendError(res, 403, "EXTENSION_SCOPE_FORBIDDEN", "插件授权不包含该权限，请重新配对");
  }
  if (allowed.taskId) {
    const task = await prisma.collectionTask.findFirst({
      where: { id: allowed.taskId, project: { accountProfileId: user.extensionAccountProfileId } },
      select: { id: true }
    });
    if (!task) return sendError(res, 403, "EXTENSION_ACCOUNT_MISMATCH", "该任务不属于当前插件绑定账号，已阻止访问");
  }
  if (allowed.collectionRunId) {
    const run = await prisma.collectionRun.findFirst({
      where: { id: allowed.collectionRunId, task: { project: { accountProfileId: user.extensionAccountProfileId } } },
      select: { id: true }
    });
    if (!run) return sendError(res, 403, "EXTENSION_ACCOUNT_MISMATCH", "该巡检不属于当前插件绑定账号，已阻止访问");
  }
  return next();
}

function extensionAllowedRoute(method: string, path: string): { scope?: "COLLECT" | "READ_DIAGNOSIS"; taskId?: string; collectionRunId?: string } | null {
  if (method === "GET" && path === "/extension/context") return { scope: "READ_DIAGNOSIS" };
  if (method === "POST" && path === "/extension/heartbeat") return { scope: "COLLECT" };
  let match = path.match(/^\/collection-tasks\/([^/]+)$/);
  if (method === "GET" && match) return { scope: "READ_DIAGNOSIS", taskId: match[1] };
  match = path.match(/^\/collection-tasks\/([^/]+)\/(snapshots|metric-pulses|collection-runs)$/);
  if (method === "POST" && match) return { scope: "COLLECT", taskId: match[1] };
  match = path.match(/^\/collection-tasks\/([^/]+)\/decision-runs\/latest$/);
  if (method === "GET" && match) return { scope: "READ_DIAGNOSIS", taskId: match[1] };
  match = path.match(/^\/collection-runs\/([^/]+)\/(failures|stop)$/);
  if (method === "POST" && match) return { scope: "COLLECT", collectionRunId: match[1] };
  return null;
}

export function readCookie(header: string, name: string) {
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function serializeSessionCookie(value: string, options: { secure: boolean; maxAge: number; name: string }) {
  return [
    `${options.name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAge}`,
    ...(options.secure ? ["Secure"] : [])
  ].join("; ");
}

function earliestExpiry(left: Date, right: Date) {
  return left <= right ? left : right;
}
