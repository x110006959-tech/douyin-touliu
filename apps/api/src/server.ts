import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { NextFunction, Request, Response } from "express";
import { authMiddleware, ensureSecurityConfiguration, extensionScopeGuard, type AuthenticatedRequest } from "./auth.js";
import { csrfProtection } from "./csrf.js";
import { assignRequestId, corsOrigin, getRequestId, requireConfiguredWebOrigins, sanitizeErrorForLog, sanitizeErrorMessage } from "./http-security.js";
import { prisma } from "./prisma.js";
import { sendError, sendSuccess } from "./response.js";
import { createAuthRouter } from "./routes/auth.js";
import { createActionProposalRouter } from "./routes/action-proposals.js";
import { createAccountRouter } from "./routes/accounts.js";
import { createExtensionProtectedRouter, createExtensionPublicRouter } from "./routes/extension-pairing.js";
import { createReviewMetricRouter } from "./routes/review-metrics.js";
import { createSnapshotAccountRouter } from "./routes/snapshot-accounts.js";
import { createCollectionDashboardRouter } from "./routes/collection-dashboard.js";
import { createSystemHealthRouter } from "./routes/system-health.js";
import { createWorkspaceRouter } from "./routes/workspaces.js";
import { createDecisionRunRouter } from "./routes/decision-runs.js";
import { createCreditsRouter } from "./routes/credits.js";
import { createProjectHistoryRouter } from "./routes/project-history.js";
import { checkWriteRateLimit } from "./rate-limit.js";
import { getBuildMetadata } from "./version.js";
import { observeSecurityMetricResponse, queueSecurityMetrics } from "./security-metrics.js";
import { registerLegacyRoutes } from "./server-routes.js";

export function createServer(options: { isDraining?: () => boolean } = {}) {
  ensureSecurityConfiguration();
  requireConfiguredWebOrigins();

  const app = express();
  app.use((req, res, next) => {
    if (options.isDraining?.() && req.path !== "/health") {
      return sendError(res, 503, "SERVICE_DRAINING", "服务正在安全停止，请稍后重试");
    }
    return next();
  });
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) app.set("trust proxy", trustProxyHops);
  app.disable("x-powered-by");
  app.use(assignRequestId);
  app.use(observeSecurityMetricResponse);
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: process.env.NODE_ENV === "production" ? undefined : false
  }));
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({
    limit: "2mb",
    verify: (req, _res, buffer) => {
      (req as Request & { rawBodyBytes?: number }).rawBodyBytes = buffer.length;
    }
  }));
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (isBodyTooLargeError(error)) return sendError(res, 413, "REQUEST_BODY_TOO_LARGE", "请求内容超过该接口允许的大小");
    return next(error);
  });

  app.get("/health", (_req, res) => sendSuccess(res, { ok: true }));
  app.get("/version", (_req, res) => sendSuccess(res, getBuildMetadata()));
  app.get("/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return sendSuccess(res, { ok: true, database: "ready" });
    } catch {
      return sendError(res, 503, "DATABASE_NOT_READY", "数据库暂不可用");
    }
  });

  app.use("/auth", createAuthRouter());
  app.use(createExtensionPublicRouter());

  app.use(authMiddleware);
  app.use(csrfProtection);
  app.use(async (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const request = req as AuthenticatedRequest;
    if (request.user.authKind === "EXTENSION" || !request.session?.id) return next();
    const rateLimit = await checkWriteRateLimit(request.session.id);
    if (rateLimit.allowed) return next();
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    return sendError(res, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试");
  });
  app.use(extensionScopeGuard);
  app.use(createAccountRouter());
  app.use(createActionProposalRouter());
  app.use(createExtensionProtectedRouter());
  app.use(createReviewMetricRouter());
  app.use(createSnapshotAccountRouter());
  app.use(createCollectionDashboardRouter());
  app.use(createSystemHealthRouter());
  app.use(createWorkspaceRouter());
  app.use(createCreditsRouter());
  app.use(createDecisionRunRouter());
  app.use(createProjectHistoryRouter());

  registerLegacyRoutes(app);

  app.use((_req, res) => sendError(res, 404, "NOT_FOUND", "接口不存在"));
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = getRequestId(res);
    console.error(`[${requestId}]`, sanitizeErrorForLog(error));
    if (isDatabaseError(error)) queueSecurityMetrics([{ key: "database_errors" }]);
    if (isPublicServiceError(error)) {
      return sendError(res, error.statusCode, error.code, error.publicMessage, { requestId });
    }
    const message =
      process.env.NODE_ENV === "production"
        ? "服务暂时不可用，请稍后再试。"
        : sanitizeErrorMessage(error instanceof Error ? error.message : "服务器内部错误");
    return sendError(res, 500, "INTERNAL_ERROR", message, { requestId });
  });
  return app;
}

function isPublicServiceError(error: unknown): error is { statusCode: number; code: string; publicMessage: string } {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Partial<{ statusCode: unknown; code: unknown; publicMessage: unknown }>;
  return typeof candidate.statusCode === "number"
    && Number.isInteger(candidate.statusCode)
    && candidate.statusCode >= 400
    && candidate.statusCode < 600
    && typeof candidate.code === "string"
    && typeof candidate.publicMessage === "string";
}

function isBodyTooLargeError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { type?: string; status?: number }).type === "entity.too.large")
    || Boolean(error && typeof error === "object" && (error as { status?: number }).status === 413);
}

function isDatabaseError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return (typeof candidate.code === "string" && /^P\d{4}$/.test(candidate.code))
    || (typeof candidate.name === "string" && candidate.name.startsWith("Prisma"));
}
