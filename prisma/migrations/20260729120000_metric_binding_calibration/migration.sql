CREATE TYPE "CollectionBindingKind" AS ENUM ('METRIC', 'TABLE');

CREATE TABLE "CollectionBindingCalibration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "pageFingerprint" TEXT NOT NULL,
    "bindingKind" "CollectionBindingKind" NOT NULL,
    "bindingKey" TEXT NOT NULL,
    "bindingSignature" TEXT NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionBindingCalibration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionBindingCalibration_binding_unique"
ON "CollectionBindingCalibration"("workspaceId", "routeKey", "pageFingerprint", "bindingKind", "bindingKey", "bindingSignature");

CREATE INDEX "CollectionBindingCalibration_lookup_idx"
ON "CollectionBindingCalibration"("workspaceId", "routeKey", "pageFingerprint");

ALTER TABLE "CollectionBindingCalibration"
ADD CONSTRAINT "CollectionBindingCalibration_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionBindingCalibration"
ADD CONSTRAINT "CollectionBindingCalibration_confirmedById_fkey"
FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
