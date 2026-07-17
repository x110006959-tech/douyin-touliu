import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { NextFunction, Request, Response } from "express";
import {
  actionProposalStatuses,
  bulkReviewMetricInputSchema,
  collectionRouteTemplates,
  collectionSnapshotSchema,
  collectionFreshnessPolicy,
  evaluateFormalDecisionReadiness,
  inferCollectionRoute,
  identifyMetricKey,
  isSupportedCollectionUrl,
  manualMetricsInputSchema,
  metricKeyLabels,
  metricPulseSchema,
  normalizeCollectionRouteKey,
  type CollectionSnapshotPayload,
  createCollectionTaskSchema,
  createProjectSchema,
  reviewMetricInputSchema,
  sanitizeCaptureUrl,
  sanitizeCollectionSnapshotPayload,
  shouldRedactSensitiveKey,
  updateCollectionTaskStatusSchema,
  type AnalyzeInput,
  type DecisionEngineInput,
  type DecisionEngineOutput,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { createLlmProvider } from "@douyin-local-life/llm";
import { authMiddleware, ensureSecurityConfiguration, extensionScopeGuard, type AuthenticatedRequest } from "./auth.js";
import { csrfProtection } from "./csrf.js";
import { writeAuditLog, writeAuditLogs } from "./audit.js";
import { buildDecisionInput, runDecisionEngine, strategyVersion, toActionProposalCreate } from "./decision.js";
import { DecisionEvidenceChangedError, decisionEvidenceFingerprint } from "./decision-evidence.js";
import { normalizeMetrics } from "./normalize.js";
import { getProjectOutcomeSummary } from "./outcomes.js";
import { isUniqueConstraintError, readIdempotencyKey } from "./idempotency.js";
import { assignRequestId, corsOrigin, getRequestId, requireConfiguredWebOrigins, sanitizeErrorForLog, sanitizeErrorMessage } from "./http-security.js";
import { getOwnedProject, getOwnedReviewedMetric, getOwnedTask, getOwnedTaskAccess } from "./ownership.js";
import { cursorArgs, readPagination } from "./pagination.js";
import { prisma } from "./prisma.js";
import { sendError, sendSuccess, validationErrorOptions } from "./response.js";
import { createAuthRouter } from "./routes/auth.js";
import { createActionProposalRouter } from "./routes/action-proposals.js";
import { accountIdentity, createAccountRouter, normalizeAccountValue } from "./routes/accounts.js";
import { createExtensionProtectedRouter, createExtensionPublicRouter } from "./routes/extension-pairing.js";
import { createSnapshotAccountRouter } from "./routes/snapshot-accounts.js";
import { prepareActionProposals, proposalLifecyclePolicy } from "./proposal-lifecycle.js";
import {
  createCollectionRunSchema,
  getOwnedCollectionRun,
  hydrateCurrentRunSnapshots,
  refreshCollectionRunStatus,
  reportCollectionRouteFailureSchema,
  requiredRoutesFromJson,
  toCollectionRunDTO
} from "./collection-runs.js";
import { currentUser, readOptionalText, toJson } from "./server-utils.js";
import { getBuildMetadata } from "./version.js";
import { getCaptureSummary } from "./capture-summary.js";
import { latestRealtimeSignals, recordMetricPulse, subscribeRealtimeSignals } from "./realtime-signals.js";
import { metricAliasOverrideInputSchema, metricDriftStatusSchema, normalizeAlias, recordMetricDriftEvents } from "./metric-drift.js";
import { AiCircuitOpenError, executeWithAiCircuit, getAiCircuitStatus } from "./ai-circuit.js";
import { selectLatestSnapshotsByRoute } from "./current-snapshots.js";
import { isSerializableConflict, runSerializableTransaction } from "./transactions.js";
import { registerSseConnectionCloser, reserveSseConnection } from "./sse-limits.js";
import {
  checkAiExplanationRateLimit,
  checkDecisionRateLimit,
  checkMetricPulseRateLimit,
  checkSnapshotRateLimit,
  checkWriteRateLimit
} from "./rate-limit.js";
import {
  ensureReviewMetricsForTask,
  normalizedMetricsToVisibleMetrics,
  normalizeReviewPatch,
  toReviewedMetricDTO
} from "./review-metrics.js";

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
  app.use(createSnapshotAccountRouter());

  app.get("/system-health", async (req, res) => {
    const user = currentUser(req);
    const aiProvider = createLlmProvider("mock");
    const [rawRuns, aiCircuit] = await Promise.all([
      prisma.collectionRun.findMany({
        where: { task: { project: { workspace: { ownerId: user.id } } } },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          routeHealth: true
        }
      }),
      getAiCircuitStatus(aiProvider.name, aiProvider.model)
    ]);
    const runs = await hydrateCurrentRunSnapshots(prisma, rawRuns);
    const latestByTask = [...new Map(runs.map((run) => [run.taskId, run])).values()];
    const collectionRuns = latestByTask.map(toCollectionRunDTO);
    const degradedRuns = collectionRuns.filter((run) => run.status === "DEGRADED" || run.quality.blocksStrongActions).length;
    const aiCircuitOpen = aiCircuit.state !== "CLOSED";
    return sendSuccess(res, {
      status: degradedRuns > 0 || aiCircuitOpen ? "DEGRADED" : "HEALTHY",
      database: "READY",
      collection: {
        activeRuns: collectionRuns.filter((run) => run.status === "ACTIVE" || run.status === "COMPLETED").length,
        degradedRuns,
        runs: collectionRuns
      },
      ai: {
        status: aiCircuit.state,
        cooldownEndsAt: aiCircuit.cooldownEndsAt,
        recentFailures: aiCircuit.consecutiveFailures,
        backoffLevel: aiCircuit.backoffLevel
      },
      checkedAt: new Date().toISOString()
    });
  });

  app.get("/workspaces", async (req, res) => {
    const user = currentUser(req);
    const workspaces = await prisma.workspace.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
    return sendSuccess(res, workspaces);
  });

  app.post("/workspaces", async (req, res) => {
    const user = currentUser(req);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return sendError(res, 400, "VALIDATION_ERROR", "工作区名称必填");
    const workspace = await prisma.workspace.create({ data: { name, ownerId: user.id } });
    await writeAuditLog(req, "workspace.created", { workspaceId: workspace.id, detailJson: { name } });
    return sendSuccess(res, workspace, 201);
  });

  app.get("/projects", async (req, res) => {
    const user = currentUser(req);
    const pagination = readPagination(req);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    const projects = await prisma.project.findMany({
      where: { workspace: { ownerId: user.id } },
      select: {
        id: true,
        workspaceId: true,
        accountProfileId: true,
        accountProfile: { select: { id: true, accountName: true, platformAccountId: true, identityStatus: true } },
        name: true,
        businessType: true,
        subjectType: true,
        operatorType: true,
        cooperationType: true,
        controlLevel: true,
        subjectConfidence: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { tasks: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.take,
      ...cursorArgs(pagination.cursor)
    });
    return sendSuccess(res, projects);
  });

  app.post("/projects", async (req, res) => {
    const user = currentUser(req);
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误", validationErrorOptions(parsed.error));

    const workspace = parsed.data.workspaceId
      ? await prisma.workspace.findFirst({ where: { id: parsed.data.workspaceId, ownerId: user.id } })
      : await prisma.workspace.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
    if (!workspace) return sendError(res, 404, "WORKSPACE_NOT_FOUND", "默认工作区不存在，请重新登录后再试");
    const selectedAccount = parsed.data.accountProfileId
      ? await prisma.accountProfile.findFirst({ where: { id: parsed.data.accountProfileId, workspaceId: workspace.id, workspace: { ownerId: user.id } } })
      : null;
    if (parsed.data.accountProfileId && !selectedAccount) {
      return sendError(res, 409, "ACCOUNT_PROJECT_MISMATCH", "所选账号不属于当前工作区");
    }
    const project = await prisma.$transaction(async (tx) => {
      let accountProfileId = selectedAccount?.id;
      if (!accountProfileId) {
        const identity = accountIdentity(parsed.data.name, null);
        const account = await tx.accountProfile.upsert({
          where: { workspaceId_platform_identityKey: { workspaceId: workspace.id, platform: "DOUYIN_LOCAL_LIFE", identityKey: identity.identityKey } },
          create: {
            workspaceId: workspace.id,
            platform: "DOUYIN_LOCAL_LIFE",
            identityKey: identity.identityKey,
            accountName: parsed.data.name,
            normalizedName: identity.normalizedName,
            identityStatus: "PENDING_ID"
          },
          update: {}
        });
        accountProfileId = account.id;
      }
      const created = await tx.project.create({
        data: {
          workspaceId: workspace.id,
          accountProfileId,
          name: parsed.data.name,
          businessType: parsed.data.businessType,
          subjectType: parsed.data.subjectType,
          operatorType: parsed.data.operatorType,
          cooperationType: parsed.data.cooperationType,
          controlLevel: parsed.data.controlLevel,
          subjectConfidence: parsed.data.subjectConfidence || (parsed.data.subjectType !== "SUBJECT_PENDING" ? 1 : 0),
          serviceProviderName: parsed.data.serviceProviderName || null,
          serviceMode: parsed.data.operatorType === "SERVICE_PROVIDER_LIVE" ? "代播" : parsed.data.operatorType === "SERVICE_PROVIDER_OPERATION" ? "代运营" : parsed.data.serviceMode || null,
          serviceFee: parsed.data.serviceFee ?? null
        }
      });
      await writeAuditLog(req, "project.created", {
        workspaceId: workspace.id,
        projectId: created.id,
        detailJson: {
          accountProfileId,
          businessType: created.businessType,
          subjectType: created.subjectType,
          operatorType: created.operatorType,
          cooperationType: created.cooperationType
        }
      }, tx);
      return created;
    });
    return sendSuccess(res, project, 201);
  });

  app.get("/projects/:id", async (req, res) => {
    const project = await getOwnedProject(currentUser(req).id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    return sendSuccess(res, project);
  });

  app.get("/projects/:id/action-proposals", async (req, res) => {
    const project = await getOwnedProject(currentUser(req).id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    await expireProjectProposalsWithAudit(req, project);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !actionProposalStatuses.includes(status as (typeof actionProposalStatuses)[number])) {
      return sendError(res, 400, "VALIDATION_ERROR", "动作建议状态不合法");
    }
    const pagination = readPagination(req, 100);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    const proposals = await prisma.actionProposal.findMany({
      where: {
        projectId: project.id,
        ...(status ? { status: status as (typeof actionProposalStatuses)[number] } : {})
      },
      select: {
        id: true,
        decisionRunId: true,
        projectId: true,
        collectionTaskId: true,
        actionType: true,
        title: true,
        summary: true,
        reason: true,
        expectedImpact: true,
        riskLevel: true,
        confidence: true,
        requiresApproval: true,
        blockedReason: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        dedupeKey: true,
        supersededAt: true,
        project: { select: { id: true, name: true, accountProfile: { select: { id: true, accountName: true, platformAccountId: true, identityStatus: true } } } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.take,
      ...cursorArgs(pagination.cursor)
    });
    return sendSuccess(res, proposals);
  });

  app.get("/action-proposals", async (req, res) => {
    const user = currentUser(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !actionProposalStatuses.includes(status as (typeof actionProposalStatuses)[number])) {
      return sendError(res, 400, "VALIDATION_ERROR", "动作建议状态不合法");
    }
    const accountProfileId = typeof req.query.accountProfileId === "string" ? req.query.accountProfileId : undefined;
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return sendError(res, 400, "VALIDATION_ERROR", "时间筛选格式不合法");
    }
    const pagination = readPagination(req, 100);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    const proposals = await prisma.actionProposal.findMany({
      where: {
        project: {
          workspace: { ownerId: user.id },
          ...(accountProfileId ? { accountProfileId } : {}),
          ...(projectId ? { id: projectId } : {})
        },
        ...(status ? { status: status as (typeof actionProposalStatuses)[number] } : {}),
        ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
      },
      include: {
        project: { include: { accountProfile: { select: { id: true, accountName: true, platformAccountId: true, identityStatus: true } } } },
        collectionTask: { select: { id: true, pageTitle: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.take,
      ...cursorArgs(pagination.cursor)
    });
    return sendSuccess(res, proposals);
  });

  app.get("/projects/:id/outcome-summary", async (req, res) => {
    const project = await getOwnedProject(currentUser(req).id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    return sendSuccess(res, await getProjectOutcomeSummary(project.id));
  });

  app.get("/projects/:id/metric-aliases", async (req, res) => {
    const project = await getOwnedProject(currentUser(req).id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    return sendSuccess(res, await prisma.metricAliasOverride.findMany({
      where: { workspaceId: project.workspaceId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    }));
  });

  app.put("/projects/:id/metric-aliases/:alias", async (req, res) => {
    const user = currentUser(req);
    const project = await getOwnedProject(user.id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    const parsed = metricAliasOverrideInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "指标映射参数错误");
    const aliasNormalized = normalizeAlias(req.params.alias);
    if (!aliasNormalized) return sendError(res, 400, "VALIDATION_ERROR", "指标别名不能为空");
    const alias = await prisma.$transaction(async (tx) => {
      const saved = await tx.metricAliasOverride.upsert({
        where: { workspaceId_aliasNormalized_pageType: { workspaceId: project.workspaceId, aliasNormalized, pageType: parsed.data.pageType } },
        create: { workspaceId: project.workspaceId, aliasNormalized, pageType: parsed.data.pageType, metricKey: parsed.data.metricKey, createdById: user.id },
        update: { metricKey: parsed.data.metricKey, active: true, createdById: user.id }
      });
      await tx.metricDriftEvent.updateMany({
        where: { projectId: project.id, aliasNormalized, status: "OPEN", pageType: parsed.data.pageType === "ANY" ? undefined : parsed.data.pageType },
        data: { status: "RESOLVED", resolvedMetricKey: parsed.data.metricKey, resolvedById: user.id, resolvedAt: new Date() }
      });
      await writeAuditLog(req, "METRIC_ALIAS_OVERRIDE_UPSERTED", {
        workspaceId: project.workspaceId,
        projectId: project.id,
        detailJson: { aliasNormalized, pageType: parsed.data.pageType, metricKey: parsed.data.metricKey, note: parsed.data.note || null }
      }, tx);
      return saved;
    });
    return sendSuccess(res, alias);
  });

  app.get("/projects/:id/metric-drift-events", async (req, res) => {
    const project = await getOwnedProject(currentUser(req).id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    const status = metricDriftStatusSchema.safeParse(typeof req.query.status === "string" ? req.query.status : "OPEN");
    if (!status.success) return sendError(res, 400, "VALIDATION_ERROR", "漂移状态不合法");
    const pagination = readPagination(req, 100);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    return sendSuccess(res, await prisma.metricDriftEvent.findMany({
      where: { projectId: project.id, status: status.data },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.take,
      ...cursorArgs(pagination.cursor)
    }));
  });

  app.post("/collection-tasks", async (req, res) => {
    const user = currentUser(req);
    const parsed = createCollectionTaskSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误", validationErrorOptions(parsed.error));

    const project = await getOwnedProject(user.id, parsed.data.projectId);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    const idempotency = readIdempotencyKey(req);
    if (idempotency.error) return sendError(res, 400, "INVALID_IDEMPOTENCY_KEY", idempotency.error);
    if (idempotency.key) {
      const existing = await prisma.collectionTask.findUnique({
        where: { projectId_idempotencyKey: { projectId: project.id, idempotencyKey: idempotency.key } },
        include: { routeSources: true }
      });
      if (existing) {
        res.setHeader("Idempotent-Replayed", "true");
        return sendSuccess(res, existing);
      }
    }
    const safeSourceUrl = parsed.data.sourceUrl ? sanitizeCaptureUrl(parsed.data.sourceUrl) : null;
    const unsupportedRoute = (parsed.data.routeSources || []).find((route) => route.sourceUrl && !isSupportedCollectionUrl(route.sourceUrl));
    if ((safeSourceUrl && !isSupportedCollectionUrl(safeSourceUrl)) || unsupportedRoute) {
      return sendError(res, 400, "UNSUPPORTED_SOURCE_URL", "该网址不在支持的抖音生活服务或巨量本地推页面范围内");
    }
    const suppliedRoutes = new Map((parsed.data.routeSources || []).map((route) => [route.routeKey, route.sourceUrl ? sanitizeCaptureUrl(route.sourceUrl) : null]));
    if (safeSourceUrl) suppliedRoutes.set(inferCollectionRoute({ sourceUrl: safeSourceUrl, pageTitle: parsed.data.pageTitle }), safeSourceUrl);
    try {
      const task = await prisma.$transaction(async (tx) => {
        const created = await tx.collectionTask.create({
          data: {
            projectId: project.id,
            userId: user.id,
            idempotencyKey: idempotency.key,
            sourceUrl: safeSourceUrl,
            pageTitle: parsed.data.pageTitle || `采集任务 ${new Date().toLocaleDateString("zh-CN")}`,
            status: "PENDING",
            routeSources: {
              create: collectionRouteTemplates.map((template) => ({
                routeKey: template.routeKey,
                label: template.label,
                sourceUrl: suppliedRoutes.get(template.routeKey) || null,
                required: template.required
              }))
            }
          },
          include: { routeSources: true, project: { include: { accountProfile: true } } }
        });
        await writeAuditLog(req, "collection_task.created", {
          workspaceId: project.workspaceId,
          projectId: project.id,
          taskId: created.id,
          detailJson: { accountProfileId: project.accountProfileId, routeCount: created.routeSources.length, pageTitle: created.pageTitle, idempotencyKey: idempotency.key }
        }, tx);
        return created;
      });
      return sendSuccess(res, task, 201);
    } catch (error) {
      if (idempotency.key && isUniqueConstraintError(error)) {
        const existing = await prisma.collectionTask.findUnique({
          where: { projectId_idempotencyKey: { projectId: project.id, idempotencyKey: idempotency.key } },
          include: { routeSources: true }
        });
        if (existing) {
          res.setHeader("Idempotent-Replayed", "true");
          return sendSuccess(res, existing);
        }
      }
      throw error;
    }
  });

  app.get("/collection-tasks/:id", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id || "");
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    return sendSuccess(res, task);
  });

  app.delete("/collection-tasks/:id", async (req, res) => {
    const user = currentUser(req);
    const taskId = req.params.id || "";
    if (readOptionalText(req.body?.confirmTaskId) !== taskId) {
      return sendError(res, 400, "TASK_DELETE_CONFIRMATION_MISMATCH", "删除确认已失效，请重新打开确认窗口");
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const task = await tx.collectionTask.findFirst({
        where: { id: taskId, project: { workspace: { ownerId: user.id } } },
        select: {
          id: true,
          projectId: true,
          pageTitle: true,
          project: { select: { workspaceId: true } },
          _count: {
            select: {
              routeSources: true,
              snapshots: true,
              decisionRuns: true,
              actionProposals: true
            }
          }
        }
      });
      if (!task) return null;

      await tx.collectionTask.delete({ where: { id: task.id } });
      await writeAuditLog(req, "COLLECTION_TASK_DELETED", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        detailJson: {
          deletedTaskId: task.id,
          pageTitle: task.pageTitle,
          routeCount: task._count.routeSources,
          snapshotCount: task._count.snapshots,
          decisionRunCount: task._count.decisionRuns,
          actionProposalCount: task._count.actionProposals
        }
      }, tx);

      return {
        id: task.id,
        pageTitle: task.pageTitle,
        routeCount: task._count.routeSources,
        snapshotCount: task._count.snapshots,
        decisionRunCount: task._count.decisionRuns,
        actionProposalCount: task._count.actionProposals
      };
    });

    if (!deleted) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在或已被删除");
    return sendSuccess(res, deleted);
  });

  app.put("/collection-tasks/:id/routes/:routeKey", async (req, res) => {
    const task = await getOwnedTaskAccess(currentUser(req).id, req.params.id || "");
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const route = collectionRouteTemplates.find((item) => item.routeKey === req.params.routeKey);
    if (!route) return sendError(res, 400, "COLLECTION_ROUTE_INVALID", "采集页面类型不受支持");
    const rawUrl = typeof req.body?.sourceUrl === "string" ? req.body.sourceUrl.trim() : "";
    if (rawUrl) {
      try { new URL(rawUrl); } catch { return sendError(res, 400, "INVALID_SOURCE_URL", "请输入完整的网址，例如 https://example.com/page"); }
      if (!isSupportedCollectionUrl(rawUrl)) return sendError(res, 400, "UNSUPPORTED_SOURCE_URL", "该网址不在支持的抖音生活服务或巨量本地推页面范围内");
    }
    const saved = await prisma.$transaction(async (tx) => {
      const source = await tx.collectionRouteSource.upsert({
        where: { taskId_routeKey: { taskId: task.id, routeKey: route.routeKey } },
        create: { taskId: task.id, routeKey: route.routeKey, label: route.label, required: route.required, sourceUrl: rawUrl ? sanitizeCaptureUrl(rawUrl) : null },
        update: { sourceUrl: rawUrl ? sanitizeCaptureUrl(rawUrl) : null, status: "PENDING", lastError: null }
      });
      await writeAuditLog(req, "COLLECTION_ROUTE_UPDATED", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: { routeKey: route.routeKey, hasUrl: Boolean(rawUrl) }
      }, tx);
      return source;
    });
    return sendSuccess(res, saved);
  });

  app.patch("/collection-tasks/:id/status", async (req, res) => {
    const parsed = updateCollectionTaskStatusSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误");
    const task = await getOwnedTaskAccess(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");

    const updated = await prisma.collectionTask.update({
      where: { id: task.id },
      data: {
        status: parsed.data.status,
        startedAt: parsed.data.status === "COLLECTING" ? new Date() : task.startedAt,
        finishedAt: ["ANALYZED", "FAILED"].includes(parsed.data.status) ? new Date() : task.finishedAt
      }
    });
    await writeAuditLog(req, "collection_task.status_updated", {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      detailJson: { status: parsed.data.status }
    });
    return sendSuccess(res, updated);
  });

  app.post("/collection-tasks/:id/metric-pulses", async (req, res) => {
    if (!requestBodyWithinLimit(req, 64 * 1024)) return sendError(res, 413, "REQUEST_BODY_TOO_LARGE", "实时脉冲负载不能超过 64 KiB");
    const task = await getOwnedTaskAccess(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const pulseLimit = await checkMetricPulseRateLimit({ credentialOrSessionId: rateLimitSubject(req), taskId: task.id });
    if (!pulseLimit.allowed) {
      res.setHeader("Retry-After", String(pulseLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "实时脉冲过于频繁，请稍后再试");
    }
    const parsed = metricPulseSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "实时指标参数错误");
    const capturedAt = new Date(parsed.data.localCapturedAt).getTime();
    if (capturedAt > Date.now() + 60_000 || Date.now() - capturedAt > 5 * 60_000) {
      return sendError(res, 400, "PULSE_TIME_INVALID", "实时指标时间超出允许范围");
    }
    if (parsed.data.tabState !== "VISIBLE") {
      return sendError(res, 409, "PAGE_INACTIVE", "页面非活跃，实时信号已停止");
    }
    const accountMatch = evaluateAccountMatch(task.project.accountProfile, parsed.data);
    if (accountMatch.status === "MISMATCHED") {
      return sendError(res, 409, "ACCOUNT_MISMATCH", "当前页面账号与任务账号不一致，实时信号已停止");
    }
    if (accountMatch.status === "UNVERIFIED") {
      return sendError(res, 409, "ACCOUNT_UNVERIFIED", "当前页面未识别到账号，确认账号后才能生成实时信号");
    }
    if (parsed.data.collectionRunId) {
      const run = await prisma.collectionRun.findFirst({ where: { id: parsed.data.collectionRunId, taskId: task.id, status: { in: ["ACTIVE", "COMPLETED", "DEGRADED"] } }, select: { id: true } });
      if (!run) return sendError(res, 409, "COLLECTION_RUN_NOT_ACTIVE", "巡检批次不存在或已停止");
    }
    return sendSuccess(res, recordMetricPulse(task.id, parsed.data), 202);
  });

  app.get("/collection-tasks/:id/signals/stream", async (req, res) => {
    const user = currentUser(req);
    const task = await getOwnedTaskAccess(user.id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const reservation = reserveSseConnection(user.id, task.id);
    if (!reservation.allowed) {
      res.setHeader("Retry-After", String(reservation.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "实时连接数已达上限，请关闭闲置页面后重试");
    }
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const push = (signals: ReturnType<typeof latestRealtimeSignals>) => {
      if (res.destroyed || res.writableEnded || res.writableLength > 256 * 1024) return;
      res.write(`event: signals\ndata: ${JSON.stringify(signals)}\n\n`);
    };
    push(latestRealtimeSignals(task.id));
    const unsubscribe = subscribeRealtimeSignals(task.id, push);
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded && res.writableLength <= 256 * 1024) {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
      }
    }, 15_000);
    const maxLifetime = setTimeout(() => res.end(), 30 * 60_000);
    let closed = false;
    let unregister: () => void = () => undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(maxLifetime);
      unsubscribe();
      reservation.release();
      unregister();
      if (!res.writableEnded) res.end();
    };
    unregister = registerSseConnectionCloser(close);
    req.once("close", close);
    res.once("close", close);
  });

  app.post("/collection-tasks/:id/snapshots", async (req, res) => {
    if (!requestBodyWithinLimit(req, 2 * 1024 * 1024)) return sendError(res, 413, "REQUEST_BODY_TOO_LARGE", "采集快照不能超过 2 MiB");
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const snapshotLimit = await checkSnapshotRateLimit({ credentialOrSessionId: rateLimitSubject(req), taskId: task.id });
    if (!snapshotLimit.allowed) {
      res.setHeader("Retry-After", String(snapshotLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "采集快照过于频繁，请稍后再试");
    }
    const idempotency = readIdempotencyKey(req);
    if (idempotency.error) return sendError(res, 400, "INVALID_IDEMPOTENCY_KEY", idempotency.error);
    if (idempotency.key) {
      const existing = await prisma.dataSnapshot.findUnique({
        where: { taskId_idempotencyKey: { taskId: task.id, idempotencyKey: idempotency.key } },
        include: { normalizedMetrics: true }
      });
      if (existing) {
        res.setHeader("Idempotent-Replayed", "true");
        return sendSuccess(res, existing);
      }
    }
    const parsed = collectionSnapshotSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "快照参数错误");
    const collectedAt = new Date(parsed.data.localCollectedAt);
    if (collectedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return sendError(res, 400, "COLLECTION_TIME_INVALID", "采集时间超出服务器允许的时钟偏差");
    }

    const snapshotPayload = sanitizeCollectionSnapshotPayload(parsed.data) as CollectionSnapshotPayload;
    const suppliedRouteKey = normalizeCollectionRouteKey(snapshotPayload.routeKey);
    const inferredRouteKey = inferCollectionRoute(snapshotPayload);
    const routeDetection = snapshotPayload.captureMeta?.routeDetection;
    const routeKey = suppliedRouteKey !== "UNKNOWN" ? suppliedRouteKey : inferredRouteKey;
    const routeConfigured = task.routeSources.some((route) => route.routeKey === routeKey);
    const routeConflictsWithEvidence = suppliedRouteKey !== "UNKNOWN"
      && inferredRouteKey !== "UNKNOWN"
      && suppliedRouteKey !== inferredRouteKey;
    const routeConflictsWithPageType = suppliedRouteKey !== "UNKNOWN"
      && snapshotPayload.pageType !== "UNKNOWN"
      && suppliedRouteKey !== snapshotPayload.pageType
      && !["LIVE_PRODUCT_TAB", "LIVE_TRAFFIC_TAB"].includes(suppliedRouteKey);
    const routeVerificationStatus = routeKey === "UNKNOWN" || !routeConfigured || routeConflictsWithEvidence || routeConflictsWithPageType || routeDetection?.manuallyConfirmed
      ? "MANUAL_PENDING" as const
      : "VERIFIED" as const;
    if (routeKey === "UNKNOWN") {
      await writeAuditLog(req, "SNAPSHOT_ROUTE_UNVERIFIED", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: { suppliedRouteKey: snapshotPayload.routeKey || null, inferredRouteKey, sourceUrl: snapshotPayload.sourceUrl }
      });
    }
    const accountMatch = evaluateAccountMatch(task.project.accountProfile, snapshotPayload);
    if (accountMatch.status === "MISMATCHED") {
      await writeAuditLog(req, "SNAPSHOT_ACCOUNT_MISMATCH_REJECTED", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: { routeKey, reason: accountMatch.reason, detectedAccountId: snapshotPayload.detectedAccountId || null, detectedAccountName: snapshotPayload.detectedAccountName || null }
      });
      return sendError(res, 409, "ACCOUNT_MISMATCH", "当前页面账号与任务账号不一致，请切换到正确账号后重新采集");
    }
    if (snapshotPayload.collectionRunId) {
      const collectionRun = await prisma.collectionRun.findFirst({
        where: { id: snapshotPayload.collectionRunId, taskId: task.id, status: { in: ["ACTIVE", "COMPLETED", "DEGRADED"] } }
      });
      if (!collectionRun) return sendError(res, 409, "COLLECTION_RUN_NOT_ACTIVE", "采集巡检不存在或已停止");
    }
    const aliasOverrides = await prisma.metricAliasOverride.findMany({
      where: { workspaceId: task.project.workspaceId, active: true, pageType: { in: ["ANY", snapshotPayload.pageType] } },
      select: { aliasNormalized: true, pageType: true, metricKey: true }
    });
    const normalized = normalizeMetrics(snapshotPayload, aliasOverrides as Parameters<typeof normalizeMetrics>[1]);
    const formalMetrics = accountMatch.status === "MATCHED" && routeVerificationStatus === "VERIFIED" ? normalized : [];
    try {
      const snapshot = await prisma.$transaction(async (tx) => {
        const created = await tx.dataSnapshot.create({
          data: {
            taskId: task.id,
            idempotencyKey: idempotency.key,
            pageType: snapshotPayload.pageType,
            rawDomText: snapshotPayload.rawDomText,
            rawNetworkJson: toJson([]),
            rawTableData: toJson(snapshotPayload.rawTableData),
            visibleMetricsJson: toJson(normalized),
            captureMetaJson: snapshotPayload.captureMeta ? toJson(snapshotPayload.captureMeta) : undefined,
            screenshotUrl: snapshotPayload.screenshotUrl || null,
            localCollectedAt: collectedAt,
            collectionRunId: snapshotPayload.collectionRunId || null,
            routeKey,
            routeVerificationStatus,
            accountMatchStatus: accountMatch.status,
            detectedAccountId: snapshotPayload.detectedAccountId || null,
            detectedAccountName: snapshotPayload.detectedAccountName || null,
            accountMatchEvidence: snapshotPayload.accountMatchEvidence ? toJson(snapshotPayload.accountMatchEvidence) : undefined,
            normalizedMetrics: {
              create: formalMetrics.map((metric: VisibleMetric) => ({
                metricKey: metric.key,
                metricName: metric.name,
                metricValue: metric.value == null ? "" : String(metric.value),
                metricUnit: metric.unit || null,
                metricSource: metric.metricSource || metric.source,
                confidence: metric.confidence ?? 0.5,
                rawEvidence: metric.rawEvidence ? toJson(metric.rawEvidence) : undefined
              }))
            }
          },
          include: { normalizedMetrics: true }
        });
        if (snapshotPayload.collectionRunId && accountMatch.status === "MATCHED" && routeVerificationStatus === "VERIFIED") {
          const collectionRun = await tx.collectionRun.findFirst({
            where: { id: snapshotPayload.collectionRunId, taskId: task.id, status: { in: ["ACTIVE", "COMPLETED", "DEGRADED"] } }
          });
          if (!collectionRun) throw new Error("COLLECTION_RUN_NOT_ACTIVE");
          await tx.collectionRouteHeartbeat.upsert({
            where: { collectionRunId_routeKey: { collectionRunId: collectionRun.id, routeKey } },
            create: {
              collectionRunId: collectionRun.id,
              routeKey,
              consecutiveFailures: 0,
              lastAttemptAt: new Date(),
              lastSuccessAt: new Date()
            },
            update: {
              consecutiveFailures: 0,
              lastAttemptAt: new Date(),
              lastSuccessAt: new Date(),
              lastError: null
            }
          });
          await refreshCollectionRunStatus(tx, collectionRun.id);
        }
        const initialized = accountMatch.status === "MATCHED" && routeVerificationStatus === "VERIFIED"
          ? await ensureReviewMetricsForTask({ id: task.id, snapshots: [created] }, tx)
          : { metrics: [], createdCount: 0 };
        const driftCount = accountMatch.status === "MATCHED" && routeVerificationStatus === "VERIFIED" ? await recordMetricDriftEvents(tx, {
          projectId: task.projectId,
          collectionTaskId: task.id,
          snapshotId: created.id,
          snapshot: snapshotPayload,
          normalized
        }) : 0;
        if (accountMatch.status === "MATCHED" && routeVerificationStatus === "VERIFIED") {
          await tx.collectionRouteSource.updateMany({
            where: { taskId: task.id, routeKey },
            data: { status: "CAPTURED", lastCapturedAt: collectedAt, lastError: null, sourceUrl: snapshotPayload.sourceUrl }
          });
        }
        await tx.collectionTask.update({
          where: { id: task.id },
          data: {
            status: accountMatch.status === "MATCHED" && routeVerificationStatus === "VERIFIED" ? "UPLOADED" : "REVIEWING",
            sourceUrl: task.sourceUrl || snapshotPayload.sourceUrl,
            pageTitle: task.pageTitle || snapshotPayload.pageTitle,
            finishedAt: new Date()
          }
        });
        await writeAuditLog(
          req,
          "snapshot.uploaded",
          {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            detailJson: {
              metricCount: normalized.length,
              sourceUrl: snapshotPayload.sourceUrl,
              pageType: snapshotPayload.pageType,
              routeKey,
              collectionRunId: snapshotPayload.collectionRunId || null,
              idempotencyKey: idempotency.key,
              accountMatchStatus: accountMatch.status,
              accountMatchReason: accountMatch.reason,
              routeVerificationStatus,
              routeDetection: routeDetection || null
            }
          },
          tx
        );
        if (initialized.createdCount > 0) {
          await writeAuditLog(
            req,
            "REVIEW_METRICS_INITIALIZED",
            {
              workspaceId: task.project.workspaceId,
              projectId: task.projectId,
              taskId: task.id,
              detailJson: {
                taskId: task.id,
                snapshotId: created.id,
                metricCount: initialized.createdCount,
                source: "NormalizedMetric"
              }
            },
            tx
          );
        }
        if (driftCount > 0) {
          await writeAuditLog(req, "METRIC_DRIFT_DETECTED", {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            detailJson: { snapshotId: created.id, driftCount, adapterId: snapshotPayload.captureMeta?.adapterId || null }
          }, tx);
        }
        return created;
      });
      return sendSuccess(res, { ...snapshot, requiresAccountConfirmation: snapshot.accountMatchStatus === "UNVERIFIED" }, 201);
    } catch (error) {
      if (idempotency.key && isUniqueConstraintError(error)) {
        const existing = await prisma.dataSnapshot.findUnique({
          where: { taskId_idempotencyKey: { taskId: task.id, idempotencyKey: idempotency.key } },
          include: { normalizedMetrics: true }
        });
        if (existing) {
          res.setHeader("Idempotent-Replayed", "true");
          return sendSuccess(res, existing);
        }
      }
      throw error;
    }
  });

  app.post("/collection-tasks/:id/manual-metrics", async (req, res) => {
    const user = currentUser(req);
    const task = await getOwnedTask(user.id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const idempotency = readIdempotencyKey(req);
    if (idempotency.error) return sendError(res, 400, "INVALID_IDEMPOTENCY_KEY", idempotency.error);
    if (idempotency.key) {
      const existing = await prisma.dataSnapshot.findUnique({
        where: { taskId_idempotencyKey: { taskId: task.id, idempotencyKey: idempotency.key } },
        include: { normalizedMetrics: true, reviewedMetrics: true }
      });
      if (existing) {
        res.setHeader("Idempotent-Replayed", "true");
        return sendSuccess(res, existing);
      }
    }
    const parsed = manualMetricsInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "手工指标参数错误", validationErrorOptions(parsed.error));
    const sensitiveMetricIndex = parsed.data.metrics.findIndex((metric) => shouldRedactSensitiveKey(metric.key || metric.name));
    if (sensitiveMetricIndex >= 0) {
      return sendError(res, 400, "SENSITIVE_METRIC_FORBIDDEN", "手工指标中包含密码、Token 或认证信息字段，已拒绝导入", {
        fieldErrors: { [`metrics.${sensitiveMetricIndex}.name`]: "不得录入密码、Token、Cookie 或认证信息" }
      });
    }
    const now = new Date();
    const visibleMetrics: VisibleMetric[] = parsed.data.metrics.map((metric) => {
      const key = identifyMetricKey(metric.key || metric.name);
      return {
        key,
        name: key === "unknown" ? metric.name : metricKeyLabels[key],
        value: metric.value,
        unit: metric.unit || null,
        source: "manual",
        metricSource: "MANUAL_INPUT",
        confidence: key === "unknown" ? 0.4 : 1,
        rawEvidence: { sourceType: "MANUAL_INPUT", textSnippet: parsed.data.sourceLabel }
      };
    });
    const snapshotPayload: CollectionSnapshotPayload = {
      pageType: parsed.data.pageType,
      sourceUrl: "https://www.pxxis.cn/manual-entry",
      pageTitle: parsed.data.sourceLabel,
      rawDomText: "",
      rawNetworkJson: [],
      rawTableData: parsed.data.metrics,
      visibleMetricsJson: visibleMetrics,
      localCollectedAt: now.toISOString(),
      routeKey: parsed.data.routeKey,
      detectedAccountId: task.project.accountProfile.platformAccountId,
      detectedAccountName: task.project.accountProfile.accountName,
      accountMatchEvidence: { idSource: "MANUAL_CONFIRMATION", nameSource: "MANUAL_CONFIRMATION" }
    };
    const safeSnapshotPayload = sanitizeCollectionSnapshotPayload(snapshotPayload);
    const normalized = normalizeMetrics(safeSnapshotPayload);
    try {
      const snapshot = await prisma.$transaction(async (tx) => {
        const created = await tx.dataSnapshot.create({
          data: {
            taskId: task.id,
            idempotencyKey: idempotency.key,
            pageType: parsed.data.pageType,
            rawDomText: "",
            rawNetworkJson: toJson([]),
            rawTableData: toJson(safeSnapshotPayload.rawTableData),
            visibleMetricsJson: toJson(normalized),
            localCollectedAt: now,
            routeKey: parsed.data.routeKey,
            accountMatchStatus: "MATCHED",
            detectedAccountId: task.project.accountProfile.platformAccountId,
            detectedAccountName: task.project.accountProfile.accountName,
            accountMatchEvidence: toJson({ idSource: "MANUAL_CONFIRMATION", nameSource: "MANUAL_CONFIRMATION" }),
            accountConfirmedById: user.id,
            accountConfirmedAt: now,
            normalizedMetrics: {
              create: normalized.map((metric) => ({
                metricKey: String(metric.key),
                metricName: metric.name,
                metricValue: metric.value == null ? "" : String(metric.value),
                metricUnit: metric.unit || null,
                metricSource: "MANUAL_INPUT",
                confidence: metric.key === "unknown" ? 0.4 : 1,
                rawEvidence: metric.rawEvidence ? toJson(metric.rawEvidence) : undefined
              }))
            }
          },
          include: { normalizedMetrics: true }
        });
        await tx.reviewedMetric.createMany({
          data: created.normalizedMetrics.map((metric) => ({
            taskId: task.id,
            snapshotId: created.id,
            normalizedMetricId: metric.id,
            metricKey: metric.metricKey,
            metricName: metric.metricName,
            originalValue: metric.metricValue,
            reviewedValue: metric.metricValue,
            metricUnit: metric.metricUnit,
            metricSource: "MANUAL_INPUT",
            confidence: metric.confidence,
            rawEvidence: metric.rawEvidence || undefined,
            pageType: parsed.data.pageType,
            reviewStatus: metric.metricKey === "unknown" ? "PENDING" : "CONFIRMED",
            reviewerId: metric.metricKey === "unknown" ? null : user.id,
            reviewedAt: metric.metricKey === "unknown" ? null : now
          }))
        });
        const driftCount = await recordMetricDriftEvents(tx, {
          projectId: task.projectId,
          collectionTaskId: task.id,
          snapshotId: created.id,
          snapshot: safeSnapshotPayload,
          normalized
        });
        await tx.collectionTask.update({ where: { id: task.id }, data: { status: "UPLOADED", finishedAt: now } });
        await tx.collectionRouteSource.updateMany({
          where: { taskId: task.id, routeKey: parsed.data.routeKey },
          data: { status: "CAPTURED", lastCapturedAt: now, lastError: null }
        });
        await writeAuditLog(req, "MANUAL_METRICS_IMPORTED", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: { snapshotId: created.id, metricCount: normalized.length, driftCount, sourceLabel: parsed.data.sourceLabel, idempotencyKey: idempotency.key }
        }, tx);
        return tx.dataSnapshot.findUniqueOrThrow({ where: { id: created.id }, include: { normalizedMetrics: true, reviewedMetrics: true } });
      });
      return sendSuccess(res, snapshot, 201);
    } catch (error) {
      if (idempotency.key && isUniqueConstraintError(error)) {
        const existing = await prisma.dataSnapshot.findUnique({
          where: { taskId_idempotencyKey: { taskId: task.id, idempotencyKey: idempotency.key } },
          include: { normalizedMetrics: true, reviewedMetrics: true }
        });
        if (existing) {
          res.setHeader("Idempotent-Replayed", "true");
          return sendSuccess(res, existing);
        }
      }
      throw error;
    }
  });

  app.post("/collection-tasks/:id/collection-runs", async (req, res) => {
    const user = currentUser(req);
    const task = await getOwnedTaskAccess(user.id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const parsed = createCollectionRunSchema.safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "采集路线配置错误");
    const run = await prisma.$transaction(async (tx) => {
      await tx.collectionRun.updateMany({
        where: { taskId: task.id, status: { in: ["ACTIVE", "COMPLETED", "DEGRADED"] } },
        data: { status: "STOPPED", stoppedAt: new Date() }
      });
      const created = await tx.collectionRun.create({
        data: { taskId: task.id, requiredRoutesJson: toJson(parsed.data.requiredRoutes) },
        include: { snapshots: true, routeHealth: true }
      });
      await writeAuditLog(req, "collection_run.started", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: { collectionRunId: created.id, requiredRoutes: parsed.data.requiredRoutes }
      }, tx);
      return created;
    });
    return sendSuccess(res, toCollectionRunDTO(run), 201);
  });

  app.get("/collection-tasks/:id/collection-runs/latest", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const run = task.collectionRuns[0] || null;
    return sendSuccess(res, run ? toCollectionRunDTO(run) : null);
  });

  app.post("/collection-runs/:id/stop", async (req, res) => {
    const run = await getOwnedCollectionRun(currentUser(req).id, req.params.id);
    if (!run) return sendError(res, 404, "COLLECTION_RUN_NOT_FOUND", "采集巡检不存在");
    const stopped = await prisma.$transaction(async (tx) => {
      const updated = await tx.collectionRun.update({
        where: { id: run.id },
        data: { status: "STOPPED", stoppedAt: new Date() },
        include: { routeHealth: true }
      });
      await writeAuditLog(req, "collection_run.stopped", {
        workspaceId: run.task.project.workspaceId,
        projectId: run.task.projectId,
        taskId: run.taskId,
        detailJson: { collectionRunId: run.id }
      }, tx);
      return { ...updated, snapshots: run.snapshots };
    });
    return sendSuccess(res, toCollectionRunDTO(stopped));
  });

  app.post("/collection-runs/:id/failures", async (req, res) => {
    const run = await getOwnedCollectionRun(currentUser(req).id, req.params.id);
    if (!run) return sendError(res, 404, "COLLECTION_RUN_NOT_FOUND", "采集巡检不存在");
    if (run.status === "STOPPED") return sendError(res, 409, "COLLECTION_RUN_STOPPED", "采集巡检已停止");
    const parsed = reportCollectionRouteFailureSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "采集失败信息错误");
    const updated = await prisma.$transaction(async (tx) => {
      await tx.collectionRouteHeartbeat.upsert({
        where: { collectionRunId_routeKey: { collectionRunId: run.id, routeKey: parsed.data.routeKey } },
        create: {
          collectionRunId: run.id,
          routeKey: parsed.data.routeKey,
          consecutiveFailures: 1,
          lastAttemptAt: new Date(),
          lastError: parsed.data.error
        },
        update: {
          consecutiveFailures: { increment: 1 },
          lastAttemptAt: new Date(),
          lastError: parsed.data.error
        }
      });
      const refreshed = await refreshCollectionRunStatus(tx, run.id);
      await writeAuditLog(req, "collection_route.failed", {
        workspaceId: run.task.project.workspaceId,
        projectId: run.task.projectId,
        taskId: run.taskId,
        detailJson: { collectionRunId: run.id, routeKey: parsed.data.routeKey, error: parsed.data.error }
      }, tx);
      return refreshed;
    });
    const full = await getOwnedCollectionRun(currentUser(req).id, updated!.id);
    return sendSuccess(res, full ? toCollectionRunDTO(full) : null);
  });

  app.get("/collection-tasks/:id/snapshots", async (req, res) => {
    const task = await getOwnedTaskAccess(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const pagination = readPagination(req);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    const snapshots = await prisma.dataSnapshot.findMany({
      where: { taskId: task.id },
      include: { normalizedMetrics: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.take,
      ...cursorArgs(pagination.cursor)
    });
    return sendSuccess(res, snapshots);
  });

  app.get("/collection-tasks/:id/metrics", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    return sendSuccess(res, task.snapshots[0]?.normalizedMetrics || []);
  });

  app.get("/collection-tasks/:id/capture-summary", async (req, res) => {
    const summary = await getCaptureSummary(currentUser(req).id, req.params.id);
    if (!summary) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    return sendSuccess(res, summary);
  });

  app.get("/collection-tasks/:id/review-metrics", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const initialized = await ensureReviewMetricsForTask(task);
    if (initialized.createdCount > 0) {
      await writeAuditLog(req, "REVIEW_METRICS_INITIALIZED", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: {
          taskId: task.id,
          snapshotIds: initialized.snapshotIds,
          metricCount: initialized.createdCount,
          source: "NormalizedMetric"
        }
      });
    }
    return sendSuccess(res, initialized.metrics.map(toReviewedMetricDTO));
  });

  app.patch("/review-metrics/:id", async (req, res) => {
    const user = currentUser(req);
    const parsed = reviewMetricInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "复核参数错误");
    const metric = await getOwnedReviewedMetric(user.id, req.params.id);
    if (!metric) return sendError(res, 404, "REVIEW_METRIC_NOT_FOUND", "复核指标不存在");

    const patch = normalizeReviewPatch(metric, parsed.data);
    const updated = await prisma.reviewedMetric.update({
      where: { id: metric.id },
      data: {
        reviewedValue: patch.reviewedValue,
        reviewStatus: patch.reviewStatus,
        ...(patch.reviewStatus === "MODIFIED"
          ? {
              metricSource: "MANUAL_INPUT" as const,
              rawEvidence: toJson({
                sourceType: "MANUAL_INPUT",
                path: "reviewedValue",
                originalSource: metric.metricSource,
                originalEvidence: metric.rawEvidence || null
              })
            }
          : {}),
        reviewerId: user.id,
        reviewedAt: new Date(),
        confidence: 1
      }
    });
    await writeAuditLog(req, "REVIEW_METRIC_UPDATE", {
      workspaceId: metric.task.project.workspaceId,
      projectId: metric.task.projectId,
      taskId: metric.taskId,
      detailJson: {
        taskId: metric.taskId,
        metricId: metric.id,
        metricKey: metric.metricKey,
        oldValue: metric.reviewedValue || metric.originalValue,
        newValue: updated.reviewedValue,
        reviewStatus: updated.reviewStatus,
        source: updated.metricSource
      }
    });
    return sendSuccess(res, toReviewedMetricDTO(updated));
  });

  app.post("/collection-tasks/:id/review-metrics/bulk", async (req, res) => {
    const user = currentUser(req);
    const task = await getOwnedTask(user.id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const parsed = bulkReviewMetricInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "复核参数错误");

    const metricIds = parsed.data.items.map((item) => item.metricId);
    const metrics = await prisma.reviewedMetric.findMany({ where: { id: { in: metricIds }, taskId: task.id } });
    if (metrics.length !== metricIds.length) return sendError(res, 404, "REVIEW_METRIC_NOT_FOUND", "存在不属于该任务的复核指标");
    const byId = new Map(metrics.map((metric) => [metric.id, metric]));
    const now = new Date();
    const updated = await prisma.$transaction(
      parsed.data.items.map((item) => {
        const metric = byId.get(item.metricId);
        if (!metric) throw new Error("REVIEW_METRIC_NOT_FOUND");
        const patch = normalizeReviewPatch(metric, item);
        return prisma.reviewedMetric.update({
          where: { id: metric.id },
          data: {
            reviewedValue: patch.reviewedValue,
            reviewStatus: patch.reviewStatus,
            ...(patch.reviewStatus === "MODIFIED"
              ? {
                  metricSource: "MANUAL_INPUT" as const,
                  rawEvidence: toJson({
                    sourceType: "MANUAL_INPUT",
                    path: "reviewedValue",
                    originalSource: metric.metricSource,
                    originalEvidence: metric.rawEvidence || null
                  })
                }
              : {}),
            reviewerId: user.id,
            reviewedAt: now,
            confidence: 1
          }
        });
      })
    );
    await writeAuditLog(req, "REVIEW_METRICS_BULK_UPDATE", {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      detailJson: {
        taskId: task.id,
        items: updated.map((metric) => ({
          metricId: metric.id,
          metricKey: metric.metricKey,
          oldValue: byId.get(metric.id)?.reviewedValue || byId.get(metric.id)?.originalValue || null,
          newValue: metric.reviewedValue,
          reviewStatus: metric.reviewStatus,
          source: metric.metricSource
        }))
      }
    });
    return sendSuccess(res, updated.map(toReviewedMetricDTO));
  });

  app.post("/collection-tasks/:id/review-metrics/confirm-all", async (req, res) => {
    const user = currentUser(req);
    const task = await getOwnedTask(user.id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const initialized = await ensureReviewMetricsForTask(task);
    const pending = initialized.metrics.filter((metric) => metric.reviewStatus === "PENDING");
    const now = new Date();
    if (pending.length > 0) {
      await prisma.$transaction(
        pending.map((metric) =>
          prisma.reviewedMetric.update({
            where: { id: metric.id },
            data: {
              reviewStatus: "CONFIRMED",
              reviewedValue: metric.originalValue || "",
              reviewerId: user.id,
              reviewedAt: now,
              confidence: 1
            }
          })
        )
      );
    }
    const metrics = await prisma.reviewedMetric.findMany({
      where: { taskId: task.id, snapshotId: { in: initialized.snapshotIds } },
      orderBy: [{ createdAt: "asc" }, { metricKey: "asc" }]
    });
    await writeAuditLog(req, "REVIEW_METRICS_CONFIRM_ALL", {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      detailJson: {
        taskId: task.id,
        snapshotIds: initialized.snapshotIds,
        updatedCount: pending.length,
        source: "ReviewedMetric"
      }
    });
    return sendSuccess(res, metrics.map(toReviewedMetricDTO));
  });

  app.post("/collection-tasks/:id/decision-preview", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    if (!task.snapshots[0]) return sendError(res, 409, "SNAPSHOT_REQUIRED", "请先上传采集快照");
    const input = buildDecisionInput(task);
    const { ruleOutput, finalOutput } = runDecisionEngine(input);
    const readiness = decisionReadiness(task, input, finalOutput);
    return sendSuccess(res, {
      preview: true,
      createsRecords: false,
      mode: readiness.ready ? "FORMAL_READY" : "CONSERVATIVE_ONLY",
      readiness,
      input,
      ruleOutput,
      finalOutput,
      lifecyclePolicy: proposalLifecyclePolicy
    });
  });

  app.post("/collection-tasks/:id/decision-runs", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const idempotency = readIdempotencyKey(req);
    if (idempotency.error) return sendError(res, 400, "INVALID_IDEMPOTENCY_KEY", idempotency.error);
    if (idempotency.key) {
      const existing = await prisma.decisionRun.findUnique({
        where: { collectionTaskId_idempotencyKey: { collectionTaskId: task.id, idempotencyKey: idempotency.key } },
        include: { actionProposals: { orderBy: { createdAt: "asc" } } }
      });
      if (existing) {
        res.setHeader("Idempotent-Replayed", "true");
        return sendSuccess(res, existing);
      }
    }
    const decisionLimit = await checkDecisionRateLimit(task.id);
    if (!decisionLimit.allowed) {
      res.setHeader("Retry-After", String(decisionLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "决策运行过于频繁，请稍后再试");
    }
    if (!task.snapshots[0]) return sendError(res, 409, "SNAPSHOT_REQUIRED", "请先上传采集快照");

    const initialized = await prisma.$transaction(async (tx) => {
      const result = await ensureReviewMetricsForTask(task, tx);
      if (result.createdCount > 0) {
        await writeAuditLog(req, "REVIEW_METRICS_INITIALIZED", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: {
            taskId: task.id,
            snapshotId: task.snapshots[0]?.id || null,
            metricCount: result.createdCount,
            source: "NormalizedMetric"
          }
        }, tx);
      }
      return result;
    });
    const refreshedTask = await getOwnedTask(currentUser(req).id, task.id);
    if (!refreshedTask?.snapshots[0]) return sendError(res, 409, "SNAPSHOT_REQUIRED", "请先上传采集快照");
    const input = buildDecisionInput({
      ...refreshedTask,
      reviewedMetrics: initialized.metrics.length ? initialized.metrics : refreshedTask.reviewedMetrics
    });
    const { ruleOutput, finalOutput } = runDecisionEngine(input);
    const readiness = decisionReadiness(refreshedTask, input, finalOutput);
    if (!readiness.ready) {
      return sendError(res, 409, "DECISION_NOT_READY", `当前只能生成保守诊断：${readiness.blockingReasons.join("；")}`, {
        fieldErrors: { readiness: readiness.blockingReasons.join("；") }
      });
    }
    const evidenceFingerprint = decisionEvidenceFingerprint(refreshedTask);

    try {
      const transactionQueuedAt = performance.now();
      let transactionStartedAt = transactionQueuedAt;
      const transactionResult = await runSerializableTransaction(async (tx) => {
        transactionStartedAt = performance.now();
        if (idempotency.key) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${task.id}), hashtext(${idempotency.key}))`;
          const existing = await tx.decisionRun.findUnique({
            where: { collectionTaskId_idempotencyKey: { collectionTaskId: task.id, idempotencyKey: idempotency.key } },
            include: { actionProposals: { orderBy: { createdAt: "asc" } } }
          });
          if (existing) return { decisionRun: existing, replayed: true };
        }
        const currentTask = await getOwnedTask(currentUser(req).id, task.id, tx);
        if (!currentTask || decisionEvidenceFingerprint(currentTask) !== evidenceFingerprint) {
          throw new DecisionEvidenceChangedError();
        }
        const prepared = await prepareActionProposals(tx, {
          projectId: currentTask.projectId,
          collectionTaskId: currentTask.id,
          proposals: finalOutput.actionProposals
        });
        if (prepared.expiredProposalIds.length) {
          await writeAuditLog(req, "action_proposals.expired", {
            workspaceId: currentTask.project.workspaceId,
            projectId: currentTask.projectId,
            detailJson: {
              actionProposalIds: prepared.expiredProposalIds,
              expiredCount: prepared.expiredProposalIds.length,
              source: "decision_run"
            }
          }, tx);
        }
        const persistedOutput = { ...finalOutput, actionProposals: prepared.accepted };
        const created = await tx.decisionRun.create({
          data: {
            projectId: currentTask.projectId,
            collectionTaskId: currentTask.id,
            idempotencyKey: idempotency.key,
            evidenceFingerprint,
            engineVersion: persistedOutput.engineVersion || "decision-engine-v0.1.0",
            ruleVersion: persistedOutput.ruleVersion || strategyVersion,
            strategyVersion: persistedOutput.strategyVersion || strategyVersion,
            inputJson: toJson(input),
            ruleResultJson: toJson(ruleOutput),
            finalResultJson: toJson(persistedOutput),
            manualCheckItemsJson: toJson(persistedOutput.manualCheckItems),
            riskLevel: persistedOutput.riskLevel,
            confidence: persistedOutput.confidence,
            diagnosis: persistedOutput.diagnosis
          }
        });

        if (persistedOutput.actionProposals.length > 0) {
          const proposalCreatedAt = new Date();
          const oldestRouteAgeMs = input.collectionQuality?.routes.reduce((max, route) => Math.max(max, route.ageMs || 0), 0) || 0;
          const sourceRemainingMs = input.collectionQuality
            ? Math.max(0, collectionFreshnessPolicy.staleAfterMs - oldestRouteAgeMs)
            : proposalLifecyclePolicy.expiresAfterMs;
          const proposalExpiresAt = new Date(proposalCreatedAt.getTime() + Math.min(proposalLifecyclePolicy.expiresAfterMs, sourceRemainingMs));
          await tx.actionProposal.createMany({
            data: persistedOutput.actionProposals.map((proposal) =>
              toActionProposalCreate(proposal, created.id, currentTask.projectId, currentTask.id, proposalCreatedAt, proposalExpiresAt)
            )
          });
        }
        const withProposals = persistedOutput.actionProposals.length
          ? await tx.decisionRun.findUniqueOrThrow({
              where: { id: created.id },
              include: { actionProposals: { orderBy: { createdAt: "asc" } } }
            })
          : { ...created, actionProposals: [] };
        await writeAuditLogs(req, [
          {
            action: "CREATE_DECISION_RUN",
            detail: {
              workspaceId: currentTask.project.workspaceId,
              projectId: currentTask.projectId,
              taskId: currentTask.id,
              detailJson: {
                decisionRunId: withProposals.id,
                strategyVersion: withProposals.strategyVersion,
                riskLevel: withProposals.riskLevel,
                confidence: withProposals.confidence,
                idempotencyKey: idempotency.key
              }
            }
          },
          {
            action: "CREATE_ACTION_PROPOSALS",
            detail: {
              workspaceId: currentTask.project.workspaceId,
              projectId: currentTask.projectId,
              taskId: currentTask.id,
              detailJson: {
                decisionRunId: withProposals.id,
                actionProposalCount: withProposals.actionProposals.length,
                suppressedProposals: prepared.suppressed
              }
            }
          },
          {
            action: input.metricLayer === "REVIEWED_METRIC" ? "DECISION_RUN_USE_REVIEWED_METRICS" : "DECISION_RUN_FALLBACK_NORMALIZED_METRICS",
            detail: {
              workspaceId: currentTask.project.workspaceId,
              projectId: currentTask.projectId,
              taskId: currentTask.id,
              detailJson: {
                taskId: currentTask.id,
                decisionRunId: withProposals.id,
                source: input.metricLayer,
                dataReviewStatus: input.dataReviewStatus,
                reviewCoverage: input.reviewCoverage || null
              }
            }
          }
        ], tx);
        return { decisionRun: withProposals, replayed: false };
      });
      const transactionFinishedAt = performance.now();
      if (!transactionResult.replayed) {
        res.setHeader(
          "Server-Timing",
          `decision-queue;dur=${(transactionStartedAt - transactionQueuedAt).toFixed(1)}, decision-write;dur=${(transactionFinishedAt - transactionStartedAt).toFixed(1)}`
        );
      } else {
        res.setHeader("Idempotent-Replayed", "true");
      }
      return sendSuccess(res, transactionResult.decisionRun, transactionResult.replayed ? 200 : 201);
    } catch (error) {
      if (error instanceof DecisionEvidenceChangedError || isSerializableConflict(error)) {
        return sendError(res, 409, "DECISION_EVIDENCE_CHANGED", "决策期间采集证据或复核数据发生变化，请刷新后重新运行诊断");
      }
      if (idempotency.key && isUniqueConstraintError(error)) {
        const existing = await prisma.decisionRun.findUnique({
          where: { collectionTaskId_idempotencyKey: { collectionTaskId: task.id, idempotencyKey: idempotency.key } },
          include: { actionProposals: { orderBy: { createdAt: "asc" } } }
        });
        if (existing) {
          res.setHeader("Idempotent-Replayed", "true");
          return sendSuccess(res, existing);
        }
      }
      throw error;
    }
  });

  app.get("/collection-tasks/:id/decision-runs/latest", async (req, res) => {
    const task = await getOwnedTaskAccess(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const decisionRun = await prisma.decisionRun.findFirst({
      where: { collectionTaskId: task.id },
      include: { actionProposals: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" }
    });
    return sendSuccess(res, decisionRun);
  });

  app.post(["/collection-tasks/:id/explain", "/collection-tasks/:id/analyze"], async (req, res) => {
    if (req.path.endsWith("/analyze")) {
      res.setHeader("Deprecation", "true");
      res.setHeader("Sunset", "Wed, 31 Dec 2026 23:59:59 GMT");
      res.setHeader("Link", '</collection-tasks/:id/explain>; rel="successor-version"');
    }
    const task = await getOwnedTask(currentUser(req).id, req.params.id || "");
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const explanationLimit = await checkAiExplanationRateLimit(currentUser(req).id);
    if (!explanationLimit.allowed) {
      res.setHeader("Retry-After", String(explanationLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "AI 解读请求过于频繁，请稍后再试");
    }
    const latestSnapshot = task.snapshots[0];
    if (!latestSnapshot) return sendError(res, 409, "SNAPSHOT_REQUIRED", "请先上传采集快照");
    const metrics = normalizedMetricsToVisibleMetrics(latestSnapshot.normalizedMetrics);
    const input: AnalyzeInput = {
      businessType: task.project.businessType as AnalyzeInput["businessType"],
      subject: {
        subjectType: task.project.subjectType as AnalyzeInput["subject"]["subjectType"],
        operatorType: task.project.operatorType as AnalyzeInput["subject"]["operatorType"],
        cooperationType: task.project.cooperationType as AnalyzeInput["subject"]["cooperationType"],
        controlLevel: task.project.controlLevel as AnalyzeInput["subject"]["controlLevel"],
        confidence: task.project.subjectConfidence,
        serviceProviderName: task.project.serviceProviderName,
        serviceMode: task.project.serviceMode,
        serviceFee: task.project.serviceFee
      },
      pageTitle: task.pageTitle || "",
      sourceUrl: task.sourceUrl || "",
      metrics,
      tables: Array.isArray(latestSnapshot.rawTableData) ? (latestSnapshot.rawTableData as AnalyzeInput["tables"]) : [],
      visibleText: latestSnapshot.rawDomText || "",
      networkJsonSummary: Array.isArray(latestSnapshot.rawNetworkJson)
        ? (latestSnapshot.rawNetworkJson.slice(0, 10) as AnalyzeInput["networkJsonSummary"])
        : []
    };
    const provider = createLlmProvider("mock");
    const analysisTask = await prisma.aiAnalysisTask.create({
      data: {
        collectionTaskId: task.id,
        provider: provider.name,
        model: provider.model,
        promptVersion: "explanation-only-v0.1.2",
        status: "RUNNING",
        requestPayload: toJson(input)
      }
    });

    try {
      const output = await executeWithAiCircuit(provider.name, provider.model, () => provider.analyze(input));
      const updated = await prisma.aiAnalysisTask.update({
        where: { id: analysisTask.id },
        data: {
          status: "SUCCEEDED",
          responsePayload: toJson({
            summary: output.summary,
            problems: output.problems,
            suggestions: output.suggestions,
            manualCheckItems: output.manualCheckItems,
            confidence: output.confidence,
            finalActionsSource: "decision-engine"
          })
        }
      });
      await writeAuditLog(req, "ai_explanation.succeeded", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: { analysisTaskId: updated.id, provider: provider.name, model: provider.model }
      });
      return sendSuccess(res, updated, 201);
    } catch (error) {
      if (error instanceof AiCircuitOpenError) {
        const fallback = await prisma.aiAnalysisTask.update({
          where: { id: analysisTask.id },
          data: {
            status: "SUCCEEDED",
            provider: "deterministic-fallback",
            model: "rule-template",
            responsePayload: toJson({
              summary: "AI解释服务正在渐进退避，当前请以确定性决策诊断、证据和人工复核项为准。",
              manualCheckItems: [{ title: "AI解释降级", reason: error.retryAt ? `预计 ${error.retryAt.toISOString()} 后进行半开探测。` : "等待下一次半开探测。" }],
              confidence: 1,
              finalActionsSource: "decision-engine",
              fallback: true
            })
          }
        });
        await writeAuditLog(req, "ai_explanation.fallback", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: { analysisTaskId: fallback.id, retryAt: error.retryAt?.toISOString() || null }
        });
        return sendSuccess(res, fallback, 201);
      }
      const message = error instanceof Error ? error.message : "AI 分析失败";
      const failed = await prisma.aiAnalysisTask.update({
        where: { id: analysisTask.id },
        data: { status: "FAILED", errorMessage: message }
      });
      await writeAuditLog(req, "ai_explanation.failed", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: { analysisTaskId: failed.id, errorMessage: message }
      });
      return sendError(res, 500, "AI_ANALYSIS_FAILED", message);
    }
  });

  app.get("/collection-tasks/:id/analysis", async (req, res) => {
    const task = await getOwnedTaskAccess(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const pagination = readPagination(req, 20);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    const analyses = await prisma.aiAnalysisTask.findMany({
      where: { collectionTaskId: task.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.take,
      ...cursorArgs(pagination.cursor)
    });
    return sendSuccess(res, analyses);
  });

  app.get("/projects/:id/audit-logs", async (req, res) => {
    const project = await getOwnedProject(currentUser(req).id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    const pagination = readPagination(req, 100);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    const logs = await prisma.auditLog.findMany({
      where: { projectId: project.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.take,
      ...cursorArgs(pagination.cursor)
    });
    return sendSuccess(res, logs);
  });

  app.use((_req, res) => sendError(res, 404, "NOT_FOUND", "接口不存在"));
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = getRequestId(res);
    console.error(`[${requestId}]`, sanitizeErrorForLog(error));
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

async function expireProjectProposalsWithAudit(
  req: Request,
  project: { id: string; workspaceId: string }
) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.actionProposal.findMany({
      where: {
        projectId: project.id,
        status: { in: ["PENDING_APPROVAL", "APPROVED", "OBSERVING"] },
        expiresAt: { lte: now }
      },
      select: { id: true }
    });
    if (!candidates.length) return 0;
    const result = await tx.actionProposal.updateMany({
      where: {
        id: { in: candidates.map((proposal) => proposal.id) },
        status: { in: ["PENDING_APPROVAL", "APPROVED", "OBSERVING"] },
        expiresAt: { lte: now }
      },
      data: { status: "EXPIRED" }
    });
    if (result.count) {
      await writeAuditLog(req, "action_proposals.expired", {
        workspaceId: project.workspaceId,
        projectId: project.id,
        detailJson: {
          actionProposalIds: candidates.map((proposal) => proposal.id),
          expiredCount: result.count,
          source: "project_proposal_list"
        }
      }, tx);
    }
    return result.count;
  });
}

function decisionReadiness(
  task: NonNullable<Awaited<ReturnType<typeof getOwnedTask>>>,
  input: DecisionEngineInput,
  output: DecisionEngineOutput
) {
  const latestRunId = task.collectionRuns[0]?.id || null;
  const currentSnapshots = selectLatestSnapshotsByRoute(task.snapshots, latestRunId);
  const latestByRoute = new Map(currentSnapshots.flatMap((snapshot) => {
    const routeKey = normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType);
    return routeKey ? [[routeKey, snapshot] as const] : [];
  }));
  const activeRequiredRouteKeys = task.collectionRuns[0]
    ? requiredRoutesFromJson(task.collectionRuns[0].requiredRoutesJson)
    : task.routeSources.filter((route) => route.required).map((route) => route.routeKey);
  const requiredRoutes = activeRequiredRouteKeys.map((routeKey) => task.routeSources.find((route) => route.routeKey === routeKey) || {
    routeKey,
    label: collectionRouteTemplates.find((route) => route.routeKey === routeKey)?.label || routeKey
  });
  const missingRequiredRoutes = requiredRoutes.filter((route) => !latestByRoute.has(normalizeCollectionRouteKey(route.routeKey)));
  const unverifiedRequiredRoutes = requiredRoutes.filter((route) => {
    const snapshot = latestByRoute.get(normalizeCollectionRouteKey(route.routeKey));
    return snapshot && (snapshot.accountMatchStatus !== "MATCHED" || snapshot.routeVerificationStatus !== "VERIFIED");
  });
  const readiness = evaluateFormalDecisionReadiness({
    missingRequiredRouteLabels: missingRequiredRoutes.map((route) => route.label),
    unverifiedRequiredRouteLabels: unverifiedRequiredRoutes.map((route) => route.label),
    subjectReady: output.dataQuality.subjectReady !== false,
    reviewTotalCount: input.reviewCoverage?.totalCount || 0,
    reviewPendingCount: input.reviewCoverage?.pendingCount || 0
  });
  const advisories = (output.dataQuality.blockingReasons || []).filter((reason) => ![
    "主体识别未完成",
    "数据未人工复核"
  ].includes(reason));
  return {
    ...readiness,
    advisories
  };
}

function evaluateAccountMatch(
  account: { platformAccountId: string | null; accountName: string },
  snapshot: Pick<CollectionSnapshotPayload, "detectedAccountId" | "detectedAccountName">
): { status: "MATCHED" | "MISMATCHED" | "UNVERIFIED"; reason: string } {
  const expectedId = normalizeAccountValue(account.platformAccountId);
  const expectedName = normalizeAccountValue(account.accountName);
  const detectedId = normalizeAccountValue(snapshot.detectedAccountId);
  const detectedName = normalizeAccountValue(snapshot.detectedAccountName);
  if (expectedId && detectedId) {
    return expectedId === detectedId
      ? { status: "MATCHED", reason: "平台账号 ID 完全一致" }
      : { status: "MISMATCHED", reason: "平台账号 ID 不一致" };
  }
  if (expectedId) {
    return { status: "UNVERIFIED", reason: "账号档案已有平台账号 ID，但当前页面未识别到账号 ID" };
  }
  if (expectedName && detectedName) {
    return expectedName === detectedName
      ? { status: "MATCHED", reason: "平台账号名称完全一致" }
      : { status: "MISMATCHED", reason: "平台账号名称不一致" };
  }
  return { status: "UNVERIFIED", reason: "当前页面未识别到可核对的账号 ID 或账号名称" };
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

function requestBodyWithinLimit(req: Request, maxBytes: number) {
  const measuredBytes = (req as Request & { rawBodyBytes?: number }).rawBodyBytes;
  if (typeof measuredBytes === "number") return measuredBytes <= maxBytes;
  const contentLength = Number(req.header("content-length"));
  return !Number.isFinite(contentLength) || contentLength <= maxBytes;
}

function isBodyTooLargeError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { type?: string; status?: number }).type === "entity.too.large")
    || Boolean(error && typeof error === "object" && (error as { status?: number }).status === 413);
}

function rateLimitSubject(req: Request) {
  const request = req as AuthenticatedRequest;
  return request.user.authKind === "EXTENSION"
    ? `extension:${request.user.extensionCredentialId || request.user.id}`
    : `session:${request.session?.id || request.user.id}`;
}
