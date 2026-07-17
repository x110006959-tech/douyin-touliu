CREATE TYPE "AccountProfileStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AccountIdentityStatus" AS ENUM ('PENDING_ID', 'VERIFIED');
CREATE TYPE "AccountMatchStatus" AS ENUM ('MATCHED', 'MISMATCHED', 'UNVERIFIED');
CREATE TYPE "CollectionRouteSourceStatus" AS ENUM ('PENDING', 'CAPTURED', 'FAILED');

CREATE TABLE "AccountProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'DOUYIN_LOCAL_LIFE',
    "platformAccountId" TEXT,
    "identityKey" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "merchantName" TEXT,
    "storeName" TEXT,
    "memo" TEXT,
    "identityStatus" "AccountIdentityStatus" NOT NULL DEFAULT 'PENDING_ID',
    "status" "AccountProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project" ADD COLUMN "accountProfileId" TEXT;

INSERT INTO "AccountProfile" (
    "id", "workspaceId", "platform", "platformAccountId", "identityKey", "accountName", "normalizedName", "identityStatus", "status", "createdAt", "updatedAt"
)
SELECT
    'legacy_' || md5(p."id"),
    p."workspaceId",
    'DOUYIN_LOCAL_LIFE',
    NULL,
    'legacy-project:' || p."id",
    p."name",
    lower(trim(p."name")),
    'PENDING_ID'::"AccountIdentityStatus",
    'ACTIVE'::"AccountProfileStatus",
    p."createdAt",
    p."updatedAt"
FROM "Project" p;

UPDATE "Project" p
SET "accountProfileId" = 'legacy_' || md5(p."id");

ALTER TABLE "Project" ALTER COLUMN "accountProfileId" SET NOT NULL;
ALTER TABLE "CollectionTask" ADD COLUMN "idempotencyKey" TEXT;

CREATE TABLE "CollectionRouteSource" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "status" "CollectionRouteSourceStatus" NOT NULL DEFAULT 'PENDING',
    "lastCapturedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionRouteSource_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CollectionRouteSource" ("id", "taskId", "routeKey", "label", "sourceUrl", "required")
SELECT 'route_dashboard_' || md5(t."id"), t."id", 'LOCAL_PROMOTION_DASHBOARD', '巨量本地推数据总览',
       CASE WHEN t."sourceUrl" ILIKE '%local%' OR t."sourceUrl" ILIKE '%promotion%' THEN t."sourceUrl" ELSE NULL END, true
FROM "CollectionTask" t
UNION ALL
SELECT 'route_live_' || md5(t."id"), t."id", 'LIVE_DATA_SCREEN', '直播数据大屏概览',
       CASE WHEN t."sourceUrl" ILIKE '%live%' OR t."sourceUrl" ILIKE '%room%' THEN t."sourceUrl" ELSE NULL END, true
FROM "CollectionTask" t
UNION ALL
SELECT 'route_task_' || md5(t."id"), t."id", 'TASK_TABLE', '巨量本地推任务列表', NULL, true
FROM "CollectionTask" t
UNION ALL
SELECT 'route_product_' || md5(t."id"), t."id", 'LIVE_PRODUCT_TAB', '直播大屏商品页', NULL, false
FROM "CollectionTask" t
UNION ALL
SELECT 'route_traffic_' || md5(t."id"), t."id", 'LIVE_TRAFFIC_TAB', '直播大屏流量页', NULL, false
FROM "CollectionTask" t;

ALTER TABLE "DataSnapshot"
  ADD COLUMN "accountMatchStatus" "AccountMatchStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "detectedAccountId" TEXT,
  ADD COLUMN "detectedAccountName" TEXT,
  ADD COLUMN "accountMatchEvidence" JSONB,
  ADD COLUMN "accountConfirmedById" TEXT,
  ADD COLUMN "accountConfirmedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AccountProfile_workspaceId_platform_identityKey_key" ON "AccountProfile"("workspaceId", "platform", "identityKey");
CREATE INDEX "AccountProfile_workspaceId_status_idx" ON "AccountProfile"("workspaceId", "status");
CREATE INDEX "AccountProfile_platformAccountId_idx" ON "AccountProfile"("platformAccountId");
CREATE INDEX "AccountProfile_normalizedName_idx" ON "AccountProfile"("normalizedName");
CREATE INDEX "Project_accountProfileId_status_idx" ON "Project"("accountProfileId", "status");
CREATE UNIQUE INDEX "CollectionTask_projectId_idempotencyKey_key" ON "CollectionTask"("projectId", "idempotencyKey");
CREATE UNIQUE INDEX "CollectionRouteSource_taskId_routeKey_key" ON "CollectionRouteSource"("taskId", "routeKey");
CREATE INDEX "CollectionRouteSource_taskId_status_idx" ON "CollectionRouteSource"("taskId", "status");
CREATE INDEX "DataSnapshot_taskId_accountMatchStatus_idx" ON "DataSnapshot"("taskId", "accountMatchStatus");

ALTER TABLE "AccountProfile" ADD CONSTRAINT "AccountProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_accountProfileId_fkey" FOREIGN KEY ("accountProfileId") REFERENCES "AccountProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollectionRouteSource" ADD CONSTRAINT "CollectionRouteSource_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataSnapshot" ADD CONSTRAINT "DataSnapshot_accountConfirmedById_fkey" FOREIGN KEY ("accountConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
