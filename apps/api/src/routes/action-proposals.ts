import { Router, type Request } from "express";
import { createActionOutcomeInputSchema } from "@douyin-local-life/shared";
import {
  approveActionProposal,
  markActionProposalManualExecuted,
  observeActionProposal,
  rejectActionProposal
} from "../action-proposals.js";
import { writeAuditLog } from "../audit.js";
import { isUniqueConstraintError, readIdempotencyKey } from "../idempotency.js";
import { createActionOutcome, listActionOutcomes, toActionOutcomeDTO } from "../outcomes.js";
import { getOwnedActionProposal } from "../ownership.js";
import { readPagination } from "../pagination.js";
import { readSafeOptionalText } from "../persisted-input.js";
import { prisma } from "../prisma.js";
import { expireProposalIfNeeded } from "../proposal-lifecycle.js";
import { sendError, sendSuccess } from "../response.js";
import { actionProposalAudit, currentUser } from "../server-utils.js";

const defaultManualExecutionNote = "用户确认已在平台页面或线下流程中手动执行完成，系统未执行任何平台操作。";

export function createActionProposalRouter() {
  const router = Router();

  router.get("/action-proposals/:id", async (req, res) => {
    let proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (proposal.expiresAt && proposal.expiresAt <= new Date()) {
      await expireActionProposalWithAudit(req, proposal);
      proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    }
    return sendSuccess(res, proposal);
  });

  router.get("/action-proposals/:id/outcomes", async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    const pagination = readPagination(req);
    if (pagination.cursorError) return sendError(res, 400, "INVALID_CURSOR", "分页游标不合法");
    return sendSuccess(res, await listActionOutcomes(proposal.id, pagination));
  });

  router.post("/action-proposals/:id/outcomes", async (req, res) => {
    const user = currentUser(req);
    const proposal = await getOwnedActionProposal(user.id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (proposal.status !== "MANUAL_EXECUTED") {
      return sendError(res, 409, "ACTION_NOT_MANUAL_EXECUTED", "只有人工已执行的动作建议才能记录执行后结果");
    }

    const idempotency = readIdempotencyKey(req);
    if (idempotency.error) return sendError(res, 400, "INVALID_IDEMPOTENCY_KEY", idempotency.error);
    const existing = idempotency.key
      ? await prisma.actionOutcome.findUnique({
          where: { actionProposalId_idempotencyKey: { actionProposalId: proposal.id, idempotencyKey: idempotency.key } }
        })
      : null;
    if (existing) {
      res.setHeader("Idempotent-Replayed", "true");
      return sendSuccess(res, toActionOutcomeDTO(existing));
    }

    const parsed = createActionOutcomeInputSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "结果复盘参数错误");
    const noteInput = readSafeOptionalText(parsed.data.note, 2_000);
    const conclusionInput = readSafeOptionalText(parsed.data.conclusion, 2_000);
    if (noteInput.error || conclusionInput.error) {
      return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", noteInput.error || conclusionInput.error || "输入包含敏感认证信息，已拒绝保存");
    }

    const outcomeBody = { ...parsed.data, note: noteInput.value, conclusion: conclusionInput.value };
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const created = await createActionOutcome(
          {
            actionProposalId: proposal.id,
            projectId: proposal.projectId,
            collectionTaskId: proposal.collectionTaskId,
            userId: user.id,
            body: outcomeBody,
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
              observationWindow: outcomeBody.observationWindow,
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
        const replayed = await prisma.actionOutcome.findUnique({
          where: { actionProposalId_idempotencyKey: { actionProposalId: proposal.id, idempotencyKey: idempotency.key } }
        });
        if (replayed) {
          res.setHeader("Idempotent-Replayed", "true");
          return sendSuccess(res, toActionOutcomeDTO(replayed));
        }
      }
      throw error;
    }
  });

  registerApprovalTransition(router, "approve", {
    action: "APPROVE_ACTION_PROPOSAL",
    nextStatus: "APPROVED",
    invalidStatusMessage: "只有待审批动作建议可以审批通过",
    transition: approveActionProposal
  });
  registerApprovalTransition(router, "reject", {
    action: "REJECT_ACTION_PROPOSAL",
    nextStatus: "REJECTED",
    invalidStatusMessage: "只有待审批动作建议可以拒绝",
    transition: rejectActionProposal
  });
  registerApprovalTransition(router, "observe", {
    action: "OBSERVE_ACTION_PROPOSAL",
    nextStatus: "OBSERVING",
    invalidStatusMessage: "只有待审批动作建议可以设置观察",
    transition: observeActionProposal
  });

  router.post("/action-proposals/:id/mark-manual-executed", async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (await rejectIfProposalExpired(req, res, proposal)) return;
    if (proposal.status !== "APPROVED") {
      return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "只有已审批动作建议可以标记人工已执行");
    }

    const noteInput = readSafeOptionalText(req.body?.note);
    if (noteInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", noteInput.error);
    const note = noteInput.value || defaultManualExecutionNote;
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

  return router;
}

type ApprovalTransition = {
  action: "APPROVE_ACTION_PROPOSAL" | "REJECT_ACTION_PROPOSAL" | "OBSERVE_ACTION_PROPOSAL";
  nextStatus: "APPROVED" | "REJECTED" | "OBSERVING";
  invalidStatusMessage: string;
  transition: typeof approveActionProposal;
};

function registerApprovalTransition(router: Router, route: "approve" | "reject" | "observe", config: ApprovalTransition) {
  router.post(`/action-proposals/:id/${route}`, async (req, res) => {
    const proposal = await getOwnedActionProposal(currentUser(req).id, req.params.id);
    if (!proposal) return sendError(res, 404, "ACTION_PROPOSAL_NOT_FOUND", "动作建议不存在");
    if (await rejectIfProposalExpired(req, res, proposal)) return;
    if (proposal.status !== "PENDING_APPROVAL") {
      return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", config.invalidStatusMessage);
    }

    const commentInput = readSafeOptionalText(req.body?.comment);
    if (commentInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", commentInput.error);
    const comment = commentInput.value;
    const updated = await config.transition({
      actionProposalId: proposal.id,
      userId: currentUser(req).id,
      comment,
      audit: actionProposalAudit(req, proposal, config.action, {
        actionProposalId: proposal.id,
        previousStatus: proposal.status,
        newStatus: config.nextStatus,
        comment
      })
    });
    if (!updated) return sendError(res, 409, "INVALID_ACTION_PROPOSAL_STATUS", "动作建议状态已变化，请刷新后重试");
    return sendSuccess(res, await getOwnedActionProposal(currentUser(req).id, proposal.id));
  });
}

async function rejectIfProposalExpired(
  req: Request,
  res: Parameters<Router["post"]>[1] extends (req: Request, res: infer Response) => unknown ? Response : never,
  proposal: Parameters<typeof actionProposalAudit>[1] & { id: string; expiresAt: Date | null }
) {
  if (!proposal.expiresAt || proposal.expiresAt > new Date()) return false;
  await expireActionProposalWithAudit(req, proposal);
  sendError(res, 409, "ACTION_EXPIRED", "动作建议已过期，请重新采集并生成决策");
  return true;
}

async function expireActionProposalWithAudit(
  req: Request,
  proposal: Parameters<typeof actionProposalAudit>[1] & { id: string }
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
