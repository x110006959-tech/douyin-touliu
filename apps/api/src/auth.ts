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

export function jwtSecret() {
  return process.env.JWT_SECRET || "dev-only-change-me";
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
