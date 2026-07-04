import { isCollectionJobDue } from "@/lib/collection-config";
import { runCollectionJob } from "@/lib/collection-runner";
import { prisma } from "@/lib/prisma";

function pollMs() {
  const configured = Number(process.env.COLLECTION_WORKER_POLL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 15_000;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let stopped = false;

process.on("SIGINT", () => {
  stopped = true;
});

process.on("SIGTERM", () => {
  stopped = true;
});

async function runDueJobs() {
  const jobs = await prisma.collectionJob.findMany({
    where: { status: { not: "running" } },
    orderBy: { updatedAt: "asc" }
  });
  for (const job of jobs.filter((item) => isCollectionJobDue(item))) {
    const result = await runCollectionJob(job.id);
    console.log(
      JSON.stringify({
        jobId: result.jobId,
        status: result.status,
        evidenceIds: result.evidenceIds,
        exitCode: result.exitCode,
        stderr: result.stderr || null,
        ranAt: new Date().toISOString()
      })
    );
  }
}

async function main() {
  console.log(`collection-worker polling every ${pollMs()}ms`);
  while (!stopped) {
    await runDueJobs().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
    await delay(pollMs());
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
