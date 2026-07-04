import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import type { AccountProfile } from "@prisma/client";
import {
  accountConfirmFile,
  accountLoginDoneFile,
  accountLoginErrorFile,
  accountStorageStatePath,
  accountUserDataDir,
  ensureAccountSessionDir
} from "./account-session-files";
import { encryptJson } from "./crypto";
import { prisma } from "./prisma";
import { collectorPath } from "./workspace-paths";

function pythonCommand() {
  return process.env.COLLECTOR_PYTHON || (process.platform === "win32" ? "py" : "python");
}

function liveDashboardScriptPath() {
  return collectorPath("live_dashboard_collector.py");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function startAccountLoginFlow(account: AccountProfile) {
  if (!account.loginEntryUrl) {
    throw new Error("账号缺少登录入口 URL");
  }
  await ensureAccountSessionDir(account.id);
  await Promise.all([
    fs.rm(accountConfirmFile(account.id), { force: true }),
    fs.rm(accountLoginDoneFile(account.id), { force: true }),
    fs.rm(accountLoginErrorFile(account.id), { force: true })
  ]);

  const child = spawn(
    pythonCommand(),
    [
      liveDashboardScriptPath(),
      "prepare-login",
      "--account-id",
      account.id,
      "--url",
      account.loginEntryUrl,
      "--user-data-dir",
      accountUserDataDir(account.id),
      "--state-file",
      accountStorageStatePath(account.id),
      "--confirm-file",
      accountConfirmFile(account.id),
      "--done-file",
      accountLoginDoneFile(account.id),
      "--error-file",
      accountLoginErrorFile(account.id)
    ],
    {
      env: process.env,
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }
  );
  child.unref();

  await prisma.accountProfile.update({
    where: { id: account.id },
    data: { sessionStatus: "login_pending" }
  });

  return {
    accountId: account.id,
    loginEntryUrl: account.loginEntryUrl,
    status: "login_pending"
  };
}

export async function confirmAccountLoginFlow(account: AccountProfile) {
  await ensureAccountSessionDir(account.id);
  await fs.writeFile(accountConfirmFile(account.id), new Date().toISOString(), "utf8");

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const done = await readJsonFile<{ status: string }>(accountLoginDoneFile(account.id));
    if (done?.status === "confirmed") {
      const storageState = await readJsonFile<unknown>(accountStorageStatePath(account.id));
      if (!storageState) throw new Error("登录确认完成，但未读取到浏览器登录态");
      const encrypted = encryptJson(storageState);
      const session = await prisma.sessionVault.upsert({
        where: {
          accountId_label: {
            accountId: account.id,
            label: "live_dashboard"
          }
        },
        update: {
          encryptedPayload: encrypted.encryptedPayload,
          encryptionMeta: encrypted.encryptionMeta,
          containsPassword: false
        },
        create: {
          accountId: account.id,
          label: "live_dashboard",
          encryptedPayload: encrypted.encryptedPayload,
          encryptionMeta: encrypted.encryptionMeta,
          containsPassword: false
        }
      });
      await prisma.accountProfile.update({
        where: { id: account.id },
        data: { sessionStatus: "active", lastLoginAt: new Date() }
      });
      const existingJob = await prisma.collectionJob.findFirst({
        where: {
          accountId: account.id,
          type: "live_dashboard"
        }
      });
      return {
        accountId: account.id,
        sessionId: session.id,
        collectionJobId: existingJob?.id,
        status: "active"
      };
    }

    const error = await readJsonFile<{ reason?: string }>(accountLoginErrorFile(account.id));
    if (error?.reason) {
      await prisma.accountProfile.update({
        where: { id: account.id },
        data: { sessionStatus: "failed" }
      });
      throw new Error(error.reason);
    }
    await delay(500);
  }

  return {
    accountId: account.id,
    status: "confirm_pending"
  };
}
