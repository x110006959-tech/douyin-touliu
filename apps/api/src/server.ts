import "express-async-errors";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import {
  actionProposalStatuses,
  bulkReviewMetricInputSchema,
  collectionSnapshotSchema,
  collectionFreshnessPolicy,
  inferCollectionRoute,
  metricPulseSchema,
  type CollectionSnapshotPayload,
  createActionOutcomeInputSchema,
  createCollectionTaskSchema,
  createProjectSchema,
  reviewMetricInputSchema,
  sanitizeCollectionSnapshotPayload,
  updateCollectionTaskStatusSchema,
  type AnalyzeInput,
  type VisibleMetric
} from "@douyin-local-life/shared";
import { createLlmProvider } from "@douyin-local-life/llm";
import {
  approveActionProposal,
  markActionProposalManualExecuted,
  observeActionProposal,
  rejectActionProposal
} from "./action-proposals.js";
import { authMiddleware, ensureJwtSecretConfigured } from "./auth.js";
import { writeAuditLog } from "./audit.js";
import { buildDecisionInput, runDecisionEngine, strategyVersion, toActionProposalCreate } from "./decision.js";
import { normalizeMetrics } from "./normalize.js";
import { createActionOutcome, getProjectOutcomeSummary, listActionOutcomes, toActionOutcomeDTO } from "./outcomes.js";
import { isUniqueConstraintError, readIdempotencyKey } from "./idempotency.js";
import { assignRequestId, corsOrigin, getRequestId, sanitizeErrorForLog, sanitizeErrorMessage } from "./http-security.js";
import { getOwnedActionProposal, getOwnedProject, getOwnedReviewedMetric, getOwnedTask } from "./ownership.js";
import { cursorArgs, readPagination } from "./pagination.js";
import { prisma } from "./prisma.js";
import { sendError, sendSuccess } from "./response.js";
import { createAuthRouter } from "./routes/auth.js";
import { expireProposalIfNeeded, prepareActionProposals, proposalLifecyclePolicy } from "./proposal-lifecycle.js";
import {
  createCollectionRunSchema,
  getOwnedCollectionRun,
  refreshCollectionRunStatus,
  reportCollectionRouteFailureSchema,
  toCollectionRunDTO
} from "./collection-runs.js";
import { actionProposalAudit, currentUser, readOptionalText, toJson } from "./server-utils.js";
import { getBuildMetadata } from "./version.js";
import { latestRealtimeSignals, recordMetricPulse, subscribeRealtimeSignals } from "./realtime-signals.js";
import { metricAliasOverrideInputSchema, metricDriftStatusSchema, normalizeAlias, recordMetricDriftEvents } from "./metric-drift.js";
import { AiCircuitOpenError, executeWithAiCircuit, getAiCircuitStatus } from "./ai-circuit.js";
import {
  ensureReviewMetricsForTask,
  normalizedMetricsToVisibleMetrics,
  normalizeReviewPatch,
  toReviewedMetricDTO
} from "./review-metrics.js";

export function createServer() {
  ensureJwtSecretConfigured();

  const app = express();
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) app.set("trust proxy", trustProxyHops);
  app.use(assignRequestId);
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: "5mb" }));

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

  app.use(authMiddleware);

  app.get("/system-health", async (req, res) => {
    const user = currentUser(req);
    const aiProvider = createLlmProvider("mock");
    const [runs, aiCircuit] = await Promise.all([
      prisma.collectionRun.findMany({
        where: { task: { project: { workspace: { ownerId: user.id } } } },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          snapshots: { orderBy: { localCollectedAt: "desc" }, take: 100 },
          routeHealth: true
        }
      }),
      getAiCircuitStatus(aiProvider.name, aiProvider.model)
    ]);
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
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误");

    const workspace = await prisma.workspace.findFirst({ where: { id: parsed.data.workspaceId, ownerId: user.id } });
    if (!workspace) return sendError(res, 404, "WORKSPACE_NOT_FOUND", "工作区不存在");

    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: parsed.data.name,
        businessType: parsed.data.businessType,
        subjectType: parsed.data.subjectType,
        operatorType: parsed.data.operatorType,
        cooperationType: parsed.data.cooperationType,
        controlLevel: parsed.data.controlLevel,
        subjectConfidence: parsed.data.subjectConfidence,
        serviceProviderName: parsed.data.serviceProviderName || null,
        serviceMode: parsed.data.serviceMode || null,
        serviceFee: parsed.data.serviceFee ?? null
      }
    });
    await writeAuditLog(req, "project.created", {
      workspaceId: workspace.id,
      projectId: project.id,
      detailJson: {
        businessType: project.businessType,
        subjectType: project.subjectType,
        operatorType: project.operatorType,
        cooperationType: project.cooperationType,
        controlLevel: project.controlLevel
      }
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
        updatedAt: true
        ,expiresAt: true
        ,dedupeKey: true
        ,supersededAt: true
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
        detailJson: { aliasNormalized, pageType: parsed.data.pageType, metricKey: parsed.data.metricKey }
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
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误");

    const project = await getOwnedProject(user.id, parsed.data.projectId);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");

    const task = await prisma.collectionTask.create({
      data: {
        projectId: project.id,
        userId: user.id,
        sourceUrl: parsed.data.sourceUrl || null,
        pageTitle: parsed.data.pageTitle || null,
        status: "PENDING"
      }
    });
    await writeAuditLog(req, "collection_task.created", {
      workspaceId: project.workspaceId,
      projectId: project.id,
      taskId: task.id,
      detailJson: { sourceUrl: task.sourceUrl, pageTitle: task.pageTitle }
    });
    return sendSuccess(res, task, 201);
  });

  app.get("/collection-tasks/:id", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id || "");
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    return sendSuccess(res, task);
  });

  app.patch("/collection-tasks/:id/status", async (req, res) => {
    const parsed = updateCollectionTaskStatusSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误");
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
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
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
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
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const push = (signals: ReturnType<typeof latestRealtimeSignals>) => res.write(`event: signals\ndata: ${JSON.stringify(signals)}\n\n`);
    push(latestRealtimeSignals(task.id));
    const unsubscribe = subscribeRealtimeSignals(task.id, push);
    const heartbeat = setInterval(() => res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.post("/collection-tasks/:id/snapshots", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
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
    const routeKey = snapshotPayload.routeKey || inferCollectionRoute(snapshotPayload);
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
            normalizedMetrics: {
              create: normalized.map((metric: VisibleMetric) => ({
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
        if (snapshotPayload.collectionRunId) {
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
        const initialized = await ensureReviewMetricsForTask({ id: task.id, snapshots: [created] }, tx);
        const driftCount = await recordMetricDriftEvents(tx, {
          projectId: task.projectId,
          collectionTaskId: task.id,
          snapshotId: created.id,
          snapshot: snapshotPayload,
          normalized
        });
        await tx.collectionTask.update({
          where: { id: task.id },
          data: {
            status: "UPLOADED",
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
              idempotencyKey: idempotency.key
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
      return sendSuccess(res, snapshot, 201);
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

  app.post("/collection-tasks/:id/collection-runs", async (req, res) => {
    const user = currentUser(req);
    const task = await getOwnedTask(user.id, req.params.id);
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
    const run = await prisma.collectionRun.findFirst({
      where: { taskId: task.id },
      orderBy: { createdAt: "desc" },
      include: { snapshots: { orderBy: { localCollectedAt: "desc" }, take: 100 }, routeHealth: true }
    });
    return sendSuccess(res, run ? toCollectionRunDTO(run) : null);
  });

  app.post("/collection-runs/:id/stop", async (req, res) => {
    const run = await getOwnedCollectionRun(currentUser(req).id, req.params.id);
    if (!run) return sendError(res, 404, "COLLECTION_RUN_NOT_FOUND", "采集巡检不存在");
    const stopped = await prisma.$transaction(async (tx) => {
      const updated = await tx.collectionRun.update({
        where: { id: run.id },
        data: { status: "STOPPED", stoppedAt: new Date() },
        include: { snapshots: { orderBy: { localCollectedAt: "desc" }, take: 100 }, routeHealth: true }
      });
      await writeAuditLog(req, "collection_run.stopped", {
        workspaceId: run.task.project.workspaceId,
        projectId: run.task.projectId,
        taskId: run.taskId,
        detailJson: { collectionRunId: run.id }
      }, tx);
      return updated;
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
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
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
          snapshotId: task.snapshots[0]?.id || null,
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
      where: { taskId: task.id, snapshotId: task.snapshots[0]?.id || undefined },
      orderBy: [{ createdAt: "asc" }, { metricKey: "asc" }]
    });
    await writeAuditLog(req, "REVIEW_METRICS_CONFIRM_ALL", {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      detailJson: {
        taskId: task.id,
        snapshotId: task.snapshots[0]?.id || null,
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
    return sendSuccess(res, {
      preview: true,
      createsRecords: false,
      input,
      ruleOutput,
      finalOutput,
      lifecyclePolicy: proposalLifecyclePolicy
    });
  });

  app.post("/collection-tasks/:id/decision-runs", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    if (!task.snapshots[0]) return sendError(res, 409, "SNAPSHOT_REQUIRED", "请先上传采集快照");
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

    try {
      const transactionQueuedAt = performance.now();
      let transactionStartedAt = transactionQueuedAt;
      const decisionRun = await prisma.$transaction(async (tx) => {
        transactionStartedAt = performance.now();
        const prepared = await prepareActionProposals(tx, {
          projectId: task.projectId,
          collectionTaskId: task.id,
          proposals: finalOutput.actionProposals
        });
        if (prepared.expiredProposalIds.length) {
          await writeAuditLog(req, "action_proposals.expired", {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
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
            projectId: task.projectId,
            collectionTaskId: task.id,
            idempotencyKey: idempotency.key,
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
              toActionProposalCreate(proposal, created.id, task.projectId, task.id, proposalCreatedAt, proposalExpiresAt)
            )
          });
        }
        const withProposals = await tx.decisionRun.findUniqueOrThrow({
          where: { id: created.id },
          include: { actionProposals: { orderBy: { createdAt: "asc" } } }
        });
        await writeAuditLog(
          req,
          "CREATE_DECISION_RUN",
          {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            detailJson: {
              decisionRunId: withProposals.id,
              strategyVersion: withProposals.strategyVersion,
              riskLevel: withProposals.riskLevel,
              confidence: withProposals.confidence,
              idempotencyKey: idempotency.key
            }
          },
          tx
        );
        await writeAuditLog(
          req,
          "CREATE_ACTION_PROPOSALS",
          {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
              detailJson: {
                decisionRunId: withProposals.id,
                actionProposalCount: withProposals.actionProposals.length,
                suppressedProposals: prepared.suppressed
              }
          },
          tx
        );
        await writeAuditLog(
          req,
          input.metricLayer === "REVIEWED_METRIC" ? "DECISION_RUN_USE_REVIEWED_METRICS" : "DECISION_RUN_FALLBACK_NORMALIZED_METRICS",
          {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            detailJson: {
              taskId: task.id,
              decisionRunId: withProposals.id,
              source: input.metricLayer,
              dataReviewStatus: input.dataReviewStatus,
              reviewCoverage: input.reviewCoverage || null
            }
          },
          tx
        );
        return withProposals;
      });
      const transactionFinishedAt = performance.now();
      res.setHeader(
        "Server-Timing",
        `decision-queue;dur=${(transactionStartedAt - transactionQueuedAt).toFixed(1)}, decision-write;dur=${(transactionFinishedAt - transactionStartedAt).toFixed(1)}`
      );
      return sendSuccess(res, decisionRun, 201);
    } catch (error) {
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
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
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
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
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

  app.get("/action-proposals/:id", async (req, res) => {
    let proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (proposal.expiresAt && proposal.expiresAt <= new Date()) {
      await expireActionProposalWithAudit(req, proposal);
      proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    }
    return sendSuccess(res, proposal);
  });

  app.get("/action-proposals/:id/outcomes", async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    const pagination = readPagination(req);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    return sendSuccess(res, await listActionOutcomes(proposal.id, pagination));
  });

  app.post("/action-proposals/:id/outcomes", async (req, res) => {
    const user = currentUser(req);
    const proposal = await getOwnedActionProposal(user.id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (proposal.status !== "MANUAL_EXECUTED") {
      return sendError(res, 409, "ACTION_NOT_MANUAL_EXECUTED", "只有人工已执行的动作建议才能记录执行后结果");
    }
    const idempotency = readIdempotencyKey(req);
    if (idempotency.error) return sendError(res, 400, "INVALID_IDEMPOTENCY_KEY", idempotency.error);
    if (idempotency.key) {
      const existing = await prisma.actionOutcome.findUnique({
        where: { actionProposalId_idempotencyKey: { actionProposalId: proposal.id, idempotencyKey: idempotency.key } }
      });
      if (existing) {
        res.setHeader("Idempotent-Replayed", "true");
        return sendSuccess(res, toActionOutcomeDTO(existing));
      }
    }
    const parsed = createActionOutcomeInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "结果复盘参数错误");

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const created = await createActionOutcome(
          {
            actionProposalId: proposal.id,
            projectId: proposal.projectId,
            collectionTaskId: proposal.collectionTaskId,
            userId: user.id,
            body: parsed.data,
            idempotencyKey: idempotency.key
          },
          tx
        );
        await writeAuditLog(
          req,
          "CREATE_ACTION_OUTCOME",
          {
            workspaceId: proposal.project.workspaceId,
            projectId: proposal.projectId,
            taskId: proposal.collectionTaskId,
            detailJson: {
              actionProposalId: proposal.id,
              actionType: proposal.actionType,
              outcomeId: created.id,
              result: created.result,
              observationWindow: parsed.data.observationWindow,
              platformAutoExecuted: false,
              idempotencyKey: idempotency.key
            }
          },
          tx
        );
        return created;
      });
      return sendSuccess(res, toActionOutcomeDTO(outcome), 201);
    } catch (error) {
      if (idempotency.key && isUniqueConstraintError(error)) {
        const existing = await prisma.actionOutcome.findUnique({
          where: { actionProposalId_idempotencyKey: { actionProposalId: proposal.id, idempotencyKey: idempotency.key } }
        });
        if (existing) {
          res.setHeader("Idempotent-Replayed", "true");
          return sendSuccess(res, toActionOutcomeDTO(existing));
        }
      }
      throw error;
    }
  });

  app.post("/action-proposals/:id/approve", async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (proposal.expiresAt && proposal.expiresAt <= new Date()) {
      await expireActionProposalWithAudit(req, proposal);
      return sendError(res, 409, "ACTION_EXPIRED", "动作建议已过期，请重新采集并生成决策");
    }
    if (proposal.status !== "PENDING_APPROVAL") {
      return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "只有待审批动作建议可以审批通过");
    }
    const comment = readOptionalText(req.body?.comment);
    const updated = await approveActionProposal({
      actionProposalId: proposal.id,
      userId: currentUser(req).id,
      comment,
      audit: actionProposalAudit(req, proposal, "APPROVE_ACTION_PROPOSAL", {
        actionProposalId: proposal.id,
        previousStatus: proposal.status,
        newStatus: "APPROVED",
        comment
      })
    });
    if (!updated) return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "动作建议状态已变化，请刷新后重试");
    return sendSuccess(res, await getOwnedActionProposal(currentUser(req).id, proposal.id));
  });

  app.post("/action-proposals/:id/reject", async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (proposal.expiresAt && proposal.expiresAt <= new Date()) {
      await expireActionProposalWithAudit(req, proposal);
      return sendError(res, 409, "ACTION_EXPIRED", "动作建议已过期，请重新采集并生成决策");
    }
    if (proposal.status !== "PENDING_APPROVAL") {
      return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "只有待审批动作建议可以拒绝");
    }
    const comment = readOptionalText(req.body?.comment);
    const updated = await rejectActionProposal({
      actionProposalId: proposal.id,
      userId: currentUser(req).id,
      comment,
      audit: actionProposalAudit(req, proposal, "REJECT_ACTION_PROPOSAL", {
        actionProposalId: proposal.id,
        previousStatus: proposal.status,
        newStatus: "REJECTED",
        comment
      })
    });
    if (!updated) return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "动作建议状态已变化，请刷新后重试");
    return sendSuccess(res, await getOwnedActionProposal(currentUser(req).id, proposal.id));
  });

  app.post("/action-proposals/:id/observe", async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (proposal.expiresAt && proposal.expiresAt <= new Date()) {
      await expireActionProposalWithAudit(req, proposal);
      return sendError(res, 409, "ACTION_EXPIRED", "动作建议已过期，请重新采集并生成决策");
    }
    if (proposal.status !== "PENDING_APPROVAL") {
      return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "只有待审批动作建议可以设置观察");
    }
    const comment = readOptionalText(req.body?.comment);
    const updated = await observeActionProposal({
      actionProposalId: proposal.id,
      userId: currentUser(req).id,
      comment,
      audit: actionProposalAudit(req, proposal, "OBSERVE_ACTION_PROPOSAL", {
        actionProposalId: proposal.id,
        previousStatus: proposal.status,
        newStatus: "OBSERVING",
        comment
      })
    });
    if (!updated) return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "动作建议状态已变化，请刷新后重试");
    return sendSuccess(res, await getOwnedActionProposal(currentUser(req).id, proposal.id));
  });

  app.post("/action-proposals/:id/mark-manual-executed", async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (proposal.expiresAt && proposal.expiresAt <= new Date()) {
      await expireActionProposalWithAudit(req, proposal);
      return sendError(res, 409, "ACTION_EXPIRED", "动作建议已过期，请重新采集并生成决策");
    }
    if (proposal.status !== "APPROVED") {
      return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "只有已审批动作建议可以标记人工已执行");
    }
    const note = readOptionalText(req.body?.note) || "用户确认已在平台页面或线下流程中手动执行完成，系统未执行任何平台操作。";
    const updated = await markActionProposalManualExecuted({
      actionProposalId: proposal.id,
      projectId: proposal.projectId,
      collectionTaskId: proposal.collectionTaskId,
      userId: currentUser(req).id,
      note,
      audit: actionProposalAudit(req, proposal, "MARK_ACTION_MANUAL_EXECUTED", {
        actionProposalId: proposal.id,
        previousStatus: proposal.status,
        newStatus: "MANUAL_EXECUTED",
        note,
        executionMode: "MANUAL",
        platformAutoExecuted: false
      })
    });
    if (!updated) return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "动作建议状态已变化，请刷新后重试");
    return sendSuccess(res, await getOwnedActionProposal(currentUser(req).id, proposal.id));
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
    const message =
      process.env.NODE_ENV === "production"
        ? "服务暂时不可用，请稍后再试。"
        : sanitizeErrorMessage(error instanceof Error ? error.message : "服务器内部错误");
    return sendError(res, 500, "INTERNAL_ERROR", message, { requestId });
  });
  return app;
}

async function expireActionProposalWithAudit(
  req: Request,
  proposal: {
    id: string;
    projectId: string;
    collectionTaskId: string;
    project: { workspaceId: string };
  }
) {
  return prisma.$transaction(async (tx) => {
    const expired = await expireProposalIfNeeded(tx, proposal.id);
    if (expired) {
      await writeAuditLog(
        req,
        "action_proposal.expired",
        actionProposalAudit(req, proposal, "ACTION_PROPOSAL_EXPIRED", {
          actionProposalId: proposal.id,
          source: "proposal_access"
        }),
        tx
      );
    }
    return expired;
  });
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
