import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { sendError } from "./response.js";

export type AuthUser = {
  id: string;
  email: string;
  workspaceId?: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

const TEST_JWT_SECRET = "test-only-change-me";
const FORBIDDEN_JWT_SECRETS = new Set(["dev-only-change-me", TEST_JWT_SECRET, "change-me", "secret", "password"]);
const MIN_JWT_SECRET_LENGTH = 32;
const SESSION_COOKIE_NAME = "pxxis_session";

export function resolveJwtSecret(nodeEnv = process.env.NODE_ENV, configuredSecret = process.env.JWT_SECRET) {
  if (nodeEnv === "test") {
    const testSecret = configuredSecret?.trim();
    if (!testSecret || testSecret.length < MIN_JWT_SECRET_LENGTH || FORBIDDEN_JWT_SECRETS.has(testSecret)) return TEST_JWT_SECRET;
    return testSecret;
  }

  const secret = configuredSecret?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET is required outside test environment");
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  if (FORBIDDEN_JWT_SECRETS.has(secret)) {
    throw new Error("JWT_SECRET is not allowed to use an insecure default value");
  }
  return secret;
}

export function jwtSecret() {
  return resolveJwtSecret();
}

export function ensureJwtSecretConfigured() {
  resolveJwtSecret();
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, jwtSecret(), { expiresIn: "1h" });
}

export function setSessionCookie(res: Response, token: string, nodeEnv = process.env.NODE_ENV) {
  res.setHeader("Set-Cookie", serializeSessionCookie(token, { secure: nodeEnv === "production", maxAge: 60 * 60 }));
  res.setHeader("Cache-Control", "no-store");
}

export function clearSessionCookie(res: Response, nodeEnv = process.env.NODE_ENV) {
  res.setHeader("Set-Cookie", serializeSessionCookie("", { secure: nodeEnv === "production", maxAge: 0 }));
  res.setHeader("Cache-Control", "no-store");
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : readCookie(req.header("cookie") || "", SESSION_COOKIE_NAME);
  if (!token) return sendError(res, 401, "UNAUTHORIZED", "缺少登录 token");

  try {
    (req as AuthenticatedRequest).user = jwt.verify(token, jwtSecret()) as AuthUser;
    return next();
  } catch {
    return sendError(res, 401, "UNAUTHORIZED", "登录 token 无效或已过期");
  }
}

function readCookie(header: string, name: string) {
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function serializeSessionCookie(value: string, options: { secure: boolean; maxAge: number }) {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAge}`,
    ...(options.secure ? ["Secure"] : [])
  ].join("; ");
}
