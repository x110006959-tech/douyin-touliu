import { Router, type Request, type Response } from "express";
import { diagnosisSkillSetVersion } from "@douyin-local-life/diagnosis-skills";
import { DEFAULT_DEEPSEEK_MODEL } from "@douyin-local-life/llm";
import { diagnosisFeedbackInputSchema, diagnosisCaseStatusInputSchema } from "@douyin-local-life/shared/diagnosis";
import { writeAuditLog } from "../audit.js";
import { aiDiagnosisEnabled } from "../ai-diagnosis/config.js";
import { diagnosisOrchestrationVersion, diagnosisPromptVersion } from "../ai-diagnosis/orchestrator.js";
import { decisionEngineInputSchema } from "@douyin-local-life/shared";
import { buildDecisionInput } from "../decision.js";
import { decisionEvidenceFingerprint } from "../decision-evidence.js";
import { caseCanBecomeEligible } from "../diagnosis-cases.js";
import { evaluateDecisionReadiness } from "../decision-readiness.js";
import { isUniqueConstraintError, readIdempotencyKey } from "../idempotency.js";
import { getOwnedTask, getOwnedTaskAccess } from "../ownership.js";
import { prisma } from "../prisma.js";
import { sendError, sendSuccess } from "../response.js";
import { ensureReviewMetricsForTask } from "../review-metrics.js";
import { checkDecisionRateLimit } from "../rate-limit.js";
import { currentUser, toJson } from "../server-utils.js";
import { readSafeOptionalText } from "../persisted-input.js";
import { latestRealtimeMetricFrame } from "../realtime-signals.js";
import { runSerializableTransaction } from "../transactions.js";

export function createDecisionRunRouter() {
  const router = Router();

  const createRun = async (req: Request, res: Response) => {
    if (!aiDiagnosisEnabled()) return sendError(res, 503, "AI_DIAGNOSIS_DISABLED", "AI 诊断尚未完成验收，当前功能未开启");
    const task = await getOwnedTask(currentUser(req).id, req.params.id || "");
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const idempotency = readIdempotencyKey(req);
    if (idempotency.error) return sendError(res, 400, "INVALID_IDEMPOTENCY_KEY", idempotency.error);
    if (idempotency.key) {
      const existing = await findIdempotentRun(task.id, idempotency.key);
      if (existing) {
        res.setHeader("Idempotent-Replayed", "true");
        return sendSuccess(res, toDecisionRunDTO(existing), existing.status === "PENDING" || existing.status === "RUNNING" ? 202 : 200);
      }
    }
    const active = await findActiveRun(task.id);
    if (active) {
      res.setHeader("Diagnosis-Already-Running", "true");
      return sendSuccess(res, toDecisionRunDTO(active), 202);
    }
    const limit = await checkDecisionRateLimit(task.id);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "AI 诊断运行过于频繁，请稍后再试");
    }
    const realtimeFrame = latestRealtimeMetricFrame(task.id);
    if (!task.snapshots[0] && !realtimeFrame) return sendError(res, 409, "SNAPSHOT_REQUIRED", "请先上传采集快照");

    const initialized = await prisma.$transaction(async (tx) => {
      const result = await ensureReviewMetricsForTask(task, tx);
      if (result.createdCount) {
        await writeAuditLog(req, "REVIEW_METRICS_INITIALIZED", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: { taskId: task.id, metricCount: result.createdCount, source: "NormalizedMetric" }
        }, tx);
      }
      return result;
    });
    const refreshed = await getOwnedTask(currentUser(req).id, task.id);
    const refreshedRealtimeFrame = latestRealtimeMetricFrame(task.id);
    if (!refreshed?.snapshots[0] && !refreshedRealtimeFrame) return sendError(res, 409, "SNAPSHOT_REQUIRED", "请先上传采集快照");
    const refreshedTask = refreshed as NonNullable<typeof refreshed>;
    const decisionInput = buildDecisionInput({
      ...refreshedTask,
      reviewedMetrics: initialized.metrics.length ? initialized.metrics : refreshedTask.reviewedMetrics
    }, { realtimeFrame: refreshedRealtimeFrame });
    decisionEngineInputSchema.parse(decisionInput);
    const readiness = evaluateDecisionReadiness(refreshedTask, decisionInput);
    if (!readiness.ready) {
      return sendError(res, 409, "DECISION_NOT_READY", `当前数据不能运行 AI 诊断：${readiness.blockingReasons.join("；")}`, {
        fieldErrors: { readiness: readiness.blockingReasons.join("；") }
      });
    }
    const evidenceFingerprint = decisionEvidenceFingerprint(refreshedTask);
    try {
      const created = await runSerializableTransaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${task.id}), hashtext('ai-diagnosis-create'))`;
        if (idempotency.key) {
          const replay = await tx.decisionRun.findUnique({
            where: { collectionTaskId_idempotencyKey: { collectionTaskId: task.id, idempotencyKey: idempotency.key } },
            include: decisionRunInclude
          });
          if (replay) return { run: replay, replayed: true };
        }
        const existingActive = await tx.decisionRun.findFirst({
          where: { collectionTaskId: task.id, mode: "AI_SKILL_ORCHESTRATED", status: { in: ["PENDING", "RUNNING"] } },
          include: decisionRunInclude,
          orderBy: { createdAt: "desc" }
        });
        if (existingActive) return { run: existingActive, replayed: true };
        const run = await tx.decisionRun.create({
          data: {
            projectId: task.projectId,
            collectionTaskId: task.id,
            idempotencyKey: idempotency.key,
            mode: "AI_SKILL_ORCHESTRATED",
            status: "PENDING",
            provider: "deepseek",
            model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
            promptVersion: diagnosisPromptVersion,
            skillSetVersion: diagnosisSkillSetVersion,
            orchestrationVersion: diagnosisOrchestrationVersion,
            engineVersion: "ai-skill-diagnosis-v1",
            evidenceFingerprint,
            strategyVersion: "managed-live-growth-skills-v1",
            currentStage: "QUEUED",
            inputJson: toJson(decisionInput)
          },
          include: decisionRunInclude
        });
        await writeAuditLog(req, "AI_DIAGNOSIS_QUEUED", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: { decisionRunId: run.id, evidenceFingerprint }
        }, tx);
        return { run, replayed: false };
      });
      if (created.replayed) res.setHeader("Diagnosis-Already-Running", "true");
      return sendSuccess(res, toDecisionRunDTO(created.run), 202);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = idempotency.key
          ? await findIdempotentRun(task.id, idempotency.key)
          : await findActiveRun(task.id);
        if (existing) return sendSuccess(res, toDecisionRunDTO(existing), 202);
      }
      throw error;
    }
  };

  router.post("/collection-tasks/:id/decision-runs", createRun);
  router.post(["/collection-tasks/:id/explain", "/collection-tasks/:id/analyze"], async (req, res) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", "Wed, 31 Dec 2026 23:59:59 GMT");
    res.setHeader("Link", '</collection-tasks/:id/decision-runs>; rel="successor-version"');
    return createRun(req, res);
  });

  router.get("/collection-tasks/:id/decision-runs/latest", async (req, res) => {
    const task = await getOwnedTaskAccess(currentUser(req).id, req.params.id || "");
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const run = await prisma.decisionRun.findFirst({
      where: { collectionTaskId: task.id },
      include: decisionRunInclude,
      orderBy: { createdAt: "desc" }
    });
    return sendSuccess(res, run ? toDecisionRunDTO(run) : null);
  });

  router.get("/decision-runs/:id", async (req, res) => {
    const run = await prisma.decisionRun.findFirst({
      where: { id: req.params.id, project: { workspace: { ownerId: currentUser(req).id } } },
      include: decisionRunInclude
    });
    if (!run) return sendError(res, 404, "DECISION_RUN_NOT_FOUND", "诊断运行不存在");
    return sendSuccess(res, toDecisionRunDTO(run));
  });

  router.post("/decision-runs/:id/feedback", async (req, res) => {
    const parsed = diagnosisFeedbackInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "诊断评价不合法");
    const run = await prisma.decisionRun.findFirst({
      where: { id: req.params.id, mode: "AI_SKILL_ORCHESTRATED", status: "SUCCEEDED", project: { workspace: { ownerId: currentUser(req).id } } },
      include: { project: true }
    });
    if (!run) return sendError(res, 404, "DECISION_RUN_NOT_FOUND", "可评价的 AI 诊断不存在");
    const acceptedTypes = acceptedActionTypes(run.finalResultJson);
    const invalidAdoptions = parsed.data.adoptedActionTypes.filter((actionType) => !acceptedTypes.has(actionType));
    if (invalidAdoptions.length) {
      return sendError(res, 400, "INVALID_ADOPTED_ACTION", `只能选择本次已通过规则裁决的建议：${invalidAdoptions.join("、")}`);
    }
    const safeCorrection = readSafeOptionalText(parsed.data.correctionNote || "", 2_000);
    if (safeCorrection.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", safeCorrection.error);
    const feedback = await prisma.$transaction(async (tx) => {
      const saved = await tx.diagnosisFeedback.upsert({
        where: { decisionRunId_userId: { decisionRunId: run.id, userId: currentUser(req).id } },
        create: {
          workspaceId: run.project.workspaceId,
          decisionRunId: run.id,
          userId: currentUser(req).id,
          mainProblemCorrect: parsed.data.mainProblemCorrect,
          usefulnessScore: parsed.data.usefulnessScore,
          adoptedActionTypesJson: toJson(parsed.data.adoptedActionTypes),
          correctionNote: safeCorrection.value || null
        },
        update: {
          mainProblemCorrect: parsed.data.mainProblemCorrect,
          usefulnessScore: parsed.data.usefulnessScore,
          adoptedActionTypesJson: toJson(parsed.data.adoptedActionTypes),
          correctionNote: safeCorrection.value || null
        }
      });
      await writeAuditLog(req, "AI_DIAGNOSIS_FEEDBACK_SAVED", {
        workspaceId: run.project.workspaceId,
        projectId: run.projectId,
        taskId: run.collectionTaskId,
        detailJson: { decisionRunId: run.id, usefulnessScore: parsed.data.usefulnessScore, mainProblemCorrect: parsed.data.mainProblemCorrect }
      }, tx);
      return saved;
    });
    return sendSuccess(res, feedback);
  });

  router.post("/diagnosis-cases/:id/status", async (req, res) => {
    const parsed = diagnosisCaseStatusInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "案例状态不合法");
    const caseRecord = await prisma.diagnosisCase.findFirst({
      where: { id: req.params.id, workspace: { ownerId: currentUser(req).id } }
    });
    if (!caseRecord) return sendError(res, 404, "DIAGNOSIS_CASE_NOT_FOUND", "诊断案例不存在");
    if (parsed.data.status === "ELIGIBLE" && !(await caseCanBecomeEligible(caseRecord))) {
      return sendError(res, 409, "DIAGNOSIS_CASE_NOT_ELIGIBLE", "案例需满足人工评价正确且有用度不低于 4，或具备完整前后指标与明确结果");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.diagnosisCase.update({
        where: { id: caseRecord.id },
        data: {
          status: parsed.data.status,
          eligibleAt: parsed.data.status === "ELIGIBLE" ? new Date() : null,
          reviewedById: currentUser(req).id
        }
      });
      await writeAuditLog(req, "DIAGNOSIS_CASE_STATUS_CHANGED", {
        workspaceId: caseRecord.workspaceId,
        projectId: caseRecord.projectId,
        taskId: caseRecord.collectionTaskId,
        detailJson: { diagnosisCaseId: caseRecord.id, status: parsed.data.status }
      }, tx);
      return saved;
    });
    return sendSuccess(res, updated);
  });

  return router;
}

const decisionRunInclude = {
  actionProposals: { orderBy: { createdAt: "asc" as const } },
  skillExecutions: { orderBy: { sequence: "asc" as const } },
  diagnosisCase: true,
  feedback: { orderBy: { updatedAt: "desc" as const }, take: 1 }
};

function findActiveRun(collectionTaskId: string) {
  return prisma.decisionRun.findFirst({
    where: { collectionTaskId, mode: "AI_SKILL_ORCHESTRATED", status: { in: ["PENDING", "RUNNING"] } },
    include: decisionRunInclude,
    orderBy: { createdAt: "desc" }
  });
}

function findIdempotentRun(collectionTaskId: string, idempotencyKey: string) {
  return prisma.decisionRun.findUnique({
    where: { collectionTaskId_idempotencyKey: { collectionTaskId, idempotencyKey } },
    include: decisionRunInclude
  });
}

function toDecisionRunDTO(run: Awaited<ReturnType<typeof findActiveRun>> extends infer T ? NonNullable<T> : never) {
  return {
    ...run,
    finalResult: run.finalResultJson,
    skillExecutions: run.skillExecutions.map((item) => ({
      id: item.id,
      skillId: item.skillId,
      skillVersion: item.skillVersion,
      sequence: item.sequence,
      status: item.status,
      durationMs: item.durationMs,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      totalTokens: item.totalTokens,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      startedAt: item.startedAt?.toISOString() || null,
      completedAt: item.completedAt?.toISOString() || null
    }))
  };
}

function acceptedActionTypes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return new Set<string>();
  const adjudication = (value as Record<string, unknown>).ruleAdjudication;
  if (!adjudication || typeof adjudication !== "object" || Array.isArray(adjudication)) return new Set<string>();
  const accepted = (adjudication as Record<string, unknown>).accepted;
  if (!Array.isArray(accepted)) return new Set<string>();
  return new Set(accepted.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const actionType = (item as Record<string, unknown>).actionType;
    return typeof actionType === "string" ? [actionType] : [];
  }));
}
