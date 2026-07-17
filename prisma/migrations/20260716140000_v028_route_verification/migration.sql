CREATE TYPE "RouteVerificationStatus" AS ENUM ('VERIFIED', 'MANUAL_PENDING');

ALTER TABLE "DataSnapshot"
  ADD COLUMN "routeVerificationStatus" "RouteVerificationStatus" NOT NULL DEFAULT 'VERIFIED',
  ADD COLUMN "routeConfirmedById" TEXT,
  ADD COLUMN "routeConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "DataSnapshot"
  ADD CONSTRAINT "DataSnapshot_routeConfirmedById_fkey"
  FOREIGN KEY ("routeConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DataSnapshot_taskId_routeVerificationStatus_idx"
  ON "DataSnapshot"("taskId", "routeVerificationStatus");
