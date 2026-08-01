CREATE TYPE "DecisionRunMode" AS ENUM ('LEGACY_RULE', 'AI_SKILL_ORCHESTRATED');
CREATE TYPE "DecisionRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "DiagnosisSkillExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "DiagnosisCaseStatus" AS ENUM ('DRAFT', 'ELIGIBLE', 'EXCLUDED');

ALTER TABLE "DecisionRun"
  ADD COLUMN "mode" "DecisionRunMode" NOT NULL DEFAULT 'LEGACY_RULE',
  ADD COLUMN "status" "DecisionRunStatus" NOT NULL DEFAULT 'SUCCEEDED',
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "skillSetVersion" TEXT,
  ADD COLUMN "orchestrationVersion" TEXT,
  ADD COLUMN "currentStage" TEXT,
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "inputTokens" INTEGER,
  ADD COLUMN "outputTokens" INTEGER,
  ADD COLUMN "totalTokens" INTEGER,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "engineVersion" DROP NOT NULL,
  ALTER COLUMN "ruleVersion" DROP NOT NULL,
  ALTER COLUMN "riskLevel" DROP NOT NULL,
  ALTER COLUMN "confidence" DROP NOT NULL,
  ALTER COLUMN "diagnosis" DROP NOT NULL,
  ALTER COLUMN "ruleResultJson" DROP NOT NULL,
  ALTER COLUMN "finalResultJson" DROP NOT NULL;

CREATE TABLE "DiagnosisSkillExecution" (
  "id" TEXT NOT NULL,
  "decisionRunId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "skillVersion" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "DiagnosisSkillExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "inputJson" JSONB,
  "outputJson" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "totalTokens" INTEGER,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiagnosisSkillExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiagnosisCase" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "projectId" TEXT,
  "collectionTaskId" TEXT,
  "decisionRunId" TEXT,
  "businessMode" TEXT NOT NULL,
  "status" "DiagnosisCaseStatus" NOT NULL DEFAULT 'DRAFT',
  "mainProblemTag" TEXT,
  "summaryJson" JSONB NOT NULL,
  "metricRangesJson" JSONB,
  "routeCoverageJson" JSONB,
  "actionTypesJson" JSONB,
  "outcomeJson" JSONB,
  "eligibleAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiagnosisCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiagnosisFeedback" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "decisionRunId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mainProblemCorrect" BOOLEAN NOT NULL,
  "usefulnessScore" INTEGER NOT NULL,
  "adoptedActionTypesJson" JSONB,
  "correctionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiagnosisFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiagnosisFeedback_usefulnessScore_check" CHECK ("usefulnessScore" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "DecisionRun_active_ai_task_key"
  ON "DecisionRun"("collectionTaskId")
  WHERE "mode" = 'AI_SKILL_ORCHESTRATED' AND "status" IN ('PENDING', 'RUNNING');
CREATE INDEX "DecisionRun_mode_status_lease_idx" ON "DecisionRun"("mode", "status", "leaseExpiresAt");
CREATE UNIQUE INDEX "DiagnosisSkillExecution_run_sequence_key" ON "DiagnosisSkillExecution"("decisionRunId", "sequence");
CREATE INDEX "DiagnosisSkillExecution_run_status_idx" ON "DiagnosisSkillExecution"("decisionRunId", "status");
CREATE INDEX "DiagnosisSkillExecution_skill_version_idx" ON "DiagnosisSkillExecution"("skillId", "skillVersion");
CREATE UNIQUE INDEX "DiagnosisCase_decisionRunId_key" ON "DiagnosisCase"("decisionRunId");
CREATE INDEX "DiagnosisCase_workspace_status_mode_idx" ON "DiagnosisCase"("workspaceId", "status", "businessMode");
CREATE INDEX "DiagnosisCase_workspace_problem_idx" ON "DiagnosisCase"("workspaceId", "mainProblemTag");
CREATE INDEX "DiagnosisCase_collectionTaskId_idx" ON "DiagnosisCase"("collectionTaskId");
CREATE UNIQUE INDEX "DiagnosisFeedback_run_user_key" ON "DiagnosisFeedback"("decisionRunId", "userId");
CREATE INDEX "DiagnosisFeedback_workspace_created_idx" ON "DiagnosisFeedback"("workspaceId", "createdAt");
CREATE INDEX "DiagnosisFeedback_userId_idx" ON "DiagnosisFeedback"("userId");

ALTER TABLE "DiagnosisSkillExecution" ADD CONSTRAINT "DiagnosisSkillExecution_decisionRunId_fkey"
  FOREIGN KEY ("decisionRunId") REFERENCES "DecisionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiagnosisCase" ADD CONSTRAINT "DiagnosisCase_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiagnosisCase" ADD CONSTRAINT "DiagnosisCase_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiagnosisCase" ADD CONSTRAINT "DiagnosisCase_collectionTaskId_fkey"
  FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiagnosisCase" ADD CONSTRAINT "DiagnosisCase_decisionRunId_fkey"
  FOREIGN KEY ("decisionRunId") REFERENCES "DecisionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiagnosisCase" ADD CONSTRAINT "DiagnosisCase_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiagnosisFeedback" ADD CONSTRAINT "DiagnosisFeedback_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiagnosisFeedback" ADD CONSTRAINT "DiagnosisFeedback_decisionRunId_fkey"
  FOREIGN KEY ("decisionRunId") REFERENCES "DecisionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiagnosisFeedback" ADD CONSTRAINT "DiagnosisFeedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
