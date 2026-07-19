import { createServer } from "./server.js";
import { ensureEmailDeliveryConfigured } from "./email-verification.js";
import { sanitizeErrorForLog } from "./http-security.js";
import { prisma } from "./prisma.js";
import { flushSecurityMetrics } from "./security-metrics.js";
import { closeAllSseConnections } from "./sse-limits.js";

ensureEmailDeliveryConfigured();

const port = Number(process.env.API_PORT || 4000);
let shuttingDown = false;
const server = createServer({ isDraining: () => shuttingDown }).listen(port, () => {
  console.log(`Douyin local-life diagnosis API listening on http://localhost:${port}`);
});

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  closeAllSseConnections();
  await closeServerWithinGracePeriod();
  await flushSecurityMetrics().catch((error: unknown) => console.error("Security metric flush failed", sanitizeErrorForLog(error)));
  await prisma.$disconnect();
}

function closeServerWithinGracePeriod() {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(forceClose);
      if (error) reject(error);
      else resolve();
    };
    const forceClose = setTimeout(() => {
      server.closeAllConnections();
      finish();
    }, 15_000);
    server.close((error) => finish(error || undefined));
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error("API shutdown failed", error);
        process.exit(1);
      });
  });
}
