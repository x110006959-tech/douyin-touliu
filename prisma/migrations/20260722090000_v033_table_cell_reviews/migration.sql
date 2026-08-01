CREATE TABLE "TableCellReview" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "tableIndex" INTEGER NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "columnIndex" INTEGER NOT NULL,
    "originalValue" TEXT,
    "reviewedValue" TEXT,
    "reviewStatus" "MetricReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableCellReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TableCellReview_snapshotId_tableIndex_rowIndex_columnIndex_key"
ON "TableCellReview"("snapshotId", "tableIndex", "rowIndex", "columnIndex");

CREATE INDEX "TableCellReview_taskId_snapshotId_idx" ON "TableCellReview"("taskId", "snapshotId");
CREATE INDEX "TableCellReview_snapshotId_reviewStatus_idx" ON "TableCellReview"("snapshotId", "reviewStatus");
CREATE INDEX "TableCellReview_reviewerId_idx" ON "TableCellReview"("reviewerId");

ALTER TABLE "TableCellReview"
ADD CONSTRAINT "TableCellReview_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "CollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TableCellReview"
ADD CONSTRAINT "TableCellReview_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "DataSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TableCellReview"
ADD CONSTRAINT "TableCellReview_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
