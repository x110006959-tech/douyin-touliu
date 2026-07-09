import "express-async-errors";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import {
  actionProposalStatuses,
  authLoginSchema,
  authRegisterSchema,
  bulkReviewMetricInputSchema,
  collectionSnapshotSchema,
  type CollectionSnapshotPayload,
  createActionOutcomeInputSchema,
  createCollectionTaskSchema,
  createProjectSchema,
  reviewMetricInputSchema,
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
import { authMiddleware, ensureJwtSecretConfigured, signToken, type AuthenticatedRequest } from "./auth.js";
import { writeAuditLog } from "./audit.js";
import { buildDecisionInput, runDecisionEngine, strategyVersion, toActionProposalCreate } from "./decision.js";
import { normalizeMetrics } from "./normalize.js";
import { createActionOutcome, getProjectOutcomeSummary, listActionOutcomes, toActionOutcomeDTO } from "./outcomes.js";
import { prisma } from "./prisma.js";
import { checkLoginRateLimit, checkRegisterRateLimit } from "./rate-limit.js";
import { sendError, sendSuccess } from "./response.js";
import {
  ensureReviewMetricsForTask,
  normalizedMetricsToVisibleMetrics,
  normalizeReviewPatch,
  toReviewedMetricDTO
} from "./review-metrics.js";

export function createServer() {
  ensureJwtSecretConfigured();

  const app = express();
  app.use(assignRequestId);
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => sendSuccess(res, { ok: true }));

  app.post("/auth/register", async (req, res) => {
    const parsed = authRegisterSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误");

    const rateLimit = checkRegisterRateLimit({ ip: req.ip, email: parsed.data.email });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) return sendError(res, 400, "REGISTER_FAILED", "注册失败，请检查信息或稍后再试。");

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        name: parsed.data.name || parsed.data.email.split("@")[0],
        workspaces: {
          create: { name: "默认工作区" }
        }
      },
      include: { workspaces: true }
    });
    const workspaceId = user.workspaces[0]?.id;
    const token = signToken({ id: user.id, email: user.email, workspaceId });
    return sendSuccess(res, { token, user: { id: user.id, email: user.email, name: user.name, workspaceId } }, 201);
  });

  app.post("/auth/login", async (req, res) => {
    const parsed = authLoginSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "参数错误");

    const rateLimit = checkLoginRateLimit({ ip: req.ip, email: parsed.data.email });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      include: { workspaces: { orderBy: { createdAt: "asc" }, take: 1 } }
    });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return sendError(res, 401, "INVALID_CREDENTIALS", "邮箱或密码错误。");
    }
    const workspaceId = user.workspaces[0]?.id;
    const token = signToken({ id: user.id, email: user.email, workspaceId });
    return sendSuccess(res, { token, user: { id: user.id, email: user.email, name: user.name, workspaceId } });
  });

  app.get("/auth/me", authMiddleware, async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: currentUser(req).id },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    if (!user) return sendError(res, 404, "USER_NOT_FOUND", "用户不存在");
    return sendSuccess(res, user);
  });

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
    const projects = await prisma.project.findMany({
      where: { workspace: { ownerId: user.id } },
      include: { workspace: true, tasks: { orderBy: { createdAt: "desc" }, take: 5 } },
      orderBy: { createdAt: "desc" }
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
    const recommendation = await latestRecommendationForProject(project.id);
    return sendSuccess(res, { ...project, latestRecommendation: recommendation });
  });

  app.get("/projects/:id/action-proposals", async (req, res) => {
    const project = await getOwnedProject(currentUser(req).id, req.params.id);
    if (!project) return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !actionProposalStatuses.includes(status as (typeof actionProposalStatuses)[number])) {
      return sendError(res, 400, "VALIDATION_ERROR", "动作建议状态不合法");
    }
    const proposals = await prisma.actionProposal.findMany({
      where: {
        projectId: project.id,
        ...(status ? { status: status as (typeof actionProposalStatuses)[number] } : {})
      },
      include: {
        decisionRun: true,
        approvalRecords: { orderBy: { createdAt: "desc" } },
        executionLogs: { orderBy: { createdAt: "desc" } }
      },
      orderBy: { createdAt: "desc" }
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
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
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
    const parsed = collectionSnapshotSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "快照参数错误");

    const snapshotPayload = parsed.data as CollectionSnapshotPayload;
    const normalized = normalizeMetrics(snapshotPayload);
    const snapshot = await prisma.dataSnapshot.create({
      data: {
        taskId: task.id,
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
    const initialized = await ensureReviewMetricsForTask({ id: task.id, snapshots: [snapshot] });
    await prisma.collectionTask.update({
      where: { id: task.id },
      data: {
        status: "UPLOADED",
        sourceUrl: task.sourceUrl || snapshotPayload.sourceUrl,
        pageTitle: task.pageTitle || snapshotPayload.pageTitle,
        finishedAt: new Date()
      }
    });
    await writeAuditLog(req, "snapshot.uploaded", {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      detailJson: { metricCount: normalized.length, sourceUrl: snapshotPayload.sourceUrl, pageType: snapshotPayload.pageType }
    });
    if (initialized.createdCount > 0) {
      await writeAuditLog(req, "REVIEW_METRICS_INITIALIZED", {
        workspaceId: task.project.workspaceId,
        projectId: task.projectId,
        taskId: task.id,
        detailJson: {
          taskId: task.id,
          snapshotId: snapshot.id,
          metricCount: initialized.createdCount,
          source: "NormalizedMetric"
        }
      });
    }
    return sendSuccess(res, snapshot, 201);
  });

  app.get("/collection-tasks/:id/snapshots", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const snapshots = await prisma.dataSnapshot.findMany({
      where: { taskId: task.id },
      include: { normalizedMetrics: true },
      orderBy: { createdAt: "desc" }
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
        reviewedAt: new Date()
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
            reviewedAt: now
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
              reviewedAt: now
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
    const input = buildDecisionInput({
      ...task,
      reviewedMetrics: initialized.metrics.length ? initialized.metrics : task.reviewedMetrics
    });
    const { ruleOutput, finalOutput } = runDecisionEngine(input);
    const decisionRun = await prisma.$transaction(async (tx) => {
      const created = await tx.decisionRun.create({
        data: {
          projectId: task.projectId,
          collectionTaskId: task.id,
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

      return tx.decisionRun.findUniqueOrThrow({
        where: { id: created.id },
        include: { actionProposals: { orderBy: { createdAt: "asc" } } }
      });
    });

    await writeAuditLog(req, "CREATE_DECISION_RUN", {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      detailJson: {
        decisionRunId: decisionRun.id,
        strategyVersion: decisionRun.strategyVersion,
        riskLevel: decisionRun.riskLevel,
        confidence: decisionRun.confidence
      }
    });
    await writeAuditLog(req, "CREATE_ACTION_PROPOSALS", {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      detailJson: {
        decisionRunId: decisionRun.id,
        actionProposalCount: decisionRun.actionProposals.length
      }
    });
    await writeAuditLog(req, input.metricLayer === "REVIEWED_METRIC" ? "DECISION_RUN_USE_REVIEWED_METRICS" : "DECISION_RUN_FALLBACK_NORMALIZED_METRICS", {
      workspaceId: task.project.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      detailJson: {
        taskId: task.id,
        decisionRunId: decisionRun.id,
        source: input.metricLayer,
        dataReviewStatus: input.dataReviewStatus,
        reviewCoverage: input.reviewCoverage || null
      }
    });

    return sendSuccess(res, decisionRun, 201);
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

  app.post("/collection-tasks/:id/analyze", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
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
          responsePayload: toJson(output),
          recommendations: {
            create: {
              summary: output.summary,
              riskLevel: output.riskLevel,
              problemsJson: toJson(output.problems),
              suggestionsJson: toJson(output.suggestions),
              manualCheckItemsJson: toJson(output.manualCheckItems),
              confidence: output.confidence
            }
          }
        },
        include: { recommendations: true }
      });
      await prisma.collectionTask.update({ where: { id: task.id }, data: { status: "ANALYZED" } });
      await writeAuditLog(req, "ai_analysis.succeeded", {
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
      await writeAuditLog(req, "ai_analysis.failed", {
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
    const analyses = await prisma.aiAnalysisTask.findMany({
      where: { collectionTaskId: task.id },
      include: { recommendations: true },
      orderBy: { createdAt: "desc" }
    });
    return sendSuccess(res, analyses);
  });

  app.get("/collection-tasks/:id/recommendation", async (req, res) => {
    const task = await getOwnedTask(currentUser(req).id, req.params.id);
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const recommendation = await prisma.recommendation.findFirst({
      where: { aiAnalysisTask: { collectionTaskId: task.id } },
      orderBy: { createdAt: "desc" }
    });
    return sendSuccess(res, recommendation);
  });

  app.get("/action-proposals/:id", async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    return sendSuccess(res, proposal);
  });

  app.get("/action-proposals/:id/outcomes", async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    return sendSuccess(res, await listActionOutcomes(proposal.id));
  });

  app.post("/action-proposals/:id/outcomes", async (req, res) => {
    const user = currentUser(req);
    const proposal = await getOwnedActionProposal(user.id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (proposal.status !== "MANUAL_EXECUTED") {
      return sendError(res, 409, "ACTION_NOT_MANUAL_EXECUTED", "只有人工已执行的动作建议才能记录执行后结果");
    }
    const parsed = createActionOutcomeInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "结果复盘参数错误");

    const outcome = await createActionOutcome({
      actionProposalId: proposal.id,
      projectId: proposal.projectId,
      collectionTaskId: proposal.collectionTaskId,
      userId: user.id,
      body: parsed.data
    });
    await writeAuditLog(req, "CREATE_ACTION_OUTCOME", {
      workspaceId: proposal.project.workspaceId,
      projectId: proposal.projectId,
      taskId: proposal.collectionTaskId,
      detailJson: {
        actionProposalId: proposal.id,
        actionType: proposal.actionType,
        outcomeId: outcome.id,
        result: outcome.result,
        observationWindow: parsed.data.observationWindow,
        platformAutoExecuted: false
      }
    });
    return sendSuccess(res, toActionOutcomeDTO(outcome), 201);
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
    const logs = await prisma.auditLog.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 100 });
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

function assignRequestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  const requestId = isValidRequestId(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

function getRequestId(res: Response) {
  return typeof res.locals.requestId === "string" ? res.locals.requestId : randomUUID();
}

function isValidRequestId(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9._:-]{1,128}$/.test(value));
}

function sanitizeErrorForLog(error: unknown) {
  if (error instanceof Error) {
    return sanitizeErrorMessage(error.stack || error.message);
  }
  return sanitizeErrorMessage(String(error));
}

function sanitizeErrorMessage(message: string) {
  let sanitized = message;
  const secret = process.env.JWT_SECRET;
  if (secret) sanitized = sanitized.split(secret).join("[REDACTED]");
  return sanitized
    .replace(/(jwt_secret|password|token|authorization|cookie|secret)\s*[:=]\s*[^,\s;]+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

function actionProposalAudit(
  req: Request,
  proposal: {
    project: { workspaceId: string };
    projectId: string;
    collectionTaskId: string;
  },
  action: string,
  detailJson: unknown
) {
  return {
    action,
    workspaceId: proposal.project.workspaceId,
    projectId: proposal.projectId,
    taskId: proposal.collectionTaskId,
    detailJson,
    ip: req.ip,
    userAgent: req.header("user-agent") || null
  };
}

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return callback(null, true);
  const allowed = new Set([
    process.env.WEB_ORIGIN || "https://www.pxxis.cn",
    "https://www.pxxis.cn",
    "https://pxxis.cn",
    "http://127.0.0.1:3000",
    "http://localhost:3000"
  ]);
  if (origin.startsWith("chrome-extension://") || allowed.has(origin)) return callback(null, true);
  return callback(null, false);
}

function currentUser(req: Request) {
  return (req as unknown as AuthenticatedRequest).user;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function getOwnedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, workspace: { ownerId: userId } },
    include: {
      workspace: true,
      tasks: { orderBy: { createdAt: "desc" }, include: { analyses: { include: { recommendations: true } } } }
    }
  });
}

async function getOwnedTask(userId: string, taskId: string) {
  return prisma.collectionTask.findFirst({
    where: { id: taskId, project: { workspace: { ownerId: userId } } },
    include: {
      project: true,
      snapshots: { orderBy: { createdAt: "desc" }, include: { normalizedMetrics: true } },
      reviewedMetrics: { orderBy: [{ createdAt: "asc" }, { metricKey: "asc" }] },
      analyses: { orderBy: { createdAt: "desc" }, include: { recommendations: true } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 100 }
    }
  });
}

async function getOwnedActionProposal(userId: string, actionProposalId: string) {
  return prisma.actionProposal.findFirst({
    where: {
      id: actionProposalId,
      project: { workspace: { ownerId: userId } }
    },
    include: {
      project: true,
      collectionTask: true,
      decisionRun: true,
      approvalRecords: { orderBy: { createdAt: "desc" } },
      executionLogs: { orderBy: { createdAt: "desc" } },
      outcomes: { orderBy: { createdAt: "desc" } }
    }
  });
}

async function getOwnedReviewedMetric(userId: string, metricId: string) {
  return prisma.reviewedMetric.findFirst({
    where: {
      id: metricId,
      task: { project: { workspace: { ownerId: userId } } }
    },
    include: {
      task: { include: { project: true } }
    }
  });
}

async function latestRecommendationForProject(projectId: string) {
  return prisma.recommendation.findFirst({
    where: { aiAnalysisTask: { collectionTask: { projectId } } },
    orderBy: { createdAt: "desc" }
  });
}

function readOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1000) : null;
}
