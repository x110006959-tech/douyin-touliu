import { randomBytes, randomInt } from "node:crypto";
import { Router } from "express";
import {
  createExtensionPairingCodeSchema,
  exchangeExtensionPairingCodeSchema,
  extensionCollectionProtocolVersion,
  extensionHeartbeatSchema,
  liveScreenInternalApiAdapterVersion,
  liveScreenInternalApiContractVersion
} from "@douyin-local-life/shared";
import { hashExtensionSecret, requireHumanSession, type AuthenticatedRequest } from "../auth.js";
import { createAuditActorSnapshot, writeAuditLog } from "../audit.js";
import { getExtensionStatus, recordExtensionPresence, removeExtensionPresence } from "../extension-presence.js";
import { readSafeOptionalText, sanitizeRequestMetadata } from "../persisted-input.js";
import { prisma } from "../prisma.js";
import { checkExtensionPairingRateLimit } from "../rate-limit.js";
import { sendError, sendSuccess, validationErrorOptions } from "../response.js";
import { currentUser, toJson } from "../server-utils.js";
import { getBuildMetadata } from "../version.js";
import { liveScreenInternalApiEnabled } from "../live-screen-internal-api-config.js";

const pairingLifetimeMs = 2 * 60 * 1000;
const credentialLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const extensionCollectionProtocolHeader = "x-pxxis-collection-protocol";

export function createExtensionPublicRouter() {
  const router = Router();

  router.post("/extension/pairing-codes/preview", async (req, res) => {
    const rateLimit = await checkExtensionPairingRateLimit({ ip: req.ip, code: typeof req.body?.code === "string" ? req.body.code : null });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "配对尝试过于频繁，请稍后再试");
    }
    const parsed = exchangeExtensionPairingCodeSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "配对信息不完整", validationErrorOptions(parsed.error));
    const pairing = await prisma.extensionPairingCode.findUnique({
      where: { codeHash: hashExtensionSecret(parsed.data.code) },
      include: { accountProfile: true, collectionTask: { include: { project: true } } }
    });
    if (!pairing || pairing.consumedAt || pairing.expiresAt <= new Date()) {
      return sendError(res, 401, "PAIRING_CODE_INVALID", "配对码错误、已使用或已过期，请在网页重新生成");
    }
    return sendSuccess(res, {
      account: { id: pairing.accountProfile.id, accountName: pairing.accountProfile.accountName },
      task: pairing.collectionTask && pairing.collectionTask.project.accountProfileId === pairing.accountProfileId
        ? {
            id: pairing.collectionTask.id,
            pageTitle: pairing.collectionTask.pageTitle,
            projectId: pairing.collectionTask.projectId,
            projectName: pairing.collectionTask.project.name
          }
        : null,
      expiresAt: pairing.expiresAt.toISOString()
    });
  });

  router.post("/extension/pairing-codes/exchange", async (req, res) => {
    const rateLimit = await checkExtensionPairingRateLimit({ ip: req.ip, code: typeof req.body?.code === "string" ? req.body.code : null });
    if (!rateLimit.allowed) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return sendError(res, 429, "RATE_LIMITED", "配对尝试过于频繁，请稍后再试");
    }
    const parsed = exchangeExtensionPairingCodeSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "配对信息不完整", validationErrorOptions(parsed.error));
    const labelInput = readSafeOptionalText(parsed.data.label, 100);
    if (labelInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", labelInput.error);
    const pairing = await prisma.extensionPairingCode.findUnique({
      where: { codeHash: hashExtensionSecret(parsed.data.code) },
      include: {
        accountProfile: true,
        user: true,
        collectionTask: { include: { project: true } }
      }
    });
    if (!pairing || pairing.consumedAt || pairing.expiresAt <= new Date()) {
      return sendError(res, 401, "PAIRING_CODE_INVALID", "配对码错误、已使用或已过期，请在网页重新生成");
    }

    const rawToken = `pxx_ext_${randomBytes(32).toString("base64url")}`;
    try {
      const credential = await prisma.$transaction(async (tx) => {
        const consumed = await tx.extensionPairingCode.updateMany({
          where: { id: pairing.id, consumedAt: null, expiresAt: { gt: new Date() } },
          data: { consumedAt: new Date() }
        });
        if (consumed.count !== 1) throw new Error("PAIRING_CODE_ALREADY_USED");
        const created = await tx.extensionCredential.create({
          data: {
            workspaceId: pairing.workspaceId,
            accountProfileId: pairing.accountProfileId,
            userId: pairing.userId,
            tokenHash: hashExtensionSecret(rawToken),
            label: labelInput.value || "Chrome 采集插件",
            scopes: ["COLLECT", "READ_DIAGNOSIS"],
            expiresAt: new Date(Date.now() + credentialLifetimeMs)
          }
        });
        await tx.auditLog.create({
          data: {
            userId: pairing.userId,
            actorSnapshotJson: toJson(createAuditActorSnapshot(pairing.user)),
            workspaceId: pairing.workspaceId,
            action: "EXTENSION_CREDENTIAL_PAIRED",
            detailJson: toJson({ credentialId: created.id, accountProfileId: pairing.accountProfileId, scopes: created.scopes }),
            ip: req.ip,
            userAgent: sanitizeRequestMetadata(req.header("user-agent"))
          }
        });
        return created;
      });
      return sendSuccess(res, {
        token: rawToken,
        expiresAt: credential.expiresAt,
        account: { id: pairing.accountProfile.id, accountName: pairing.accountProfile.accountName },
        scopes: credential.scopes,
        suggestedTask: pairing.collectionTask && pairing.collectionTask.project.accountProfileId === pairing.accountProfileId
          ? {
              id: pairing.collectionTask.id,
              pageTitle: pairing.collectionTask.pageTitle,
              projectId: pairing.collectionTask.projectId,
              projectName: pairing.collectionTask.project.name
            }
          : null
      }, 201);
    } catch (error) {
      if ((error as Error).message === "PAIRING_CODE_ALREADY_USED") {
        return sendError(res, 409, "PAIRING_CODE_ALREADY_USED", "该配对码已经使用，请在网页重新生成");
      }
      throw error;
    }
  });

  return router;
}

export function createExtensionProtectedRouter() {
  const router = Router();

  router.post("/extension/pairing-codes", requireHumanSession, async (req, res) => {
    const user = currentUser(req);
    const parsed = createExtensionPairingCodeSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "请选择账号", validationErrorOptions(parsed.error));
    const account = await prisma.accountProfile.findFirst({
      where: { id: parsed.data.accountProfileId, workspace: { ownerId: user.id }, status: "ACTIVE" }
    });
    if (!account) return sendError(res, 404, "ACCOUNT_PROFILE_NOT_FOUND", "账号档案不存在");
    const collectionTask = parsed.data.collectionTaskId
      ? await prisma.collectionTask.findFirst({
          where: {
            id: parsed.data.collectionTaskId,
            project: { accountProfileId: account.id, workspace: { ownerId: user.id }, status: "ACTIVE" }
          },
          include: { project: true }
        })
      : null;
    if (parsed.data.collectionTaskId && !collectionTask) {
      return sendError(res, 409, "EXTENSION_TASK_ACCOUNT_MISMATCH", "采集任务不属于当前账号，已阻止生成配对码");
    }

    let code = "";
    let created;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      try {
        created = await prisma.$transaction(async (tx) => {
          await tx.extensionPairingCode.deleteMany({ where: { accountProfileId: account.id, consumedAt: null } });
          const pairing = await tx.extensionPairingCode.create({
            data: {
              workspaceId: account.workspaceId,
              accountProfileId: account.id,
              collectionTaskId: collectionTask?.id || null,
              userId: user.id,
              codeHash: hashExtensionSecret(code),
              expiresAt: new Date(Date.now() + pairingLifetimeMs)
            }
          });
          await writeAuditLog(req, "EXTENSION_PAIRING_CODE_CREATED", {
            workspaceId: account.workspaceId,
            detailJson: {
              pairingCodeId: pairing.id,
              accountProfileId: account.id,
              collectionTaskId: collectionTask?.id || null,
              expiresAt: pairing.expiresAt
            }
          }, tx);
          return pairing;
        });
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    if (!created) return sendError(res, 503, "PAIRING_CODE_UNAVAILABLE", "暂时无法生成配对码，请稍后重试");
    return sendSuccess(res, {
      code,
      expiresAt: created.expiresAt,
      account: { id: account.id, accountName: account.accountName },
      task: collectionTask ? { id: collectionTask.id, pageTitle: collectionTask.pageTitle, projectId: collectionTask.projectId, projectName: collectionTask.project.name } : null
    }, 201);
  });

  router.get("/extension/credentials", requireHumanSession, async (req, res) => {
    const user = currentUser(req);
    const credentials = await prisma.extensionCredential.findMany({
      where: { userId: user.id },
      include: { accountProfile: { select: { id: true, accountName: true } } },
      orderBy: { createdAt: "desc" }
    });
    return sendSuccess(res, credentials.map(({ tokenHash: _tokenHash, ...credential }) => credential));
  });

  router.delete("/extension/credentials/:id", requireHumanSession, async (req, res) => {
    const user = currentUser(req);
    const credential = await prisma.extensionCredential.findFirst({ where: { id: req.params.id, userId: user.id } });
    if (!credential) return sendError(res, 404, "EXTENSION_CREDENTIAL_NOT_FOUND", "插件授权不存在");
    const revoked = await prisma.$transaction(async (tx) => {
      const updated = await tx.extensionCredential.update({ where: { id: credential.id }, data: { revokedAt: credential.revokedAt || new Date() } });
      await writeAuditLog(req, "EXTENSION_CREDENTIAL_REVOKED", {
        workspaceId: credential.workspaceId,
        detailJson: { credentialId: credential.id, accountProfileId: credential.accountProfileId }
      }, tx);
      return updated;
    });
    removeExtensionPresence(credential.id);
    return sendSuccess(res, { id: revoked.id, revokedAt: revoked.revokedAt });
  });

  router.post("/extension/heartbeat", async (req, res) => {
    const extensionUser = (req as AuthenticatedRequest).user;
    if (extensionUser.authKind !== "EXTENSION" || !extensionUser.extensionCredentialId || !extensionUser.extensionAccountProfileId) {
      return sendError(res, 403, "EXTENSION_CREDENTIAL_REQUIRED", "请使用插件配对凭证上报状态");
    }
    const parsed = extensionHeartbeatSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "插件状态不完整", validationErrorOptions(parsed.error));
    const lastErrorInput = readSafeOptionalText(parsed.data.lastError, 500);
    if (lastErrorInput.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", lastErrorInput.error);
    const task = await prisma.collectionTask.findFirst({
      where: { id: parsed.data.collectionTaskId, project: { accountProfileId: extensionUser.extensionAccountProfileId } },
      select: { id: true }
    });
    if (!task) return sendError(res, 403, "EXTENSION_ACCOUNT_MISMATCH", "该任务不属于当前插件绑定账号，已阻止状态上报");
    recordExtensionPresence({
      credentialId: extensionUser.extensionCredentialId,
      accountProfileId: extensionUser.extensionAccountProfileId,
      heartbeat: {
        ...parsed.data,
        lastError: lastErrorInput.value
      }
    });
    return sendSuccess(res, { receivedAt: new Date().toISOString() });
  });

  router.get("/collection-tasks/:id/extension-status", requireHumanSession, async (req, res) => {
    const user = currentUser(req);
    const task = await prisma.collectionTask.findFirst({
      where: { id: req.params.id, project: { workspace: { ownerId: user.id } } },
      include: { project: { include: { accountProfile: true } } }
    });
    if (!task) return sendError(res, 404, "TASK_NOT_FOUND", "采集任务不存在");
    const credentials = await prisma.extensionCredential.findMany({
      where: {
        userId: user.id,
        accountProfileId: task.project.accountProfileId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: { id: true }
    });
    return sendSuccess(res, getExtensionStatus({
      collectionTaskId: task.id,
      taskTitle: task.pageTitle || task.sourceUrl || task.id,
      accountProfileId: task.project.accountProfileId,
      activeCredentialIds: credentials.map((credential) => credential.id),
      expectedVersion: getBuildMetadata().extensionVersion
    }));
  });

  router.get("/extension/context", async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    if (user.authKind !== "EXTENSION" || !user.extensionAccountProfileId) {
      return sendError(res, 403, "EXTENSION_CREDENTIAL_REQUIRED", "请使用插件配对凭证访问");
    }
    const declaredProtocol = parseDeclaredCollectionProtocol(req.get(extensionCollectionProtocolHeader));
    if (declaredProtocol !== extensionCollectionProtocolVersion) {
      return sendError(res, 409, "EXTENSION_COLLECTION_PROTOCOL_MISMATCH", "插件版本已过期，请重新加载当前本地扩展后重试");
    }
    const account = await prisma.accountProfile.findFirst({
      where: { id: user.extensionAccountProfileId, workspaceId: user.workspaceId, status: "ACTIVE" },
      select: {
        id: true,
        accountName: true,
        projects: {
          where: { status: "ACTIVE" },
          orderBy: { updatedAt: "desc" },
          include: { tasks: { orderBy: { createdAt: "desc" }, take: 50, include: { routeSources: true } } }
        }
      }
    });
    if (!account) return sendError(res, 404, "ACCOUNT_PROFILE_NOT_FOUND", "绑定账号已停用或不存在");
    return sendSuccess(res, {
      account,
      credential: { id: user.extensionCredentialId, scopes: user.extensionScopes },
      collectionProtocolVersion: extensionCollectionProtocolVersion,
      liveScreenInternalApi: {
        enabled: liveScreenInternalApiEnabled(),
        contractVersion: liveScreenInternalApiContractVersion,
        adapterVersion: liveScreenInternalApiAdapterVersion
      }
    });
  });

  return router;
}

function parseDeclaredCollectionProtocol(value: string | undefined) {
  if (!value || !/^\d{1,3}$/.test(value)) return null;
  const protocol = Number(value);
  return Number.isInteger(protocol) && protocol > 0 ? protocol : null;
}
