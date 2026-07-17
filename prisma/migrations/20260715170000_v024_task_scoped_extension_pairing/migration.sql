ALTER TABLE "ExtensionPairingCode" ADD COLUMN "collectionTaskId" TEXT;

CREATE INDEX "ExtensionPairingCode_collectionTaskId_expiresAt_idx"
ON "ExtensionPairingCode"("collectionTaskId", "expiresAt");

ALTER TABLE "ExtensionPairingCode"
ADD CONSTRAINT "ExtensionPairingCode_collectionTaskId_fkey"
FOREIGN KEY ("collectionTaskId") REFERENCES "CollectionTask"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
