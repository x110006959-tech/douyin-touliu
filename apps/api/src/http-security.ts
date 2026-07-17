import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const defaultWebOrigin = "https://www.pxxis.cn";
const localWebOrigins = ["http://127.0.0.1:3000", "http://localhost:3000"];

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
  for (const secret of [process.env.SECURITY_SECRET, process.env.JWT_SECRET]) {
    if (secret) sanitized = sanitized.split(secret).join("[REDACTED]");
  }
  return sanitized
    .replace(/(jwt_secret|password|token|authorization|cookie|secret)\s*[:=]\s*[^,\s;]+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

export function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return callback(null, true);
  const extensionOrigins = configuredExtensionOrigins();
  return callback(null, isAllowedWebOrigin(origin) || extensionOrigins.has(origin));
}

export function configuredWebOrigins(nodeEnv = process.env.NODE_ENV) {
  const configured = parseConfiguredOrigins(process.env.WEB_ORIGIN, "WEB_ORIGIN");
  if (nodeEnv === "production") return configured;
  return new Set([...configured, ...localWebOrigins]);
}

export function isAllowedWebOrigin(origin: string, nodeEnv = process.env.NODE_ENV) {
  return configuredWebOrigins(nodeEnv).has(origin);
}

export function configuredExtensionOrigins() {
  return parseConfiguredOrigins(process.env.EXTENSION_ORIGINS, "EXTENSION_ORIGINS", "chrome-extension:");
}

export function requireConfiguredWebOrigins(nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv !== "production") return;
  if (!process.env.WEB_ORIGIN?.trim()) {
    throw new Error("WEB_ORIGIN must be explicitly configured in production");
  }
  const origins = configuredWebOrigins(nodeEnv);
  if ([...origins].some(isLocalOrigin)) {
    throw new Error("WEB_ORIGIN must not contain localhost or loopback origins in production");
  }
}

function parseConfiguredOrigins(value: string | undefined, variableName: string, allowedProtocol?: string) {
  const values = (value || (variableName === "WEB_ORIGIN" ? defaultWebOrigin : ""))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const origins = values.map((item) => normalizeOrigin(item, variableName, allowedProtocol));
  return new Set(origins);
}

function normalizeOrigin(value: string, variableName: string, allowedProtocol?: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} contains an invalid origin`);
  }
  const normalizedOrigin = allowedProtocol ? `${url.protocol}//${url.host}` : url.origin;
  if (normalizedOrigin !== value || !["", "/"].includes(url.pathname) || url.search || url.hash || url.username || url.password) {
    throw new Error(`${variableName} must contain exact origins without paths or credentials`);
  }
  if (allowedProtocol && url.protocol !== allowedProtocol) throw new Error(`${variableName} contains an unsupported origin protocol`);
  if (!allowedProtocol && !["http:", "https:"].includes(url.protocol)) throw new Error(`${variableName} contains an unsupported origin protocol`);
  return normalizedOrigin;
}

function isLocalOrigin(origin: string) {
  const hostname = new URL(origin).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
}

function isValidRequestId(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9._:-]{1,128}$/.test(value));
}
