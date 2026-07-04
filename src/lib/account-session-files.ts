import fs from "node:fs/promises";
import { decryptJson } from "./crypto";
import { prisma } from "./prisma";
import { collectorPath } from "./workspace-paths";

export function accountSessionDir(accountId: string) {
  return collectorPath(".cache", "accounts", accountId);
}

export function accountUserDataDir(accountId: string) {
  return collectorPath(".cache", "accounts", accountId, "browser-profile");
}

export function accountStorageStatePath(accountId: string) {
  return collectorPath(".cache", "accounts", accountId, "storage_state.json");
}

export function accountArtifactsDir(accountId: string) {
  return collectorPath(".cache", "accounts", accountId, "artifacts");
}

export function accountConfirmFile(accountId: string) {
  return collectorPath(".cache", "accounts", accountId, "confirm-login.flag");
}

export function accountLoginDoneFile(accountId: string) {
  return collectorPath(".cache", "accounts", accountId, "login-done.json");
}

export function accountLoginErrorFile(accountId: string) {
  return collectorPath(".cache", "accounts", accountId, "login-error.json");
}

export async function ensureAccountSessionDir(accountId: string) {
  await fs.mkdir(accountSessionDir(accountId), { recursive: true });
}

export async function restoreStorageStateFromVault(accountId: string) {
  const statePath = accountStorageStatePath(accountId);
  try {
    await fs.access(statePath);
    return statePath;
  } catch {
    // Continue and try the encrypted vault.
  }

  const session = await prisma.sessionVault.findFirst({
    where: {
      accountId,
      label: { in: ["live_dashboard", "playwright", "default"] }
    },
    orderBy: { updatedAt: "desc" }
  });
  if (!session) return null;

  const payload = decryptJson<unknown>(session.encryptedPayload, session.encryptionMeta);
  await ensureAccountSessionDir(accountId);
  await fs.writeFile(statePath, JSON.stringify(payload), "utf8");
  return statePath;
}
