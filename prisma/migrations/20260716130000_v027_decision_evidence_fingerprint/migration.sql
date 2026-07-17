ALTER TABLE "DecisionRun" ADD COLUMN "evidenceFingerprint" TEXT;

CREATE INDEX "DecisionRun_evidenceFingerprint_idx" ON "DecisionRun"("evidenceFingerprint");
