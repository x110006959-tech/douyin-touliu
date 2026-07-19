import { prisma } from "./prisma.js";
import { runRetention } from "./retention.js";
import { recordSecurityMetrics } from "./security-metrics.js";
import { sanitizeErrorForLog } from "./http-security.js";

const dailyIntervalMs = 24 * 60 * 60 * 1_000;
let stopping = false;
let wakeScheduler: (() => void) | null = null;

async function main() {
  try {
    while (!stopping) {
      const report = await runRetention(prisma, { mode: "run" });
      await recordSecurityMetrics([
        { key: "retention_runs" },
        { key: "retention_processed_records", value: processedRetentionRecordCount(report) }
      ]);
      console.log(JSON.stringify({ event: "retention.completed", report }));
      if (!stopping) await sleepUntilNextRun();
    }
  } finally {
    await prisma.$disconnect();
  }
}

function processedRetentionRecordCount(report: Awaited<ReturnType<typeof runRetention>>) {
  const rawEvidence = Object.values(report.rawEvidence);
  const structuredData = Object.values(report.structuredData);
  return [...rawEvidence, ...structuredData].reduce((total, operation) => total + operation.processedCount, 0);
}

function sleepUntilNextRun() {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, dailyIntervalMs);
    wakeScheduler = () => {
      clearTimeout(timer);
      resolve();
    };
  }).finally(() => {
    wakeScheduler = null;
  });
}

function requestShutdown() {
  stopping = true;
  wakeScheduler?.();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, requestShutdown);
}

void main().then(
  () => { process.exitCode = 0; },
  (error: unknown) => {
    console.error("Retention scheduler failed", sanitizeErrorForLog(error));
    process.exitCode = 1;
  }
);
