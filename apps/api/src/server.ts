import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { NextFunction, Request, Response } from "express";
import {
  actionProposalStatuses,
  collectionRouteTemplates,
  collectionSnapshotSchema,
  extensionCollectionProtocolVersion,
  collectionFreshnessPolicy,
  inferCollectionRoute,
  identifyMetricKey,
  isSupportedCollectionUrl,
  isTrustedExtensionCollectionUrl,
  manualMetricsInputSchema,
  metricValueSemantic,
  metricValueText,
  metricKeyLabels,
  metricPulseSchema,
  normalizeCollectionRouteKey,
  projectRawTableData,
  type CollectionSnapshotPayload,
  createCollectionTaskSchema,
  createProjectSchema,
  sanitizeCaptureUrl,
  sanitizeCollectionSnapshotPayload,
  shouldRedactSensitiveKey,
  updateCollectionTaskStatusSchema,
  type AnalyzeInput,
  type DecisionEngineInput,
  type DecisionEngineOutput,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { evaluateFormalDecisionReadiness } from "@douyin-local-life/shared/formal-decision-readiness";
import { structureTaskCollectionTables } from "@douyin-local-life/decision-engine";
import {
  EXPLANATION_PROMPT_VERSION,
  buildDecisionReferenceBundle,
  createLlmProvider
} from "@douyin-local-life/llm";
import { authMiddleware, ensureSecurityConfiguration, extensionScopeGuard, type AuthenticatedRequest } from "./auth.js";
import { csrfProtection } from "./csrf.js";
import { writeAuditLog, writeAuditLogs } from "./audit.js";
import { buildDecisionInput, hasUntrustedCurrentEvidence, runDecisionEngine, strategyVersion, toActionProposalCreate } from "./decision.js";
import { DecisionEvidenceChangedError, decisionEvidenceFingerprint } from "./decision-evidence.js";
import { normalizeMetrics } from "./normalize.js";
import { qualifyCapturedMetrics, qualifyTableBindings } from "./metric-validation.js";
import { getProjectOutcomeSummary } from "./outcomes.js";
import { isUniqueConstraintError, readIdempotencyKey } from "./idempotency.js";
import { assignRequestId, corsOrigin, getRequestId, requireConfiguredWebOrigins, sanitizeErrorForLog, sanitizeErrorMessage } from "./http-security.js";
import { getOwnedProject, getOwnedTask, getOwnedTaskAccess } from "./ownership.js";
import { cursorArgs, readPagination } from "./pagination.js";
import { prisma } from "./prisma.js";
import { sendError, sendSuccess, validationErrorOptions } from "./response.js";
import { createAuthRouter } from "./routes/auth.js";
import { createActionProposalRouter } from "./routes/action-proposals.js";
import { accountIdentity, createAccountRouter } from "./routes/accounts.js";
import { createExtensionProtectedRouter, createExtensionPublicRouter } from "./routes/extension-pairing.js";
import { createReviewMetricRouter } from "./routes/review-metrics.js";
import { createSnapshotAccountRouter } from "./routes/snapshot-accounts.js";
import { createCollectionDashboardRouter } from "./routes/collection-dashboard.js";
import { createSystemHealthRouter } from "./routes/system-health.js";
import { createWorkspaceRouter } from "./routes/workspaces.js";
import { createDecisionRunRouter } from "./routes/decision-runs.js";
import { actionProposalStatusFilter, prepareActionProposals, proposalLifecyclePolicy, toReadableActionProposal } from "./proposal-lifecycle.js";
import {
  createCollectionRunSchema,
  getOwnedCollectionRun,
  hydrateCurrentRunSnapshots,
  refreshCollectionRunStatus,
  reportCollectionRouteFailureSchema,
  requiredRoutesFromJson,
  sameCollectionRouteSet,
  toCollectionRunDTO
} from "./collection-runs.js";
import { currentUser, readOptionalText, toJson } from "./server-utils.js";
import { readSafeOptionalText, sanitizeDerivedPersistedJson } from "./persisted-input.js";
import { getBuildMetadata } from "./version.js";
import { getCaptureSummary } from "./capture-summary.js";
import { latestRealtimeSignals, recordMetricPulse, subscribeRealtimeSignals } from "./realtime-signals.js";
import { metricAliasOverrideInputSchema, metricDriftStatusSchema, normalizeAlias, recordMetricDriftEvents } from "./metric-drift.js";
import { AiCircuitOpenError, executeWithAiCircuit } from "./ai-circuit.js";
import { selectLatestSnapshotsByRoute } from "./current-snapshots.js";
import { isSerializableConflict, runSerializableTransaction } from "./transactions.js";
import { getSseConnectionMetrics, registerSseConnectionCloser, reserveSseConnection } from "./sse-limits.js";
import { createLatestSseWriter } from "./sse-writer.js";
import { observeSecurityMetricResponse, queueSecurityMetrics } from "./security-metrics.js";
import {
  checkAiExplanationRateLimit,
  checkDecisionRateLimit,
  checkMetricPulseRateLimit,
  checkSnapshotRateLimit,
  checkWriteRateLimit
} from "./rate-limit.js";
import {
  currentReviewedMetrics,
  ensureReviewMetricsForTask,
  normalizedMetricsToVisibleMetrics,
  reviewCoverage
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
  app.use(createDecisionRunRouter());

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
        accountProfile: { select: { id: true, accountName: true } },
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
    const projectNameInput = readSafeOptionalText(parsed.data.name, 100);
    const serviceProviderNameInput = readSafeOptionalText(parsed.data.serviceProviderName, 100);
    const serviceModeInput = readSafeOptionalText(parsed.data.serviceMode, 100);
    if (projectNameInput.error || serviceProviderNameInput.error || serviceModeInput.error) {
      return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", projectNameInput.error || serviceProviderNameInput.error || serviceModeInput.error || "输入包含敏感认证信息，已拒绝保存");
    }
    const projectName = projectNameInput.value;
    if (!projectName) return sendError(res, 400, "VALIDATION_ERROR", "请填写项目名称");

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
        const identity = accountIdentity(projectName);
        const account = await tx.accountProfile.upsert({
          where: { workspaceId_platform_identityKey: { workspaceId: workspace.id, platform: "DOUYIN_LOCAL_LIFE", identityKey: identity.identityKey } },
          create: {
            workspaceId: workspace.id,
            platform: "DOUYIN_LOCAL_LIFE",
            identityKey: identity.identityKey,
            accountName: projectName,
            normalizedName: identity.normalizedName,
            identityStatus: "VERIFIED"
          },
          update: {}
        });
        accountProfileId = account.id;
      }
      const created = await tx.project.create({
        data: {
          workspaceId: workspace.id,
          accountProfileId,
          name: projectName,
          businessType: parsed.data.businessType,
          subjectType: parsed.data.subjectType,
          operatorType: parsed.data.operatorType,
          cooperationType: parsed.data.cooperationType,
          controlLevel: parsed.data.controlLevel,
          subjectConfidence: parsed.data.subjectConfidence || (parsed.data.subjectType !== "SUBJECT_PENDING" ? 1 : 0),
          serviceProviderName: serviceProviderNameInput.value || null,
          serviceMode: parsed.data.operatorType === "SERVICE_PROVIDER_LIVE" ? "代播" : parsed.data.operatorType === "SERVICE_PROVIDER_OPERATION" ? "代运营" : serviceModeInput.value || null,
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
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !actionProposalStatuses.includes(status as (typeof actionProposalStatuses)[number])) {
      return sendError(res, 400, "VALIDATION_ERROR", "动作建议状态不合法");
    }
    const pagination = readPagination(req, 100);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    const now = new Date();
    const proposals = await prisma.actionProposal.findMany({
      where: {
        projectId: project.id,
        ...actionProposalStatusFilter(status as (typeof actionProposalStatuses)[number] | undefined, now)
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
        project: { select: { id: true, name: true, accountProfile: { select: { id: true, accountName: true } } } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.take,
      ...cursorArgs(pagination.cursor)
    });
    return sendSuccess(res, proposals.map((proposal) => toReadableActionProposal(proposal, now)));
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
    const now = new Date();
    const proposals = await prisma.actionProposal.findMany({
      where: {
        project: {
          workspace: { ownerId: user.id },
          ...(accountProfileId ? { accountProfileId } : {}),
          ...(projectId ? { id: projectId } : {})
        },
        ...actionProposalStatusFilter(status as (typeof actionProposalStatuses)[number] | undefined, now),
        ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
      },
      include: {
        project: { include: { accountProfile: { select: { id: true, accountName: true } } } },
        collectionTask: { select: { id: true, pageTitle: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.take,
      ...cursorArgs(pagination.cursor)
    });
    return sendSuccess(res, proposals.map((proposal) => toReadableActionProposal(proposal, now)));
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
    const noteInput = readSafeOptionalText(parsed.data.note, 500);
    if (noteInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", noteInput.error);
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
        detailJson: { aliasNormalized, pageType: parsed.data.pageType, metricKey: parsed.data.metricKey, note: noteInput.value }
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
    const pageTitleInput = readSafeOptionalText(parsed.data.pageTitle, 100);
    if (pageTitleInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", pageTitleInput.error);

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
    if (safeSourceUrl) suppliedRoutes.set(inferCollectionRoute({ sourceUrl: safeSourceUrl, pageTitle: pageTitleInput.value || undefined }), safeSourceUrl);
    try {
      const task = await prisma.$transaction(async (tx) => {
        const created = await tx.collectionTask.create({
          data: {
            projectId: project.id,
            userId: user.id,
            idempotencyKey: idempotency.key,
            sourceUrl: safeSourceUrl,
            pageTitle: pageTitleInput.value || `采集任务 ${new Date().toLocaleDateString("zh-CN")}`,
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
    queueSecurityMetrics([{ key: "sse_active_connections", value: getSseConnectionMetrics().totalConnections }]);
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const signalWriter = createLatestSseWriter(res, (signals: ReturnType<typeof latestRealtimeSignals>) => `event: signals\ndata: ${JSON.stringify(signals)}\n\n`);
    signalWriter.push(latestRealtimeSignals(task.id));
    const unsubscribe = subscribeRealtimeSignals(task.id, (signals) => signalWriter.push(signals));
    const heartbeat = setInterval(() => {
      if (signalWriter.canWriteHeartbeat()) {
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
      signalWriter.close();
      reservation.release();
      queueSecurityMetrics([{ key: "sse_active_connections", value: getSseConnectionMetrics().totalConnections }]);
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
    if (
      currentUser(req).authKind === "EXTENSION"
      && snapshotPayload.captureProtocolVersion !== extensionCollectionProtocolVersion
    ) {
      return sendError(res, 409, "EXTENSION_COLLECTION_PROTOCOL_MISMATCH", "插件与当前采集服务不兼容，请更新本地服务并重新加载插件后重试");
    }
    if (currentUser(req).authKind === "EXTENSION" && !isTrustedExtensionCollectionUrl(snapshotPayload.sourceUrl)) {
      return sendError(res, 403, "EXTENSION_SOURCE_URL_FORBIDDEN", "插件只能上传可信平台域名下当前打开页面的采集结果");
    }
    const suppliedRouteKey = normalizeCollectionRouteKey(snapshotPayload.routeKey);
    const inferredRouteKey = inferCollectionRoute(snapshotPayload);
    const routeDetection = snapshotPayload.captureMeta?.routeDetection;
    const routeKey = suppliedRouteKey !== "UNKNOWN" ? suppliedRouteKey : inferredRouteKey;
    const routeConfigured = task.routeSources.some((route) => route.routeKey === routeKey);
    const extensionManualRouteConfirmed = routeDetection?.manuallyConfirmed === true
      && routeDetection.source === "MANUAL"
      && routeDetection.routeKey === routeKey
      && currentUser(req).authKind === "EXTENSION"
      && isTrustedExtensionCollectionUrl(snapshotPayload.sourceUrl);
    // The live dashboard uses one page type for its overview, product, and traffic tabs.
    const isManualLiveDashboardTab = extensionManualRouteConfirmed
      && snapshotPayload.pageType === "LIVE_DATA_SCREEN"
      && ["LIVE_PRODUCT_TAB", "LIVE_TRAFFIC_TAB"].includes(suppliedRouteKey);
    const routeConflictsWithEvidence = suppliedRouteKey !== "UNKNOWN"
      && inferredRouteKey !== "UNKNOWN"
      && suppliedRouteKey !== inferredRouteKey
      && !isManualLiveDashboardTab;
    const routeConflictsWithPageType = suppliedRouteKey !== "UNKNOWN"
      && snapshotPayload.pageType !== "UNKNOWN"
      && suppliedRouteKey !== snapshotPayload.pageType
      && !["LIVE_PRODUCT_TAB", "LIVE_TRAFFIC_TAB"].includes(suppliedRouteKey);
    // Extension uploads must retain a concrete detection result for this exact route.
    // URL inference remains a legacy fallback, but cannot turn an unknown/conflicting Popup route into verified evidence.
    const extensionRouteEvidenceInvalid = currentUser(req).authKind === "EXTENSION"
      && (!routeDetection || routeDetection.routeKey === "UNKNOWN" || routeDetection.routeKey !== routeKey);
    const routeVerificationStatus = routeKey === "UNKNOWN" || !routeConfigured || routeConflictsWithEvidence || routeConflictsWithPageType || extensionRouteEvidenceInvalid || (routeDetection?.manuallyConfirmed && !extensionManualRouteConfirmed)
      ? "MANUAL_PENDING" as const
      : "VERIFIED" as const;
    if (routeVerificationStatus === "MANUAL_PENDING") queueSecurityMetrics([{ key: "account_route_mismatches" }]);
    if (routeKey === "UNKNOWN") {
      await writeAuditLog(req, "SNAPSHOT_ROUTE_UNVERIFIED", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: { suppliedRouteKey: snapshotPayload.routeKey || null, inferredRouteKey, sourceUrl: snapshotPayload.sourceUrl }
      });
    }
    // The credential-to-task scope has already been checked by extensionScopeGuard.
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
    const normalized = await qualifyCapturedMetrics(prisma, {
      workspaceId: task.project.workspaceId,
      routeKey,
      captureMeta: snapshotPayload.captureMeta,
      metrics: normalizeMetrics(snapshotPayload, aliasOverrides as Parameters<typeof normalizeMetrics>[1])
    });
    const qualifiedCaptureMeta = await qualifyTableBindings(prisma, {
      workspaceId: task.project.workspaceId,
      routeKey,
      captureMeta: snapshotPayload.captureMeta,
      rawTableData: snapshotPayload.rawTableData
    });
    const formalMetrics = routeVerificationStatus === "VERIFIED" ? normalized : [];
    const structuredData = routeKey === "TASK_TABLE"
      ? structureTaskCollectionTables(projectRawTableData(snapshotPayload.rawTableData, {
          routeKey,
          pageType: snapshotPayload.pageType
        }), {
          routeKey,
          capturedAt: snapshotPayload.localCollectedAt,
          adapterId: snapshotPayload.captureMeta?.adapterId,
          adapterVersion: snapshotPayload.captureMeta?.adapterVersion
        })
      : null;
    try {
      const snapshot = await prisma.$transaction(async (tx) => {
        const created = await tx.dataSnapshot.create({
          data: {
            taskId: task.id,
            idempotencyKey: idempotency.key,
            pageType: snapshotPayload.pageType,
            // The legacy status records verified task scope, never a page account identifier.
            accountMatchStatus: "MATCHED",
            // Route and account detection are resolved before persistence; never retain page text.
            rawDomText: null,
            rawNetworkJson: toJson([]),
            rawTableData: toJson(snapshotPayload.rawTableData),
            structuredDataJson: structuredData ? toJson(structuredData) : undefined,
            structuredDataVersion: structuredData?.schemaVersion || null,
            visibleMetricsJson: toJson(normalized),
            captureMetaJson: qualifiedCaptureMeta ? toJson(qualifiedCaptureMeta) : undefined,
            screenshotUrl: snapshotPayload.screenshotUrl || null,
            localCollectedAt: collectedAt,
            collectionRunId: snapshotPayload.collectionRunId || null,
            routeKey,
            routeVerificationStatus,
            normalizedMetrics: {
              create: formalMetrics.map((metric: VisibleMetric) => ({
                metricKey: metric.key,
                metricName: metric.name,
                metricValue: persistedMetricValue(metric),
                metricUnit: metric.unit || null,
                metricSource: metric.metricSource || metric.source,
                confidence: metric.confidence ?? 0.5,
                rawEvidence: metric.rawEvidence ? toJson(metric.rawEvidence) : undefined
              }))
            }
          },
          include: { normalizedMetrics: true }
        });
        const trustedTableBindings = qualifiedCaptureMeta?.tableBindings?.length
          ? qualifiedCaptureMeta.tableBindings.every((binding) => binding.validationStatus === "TRUSTED")
          : false;
        if (trustedTableBindings) {
          const tables = projectRawTableData(snapshotPayload.rawTableData, { routeKey, pageType: snapshotPayload.pageType });
          const trustedReviews = tables.flatMap((table, tableIndex) => table.rows.flatMap((row, rowIndex) => row.map((cell, columnIndex) => ({
            taskId: task.id,
            snapshotId: created.id,
            tableIndex,
            rowIndex,
            columnIndex,
            originalValue: cell == null ? "" : String(cell),
            reviewedValue: cell == null ? "" : String(cell),
            reviewStatus: "CONFIRMED" as const
          }))));
          if (trustedReviews.length) await tx.tableCellReview.createMany({ data: trustedReviews, skipDuplicates: true });
        }
        if (snapshotPayload.collectionRunId && routeVerificationStatus === "VERIFIED") {
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
              lastErrorCode: null,
              lastError: null
            }
          });
          await refreshCollectionRunStatus(tx, collectionRun.id);
        }
        const initialized = routeVerificationStatus === "VERIFIED"
          ? await ensureReviewMetricsForTask({ id: task.id, snapshots: [created] }, tx)
          : { metrics: [], createdCount: 0 };
        const driftCount = routeVerificationStatus === "VERIFIED" ? await recordMetricDriftEvents(tx, {
          projectId: task.projectId,
          collectionTaskId: task.id,
          snapshotId: created.id,
          snapshot: snapshotPayload,
          normalized
        }) : 0;
        if (routeVerificationStatus === "VERIFIED") {
          await tx.collectionRouteSource.updateMany({
            where: { taskId: task.id, routeKey },
            data: { status: "CAPTURED", lastCapturedAt: collectedAt, lastError: null, sourceUrl: snapshotPayload.sourceUrl }
          });
        }
        await tx.collectionTask.update({
          where: { id: task.id },
          data: {
            status: routeVerificationStatus === "VERIFIED" ? "UPLOADED" : "REVIEWING",
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
              accountBinding: "SERVER_TASK_SCOPE",
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
      return sendSuccess(res, { ...snapshot, requiresAccountConfirmation: false }, 201);
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
    const sourceLabelInput = readSafeOptionalText(parsed.data.sourceLabel, 100);
    if (sourceLabelInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", sourceLabelInput.error);
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
        rawEvidence: { sourceType: "MANUAL_INPUT", textSnippet: sourceLabelInput.value || "网页手工录入" }
      };
    });
    const snapshotPayload: CollectionSnapshotPayload = {
      pageType: parsed.data.pageType,
      sourceUrl: "https://www.pxxis.cn/manual-entry",
      pageTitle: sourceLabelInput.value || "网页手工录入",
      rawDomText: "",
      rawNetworkJson: [],
      rawTableData: parsed.data.metrics,
      visibleMetricsJson: visibleMetrics,
      localCollectedAt: now.toISOString(),
      routeKey: parsed.data.routeKey,
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
            // Compatibility-only status: task ownership is verified server-side, not from page identity.
            accountMatchStatus: "MATCHED",
            accountConfirmedAt: now,
            rawDomText: "",
            rawNetworkJson: toJson([]),
            rawTableData: toJson(safeSnapshotPayload.rawTableData),
            visibleMetricsJson: toJson(normalized),
            localCollectedAt: now,
            routeKey: parsed.data.routeKey,
            normalizedMetrics: {
              create: normalized.map((metric) => ({
                metricKey: String(metric.key),
                metricName: metric.name,
                metricValue: persistedMetricValue(metric),
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
          detailJson: { snapshotId: created.id, metricCount: normalized.length, driftCount, sourceLabel: sourceLabelInput.value || "网页手工录入", idempotencyKey: idempotency.key }
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
    const requestedRoutes = [...new Set(parsed.data.requiredRoutes)].sort();
    const configuredRoutes = new Set(task.routeSources.map((route) => normalizeCollectionRouteKey(route.routeKey)));
    if (requestedRoutes.some((route) => !configuredRoutes.has(route))) {
      return sendError(res, 400, "ROUTE_NOT_CONFIGURED", "采集路线必须属于当前任务已配置路线");
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${task.id}), hashtext(${"collection-run-start"}))`;
      const currentTask = await tx.collectionTask.findUnique({
        where: { id: task.id },
        select: { routeSources: { select: { routeKey: true } } }
      });
      if (!currentTask) throw new Error("COLLECTION_TASK_NOT_FOUND");
      const currentConfiguredRoutes = new Set(currentTask.routeSources.map((route) => normalizeCollectionRouteKey(route.routeKey)));
      if (requestedRoutes.some((route) => !currentConfiguredRoutes.has(route))) {
        throw Object.assign(new Error("ROUTE_NOT_CONFIGURED"), {
          statusCode: 409,
          code: "ROUTE_NOT_CONFIGURED",
          publicMessage: "采集路线配置已变化，请刷新任务后重试"
        });
      }
      const active = await tx.collectionRun.findFirst({
        where: { taskId: task.id, status: { in: ["ACTIVE", "COMPLETED", "DEGRADED"] } },
        orderBy: { createdAt: "desc" },
        include: { snapshots: true, routeHealth: true }
      });
      if (active && sameCollectionRouteSet(requiredRoutesFromJson(active.requiredRoutesJson), requestedRoutes)) {
        return { run: active, replayed: true };
      }
      await tx.collectionRun.updateMany({
        where: { taskId: task.id, status: { in: ["ACTIVE", "COMPLETED", "DEGRADED"] } },
        data: { status: "STOPPED", stoppedAt: new Date() }
      });
      const created = await tx.collectionRun.create({
        data: { taskId: task.id, requiredRoutesJson: toJson(requestedRoutes) },
        include: { snapshots: true, routeHealth: true }
      });
      await writeAuditLog(req, "collection_run.started", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: { collectionRunId: created.id, requiredRoutes: requestedRoutes }
      }, tx);
      return { run: created, replayed: false };
    });
    if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
    return sendSuccess(res, toCollectionRunDTO(result.run), result.replayed ? 200 : 201);
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
    if (!requiredRoutesFromJson(run.requiredRoutesJson).includes(parsed.data.routeKey)) {
      return sendError(res, 400, "ROUTE_NOT_REQUIRED", "只能上报当前采集运行要求的路线");
    }
    const safeError = readSafeOptionalText(parsed.data.error, 500);
    if (safeError.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", safeError.error);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.collectionRouteHeartbeat.upsert({
        where: { collectionRunId_routeKey: { collectionRunId: run.id, routeKey: parsed.data.routeKey } },
        create: {
          collectionRunId: run.id,
          routeKey: parsed.data.routeKey,
          consecutiveFailures: 1,
          lastAttemptAt: new Date(),
          lastErrorCode: parsed.data.errorCode,
          lastError: safeError.value
        },
        update: {
          consecutiveFailures: { increment: 1 },
          lastAttemptAt: new Date(),
          lastErrorCode: parsed.data.errorCode,
          lastError: safeError.value
        }
      });
      const refreshed = await refreshCollectionRunStatus(tx, run.id);
      await writeAuditLog(req, "collection_route.failed", {
        workspaceId: run.task.project.workspaceId,
        projectId: run.task.projectId,
        taskId: run.taskId,
        detailJson: { collectionRunId: run.id, routeKey: parsed.data.routeKey, errorCode: parsed.data.errorCode }
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

  app.get("/collection-tasks/:id/analysis/latest", async (req, res) => {
    const task = await getOwnedTaskAccess(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const analysis = await prisma.aiAnalysisTask.findFirst({
      where: { collectionTaskId: task.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        provider: true,
        model: true,
        promptVersion: true,
        responsePayload: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return sendSuccess(res, analysis);
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
    return snapshot && snapshot.routeVerificationStatus !== "VERIFIED";
  });
  const staleRequiredRoutes = requiredRoutes.filter((route) => {
    const snapshot = latestByRoute.get(normalizeCollectionRouteKey(route.routeKey));
    if (!snapshot?.localCollectedAt) return false;
    return Date.now() - snapshot.localCollectedAt.getTime() > collectionFreshnessPolicy.staleAfterMs;
  });
  const currentMetricReviewCoverage = reviewCoverage(currentReviewedMetrics(task));
  const readiness = evaluateFormalDecisionReadiness({
    missingRequiredRouteLabels: missingRequiredRoutes.map((route) => route.label),
    unverifiedRequiredRouteLabels: unverifiedRequiredRoutes.map((route) => route.label),
    staleRequiredRouteLabels: staleRequiredRoutes.map((route) => route.label),
    subjectReady: output.dataQuality.subjectReady !== false,
    reviewTotalCount: Math.max(input.reviewCoverage?.totalCount || 0, currentMetricReviewCoverage.totalCount),
    reviewPendingCount: Math.max(input.reviewCoverage?.pendingCount || 0, currentMetricReviewCoverage.pendingCount)
  });
  const invalidEvidenceReason = hasUntrustedCurrentEvidence(task)
    ? "当前快照存在未放行的字段绑定或表格行列证据，不能生成正式诊断"
    : null;
  const unsupportedBusinessModeReason = input.subject.operatorType === "SERVICE_PROVIDER_LIVE" || input.subject.serviceMode?.trim() === "代播"
    ? null
    : "首期 AI 诊断只支持代直播增长项目";
  const additionalBlockingReasons = [invalidEvidenceReason, unsupportedBusinessModeReason].filter((reason): reason is string => Boolean(reason));
  const advisories = (output.dataQuality.blockingReasons || []).filter((reason) => ![
    "主体识别未完成",
    "数据未人工复核"
  ].includes(reason));
  return {
    ...readiness,
    ready: readiness.ready && additionalBlockingReasons.length === 0,
    blockingReasons: [...readiness.blockingReasons, ...additionalBlockingReasons],
    advisories
  };
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

function isDatabaseError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return (typeof candidate.code === "string" && /^P\d{4}$/.test(candidate.code))
    || (typeof candidate.name === "string" && candidate.name.startsWith("Prisma"));
}

function rateLimitSubject(req: Request) {
  const request = req as AuthenticatedRequest;
  return request.user.authKind === "EXTENSION"
    ? `extension:${request.user.extensionCredentialId || request.user.id}`
    : `session:${request.session?.id || request.user.id}`;
}

function persistedMetricValue(metric: VisibleMetric) {
  return metricValueText(metric, metricValueSemantic(String(metric.key))) || "";
}
