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
  return jwt.sign(user, jwtSecret(), { expiresIn: "7d" });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return sendError(res, 401, "UNAUTHORIZED", "缺少登录 token");

  try {
    (req as AuthenticatedRequest).user = jwt.verify(token, jwtSecret()) as AuthUser;
    return next();
  } catch {
    return sendError(res, 401, "UNAUTHORIZED", "登录 token 无效或已过期");
  }
}
