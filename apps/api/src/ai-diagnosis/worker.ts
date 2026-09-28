import { randomUUID } from "node:crypto";
import { Prisma, type DecisionRun } from "@prisma/client";
import { guardAiCandidateActions } from "@douyin-local-life/decision-engine";
import { createDiagnosisSkillPlan, diagnosisSkillSetVersion } from "@douyin-local-life/diagnosis-skills";
import { LlmTransportError, type ChatTransport } from "@douyin-local-life/llm";
import { collectionFreshnessPolicy, decisionEngineInputSchema, type AnalyzeOutput, type DecisionEngineInput } from "@douyin-local-life/shared";
import { buildDecisionInput, toActionProposalCreate } from "../decision.js";
import { DecisionEvidenceChangedError, decisionEvidenceFingerprint } from "../decision-evidence.js";
import { upsertDraftDiagnosisCase } from "../diagnosis-cases.js";
import { evaluateDecisionReadiness } from "../decision-readiness.js";
import { getTaskForDecision } from "../ownership.js";
import { prisma } from "../prisma.js";
import { prepareActionProposals, proposalExpiresAfterMs, proposalLifecyclePolicy } from "../proposal-lifecycle.js";
import { sanitizeDerivedPersistedJson } from "../persisted-input.js";
import { latestRealtimeMetricFrames } from "../realtime-signals.js";
import { markProjectAnalysisArchiveRunStatus } from "../project-history.js";
import { refundDecisionRunCredit } from "../credits.js";
import type { ObservationValidationDiagnostic } from "./validation-diagnostic.js";
import {
  aiDiagnosisConfigurationIssue,
  aiDiagnosisEnabled,
  aiDiagnosisTimeoutMs,
  createConfiguredDiagnosisTransport
} from "./config.js";
import {
  DiagnosisOrchestrationError,
  diagnosisOrchestrationVersion,
  diagnosisPromptVersion,
  orchestrateDiagnosis,
  type SkillExecutionEvent
} from "./orchestrator.js";

const leaseDurationMs = 150_000;

export async function processNextDecisionRun(options: {
  workerId?: string;
  transport?: ChatTransport;
} = {}) {
  if (!aiDiagnosisEnabled()) return null;
  if (!options.transport && aiDiagnosisConfigurationIssue()) return null;
  const workerId = options.workerId || `diagnosis-worker-${randomUUID()}`;
  const run = await claimDecisionRun(workerId);
  if (!run) return null;
  await processClaimedDecisionRun(run, workerId, options.transport);
  return run.id;
}

export function startDecisionWorker(options: {
  pollIntervalMs?: number;
  workerId?: string;
  transport?: ChatTransport;
  onError?: (error: unknown) => void;
} = {}) {
  const configurationIssue = options.transport ? null : aiDiagnosisConfigurationIssue();
  if (configurationIssue) throw new DiagnosisWorkerError(configurationIssue.code, configurationIssue.message);
  const workerId = options.workerId || `diagnosis-worker-${randomUUID()}`;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const onError = options.onError || ((error: unknown) => console.error("Decision worker tick failed", error));
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await processNextDecisionRun({ workerId, transport: options.transport });
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), pollIntervalMs);
  void tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 25));
  };
}

async function claimDecisionRun(workerId: string) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await finalizeExpiredMaxAttemptDecisionRuns(tx, now);
    const candidate = await tx.decisionRun.findFirst({
      where: {
        mode: "AI_SKILL_ORCHESTRATED",
        attemptCount: { lt: 3 },
        OR: [
          { status: "PENDING" },
          { status: "RUNNING", leaseExpiresAt: { lt: now } }
        ]
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    if (!candidate) return null;
    const claimed = await tx.decisionRun.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: "PENDING" },
          { status: "RUNNING", leaseExpiresAt: { lt: now } }
        ]
      },
      data: {
        status: "RUNNING",
        currentStage: "VERIFYING_EVIDENCE",
        startedAt: candidate.startedAt || now,
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        attemptCount: { increment: 1 },
        errorCode: null,
        errorMessage: null
      }
    });
    return claimed.count ? tx.decisionRun.findUnique({ where: { id: candidate.id } }) : null;
  });
}

/**
 * Recovers AI runs that exhausted their three attempts and then lost their
 * lease because the owning Worker exited outside the normal catch path.
 */
export async function finalizeExpiredMaxAttemptDecisionRuns(
  tx: Prisma.TransactionClient,
  now = new Date()
) {
  const orphans = await tx.decisionRun.findMany({
    where: {
      mode: "AI_SKILL_ORCHESTRATED",
      status: "RUNNING",
      attemptCount: { gte: 3 },
      leaseExpiresAt: { lt: now }
    },
    select: {
      id: true,
      attemptCount: true,
      projectId: true,
      collectionTaskId: true,
      leaseOwner: true,
      creditCharged: true,
      creditRefunded: true,
      project: { select: { workspace: { select: { id: true, ownerId: true } } } }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  let finalized = 0;
  for (const orphan of orphans) {
    let refunded = false;
    if (orphan.leaseOwner && orphan.creditCharged && !orphan.creditRefunded) {
      refunded = await refundDecisionRunCredit(tx, {
        runId: orphan.id,
        userId: orphan.project.workspace.ownerId,
        status: "RUNNING",
        leaseOwner: orphan.leaseOwner
      });
    }

    const result = await tx.decisionRun.updateMany({
      where: {
        id: orphan.id,
        status: "RUNNING",
        attemptCount: { gte: 3 },
        leaseExpiresAt: { lt: now }
      },
      data: {
        status: "FAILED",
        currentStage: "FAILED:ORPHANED_LEASE",
        errorCode: "AI_DIAGNOSIS_MAX_ATTEMPTS",
        errorMessage: "AI 诊断已超过最大尝试次数，且最后租约已过期；本次运行已自动关闭。",
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null
      }
    });

    if (result.count === 1) {
      finalized += 1;
      await markProjectAnalysisArchiveRunStatus(tx, orphan.id, "FAILED");
      await tx.auditLog.create({
        data: {
          userId: orphan.project.workspace.ownerId,
          workspaceId: orphan.project.workspace.id,
          projectId: orphan.projectId,
          taskId: orphan.collectionTaskId,
          action: "AI_DIAGNOSIS_ORPHAN_RECOVERED",
          detailJson: toJson({
            decisionRunId: orphan.id,
            attemptCount: orphan.attemptCount,
            errorCode: "AI_DIAGNOSIS_MAX_ATTEMPTS"
          })
        }
      });
    } else if (refunded) {
      // A concurrent terminal write won the row. Do not leave a refund behind.
      throw new Error("DECISION_RUN_ORPHAN_RECOVERY_WRITE_CONFLICT");
    }
  }

  return finalized;
}

export async function finalizeSucceededDecisionRun(
  tx: Prisma.TransactionClient,
  input: {
    runId: string;
    workerId: string;
    data: Prisma.DecisionRunUpdateManyMutationInput;
  }
) {
  const result = await tx.decisionRun.updateMany({
    where: { id: input.runId, status: "RUNNING", leaseOwner: input.workerId },
    data: input.data
  });
  if (!result.count) throw new DiagnosisWorkerError("DIAGNOSIS_LEASE_LOST", "诊断任务租约已失效");
  return result.count;
}

async function processClaimedDecisionRun(run: DecisionRun, workerId: string, configuredTransport?: ChatTransport) {
  const startedAt = Date.now();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), aiDiagnosisTimeoutMs());
  let lastStage = "VERIFYING_EVIDENCE";
  const validationDiagnostics: ObservationValidationDiagnostic[] = [];
  let auditActor: { userId: string; workspaceId: string } | undefined;
  const advanceStage = async (stage: string) => {
    lastStage = stage;
    await updateStage(run.id, workerId, stage);
  };
  try {
    const task = await getTaskForDecision(run.collectionTaskId);
    if (!task) throw new DiagnosisWorkerError("TASK_NOT_FOUND", "诊断任务已不存在");
    auditActor = { userId: task.userId, workspaceId: task.project.workspaceId };
    if (decisionEvidenceFingerprint(task) !== run.evidenceFingerprint) throw new DecisionEvidenceChangedError();
    const decisionInput: DecisionEngineInput = storedDecisionInput(run)
      || buildDecisionInput(task, { realtimeFrames: latestRealtimeMetricFrames(task.id) });
    const readiness = evaluateDecisionReadiness(task, decisionInput);
    if (!readiness.ready) throw new DiagnosisWorkerError("DECISION_NOT_READY", readiness.blockingReasons.join("；"));
    const transport = configuredTransport || createConfiguredDiagnosisTransport();
    const skillPlan = createDiagnosisSkillPlan(decisionInput);
    await advanceStage("ORCHESTRATING_SKILLS");
    const orchestration = await orchestrateDiagnosis({
      decisionInput,
      skillPlan,
      transport,
      signal: timeout.signal,
      onValidationDiagnostic: (diagnostic) => {
        // Local revalidation may report the same failure again. Keep only a
        // bounded sequence of distinct checks, not an apparent extra model run.
        if (JSON.stringify(validationDiagnostics.at(-1)) === JSON.stringify(diagnostic)) return;
        if (validationDiagnostics.length === 3) validationDiagnostics.shift();
        validationDiagnostics.push(diagnostic);
      },
      onSkillEvent: async (event) => {
        lastStage = `SKILL:${event.skillId}:${event.status}`;
        await persistSkillEvent(run.id, workerId, event);
      },
      onStage: advanceStage
    });
    await advanceStage("APPLYING_POLICY");
    const guarded = guardAiCandidateActions({
      decisionInput,
      candidates: orchestration.result.candidateActions,
      validEvidenceIds: new Set(orchestration.evidenceCatalog.map((item) => item.id))
    });

    await prisma.$transaction(async (tx) => {
      const currentRun = await tx.decisionRun.findFirst({ where: { id: run.id, status: "RUNNING", leaseOwner: workerId } });
      if (!currentRun) throw new DiagnosisWorkerError("DIAGNOSIS_LEASE_LOST", "诊断任务租约已失效");
      const currentTask = await getTaskForDecision(run.collectionTaskId, tx);
      if (!currentTask || decisionEvidenceFingerprint(currentTask) !== run.evidenceFingerprint) throw new DecisionEvidenceChangedError();
      const prepared = await prepareActionProposals(tx, {
        projectId: currentTask.projectId,
        collectionTaskId: currentTask.id,
        proposals: guarded.acceptedProposals
      });
      const completedAt = new Date();
      const oldestRouteAgeMs = decisionInput.collectionQuality?.routes.reduce((max, route) => Math.max(max, route.ageMs || 0), 0) || 0;
      const sourceRemainingMs = decisionInput.collectionQuality
        ? Math.max(0, collectionFreshnessPolicy.staleAfterMs - oldestRouteAgeMs)
        : proposalLifecyclePolicy.expiresAfterMs;
      if (prepared.accepted.length) {
        await tx.actionProposal.createMany({
          data: prepared.accepted.map((proposal) =>
            toActionProposalCreate(
              proposal,
              run.id,
              currentTask.projectId,
              currentTask.id,
              completedAt,
              new Date(completedAt.getTime() + Math.min(proposalExpiresAfterMs(proposal.actionType), sourceRemainingMs))
            )
          )
        });
      }
      const finalResult = {
        ...orchestration.result,
        evidenceCatalog: orchestration.evidenceCatalog,
        ruleAdjudication: {
          ...guarded.adjudication,
          lifecycleSuppressed: prepared.suppressed
        }
      };
      await finalizeSucceededDecisionRun(tx, {
        runId: run.id,
        workerId,
        data: {
          status: "SUCCEEDED",
          currentStage: "COMPLETED",
          provider: transport.provider,
          model: transport.model,
          promptVersion: diagnosisPromptVersion,
          skillSetVersion: diagnosisSkillSetVersion,
          orchestrationVersion: diagnosisOrchestrationVersion,
          engineVersion: "ai-skill-diagnosis-v1",
          ruleVersion: guarded.adjudication.policyVersion,
          strategyVersion: diagnosisSkillSetVersion,
          inputJson: run.inputJson ? undefined : toJson(sanitizeDerivedPersistedJson(decisionInput)),
          aiResultJson: toJson(sanitizeDerivedPersistedJson(orchestration.result)),
          ruleResultJson: toJson(sanitizeDerivedPersistedJson(finalResult.ruleAdjudication)),
          finalResultJson: toJson(sanitizeDerivedPersistedJson(finalResult)),
          manualCheckItemsJson: toJson(sanitizeDerivedPersistedJson(orchestration.result.missingEvidence)),
          riskLevel: highestAcceptedActionRisk(prepared.accepted),
          confidence: orchestration.result.confidence,
          diagnosis: orchestration.result.coreConclusion,
          durationMs: Date.now() - startedAt,
          inputTokens: orchestration.usage.inputTokens,
          outputTokens: orchestration.usage.outputTokens,
          totalTokens: orchestration.usage.totalTokens,
          completedAt,
          leaseOwner: null,
          leaseExpiresAt: null
        }
      });
      await markProjectAnalysisArchiveRunStatus(tx, run.id, "SUCCEEDED");
      await upsertDraftDiagnosisCase({
        workspaceId: currentTask.project.workspaceId,
        projectId: currentTask.projectId,
        collectionTaskId: currentTask.id,
        decisionRunId: run.id,
        decisionInput,
        result: orchestration.result
      }, tx);
      await tx.auditLog.create({
        data: {
          userId: currentTask.userId,
          actorSnapshotJson: toJson({ userId: currentTask.userId }),
          workspaceId: currentTask.project.workspaceId,
          projectId: currentTask.projectId,
          taskId: currentTask.id,
          action: "AI_DIAGNOSIS_SUCCEEDED",
          detailJson: toJson({ decisionRunId: run.id, skillSetVersion: diagnosisSkillSetVersion, actionProposalCount: prepared.accepted.length })
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const normalized = normalizeWorkerError(error, timeout.signal.aborted);
    await prisma.$transaction(async (tx) => {
      const currentRun = await tx.decisionRun.findFirst({
        where: { id: run.id, status: "RUNNING", leaseOwner: workerId },
        select: { project: { select: { workspace: { select: { ownerId: true } } } } }
      });
      if (!currentRun) return;
      await refundDecisionRunCredit(tx, {
        runId: run.id,
        userId: currentRun.project.workspace.ownerId,
        status: "RUNNING",
        leaseOwner: workerId
      });
      const failed = await tx.decisionRun.updateMany({
        where: { id: run.id, status: "RUNNING", leaseOwner: workerId },
        data: {
          status: "FAILED",
          currentStage: `FAILED:${lastStage}`,
          errorCode: normalized.code,
          errorMessage: normalized.message,
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null
        }
      });
      if (!failed.count) throw new Error("DECISION_RUN_FAILURE_WRITE_CONFLICT");
      await markProjectAnalysisArchiveRunStatus(tx, run.id, "FAILED");
      if (auditActor && validationDiagnostics.length) {
        await tx.auditLog.create({
          data: {
            userId: auditActor.userId,
            actorSnapshotJson: toJson({ userId: auditActor.userId }),
            workspaceId: auditActor.workspaceId,
            projectId: run.projectId,
            taskId: run.collectionTaskId,
            action: "AI_DIAGNOSIS_VALIDATION_FAILED",
            detailJson: toJson(sanitizeDerivedPersistedJson({
              decisionRunId: run.id,
              attemptCount: run.attemptCount,
              stage: lastStage,
              finalErrorCode: normalized.code,
              promptVersion: diagnosisPromptVersion,
              orchestrationVersion: diagnosisOrchestrationVersion,
              validationDiagnostics
            }))
          }
        });
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function updateStage(runId: string, workerId: string, currentStage: string) {
  const result = await prisma.decisionRun.updateMany({
    where: { id: runId, status: "RUNNING", leaseOwner: workerId },
    data: { currentStage, leaseExpiresAt: new Date(Date.now() + leaseDurationMs) }
  });
  if (!result.count) throw new DiagnosisWorkerError("DIAGNOSIS_LEASE_LOST", "诊断任务租约已失效");
}

async function persistSkillEvent(runId: string, workerId: string, event: SkillExecutionEvent) {
  await updateStage(runId, workerId, `SKILL:${event.skillId}:${event.status}`);
  const data = {
    skillId: event.skillId,
    skillVersion: event.skillVersion,
    status: event.status,
    inputJson: event.input === undefined ? undefined : toJson(sanitizeDerivedPersistedJson(event.input)),
    outputJson: event.output === undefined ? undefined : toJson(sanitizeDerivedPersistedJson(event.output)),
    errorCode: event.errorCode || null,
    errorMessage: event.errorMessage?.slice(0, 500) || null,
    durationMs: event.durationMs,
    inputTokens: event.usage?.inputTokens,
    outputTokens: event.usage?.outputTokens,
    totalTokens: event.usage?.totalTokens,
    startedAt: event.status === "RUNNING" ? new Date() : undefined,
    completedAt: event.status === "SUCCEEDED" || event.status === "FAILED" ? new Date() : undefined
  };
  await prisma.diagnosisSkillExecution.upsert({
    where: { decisionRunId_sequence: { decisionRunId: runId, sequence: event.sequence } },
    create: { decisionRunId: runId, sequence: event.sequence, ...data },
    update: data
  });
}

function highestAcceptedActionRisk(proposals: Array<{ riskLevel: "LOW" | "MEDIUM" | "HIGH" }>) {
  if (proposals.some((item) => item.riskLevel === "HIGH")) return "HIGH" as const;
  if (proposals.some((item) => item.riskLevel === "MEDIUM")) return "MEDIUM" as const;
  return "LOW" as const;
}

function normalizeWorkerError(error: unknown, timedOut: boolean) {
  if (timedOut) return { code: "AI_DIAGNOSIS_TIMEOUT", message: "AI 诊断超过总时限，请重新运行" };
  if (error instanceof DecisionEvidenceChangedError) return { code: "DECISION_EVIDENCE_CHANGED", message: "诊断期间证据发生变化，请重新运行" };
  if (error instanceof DiagnosisWorkerError || error instanceof DiagnosisOrchestrationError || error instanceof LlmTransportError) {
    return { code: error.code, message: safeErrorMessage(error.message) };
  }
  return { code: "AI_DIAGNOSIS_FAILED", message: "AI 诊断执行失败，请重新运行" };
}

function safeErrorMessage(value: string) {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]").slice(0, 500);
}

class DiagnosisWorkerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function storedDecisionInput(run: DecisionRun): DecisionEngineInput | null {
  const parsed = decisionEngineInputSchema.safeParse(run.inputJson);
  const hasFrozenContext = run.inputJson !== null && typeof run.inputJson === "object" && Object.hasOwn(run.inputJson, "diagnosisContext");
  if (!parsed.success) {
    if (hasFrozenContext) throw new DiagnosisWorkerError("DIAGNOSIS_INPUT_INVALID", "本次冻结诊断上下文未通过服务端校验，不能重建或替换输入");
    return null;
  }
  if (!hasFrozenContext && !isStoredRealtimeInput(parsed.data)) return null;
  return {
    ...parsed.data,
    latestAnalysis: isAnalyzeOutput(parsed.data.latestAnalysis) ? parsed.data.latestAnalysis : null,
    networkJsonSummary: parsed.data.networkJsonSummary.map((record) => ({
      url: record.url,
      method: record.method,
      status: record.status,
      capturedAt: record.capturedAt,
      responseJson: record.responseJson ?? null
    }))
  };
}

function isStoredRealtimeInput(input: ReturnType<typeof decisionEngineInputSchema.parse>) {
  const evidenceItems = input.realtimeEvidenceItems?.length
    ? input.realtimeEvidenceItems
    : input.realtimeEvidence
      ? [input.realtimeEvidence]
      : [];
  return (input.metricLayer === "REALTIME_API" || input.metricLayer === "REVIEWED_METRIC")
    && evidenceItems.some((evidence) => evidence.metricCount > 0 && (
      evidence.routeKey === "LIVE_DATA_SCREEN"
        ? evidence.pageType === "LIVE_DATA_SCREEN" && evidence.source === "LIVE_SCREEN_INTERNAL_API"
        : evidence.routeKey === "LOCAL_PROMOTION_DASHBOARD"
          ? evidence.pageType === "LOCAL_PROMOTION_DASHBOARD" && evidence.source === "LOCAL_PROMOTION_INTERNAL_API"
          : false
    ));
}

function isAnalyzeOutput(value: unknown): value is AnalyzeOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.summary === "string"
    && typeof record.confidence === "number"
    && typeof record.riskLevel === "string"
    && Array.isArray(record.problems)
    && Array.isArray(record.suggestions)
    && Array.isArray(record.manualCheckItems);
}
