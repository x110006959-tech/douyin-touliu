ALTER TABLE "AuditLog"
ADD COLUMN "actorSnapshotJson" JSONB;

UPDATE "AuditLog"
SET "actorSnapshotJson" = jsonb_build_object('userId', "userId")
WHERE "actorSnapshotJson" IS NULL;

ALTER TABLE "AuditLog"
DROP CONSTRAINT "AuditLog_userId_fkey";

ALTER TABLE "AuditLog"
ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
