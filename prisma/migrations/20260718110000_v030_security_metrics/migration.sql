CREATE TABLE "SecurityMetric" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "valueTotal" BIGINT NOT NULL DEFAULT 0,
    "lastValue" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SecurityMetric_metricKey_windowStartedAt_key" ON "SecurityMetric"("metricKey", "windowStartedAt");
CREATE INDEX "SecurityMetric_windowStartedAt_idx" ON "SecurityMetric"("windowStartedAt");
