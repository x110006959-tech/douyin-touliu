import { startDecisionWorker } from "./ai-diagnosis/worker.js";
import { prisma } from "./prisma.js";

const stop = startDecisionWorker({
  onError: (error) => console.error("Decision worker tick failed", error instanceof Error ? error.message : error)
});
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await stop();
  await prisma.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}
