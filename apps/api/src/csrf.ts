import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { isAllowedWebOrigin } from "./http-security.js";
import { type AuthenticatedRequest } from "./auth.js";
import { sendError } from "./response.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function hashCsrfToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (safeMethods.has(req.method)) return next();
  const user = (req as AuthenticatedRequest).user;
  if (!user || user.authKind === "EXTENSION") return next();

  const origin = req.header("origin");
  const fetchSite = req.header("sec-fetch-site");
  const csrfToken = req.header("x-csrf-token") || "";
  const csrfHash = (req as AuthenticatedRequest).session?.csrfTokenHash || "";
  const validOrigin = Boolean(origin && isAllowedWebOrigin(origin));
  const validFetchSite = fetchSite === "same-origin" || fetchSite === "same-site";
  const validToken = csrfToken.length > 0 && csrfHash.length > 0 && hashesEqual(hashCsrfToken(csrfToken), csrfHash);
  if (!validOrigin || !validFetchSite || !validToken) {
    return sendError(res, 403, "CSRF_INVALID", "请求安全校验失败，请刷新页面后重试");
  }
  return next();
}

function hashesEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
