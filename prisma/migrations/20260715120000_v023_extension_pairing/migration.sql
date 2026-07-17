CREATE TYPE "ExtensionCredentialScope" AS ENUM ('COLLECT', 'READ_DIAGNOSIS');

CREATE TABLE "ExtensionPairingCode" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionPairingCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "scopes" "ExtensionCredentialScope"[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtensionCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionPairingCode_codeHash_key" ON "ExtensionPairingCode"("codeHash");
CREATE INDEX "ExtensionPairingCode_accountProfileId_expiresAt_idx" ON "ExtensionPairingCode"("accountProfileId", "expiresAt");
CREATE INDEX "ExtensionPairingCode_userId_createdAt_idx" ON "ExtensionPairingCode"("userId", "createdAt");
CREATE UNIQUE INDEX "ExtensionCredential_tokenHash_key" ON "ExtensionCredential"("tokenHash");
CREATE INDEX "ExtensionCredential_accountProfileId_revokedAt_expiresAt_idx" ON "ExtensionCredential"("accountProfileId", "revokedAt", "expiresAt");
CREATE INDEX "ExtensionCredential_userId_createdAt_idx" ON "ExtensionCredential"("userId", "createdAt");

ALTER TABLE "ExtensionPairingCode" ADD CONSTRAINT "ExtensionPairingCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionPairingCode" ADD CONSTRAINT "ExtensionPairingCode_accountProfileId_fkey" FOREIGN KEY ("accountProfileId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionPairingCode" ADD CONSTRAINT "ExtensionPairingCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionCredential" ADD CONSTRAINT "ExtensionCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionCredential" ADD CONSTRAINT "ExtensionCredential_accountProfileId_fkey" FOREIGN KEY ("accountProfileId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionCredential" ADD CONSTRAINT "ExtensionCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
