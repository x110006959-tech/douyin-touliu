CREATE TYPE "ProjectHistorySessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ProjectHistoryArchiveStatus" AS ENUM ('QUEUED', 'SUCCEEDED', 'FAILED', 'REUSED');

ALTER TABLE "DecisionRun" ADD COLUMN "inputFingerprint" TEXT;

CREATE TABLE "ProjectHistorySession" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "status" "ProjectHistorySessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  "archiveReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectHistorySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectHistoryMetricPoint" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "collectionTaskId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "routeKey" TEXT NOT NULL,
  "pageType" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "bucketAt" TIMESTAMP(3) NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "metricsJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectHistoryMetricPoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectAnalysisArchive" (
  "id" TEXT NOT NULL,
  "archiveKey" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "collectionTaskId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "decisionRunId" TEXT,
  "status" "ProjectHistoryArchiveStatus" NOT NULL DEFAULT 'QUEUED',
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metricsJson" JSONB NOT NULL,
  "historyContextJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectAnalysisArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectHistoryMetricPoint_sessionId_routeKey_bucketAt_key"
  ON "ProjectHistoryMetricPoint"("sessionId", "routeKey", "bucketAt");
CREATE UNIQUE INDEX "ProjectAnalysisArchive_archiveKey_key" ON "ProjectAnalysisArchive"("archiveKey");
CREATE INDEX "DecisionRun_collectionTaskId_inputFingerprint_idx" ON "DecisionRun"("collectionTaskId", "inputFingerprint");
CREATE INDEX "ProjectHistorySession_projectId_status_lastActivityAt_idx"
  ON "ProjectHistorySession"("projectId", "status", "lastActivityAt");
CREATE INDEX "ProjectHistorySession_projectId_archivedAt_idx" ON "ProjectHistorySession"("projectId", "archivedAt");
CREATE INDEX "ProjectHistoryMetricPoint_projectId_observedAt_idx" ON "ProjectHistoryMetricPoint"("projectId", "observedAt");
CREATE INDEX "ProjectHistoryMetricPoint_collectionTaskId_observedAt_idx"
  ON "ProjectHistoryMetricPoint"("collectionTaskId", "observedAt");
CREATE INDEX "ProjectAnalysisArchive_projectId_archivedAt_idx" ON "ProjectAnalysisArchive"("projectId", "archivedAt");
CREATE INDEX "ProjectAnalysisArchive_collectionTaskId_archivedAt_idx"
  ON "ProjectAnalysisArchive"("collectionTaskId", "archivedAt");
CREATE INDEX "ProjectAnalysisArchive_decisionRunId_idx" ON "ProjectAnalysisArchive"("decisionRunId");

ALTER TABLE "ProjectHistorySession" ADD CONSTRAINT "ProjectHistorySession_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectHistoryMetricPoint" ADD CONSTRAINT "ProjectHistoryMetricPoint_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectHistoryMetricPoint" ADD CONSTRAINT "ProjectHistoryMetricPoint_collectionTaskId_fkey"
  FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectHistoryMetricPoint" ADD CONSTRAINT "ProjectHistoryMetricPoint_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ProjectHistorySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAnalysisArchive" ADD CONSTRAINT "ProjectAnalysisArchive_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAnalysisArchive" ADD CONSTRAINT "ProjectAnalysisArchive_collectionTaskId_fkey"
  FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAnalysisArchive" ADD CONSTRAINT "ProjectAnalysisArchive_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ProjectHistorySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAnalysisArchive" ADD CONSTRAINT "ProjectAnalysisArchive_decisionRunId_fkey"
  FOREIGN KEY ("decisionRunId") REFERENCES "DecisionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
