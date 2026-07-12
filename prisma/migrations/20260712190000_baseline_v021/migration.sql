-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('DOUYIN_LOCAL_LIFE');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('SUBJECT_PENDING', 'MERCHANT_OFFICIAL', 'PROFESSIONAL', 'EXTERNAL_CREATOR', 'CREATOR_MATRIX', 'SERVICE_PROVIDER', 'PLATFORM_EVENT', 'BRAND_REGION_MATRIX');

-- CreateEnum
CREATE TYPE "OperatorType" AS ENUM ('OPERATOR_PENDING', 'MERCHANT_SELF', 'SERVICE_PROVIDER_LIVE', 'SERVICE_PROVIDER_OPERATION', 'CREATOR_SELF', 'AGENCY_LEADER', 'PLATFORM_OPERATION', 'BRAND_REGION');

-- CreateEnum
CREATE TYPE "CooperationType" AS ENUM ('COOPERATION_PENDING', 'NONE', 'PROFESSIONAL_BINDING', 'CREATOR_COOPERATION', 'SERVICE_PROVIDER_CONTRACT', 'PLATFORM_INVITATION', 'BRAND_MATRIX');

-- CreateEnum
CREATE TYPE "ControlLevel" AS ENUM ('PENDING', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CollectionTaskStatus" AS ENUM ('PENDING', 'COLLECTING', 'REVIEWING', 'UPLOADED', 'PROCESSING', 'ANALYZED', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('OBSERVE', 'INCREASE_BUDGET', 'DECREASE_BUDGET', 'KEEP_BUDGET', 'FINE_TUNE_TARGETING', 'DECREASE_BID', 'PAUSE_TASK', 'ADJUST_ROI_TARGET', 'CHECK_LIVE_ROOM', 'CHECK_CREATIVE', 'CHECK_AUDIENCE', 'VERIFY_ACTIVITY', 'APPLY_ACTIVITY', 'OPTIMIZE_SCRIPT', 'REPAIR_REPUTATION', 'STRENGTHEN_SHELF', 'CHECK_INVENTORY_BOOKING', 'OPTIMIZE_POI_SEARCH', 'REPLACE_CREATOR', 'UNIFY_CREATOR_SCRIPT', 'ADJUST_SERVICE_PROVIDER_SOP', 'RENEGOTIATE_SERVICE_FEE', 'REUSE_MATERIAL', 'ALLOCATE_HIGH_VERIFY_STORES', 'CALIBRATE_SUBJECT', 'REQUEST_MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "ActionProposalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'OBSERVING', 'MANUAL_EXECUTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CollectionRunStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'STOPPED', 'DEGRADED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'REJECT', 'APPROVED', 'REJECTED', 'OBSERVE');

-- CreateEnum
CREATE TYPE "ExecutionMode" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'MANUAL_EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutcomeObservationWindow" AS ENUM ('THIRTY_MINUTES', 'TWO_HOURS', 'ONE_DAY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ActionOutcomeResult" AS ENUM ('IMPROVED', 'WORSENED', 'NO_CHANGE', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('XHR_JSON', 'TABLE', 'DOM_TEXT', 'SCREENSHOT', 'MANUAL_INPUT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MetricReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'MODIFIED', 'IGNORED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessType" "BusinessType" NOT NULL DEFAULT 'DOUYIN_LOCAL_LIFE',
    "subjectType" "SubjectType" NOT NULL DEFAULT 'SUBJECT_PENDING',
    "operatorType" "OperatorType" NOT NULL DEFAULT 'OPERATOR_PENDING',
    "cooperationType" "CooperationType" NOT NULL DEFAULT 'COOPERATION_PENDING',
    "controlLevel" "ControlLevel" NOT NULL DEFAULT 'PENDING',
    "subjectConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serviceProviderName" TEXT,
    "serviceMode" TEXT,
    "serviceFee" DOUBLE PRECISION,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CollectionTaskStatus" NOT NULL DEFAULT 'PENDING',
    "sourceUrl" TEXT,
    "pageTitle" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" "CollectionRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "requiredRoutesJson" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSnapshotAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRouteHeartbeat" (
    "id" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionRouteHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSnapshot" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "pageType" TEXT,
    "rawDomText" TEXT,
    "rawNetworkJson" JSONB,
    "rawTableData" JSONB,
    "visibleMetricsJson" JSONB,
    "screenshotUrl" TEXT,
    "localCollectedAt" TIMESTAMP(3) NOT NULL,
    "collectionRunId" TEXT,
    "routeKey" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedMetric" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricValue" TEXT NOT NULL,
    "metricUnit" TEXT,
    "metricSource" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "rawEvidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizedMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewedMetric" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "normalizedMetricId" TEXT,
    "metricKey" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "originalValue" TEXT,
    "reviewedValue" TEXT,
    "metricUnit" TEXT,
    "metricSource" "MetricSource" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "rawEvidence" JSONB,
    "pageType" TEXT,
    "scope" TEXT,
    "timeRange" TEXT,
    "reviewStatus" "MetricReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewedMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAnalysisTask" (
    "id" TEXT NOT NULL,
    "collectionTaskId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAnalysisTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "aiAnalysisTaskId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "problemsJson" JSONB,
    "suggestionsJson" JSONB,
    "manualCheckItemsJson" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "collectionTaskId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "aiAnalysisTaskId" TEXT,
    "engineVersion" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "strategyVersion" TEXT NOT NULL DEFAULT 'local-life-rules-v0.1.0',
    "inputJson" JSONB,
    "riskLevel" "RiskLevel" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "ruleResultJson" JSONB NOT NULL,
    "aiResultJson" JSONB,
    "finalResultJson" JSONB NOT NULL,
    "manualCheckItemsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionProposal" (
    "id" TEXT NOT NULL,
    "decisionRunId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "collectionTaskId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "reason" TEXT NOT NULL,
    "expectedImpact" TEXT,
    "riskLevel" "RiskLevel" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "blockedReason" TEXT,
    "status" "ActionProposalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3),
    "manualExecutedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "ActionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "actionProposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionLog" (
    "id" TEXT NOT NULL,
    "actionProposalId" TEXT NOT NULL,
    "projectId" TEXT,
    "collectionTaskId" TEXT,
    "userId" TEXT NOT NULL,
    "mode" "ExecutionMode" NOT NULL DEFAULT 'MANUAL',
    "status" "ExecutionStatus" NOT NULL DEFAULT 'MANUAL_EXECUTED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionOutcome" (
    "id" TEXT NOT NULL,
    "actionProposalId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "projectId" TEXT NOT NULL,
    "collectionTaskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "observationWindow" "OutcomeObservationWindow" NOT NULL,
    "customWindow" TEXT,
    "beforeMetricsJson" JSONB,
    "afterMetricsJson" JSONB,
    "result" "ActionOutcomeResult" NOT NULL,
    "note" TEXT,
    "conclusion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subjectType" "SubjectType",
    "actionType" "ActionType",
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditionJson" JSONB NOT NULL,
    "effectJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "action" TEXT NOT NULL,
    "detailJson" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

-- CreateIndex
CREATE INDEX "Project_subjectType_operatorType_idx" ON "Project"("subjectType", "operatorType");

-- CreateIndex
CREATE INDEX "CollectionTask_projectId_idx" ON "CollectionTask"("projectId");

-- CreateIndex
CREATE INDEX "CollectionTask_userId_idx" ON "CollectionTask"("userId");

-- CreateIndex
CREATE INDEX "CollectionTask_status_idx" ON "CollectionTask"("status");

-- CreateIndex
CREATE INDEX "CollectionRun_taskId_createdAt_idx" ON "CollectionRun"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "CollectionRun_status_idx" ON "CollectionRun"("status");

-- CreateIndex
CREATE INDEX "CollectionRouteHeartbeat_collectionRunId_consecutiveFailure_idx" ON "CollectionRouteHeartbeat"("collectionRunId", "consecutiveFailures");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionRouteHeartbeat_collectionRunId_routeKey_key" ON "CollectionRouteHeartbeat"("collectionRunId", "routeKey");

-- CreateIndex
CREATE INDEX "DataSnapshot_taskId_idx" ON "DataSnapshot"("taskId");

-- CreateIndex
CREATE INDEX "DataSnapshot_collectionRunId_routeKey_idx" ON "DataSnapshot"("collectionRunId", "routeKey");

-- CreateIndex
CREATE UNIQUE INDEX "DataSnapshot_taskId_idempotencyKey_key" ON "DataSnapshot"("taskId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "NormalizedMetric_snapshotId_idx" ON "NormalizedMetric"("snapshotId");

-- CreateIndex
CREATE INDEX "NormalizedMetric_metricKey_idx" ON "NormalizedMetric"("metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewedMetric_normalizedMetricId_key" ON "ReviewedMetric"("normalizedMetricId");

-- CreateIndex
CREATE INDEX "ReviewedMetric_taskId_idx" ON "ReviewedMetric"("taskId");

-- CreateIndex
CREATE INDEX "ReviewedMetric_snapshotId_idx" ON "ReviewedMetric"("snapshotId");

-- CreateIndex
CREATE INDEX "ReviewedMetric_metricKey_idx" ON "ReviewedMetric"("metricKey");

-- CreateIndex
CREATE INDEX "ReviewedMetric_metricSource_idx" ON "ReviewedMetric"("metricSource");

-- CreateIndex
CREATE INDEX "ReviewedMetric_reviewStatus_idx" ON "ReviewedMetric"("reviewStatus");

-- CreateIndex
CREATE INDEX "ReviewedMetric_reviewerId_idx" ON "ReviewedMetric"("reviewerId");

-- CreateIndex
CREATE INDEX "AiAnalysisTask_collectionTaskId_idx" ON "AiAnalysisTask"("collectionTaskId");

-- CreateIndex
CREATE INDEX "AiAnalysisTask_status_idx" ON "AiAnalysisTask"("status");

-- CreateIndex
CREATE INDEX "Recommendation_aiAnalysisTaskId_idx" ON "Recommendation"("aiAnalysisTaskId");

-- CreateIndex
CREATE INDEX "Recommendation_createdAt_idx" ON "Recommendation"("createdAt");

-- CreateIndex
CREATE INDEX "DecisionRun_projectId_idx" ON "DecisionRun"("projectId");

-- CreateIndex
CREATE INDEX "DecisionRun_collectionTaskId_idx" ON "DecisionRun"("collectionTaskId");

-- CreateIndex
CREATE INDEX "DecisionRun_aiAnalysisTaskId_idx" ON "DecisionRun"("aiAnalysisTaskId");

-- CreateIndex
CREATE INDEX "DecisionRun_createdAt_idx" ON "DecisionRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRun_collectionTaskId_idempotencyKey_key" ON "DecisionRun"("collectionTaskId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ActionProposal_decisionRunId_idx" ON "ActionProposal"("decisionRunId");

-- CreateIndex
CREATE INDEX "ActionProposal_projectId_idx" ON "ActionProposal"("projectId");

-- CreateIndex
CREATE INDEX "ActionProposal_collectionTaskId_idx" ON "ActionProposal"("collectionTaskId");

-- CreateIndex
CREATE INDEX "ActionProposal_status_idx" ON "ActionProposal"("status");

-- CreateIndex
CREATE INDEX "ActionProposal_actionType_idx" ON "ActionProposal"("actionType");

-- CreateIndex
CREATE INDEX "ActionProposal_projectId_dedupeKey_createdAt_idx" ON "ActionProposal"("projectId", "dedupeKey", "createdAt");

-- CreateIndex
CREATE INDEX "ActionProposal_expiresAt_idx" ON "ActionProposal"("expiresAt");

-- CreateIndex
CREATE INDEX "ApprovalRecord_actionProposalId_idx" ON "ApprovalRecord"("actionProposalId");

-- CreateIndex
CREATE INDEX "ApprovalRecord_userId_idx" ON "ApprovalRecord"("userId");

-- CreateIndex
CREATE INDEX "ApprovalRecord_decision_idx" ON "ApprovalRecord"("decision");

-- CreateIndex
CREATE INDEX "ExecutionLog_actionProposalId_idx" ON "ExecutionLog"("actionProposalId");

-- CreateIndex
CREATE INDEX "ExecutionLog_projectId_idx" ON "ExecutionLog"("projectId");

-- CreateIndex
CREATE INDEX "ExecutionLog_collectionTaskId_idx" ON "ExecutionLog"("collectionTaskId");

-- CreateIndex
CREATE INDEX "ExecutionLog_userId_idx" ON "ExecutionLog"("userId");

-- CreateIndex
CREATE INDEX "ExecutionLog_status_idx" ON "ExecutionLog"("status");

-- CreateIndex
CREATE INDEX "ActionOutcome_actionProposalId_idx" ON "ActionOutcome"("actionProposalId");

-- CreateIndex
CREATE INDEX "ActionOutcome_projectId_idx" ON "ActionOutcome"("projectId");

-- CreateIndex
CREATE INDEX "ActionOutcome_collectionTaskId_idx" ON "ActionOutcome"("collectionTaskId");

-- CreateIndex
CREATE INDEX "ActionOutcome_userId_idx" ON "ActionOutcome"("userId");

-- CreateIndex
CREATE INDEX "ActionOutcome_result_idx" ON "ActionOutcome"("result");

-- CreateIndex
CREATE INDEX "ActionOutcome_createdAt_idx" ON "ActionOutcome"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActionOutcome_actionProposalId_idempotencyKey_key" ON "ActionOutcome"("actionProposalId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StrategyRule_projectId_idx" ON "StrategyRule"("projectId");

-- CreateIndex
CREATE INDEX "StrategyRule_subjectType_idx" ON "StrategyRule"("subjectType");

-- CreateIndex
CREATE INDEX "StrategyRule_actionType_idx" ON "StrategyRule"("actionType");

-- CreateIndex
CREATE INDEX "StrategyRule_enabled_idx" ON "StrategyRule"("enabled");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_idx" ON "AuditLog"("workspaceId");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_idx" ON "AuditLog"("projectId");

-- CreateIndex
CREATE INDEX "AuditLog_taskId_idx" ON "AuditLog"("taskId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTask" ADD CONSTRAINT "CollectionTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTask" ADD CONSTRAINT "CollectionTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRouteHeartbeat" ADD CONSTRAINT "CollectionRouteHeartbeat_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSnapshot" ADD CONSTRAINT "DataSnapshot_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSnapshot" ADD CONSTRAINT "DataSnapshot_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NormalizedMetric" ADD CONSTRAINT "NormalizedMetric_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "DataSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewedMetric" ADD CONSTRAINT "ReviewedMetric_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewedMetric" ADD CONSTRAINT "ReviewedMetric_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "DataSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewedMetric" ADD CONSTRAINT "ReviewedMetric_normalizedMetricId_fkey" FOREIGN KEY ("normalizedMetricId") REFERENCES "NormalizedMetric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewedMetric" ADD CONSTRAINT "ReviewedMetric_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAnalysisTask" ADD CONSTRAINT "AiAnalysisTask_collectionTaskId_fkey" FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRun" ADD CONSTRAINT "DecisionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRun" ADD CONSTRAINT "DecisionRun_collectionTaskId_fkey" FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRun" ADD CONSTRAINT "DecisionRun_aiAnalysisTaskId_fkey" FOREIGN KEY ("aiAnalysisTaskId") REFERENCES "AiAnalysisTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposal" ADD CONSTRAINT "ActionProposal_decisionRunId_fkey" FOREIGN KEY ("decisionRunId") REFERENCES "DecisionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposal" ADD CONSTRAINT "ActionProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposal" ADD CONSTRAINT "ActionProposal_collectionTaskId_fkey" FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_actionProposalId_fkey" FOREIGN KEY ("actionProposalId") REFERENCES "ActionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_actionProposalId_fkey" FOREIGN KEY ("actionProposalId") REFERENCES "ActionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_collectionTaskId_fkey" FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionOutcome" ADD CONSTRAINT "ActionOutcome_actionProposalId_fkey" FOREIGN KEY ("actionProposalId") REFERENCES "ActionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionOutcome" ADD CONSTRAINT "ActionOutcome_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionOutcome" ADD CONSTRAINT "ActionOutcome_collectionTaskId_fkey" FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionOutcome" ADD CONSTRAINT "ActionOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "CollectionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
