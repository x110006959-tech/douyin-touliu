import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function assignRequestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  const requestId = isValidRequestId(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

export function getRequestId(res: Response) {
  return typeof res.locals.requestId === "string" ? res.locals.requestId : randomUUID();
}

export function sanitizeErrorForLog(error: unknown) {
  return sanitizeErrorMessage(error instanceof Error ? error.stack || error.message : String(error));
}

export function sanitizeErrorMessage(message: string) {
  let sanitized = message;
  const secret = process.env.JWT_SECRET;
  if (secret) sanitized = sanitized.split(secret).join("[REDACTED]");
  return sanitized
    .replace(/(jwt_secret|password|token|authorization|cookie|secret)\s*[:=]\s*[^,\s;]+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

export function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return callback(null, true);
  const allowed = new Set([
    ...(process.env.WEB_ORIGIN || "https://www.pxxis.cn")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    "https://www.pxxis.cn",
    "https://pxxis.cn",
    "http://127.0.0.1:3000",
    "http://localhost:3000"
  ]);
  const extensionOrigins = new Set(
    (process.env.EXTENSION_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.startsWith("chrome-extension://"))
  );
  return callback(null, allowed.has(origin) || extensionOrigins.has(origin));
}

function isValidRequestId(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9._:-]{1,128}$/.test(value));
}
