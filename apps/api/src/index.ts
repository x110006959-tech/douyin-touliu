import { createServer } from "./server.js";
import { prisma } from "./prisma.js";

const port = Number(process.env.API_PORT || 4000);
const server = createServer().listen(port, () => {
  console.log(`Douyin local-life diagnosis API listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
