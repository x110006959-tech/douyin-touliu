ALTER TABLE "User"
  ALTER COLUMN "email" DROP NOT NULL,
  ALTER COLUMN "emailVerifiedAt" DROP NOT NULL,
  ALTER COLUMN "emailVerifiedAt" DROP DEFAULT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "creditBalance" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

ALTER TABLE "User" ADD CONSTRAINT "User_login_identifier_required"
  CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

ALTER TABLE "DecisionRun"
  ADD COLUMN "creditCharged" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "creditRefunded" BOOLEAN NOT NULL DEFAULT false;
