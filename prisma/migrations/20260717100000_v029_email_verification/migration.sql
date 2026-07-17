CREATE TYPE "PendingRegistrationStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED');

CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "status" "PendingRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingRegistration_email_key" ON "PendingRegistration"("email");
CREATE INDEX "PendingRegistration_status_updatedAt_idx" ON "PendingRegistration"("status", "updatedAt");

CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "pendingRegistrationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_pendingRegistrationId_expiresAt_idx" ON "EmailVerificationToken"("pendingRegistrationId", "expiresAt");
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_pendingRegistrationId_fkey"
FOREIGN KEY ("pendingRegistrationId") REFERENCES "PendingRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
