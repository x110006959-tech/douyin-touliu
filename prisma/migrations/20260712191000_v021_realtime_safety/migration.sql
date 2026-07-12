-- CreateEnum
CREATE TYPE "MetricDriftStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "AiCircuitState" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- AlterTable
ALTER TABLE "DataSnapshot" ADD COLUMN     "captureMetaJson" JSONB;

-- CreateTable
CREATE TABLE "MetricAliasOverride" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "pageType" TEXT NOT NULL DEFAULT 'ANY',
    "metricKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricAliasOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricDriftEvent" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "collectionTaskId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "rawField" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "candidateKeysJson" JSONB,
    "status" "MetricDriftStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedMetricKey" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricDriftEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionProposalGate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "collectionTaskId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "nextAllowedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionProposalGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionProposalQuota" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "strongCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionProposalQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProviderCircuit" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "state" "AiCircuitState" NOT NULL DEFAULT 'CLOSED',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "backoffLevel" INTEGER NOT NULL DEFAULT 0,
    "openedUntil" TIMESTAMP(3),
    "halfOpenLeaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderCircuit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricAliasOverride_workspaceId_active_idx" ON "MetricAliasOverride"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "MetricAliasOverride_metricKey_idx" ON "MetricAliasOverride"("metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "MetricAliasOverride_workspaceId_aliasNormalized_pageType_key" ON "MetricAliasOverride"("workspaceId", "aliasNormalized", "pageType");

-- CreateIndex
CREATE UNIQUE INDEX "MetricDriftEvent_dedupeKey_key" ON "MetricDriftEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "MetricDriftEvent_projectId_status_createdAt_idx" ON "MetricDriftEvent"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MetricDriftEvent_collectionTaskId_status_idx" ON "MetricDriftEvent"("collectionTaskId", "status");

-- CreateIndex
CREATE INDEX "MetricDriftEvent_aliasNormalized_idx" ON "MetricDriftEvent"("aliasNormalized");

-- CreateIndex
CREATE INDEX "ActionProposalGate_nextAllowedAt_idx" ON "ActionProposalGate"("nextAllowedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActionProposalGate_projectId_collectionTaskId_actionType_key" ON "ActionProposalGate"("projectId", "collectionTaskId", "actionType");

-- CreateIndex
CREATE INDEX "ActionProposalQuota_windowStart_idx" ON "ActionProposalQuota"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "ActionProposalQuota_projectId_windowStart_key" ON "ActionProposalQuota"("projectId", "windowStart");

-- CreateIndex
CREATE INDEX "AiProviderCircuit_state_openedUntil_idx" ON "AiProviderCircuit"("state", "openedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderCircuit_provider_model_key" ON "AiProviderCircuit"("provider", "model");

-- AddForeignKey
ALTER TABLE "MetricAliasOverride" ADD CONSTRAINT "MetricAliasOverride_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricAliasOverride" ADD CONSTRAINT "MetricAliasOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDriftEvent" ADD CONSTRAINT "MetricDriftEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDriftEvent" ADD CONSTRAINT "MetricDriftEvent_collectionTaskId_fkey" FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDriftEvent" ADD CONSTRAINT "MetricDriftEvent_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "DataSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricDriftEvent" ADD CONSTRAINT "MetricDriftEvent_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposalGate" ADD CONSTRAINT "ActionProposalGate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposalGate" ADD CONSTRAINT "ActionProposalGate_collectionTaskId_fkey" FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposalQuota" ADD CONSTRAINT "ActionProposalQuota_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill active cooldown gates so deploying V0.2.1 cannot immediately emit
-- duplicates for proposals created shortly before the migration.
INSERT INTO "ActionProposalGate" ("id", "projectId", "collectionTaskId", "actionType", "nextAllowedAt", "createdAt", "updatedAt")
SELECT 'gate-' || md5("projectId" || ':' || "collectionTaskId" || ':' || "actionType"::text),
       "projectId", "collectionTaskId", "actionType", MAX("createdAt") + INTERVAL '30 minutes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ActionProposal"
WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
  AND "status" NOT IN ('REJECTED', 'EXPIRED', 'SUPERSEDED')
GROUP BY "projectId", "collectionTaskId", "actionType"
ON CONFLICT ("projectId", "collectionTaskId", "actionType") DO NOTHING;

-- Backfill the current fixed-hour quota using the same safe-action definition
-- as the application.
INSERT INTO "ActionProposalQuota" ("id", "projectId", "windowStart", "strongCount", "version", "createdAt", "updatedAt")
SELECT 'quota-' || md5("projectId" || ':' || date_trunc('hour', "createdAt")::text),
       "projectId", date_trunc('hour', "createdAt"), COUNT(*)::integer, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ActionProposal"
WHERE "createdAt" >= date_trunc('hour', CURRENT_TIMESTAMP)
  AND "actionType" NOT IN ('OBSERVE', 'KEEP_BUDGET', 'CHECK_LIVE_ROOM', 'CHECK_CREATIVE', 'CHECK_AUDIENCE', 'VERIFY_ACTIVITY', 'CALIBRATE_SUBJECT', 'REQUEST_MANUAL_REVIEW')
GROUP BY "projectId", date_trunc('hour', "createdAt")
ON CONFLICT ("projectId", "windowStart") DO NOTHING;
