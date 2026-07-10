import "express-async-errors";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import {
  actionProposalStatuses,
  bulkReviewMetricInputSchema,
  collectionSnapshotSchema,
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
import { actionProposalAudit, currentUser, readOptionalText, toJson } from "./server-utils.js";
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

    const snapshotPayload = sanitizeCollectionSnapshotPayload(parsed.data) as CollectionSnapshotPayload;
    const normalized = normalizeMetrics(snapshotPayload);
    try {
      const snapshot = await prisma.$transaction(async (tx) => {
        const created = await tx.dataSnapshot.create({
          data: {
            taskId: task.id,
            idempotencyKey: idempotency.key,
            pageType: snapshotPayload.pageType,
            rawDomText: snapshotPayload.rawDomText,
            rawNetworkJson: toJson(snapshotPayload.rawNetworkJson),
            rawTableData: toJson(snapshotPayload.rawTableData),
            visibleMetricsJson: toJson(normalized),
            screenshotUrl: snapshotPayload.screenshotUrl || null,
            localCollectedAt: new Date(snapshotPayload.localCollectedAt),
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
        const initialized = await ensureReviewMetricsForTask({ id: task.id, snapshots: [created] }, tx);
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

    try {
      const decisionRun = await prisma.$transaction(async (tx) => {
        const initialized = await ensureReviewMetricsForTask(task, tx);
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
                snapshotId: task.snapshots[0]?.id || null,
                metricCount: initialized.createdCount,
                source: "NormalizedMetric"
              }
            },
            tx
          );
        }
        const input = buildDecisionInput({
          ...task,
          reviewedMetrics: initialized.metrics.length ? initialized.metrics : task.reviewedMetrics
        });
        const { ruleOutput, finalOutput } = runDecisionEngine(input);
        const created = await tx.decisionRun.create({
          data: {
            projectId: task.projectId,
            collectionTaskId: task.id,
            idempotencyKey: idempotency.key,
            engineVersion: finalOutput.engineVersion || "decision-engine-v0.1.0",
            ruleVersion: finalOutput.ruleVersion || strategyVersion,
            strategyVersion: finalOutput.strategyVersion || strategyVersion,
            inputJson: toJson(input),
            ruleResultJson: toJson(ruleOutput),
            finalResultJson: toJson(finalOutput),
            manualCheckItemsJson: toJson(finalOutput.manualCheckItems),
            riskLevel: finalOutput.riskLevel,
            confidence: finalOutput.confidence,
            diagnosis: finalOutput.diagnosis
          }
        });

        if (finalOutput.actionProposals.length > 0) {
          await tx.actionProposal.createMany({
            data: finalOutput.actionProposals.map((proposal) =>
              toActionProposalCreate(proposal, created.id, task.projectId, task.id)
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
            detailJson: { decisionRunId: withProposals.id, actionProposalCount: withProposals.actionProposals.length }
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
      const output = await provider.analyze(input);
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
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
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
