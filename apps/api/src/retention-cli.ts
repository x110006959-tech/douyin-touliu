import { prisma } from "./prisma.js";
import { runRetention, type RetentionMode } from "./retention.js";

const mode = parseMode(process.argv.slice(2));

try {
  const report = await runRetention(prisma, { mode });
  console.log(JSON.stringify(report));
} finally {
  await prisma.$disconnect();
}

function parseMode(args: string[]): RetentionMode {
  if (args.length !== 1 || (args[0] !== "--dry-run" && args[0] !== "--run")) {
    throw new Error("Usage: retention-cli --dry-run | --run");
  }
  return args[0] === "--run" ? "run" : "dry-run";
}
