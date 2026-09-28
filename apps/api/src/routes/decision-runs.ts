import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { diagnosisSkillSetVersion } from "@douyin-local-life/diagnosis-skills";
import { DEFAULT_DEEPSEEK_MODEL } from "@douyin-local-life/llm";
import { diagnosisFeedbackInputSchema, diagnosisCaseStatusInputSchema } from "@douyin-local-life/shared/diagnosis";
import { writeAuditLog } from "../audit.js";
import { aiDiagnosisConfigurationIssue, aiDiagnosisEnabled } from "../ai-diagnosis/config.js";
import {
  buildDecisionRunDeterministicReview,
  diagnosisOrchestrationVersion,
  diagnosisPromptVersion
} from "../ai-diagnosis/orchestrator.js";
import { buildDiagnosisDecisionView, buildTrustedDiagnosisFactsView } from "../ai-diagnosis/decision-view.js";
import { decisionEngineInputSchema, diagnosisScenarios } from "@douyin-local-life/shared";
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
import { latestRealtimeMetricFrames } from "../realtime-signals.js";
import { runSerializableTransaction } from "../transactions.js";
import { chargeDiagnosisCredit } from "../credits.js";
import {
  archiveMetricsFromDecisionInput,
  buildDiagnosisContext,
  buildProjectHistoryDecisionContext,
  createProjectAnalysisArchive,
  projectHistoryInputFingerprint
} from "../project-history.js";

const createDecisionRunRequestSchema = z.object({
  scenario: z.enum(diagnosisScenarios).optional()
}).strict();

export function createDecisionRunRouter() {
  const router = Router();

  const createRun = async (req: Request, res: Response) => {
    if (!aiDiagnosisEnabled()) return sendError(res, 503, "AI_DIAGNOSIS_DISABLED", "AI 诊断尚未完成验收，当前功能未开启");
    const configurationIssue = aiDiagnosisConfigurationIssue();
    if (configurationIssue) return sendError(res, 503, configurationIssue.code, configurationIssue.message);
    const task = await getOwnedTask(currentUser(req).id, req.params.id || "");
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const requestInput = createDecisionRunRequestSchema.safeParse(req.body || {});
    if (!requestInput.success) return sendError(res, 400, "VALIDATION_ERROR", requestInput.error.issues[0]?.message || "诊断场景参数不合法");
    const scenario = requestInput.data.scenario || "UNSPECIFIED";
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
    const realtimeFrames = latestRealtimeMetricFrames(task.id);
    if (!task.snapshots[0] && !realtimeFrames.length) return sendError(res, 409, "SNAPSHOT_REQUIRED", "请先上传采集快照");

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
    const refreshedRealtimeFrames = latestRealtimeMetricFrames(task.id);
    if (!refreshed?.snapshots[0] && !refreshedRealtimeFrames.length) return sendError(res, 409, "SNAPSHOT_REQUIRED", "请先上传采集快照");
    const refreshedTask = refreshed as NonNullable<typeof refreshed>;
    const currentDecisionInput = buildDecisionInput(refreshedTask, { realtimeFrames: refreshedRealtimeFrames });
    const archiveMetrics = archiveMetricsFromDecisionInput(currentDecisionInput);
    const [historyContext, diagnosisContext] = await Promise.all([
      buildProjectHistoryDecisionContext(prisma, task.projectId, archiveMetrics),
      buildDiagnosisContext(prisma, { projectId: task.projectId, collectionTaskId: task.id, scenario })
    ]);
    const decisionInput = { ...currentDecisionInput, historyContext, diagnosisContext };
    decisionEngineInputSchema.parse(decisionInput);
    const readiness = evaluateDecisionReadiness(refreshedTask, decisionInput);
    if (!readiness.ready) {
      return sendError(res, 409, "DECISION_NOT_READY", `当前数据不能运行 AI 诊断：${readiness.blockingReasons.join("；")}`, {
        fieldErrors: { readiness: readiness.blockingReasons.join("；") }
      });
    }
    const evidenceFingerprint = decisionEvidenceFingerprint(refreshedTask);
    const inputFingerprint = projectHistoryInputFingerprint(evidenceFingerprint, historyContext, diagnosisContext);
    const archiveKey = `analysis:${task.id}:${idempotency.key || randomUUID()}`;
    try {
      const created = await runSerializableTransaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${task.id}), hashtext('ai-diagnosis-create'))`;
        if (idempotency.key) {
          const replay = await findIdempotentRun(task.id, idempotency.key, tx);
          if (replay) return { run: replay, replayed: true, idempotentReplay: true, unchangedEvidence: false };
        }
        const existingActive = await tx.decisionRun.findFirst({
          where: { collectionTaskId: task.id, mode: "AI_SKILL_ORCHESTRATED", status: { in: ["PENDING", "RUNNING"] } },
          include: decisionRunInclude,
          orderBy: { createdAt: "desc" }
        });
        if (existingActive) return { run: existingActive, replayed: true, unchangedEvidence: false };
        const unchangedSuccessfulRun = await tx.decisionRun.findFirst({
          where: {
            collectionTaskId: task.id,
            mode: "AI_SKILL_ORCHESTRATED",
            status: "SUCCEEDED",
            inputFingerprint,
            promptVersion: diagnosisPromptVersion,
            skillSetVersion: diagnosisSkillSetVersion,
            orchestrationVersion: diagnosisOrchestrationVersion
          },
          include: decisionRunInclude,
          orderBy: { createdAt: "desc" }
        });
        if (unchangedSuccessfulRun) {
          const archive = await createProjectAnalysisArchive(tx, {
            archiveKey,
            projectId: task.projectId,
            collectionTaskId: task.id,
            decisionRunId: unchangedSuccessfulRun.id,
            status: "REUSED",
            metrics: archiveMetrics,
            historyContext
          });
          await writeAuditLog(req, "PROJECT_HISTORY_ANALYSIS_ARCHIVED", {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            detailJson: { decisionRunId: unchangedSuccessfulRun.id, historyArchiveId: archive.id, status: "REUSED" }
          }, tx);
          return { run: unchangedSuccessfulRun, replayed: true, unchangedEvidence: true };
        }
        const limit = await checkDecisionRateLimit(task.id, tx);
        if (!limit.allowed) return { rateLimited: true as const, retryAfterSeconds: limit.retryAfterSeconds };
        const charged = await chargeDiagnosisCredit(tx, currentUser(req).id);
        if (!charged) return { insufficientCredits: true as const };
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
            inputFingerprint,
            strategyVersion: diagnosisSkillSetVersion,
            currentStage: "QUEUED",
            creditCharged: true,
            inputJson: toJson(decisionInput)
          },
          include: decisionRunInclude
        });
        const archive = await createProjectAnalysisArchive(tx, {
          archiveKey,
          projectId: task.projectId,
          collectionTaskId: task.id,
          decisionRunId: run.id,
          status: "QUEUED",
          metrics: archiveMetrics,
          historyContext
        });
        await writeAuditLog(req, "AI_DIAGNOSIS_QUEUED", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: { decisionRunId: run.id, evidenceFingerprint, inputFingerprint, historyArchiveId: archive.id, scenario }
        }, tx);
        await writeAuditLog(req, "PROJECT_HISTORY_ANALYSIS_ARCHIVED", {
          workspaceId: task.project.workspaceId,
          projectId: task.projectId,
          taskId: task.id,
          detailJson: { decisionRunId: run.id, historyArchiveId: archive.id, status: "QUEUED" }
        }, tx);
        return { run, replayed: false, unchangedEvidence: false };
      });
      if (created.rateLimited) {
        res.setHeader("Retry-After", String(created.retryAfterSeconds));
        return sendError(res, 429, "RATE_LIMITED", "AI 诊断运行过于频繁，请稍后再试");
      }
      if (created.insufficientCredits) {
        return sendError(res, 402, "INSUFFICIENT_CREDITS", "积分不足，无法创建新的 AI 诊断。");
      }
      if (created.unchangedEvidence) {
        res.setHeader("Diagnosis-Reused-Unchanged-Evidence", "true");
        return sendSuccess(res, { ...toDecisionRunDTO(created.run), reuseReason: "UNCHANGED_EVIDENCE" }, 200);
      }
      if (created.idempotentReplay) {
        res.setHeader("Idempotent-Replayed", "true");
        return sendSuccess(res, toDecisionRunDTO(created.run), created.run.status === "PENDING" || created.run.status === "RUNNING" ? 202 : 200);
      }
      if (created.replayed) res.setHeader("Diagnosis-Already-Running", "true");
      return sendSuccess(res, toDecisionRunDTO(created.run), 202);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = idempotency.key
          ? await findIdempotentRun(task.id, idempotency.key)
          : await findActiveRun(task.id);
        if (existing) {
          if (idempotency.key) res.setHeader("Idempotent-Replayed", "true");
          return sendSuccess(res, toDecisionRunDTO(existing), existing.status === "PENDING" || existing.status === "RUNNING" ? 202 : 200);
        }
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
  actionProposals: {
    orderBy: { createdAt: "asc" as const },
    include: { outcomes: { select: { id: true } } }
  },
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

function findIdempotentRun(collectionTaskId: string, idempotencyKey: string, db: Pick<Prisma.TransactionClient, "decisionRun"> = prisma) {
  // Reused requests are mapped by their archive, not by the original run's key.
  // Use the same lookup before creation, under the lock and after conflicts.
  return db.decisionRun.findFirst({
    where: {
      collectionTaskId,
      OR: [
        { idempotencyKey },
        { analysisArchives: { some: { collectionTaskId, archiveKey: `analysis:${collectionTaskId}:${idempotencyKey}`, status: "REUSED" } } }
      ]
    },
    include: decisionRunInclude
  });
}

function toDecisionRunDTO(run: Awaited<ReturnType<typeof findActiveRun>> extends infer T ? NonNullable<T> : never) {
  const storedInput = decisionEngineInputSchema.safeParse(run.inputJson);
  const deterministicReview = run.mode === "AI_SKILL_ORCHESTRATED" && run.status === "SUCCEEDED"
    ? buildDecisionRunDeterministicReview(run.inputJson, run.finalResultJson)
    : null;
  return {
    ...run,
    finalResult: run.finalResultJson,
    historyContext: storedInput.success ? storedInput.data.historyContext || null : null,
    trustedFacts: run.mode === "AI_SKILL_ORCHESTRATED" && storedInput.success
      ? buildTrustedDiagnosisFactsView(storedInput.data)
      : null,
    deterministicReview,
    decisionView: run.mode === "AI_SKILL_ORCHESTRATED" && run.status === "SUCCEEDED"
      ? buildDiagnosisDecisionView(run.inputJson, run.finalResultJson, run.actionProposals)
      : null,
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
