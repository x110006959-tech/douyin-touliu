import { Router } from "express";
import { cloneProjectSchema, createAccountProfileSchema, createProjectSchema, deleteAccountProfileSchema, updateAccountProfileSchema } from "@douyin-local-life/shared";
import { writeAuditLog } from "../audit.js";
import { isUniqueConstraintError } from "../idempotency.js";
import { readSafeOptionalText } from "../persisted-input.js";
import { prisma } from "../prisma.js";
import { sendError, sendSuccess, validationErrorOptions } from "../response.js";
import { currentUser } from "../server-utils.js";

export function createAccountRouter() {
  const router = Router();

  router.get("/account-profiles", async (req, res) => {
    const user = currentUser(req);
    const accounts = await prisma.accountProfile.findMany({
      where: { workspace: { ownerId: user.id }, status: "ACTIVE" },
      include: {
        projects: {
          where: { status: "ACTIVE" },
          orderBy: { updatedAt: "desc" },
          include: {
            tasks: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                snapshots: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, accountMatchStatus: true } },
                decisionRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } }
              }
            },
            _count: { select: { tasks: true } }
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    return sendSuccess(res, accounts);
  });

  router.post("/account-profiles", async (req, res) => {
    const user = currentUser(req);
    const parsed = createAccountProfileSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "账号资料不完整", validationErrorOptions(parsed.error));
    const input = readAccountProfileText(parsed.data);
    if (input.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", input.error);
    const workspace = parsed.data.workspaceId
      ? await prisma.workspace.findFirst({ where: { id: parsed.data.workspaceId, ownerId: user.id } })
      : await prisma.workspace.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
    if (!workspace) return sendError(res, 404, "WORKSPACE_NOT_FOUND", "默认工作区不存在，请重新登录后再试");
    const identity = accountIdentity(input.accountName || "", input.platformAccountId);
    try {
      const account = await prisma.$transaction(async (tx) => {
        const created = await tx.accountProfile.create({
          data: {
            workspaceId: workspace.id,
            platform: parsed.data.platform,
            platformAccountId: identity.platformAccountId,
            identityKey: identity.identityKey,
            accountName: input.accountName || "",
            normalizedName: identity.normalizedName,
            merchantName: input.merchantName,
            storeName: input.storeName,
            memo: input.memo,
            identityStatus: identity.platformAccountId ? "VERIFIED" : "PENDING_ID"
          }
        });
        await writeAuditLog(req, "ACCOUNT_PROFILE_CREATED", {
          workspaceId: workspace.id,
          detailJson: { accountProfileId: created.id, platform: created.platform, identityStatus: created.identityStatus }
        }, tx);
        return created;
      });
      return sendSuccess(res, account, 201);
    } catch (error) {
      if (isUniqueConstraintError(error)) return sendError(res, 409, "ACCOUNT_PROFILE_DUPLICATE", "该平台账号已经存在，请直接选择已有账号");
      throw error;
    }
  });

  router.get("/account-profiles/:id", async (req, res) => {
    const account = await ownedAccount(currentUser(req).id, req.params.id);
    if (!account) return sendError(res, 404, "ACCOUNT_PROFILE_NOT_FOUND", "账号档案不存在");
    return sendSuccess(res, account);
  });

  router.patch("/account-profiles/:id", async (req, res) => {
    const user = currentUser(req);
    const account = await ownedAccount(user.id, req.params.id);
    if (!account) return sendError(res, 404, "ACCOUNT_PROFILE_NOT_FOUND", "账号档案不存在");
    const parsed = updateAccountProfileSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "账号资料不合法", validationErrorOptions(parsed.error));
    const input = readAccountProfileText(parsed.data);
    if (input.error) return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", input.error);
    const accountName = input.accountName === undefined ? account.accountName : input.accountName || account.accountName;
    const platformAccountId = input.platformAccountId === undefined ? account.platformAccountId : input.platformAccountId;
    const identity = accountIdentity(accountName, platformAccountId);
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.accountProfile.update({
          where: { id: account.id },
          data: {
            accountName,
            platformAccountId: identity.platformAccountId,
            identityKey: identity.identityKey,
            normalizedName: identity.normalizedName,
            identityStatus: identity.platformAccountId ? "VERIFIED" : "PENDING_ID",
            merchantName: input.merchantName === undefined ? account.merchantName : input.merchantName,
            storeName: input.storeName === undefined ? account.storeName : input.storeName,
            memo: input.memo === undefined ? account.memo : input.memo
          }
        });
        await writeAuditLog(req, "ACCOUNT_PROFILE_UPDATED", {
          workspaceId: account.workspaceId,
          detailJson: { accountProfileId: account.id, identityStatus: saved.identityStatus }
        }, tx);
        return saved;
      });
      return sendSuccess(res, updated);
    } catch (error) {
      if (isUniqueConstraintError(error)) return sendError(res, 409, "ACCOUNT_PROFILE_DUPLICATE", "该平台账号已经存在，不能重复建档");
      throw error;
    }
  });

  router.delete("/account-profiles/:id", async (req, res) => {
    const user = currentUser(req);
    const parsed = deleteAccountProfileSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "请确认要删除的账号", validationErrorOptions(parsed.error));

    const account = await prisma.accountProfile.findFirst({
      where: { id: req.params.id, workspace: { ownerId: user.id } }
    });
    if (!account) return sendError(res, 404, "ACCOUNT_PROFILE_NOT_FOUND", "账号档案不存在或已经删除");
    if (parsed.data.accountName !== account.accountName) {
      return sendError(res, 409, "ACCOUNT_DELETE_CONFIRMATION_MISMATCH", "账号名称已变化，请刷新页面后重新确认删除");
    }
    try {
      const deleted = await prisma.$transaction(async (tx) => {
        const projectCount = await tx.project.count({ where: { accountProfileId: account.id } });
        const taskCount = await tx.collectionTask.count({ where: { project: { accountProfileId: account.id } } });
        await tx.project.deleteMany({ where: { accountProfileId: account.id } });
        await tx.accountProfile.delete({ where: { id: account.id } });
        await writeAuditLog(req, "ACCOUNT_PROFILE_DELETED", {
          workspaceId: account.workspaceId,
          detailJson: {
            accountProfileId: account.id,
            accountName: account.accountName,
            platform: account.platform,
            projectCount,
            taskCount
          }
        }, tx);
        return { id: account.id, projectCount, taskCount };
      }, { isolationLevel: "Serializable" });
      return sendSuccess(res, deleted);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2025") return sendError(res, 404, "ACCOUNT_PROFILE_NOT_FOUND", "账号档案不存在或已经删除");
      if (code === "P2003" || code === "P2034") return sendError(res, 409, "ACCOUNT_DELETE_CONFLICT", "账号数据正在变化，请刷新页面后重试");
      throw error;
    }
  });

  router.post("/projects/:id/clone", async (req, res) => {
    const user = currentUser(req);
    const parsed = cloneProjectSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "新项目信息不完整", validationErrorOptions(parsed.error));
    const projectNameInput = readSafeOptionalText(parsed.data.name, 100);
    const serviceProviderNameInput = readSafeOptionalText(parsed.data.serviceProviderName, 100);
    if (projectNameInput.error || serviceProviderNameInput.error) {
      return sendError(res, 400, "SENSITIVE_DATA_FORBIDDEN", projectNameInput.error || serviceProviderNameInput.error || "输入包含敏感认证信息，已拒绝保存");
    }
    const projectName = projectNameInput.value;
    if (!projectName) return sendError(res, 400, "VALIDATION_ERROR", "请填写新项目名称");
    const source = await prisma.project.findFirst({
      where: { id: req.params.id, workspace: { ownerId: user.id } },
      include: { accountProfile: true }
    });
    if (!source) return sendError(res, 404, "PROJECT_NOT_FOUND", "源项目不存在");
    if (parsed.data.accountProfileId && parsed.data.accountProfileId !== source.accountProfileId) {
      return sendError(res, 409, "CROSS_ACCOUNT_CLONE_FORBIDDEN", "不同平台账号之间不能复制项目配置");
    }
    const subjectType = parsed.data.subjectType ?? source.subjectType;
    const operatorType = parsed.data.operatorType ?? source.operatorType;
    const cooperationType = parsed.data.cooperationType ?? source.cooperationType;
    const serviceProviderName = parsed.data.serviceProviderName === undefined
      ? source.serviceProviderName
      : serviceProviderNameInput.value;
    const serviceFee = parsed.data.serviceFee === undefined ? source.serviceFee : parsed.data.serviceFee;
    const subjectChanged = subjectType !== source.subjectType
      || operatorType !== source.operatorType
      || cooperationType !== source.cooperationType;
    const usesServiceProvider = subjectType === "SERVICE_PROVIDER"
      || operatorType === "SERVICE_PROVIDER_LIVE"
      || operatorType === "SERVICE_PROVIDER_OPERATION";
    const merged = createProjectSchema.safeParse({
      accountProfileId: source.accountProfileId,
      name: projectName,
      businessType: source.businessType,
      subjectType,
      operatorType,
      cooperationType,
      controlLevel: subjectChanged ? "PENDING" : source.controlLevel,
      subjectConfidence: subjectChanged ? 1 : source.subjectConfidence,
      serviceProviderName: usesServiceProvider ? serviceProviderName : null,
      serviceMode: operatorType === "SERVICE_PROVIDER_LIVE"
        ? "代播"
        : operatorType === "SERVICE_PROVIDER_OPERATION"
          ? "代运营"
          : null,
      serviceFee: usesServiceProvider ? serviceFee : null
    });
    if (!merged.success) {
      return sendError(res, 400, "VALIDATION_ERROR", merged.error.issues[0]?.message || "新项目配置不完整", validationErrorOptions(merged.error));
    }
    const cloned = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          workspaceId: source.workspaceId,
          accountProfileId: source.accountProfileId,
          name: merged.data.name,
          businessType: merged.data.businessType,
          subjectType: merged.data.subjectType,
          operatorType: merged.data.operatorType,
          cooperationType: merged.data.cooperationType,
          controlLevel: merged.data.controlLevel,
          subjectConfidence: merged.data.subjectConfidence,
          serviceProviderName: merged.data.serviceProviderName || null,
          serviceMode: merged.data.serviceMode || null,
          serviceFee: merged.data.serviceFee ?? null
        }
      });
      await writeAuditLog(req, "PROJECT_CONFIG_CLONED", {
        workspaceId: source.workspaceId,
        projectId: project.id,
        detailJson: {
          sourceProjectId: source.id,
          accountProfileId: source.accountProfileId,
          editableOverridesApplied: {
            subjectType: project.subjectType !== source.subjectType,
            operatorType: project.operatorType !== source.operatorType,
            cooperationType: project.cooperationType !== source.cooperationType,
            serviceProviderName: project.serviceProviderName !== source.serviceProviderName,
            serviceFee: project.serviceFee !== source.serviceFee
          }
        }
      }, tx);
      return project;
    });
    return sendSuccess(res, cloned, 201);
  });

  return router;
}

function readAccountProfileText(value: {
  accountName?: string;
  platformAccountId?: string | null;
  merchantName?: string | null;
  storeName?: string | null;
  memo?: string | null;
}) {
  const accountName = value.accountName === undefined ? undefined : readSafeOptionalText(value.accountName, 100);
  const platformAccountId = value.platformAccountId === undefined ? undefined : readSafeOptionalText(value.platformAccountId, 200);
  const merchantName = value.merchantName === undefined ? undefined : readSafeOptionalText(value.merchantName, 100);
  const storeName = value.storeName === undefined ? undefined : readSafeOptionalText(value.storeName, 100);
  const memo = value.memo === undefined ? undefined : readSafeOptionalText(value.memo, 1_000);
  const error = accountName?.error || platformAccountId?.error || merchantName?.error || storeName?.error || memo?.error || null;
  return {
    error,
    accountName: accountName?.value,
    platformAccountId: platformAccountId?.value,
    merchantName: merchantName?.value,
    storeName: storeName?.value,
    memo: memo?.value
  };
}

export function normalizeAccountValue(value: string | null | undefined) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

export function accountIdentity(accountName: string, platformAccountId?: string | null) {
  const normalizedName = normalizeAccountValue(accountName);
  const normalizedId = normalizeAccountValue(platformAccountId);
  return {
    normalizedName,
    platformAccountId: normalizedId || null,
    identityKey: normalizedId ? `id:${normalizedId}` : `name:${normalizedName}`
  };
}

export function ownedAccount(userId: string, accountProfileId: string) {
  return prisma.accountProfile.findFirst({
    where: { id: accountProfileId, workspace: { ownerId: userId } },
    include: {
      projects: {
        orderBy: { updatedAt: "desc" },
        include: {
          tasks: { orderBy: { createdAt: "desc" }, take: 20, include: { routeSources: true } },
          _count: { select: { tasks: true } }
        }
      }
    }
  });
}
