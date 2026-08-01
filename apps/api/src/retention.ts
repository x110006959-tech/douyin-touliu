import { Prisma, PrismaClient } from "@prisma/client";

export const retentionPolicy = {
  rawEvidenceDays: 30,
  structuredDataDays: 365,
  maximumBatchSize: 500
} as const;

export type RetentionMode = "dry-run" | "run";

export type RetentionOptions = {
  mode: RetentionMode;
  now?: Date;
  batchSize?: number;
};

type OperationReport = {
  candidateCount: number;
  processedCount: number;
  batchCount: number;
  largestBatchSize: number;
};

type StructuredDataReport = Record<
  | "snapshotVisibleMetrics"
  | "normalizedMetrics"
  | "reviewedMetrics"
  | "metricDriftEvents"
  | "actionOutcomes"
  | "approvalRecords"
  | "executionLogs"
  | "actionProposals"
  | "decisionRuns"
  | "aiAnalysisTasks"
  | "auditLogs"
  | "securityMetrics",
  OperationReport
>;

export type RetentionReport = {
  mode: RetentionMode;
  startedAt: string;
  completedAt: string;
  batchSize: number;
  rawEvidenceCutoff: string;
  structuredDataCutoff: string;
  rawEvidence: Record<"snapshots" | "normalizedMetricEvidence" | "reviewedMetricEvidence", OperationReport>;
  structuredData: StructuredDataReport;
};

type RetentionOperation = {
  mode: RetentionMode;
  batchSize: number;
  count: () => Promise<number>;
  selectIds: () => Promise<string[]>;
  process: (ids: string[]) => Promise<number>;
};

type IdRow = { id: string };

export async function runRetention(client: PrismaClient, options: RetentionOptions): Promise<RetentionReport> {
  const startedAt = new Date();
  const now = options.now ?? startedAt;
  const batchSize = resolveBatchSize(options.batchSize);
  const rawEvidenceCutoff = subtractUtcDays(now, retentionPolicy.rawEvidenceDays);
  const structuredDataCutoff = subtractUtcDays(now, retentionPolicy.structuredDataDays);

  const rawEvidence = {
    snapshots: await executeOperation({
      mode: options.mode,
      batchSize,
      count: () => countRows(client, rawSnapshotEvidenceCountQuery(rawEvidenceCutoff)),
      selectIds: () => selectRows(client, rawSnapshotEvidenceIdsQuery(rawEvidenceCutoff, batchSize)),
      process: async (ids) => (await client.$transaction((tx) => tx.dataSnapshot.updateMany({
        where: { id: { in: ids } },
        data: {
          rawDomText: null,
          rawNetworkJson: Prisma.DbNull,
          rawTableData: Prisma.DbNull,
          screenshotUrl: null,
          // Legacy page identity fields are not collected anymore; expire old values with raw evidence.
          detectedAccountId: null,
          detectedAccountName: null,
          accountMatchEvidence: Prisma.DbNull
        }
      }))).count
    }),
    normalizedMetricEvidence: await executeOperation({
      mode: options.mode,
      batchSize,
      count: () => countRows(client, normalizedMetricEvidenceCountQuery(rawEvidenceCutoff)),
      selectIds: () => selectRows(client, normalizedMetricEvidenceIdsQuery(rawEvidenceCutoff, batchSize)),
      process: async (ids) => (await client.$transaction((tx) => tx.normalizedMetric.updateMany({
        where: { id: { in: ids } },
        data: { rawEvidence: Prisma.DbNull }
      }))).count
    }),
    reviewedMetricEvidence: await executeOperation({
      mode: options.mode,
      batchSize,
      count: () => countRows(client, reviewedMetricEvidenceCountQuery(rawEvidenceCutoff)),
      selectIds: () => selectRows(client, reviewedMetricEvidenceIdsQuery(rawEvidenceCutoff, batchSize)),
      process: async (ids) => (await client.$transaction((tx) => tx.reviewedMetric.updateMany({
        where: { id: { in: ids } },
        data: { rawEvidence: Prisma.DbNull }
      }))).count
    })
  };

  const structuredData = await deleteStructuredData(client, options.mode, batchSize, structuredDataCutoff);
  return {
    mode: options.mode,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    batchSize,
    rawEvidenceCutoff: rawEvidenceCutoff.toISOString(),
    structuredDataCutoff: structuredDataCutoff.toISOString(),
    rawEvidence,
    structuredData
  };
}

async function deleteStructuredData(client: PrismaClient, mode: RetentionMode, batchSize: number, cutoff: Date): Promise<StructuredDataReport> {
  // Delete leaf records first; guarded parent deletes never cascade into newer records.
  const snapshotVisibleMetrics = await executeOperation({
    mode,
    batchSize,
    count: () => countRows(client, snapshotVisibleMetricsCountQuery(cutoff)),
    selectIds: () => selectRows(client, snapshotVisibleMetricsIdsQuery(cutoff, batchSize)),
    process: async (ids) => (await client.$transaction((tx) => tx.dataSnapshot.updateMany({
      where: { id: { in: ids } },
      data: {
        visibleMetricsJson: Prisma.DbNull,
        structuredDataJson: Prisma.DbNull,
        structuredDataVersion: null
      }
    }))).count
  });
  const normalizedMetrics = await executeOperation({
    mode,
    batchSize,
    count: () => client.normalizedMetric.count({ where: { createdAt: { lt: cutoff } } }),
    selectIds: async () => (await client.normalizedMetric.findMany({
      where: { createdAt: { lt: cutoff } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.normalizedMetric.deleteMany({ where: { id: { in: ids } } }))).count
  });
  const reviewedMetrics = await executeOperation({
    mode,
    batchSize,
    count: () => client.reviewedMetric.count({ where: { createdAt: { lt: cutoff } } }),
    selectIds: async () => (await client.reviewedMetric.findMany({
      where: { createdAt: { lt: cutoff } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.reviewedMetric.deleteMany({ where: { id: { in: ids } } }))).count
  });
  const metricDriftEvents = await executeOperation({
    mode,
    batchSize,
    count: () => client.metricDriftEvent.count({ where: { createdAt: { lt: cutoff } } }),
    selectIds: async () => (await client.metricDriftEvent.findMany({
      where: { createdAt: { lt: cutoff } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.metricDriftEvent.deleteMany({ where: { id: { in: ids } } }))).count
  });
  const actionOutcomes = await executeOperation({
    mode,
    batchSize,
    count: () => client.actionOutcome.count({ where: { createdAt: { lt: cutoff } } }),
    selectIds: async () => (await client.actionOutcome.findMany({
      where: { createdAt: { lt: cutoff } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.actionOutcome.deleteMany({ where: { id: { in: ids } } }))).count
  });
  const approvalRecords = await executeOperation({
    mode,
    batchSize,
    count: () => client.approvalRecord.count({ where: { createdAt: { lt: cutoff } } }),
    selectIds: async () => (await client.approvalRecord.findMany({
      where: { createdAt: { lt: cutoff } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.approvalRecord.deleteMany({ where: { id: { in: ids } } }))).count
  });
  const executionLogs = await executeOperation({
    mode,
    batchSize,
    count: () => client.executionLog.count({ where: { createdAt: { lt: cutoff } } }),
    selectIds: async () => (await client.executionLog.findMany({
      where: { createdAt: { lt: cutoff } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.executionLog.deleteMany({ where: { id: { in: ids } } }))).count
  });
  const actionProposals = await executeOperation({
    mode,
    batchSize,
    count: () => client.actionProposal.count({ where: proposalRetentionWhere(cutoff) }),
    selectIds: async () => (await client.actionProposal.findMany({
      where: proposalRetentionWhere(cutoff), orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.actionProposal.deleteMany({
      where: { id: { in: ids }, ...proposalRetentionWhere(cutoff) }
    }))).count
  });
  const decisionRuns = await executeOperation({
    mode,
    batchSize,
    count: () => client.decisionRun.count({ where: { createdAt: { lt: cutoff }, actionProposals: { none: {} } } }),
    selectIds: async () => (await client.decisionRun.findMany({
      where: { createdAt: { lt: cutoff }, actionProposals: { none: {} } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.decisionRun.deleteMany({
      where: { id: { in: ids }, actionProposals: { none: {} } }
    }))).count
  });
  const aiAnalysisTasks = await executeOperation({
    mode,
    batchSize,
    count: () => client.aiAnalysisTask.count({ where: { createdAt: { lt: cutoff }, decisionRuns: { none: {} } } }),
    selectIds: async () => (await client.aiAnalysisTask.findMany({
      where: { createdAt: { lt: cutoff }, decisionRuns: { none: {} } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.aiAnalysisTask.deleteMany({
      where: { id: { in: ids }, decisionRuns: { none: {} } }
    }))).count
  });
  const auditLogs = await executeOperation({
    mode,
    batchSize,
    count: () => client.auditLog.count({ where: { createdAt: { lt: cutoff } } }),
    selectIds: async () => (await client.auditLog.findMany({
      where: { createdAt: { lt: cutoff } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.auditLog.deleteMany({ where: { id: { in: ids } } }))).count
  });
  const securityMetrics = await executeOperation({
    mode,
    batchSize,
    count: () => client.securityMetric.count({ where: { windowStartedAt: { lt: cutoff } } }),
    selectIds: async () => (await client.securityMetric.findMany({
      where: { windowStartedAt: { lt: cutoff } }, orderBy: [{ windowStartedAt: "asc" }, { id: "asc" }], take: batchSize, select: { id: true }
    })).map((row) => row.id),
    process: async (ids) => (await client.$transaction((tx) => tx.securityMetric.deleteMany({ where: { id: { in: ids } } }))).count
  });

  return {
    snapshotVisibleMetrics,
    normalizedMetrics,
    reviewedMetrics,
    metricDriftEvents,
    actionOutcomes,
    approvalRecords,
    executionLogs,
    actionProposals,
    decisionRuns,
    aiAnalysisTasks,
    auditLogs,
    securityMetrics
  };
}

function proposalRetentionWhere(cutoff: Date) {
  return {
    createdAt: { lt: cutoff },
    approvalRecords: { none: {} },
    executionLogs: { none: {} },
    outcomes: { none: {} }
  };
}

async function executeOperation(operation: RetentionOperation): Promise<OperationReport> {
  const candidateCount = await operation.count();
  if (operation.mode === "dry-run" || candidateCount === 0) {
    return { candidateCount, processedCount: 0, batchCount: 0, largestBatchSize: 0 };
  }

  let processedCount = 0;
  let batchCount = 0;
  let largestBatchSize = 0;
  while (true) {
    const ids = await operation.selectIds();
    if (!ids.length) break;
    if (ids.length > operation.batchSize) throw new Error("Retention batch exceeded the configured limit");
    processedCount += await operation.process(ids);
    batchCount += 1;
    largestBatchSize = Math.max(largestBatchSize, ids.length);
  }
  return { candidateCount, processedCount, batchCount, largestBatchSize };
}

function resolveBatchSize(value: number | undefined) {
  const requested = value ?? retentionPolicy.maximumBatchSize;
  if (!Number.isInteger(requested) || requested < 1) throw new Error("Retention batch size must be a positive integer");
  return Math.min(requested, retentionPolicy.maximumBatchSize);
}

function subtractUtcDays(date: Date, days: number) {
  const cutoff = new Date(date);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}

async function countRows(client: PrismaClient, query: Prisma.Sql) {
  const rows = await client.$queryRaw<Array<{ count: bigint | number | string }>>(query);
  return Number(rows[0]?.count || 0);
}

async function selectRows(client: PrismaClient, query: Prisma.Sql) {
  return (await client.$queryRaw<IdRow[]>(query)).map((row) => row.id);
}

function rawSnapshotEvidenceCountQuery(cutoff: Date) {
  return Prisma.sql`
    SELECT COUNT(*) AS "count" FROM "DataSnapshot"
    WHERE "uploadedAt" < ${cutoff} AND (
      "rawDomText" IS NOT NULL OR "rawNetworkJson" IS NOT NULL OR "rawTableData" IS NOT NULL OR "screenshotUrl" IS NOT NULL
      OR "detectedAccountId" IS NOT NULL OR "detectedAccountName" IS NOT NULL OR "accountMatchEvidence" IS NOT NULL
    )
  `;
}

function rawSnapshotEvidenceIdsQuery(cutoff: Date, batchSize: number) {
  return Prisma.sql`
    SELECT "id" FROM "DataSnapshot"
    WHERE "uploadedAt" < ${cutoff} AND (
      "rawDomText" IS NOT NULL OR "rawNetworkJson" IS NOT NULL OR "rawTableData" IS NOT NULL OR "screenshotUrl" IS NOT NULL
      OR "detectedAccountId" IS NOT NULL OR "detectedAccountName" IS NOT NULL OR "accountMatchEvidence" IS NOT NULL
    )
    ORDER BY "uploadedAt" ASC, "id" ASC LIMIT ${batchSize}
  `;
}

function snapshotVisibleMetricsCountQuery(cutoff: Date) {
  return Prisma.sql`
    SELECT COUNT(*) AS "count"
    FROM "DataSnapshot"
    WHERE "uploadedAt" < ${cutoff}
      AND ("visibleMetricsJson" IS NOT NULL OR "structuredDataJson" IS NOT NULL)
  `;
}

function snapshotVisibleMetricsIdsQuery(cutoff: Date, batchSize: number) {
  return Prisma.sql`
    SELECT "id" FROM "DataSnapshot"
    WHERE "uploadedAt" < ${cutoff}
      AND ("visibleMetricsJson" IS NOT NULL OR "structuredDataJson" IS NOT NULL)
    ORDER BY "uploadedAt" ASC, "id" ASC LIMIT ${batchSize}
  `;
}

function normalizedMetricEvidenceCountQuery(cutoff: Date) {
  return Prisma.sql`SELECT COUNT(*) AS "count" FROM "NormalizedMetric" WHERE "createdAt" < ${cutoff} AND "rawEvidence" IS NOT NULL`;
}

function normalizedMetricEvidenceIdsQuery(cutoff: Date, batchSize: number) {
  return Prisma.sql`
    SELECT "id" FROM "NormalizedMetric" WHERE "createdAt" < ${cutoff} AND "rawEvidence" IS NOT NULL
    ORDER BY "createdAt" ASC, "id" ASC LIMIT ${batchSize}
  `;
}

function reviewedMetricEvidenceCountQuery(cutoff: Date) {
  return Prisma.sql`SELECT COUNT(*) AS "count" FROM "ReviewedMetric" WHERE "createdAt" < ${cutoff} AND "rawEvidence" IS NOT NULL`;
}

function reviewedMetricEvidenceIdsQuery(cutoff: Date, batchSize: number) {
  return Prisma.sql`
    SELECT "id" FROM "ReviewedMetric" WHERE "createdAt" < ${cutoff} AND "rawEvidence" IS NOT NULL
    ORDER BY "createdAt" ASC, "id" ASC LIMIT ${batchSize}
  `;
}
