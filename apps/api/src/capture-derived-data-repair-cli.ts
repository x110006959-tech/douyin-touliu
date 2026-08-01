import { prisma } from "./prisma.js";
import { toJson } from "./server-utils.js";
import {
  inspectCurrentVerifiedCaptureDerivedData,
  repairCurrentVerifiedCaptureDerivedData
} from "./capture-derived-data-repair.js";

const run = process.argv.includes("--run");
const taskId = readTaskId(process.argv.slice(2));

try {
  const taskIds = await prisma.collectionTask.findMany({
    where: taskId ? { id: taskId } : undefined,
    select: { id: true },
    orderBy: { createdAt: "asc" }
  });
  if (taskId && !taskIds.length) throw new Error(`Collection task not found: ${taskId}`);
  if (!run) {
    const candidates = [];
    for (const { id } of taskIds) {
      const result = await prisma.$transaction((tx) => inspectCurrentVerifiedCaptureDerivedData(tx, id));
      if (result?.repairedSnapshotIds.length) candidates.push(result);
    }
    console.log(JSON.stringify({
      mode: "dry-run",
      scannedTasks: taskIds.length,
      candidateTasks: candidates.length,
      results: candidates,
      command: "pnpm capture:repair:run -- --task-id=<taskId>"
    }));
  } else {
    const results = [];
    for (const { id } of taskIds) {
      const result = await prisma.$transaction(async (tx) => {
        const repaired = await repairCurrentVerifiedCaptureDerivedData(tx, id);
        if (!repaired || !repaired.repairedSnapshotIds.length) return repaired;
        const task = await tx.collectionTask.findUniqueOrThrow({ where: { id }, include: { project: true } });
        await tx.auditLog.create({
          data: {
            workspaceId: task.project.workspaceId,
            projectId: task.projectId,
            taskId: task.id,
            action: "CAPTURE_DERIVED_DATA_REPAIRED",
            detailJson: toJson(repaired)
          }
        });
        return repaired;
      });
      if (result?.repairedSnapshotIds.length) results.push(result);
    }
    console.log(JSON.stringify({ mode: "run", repairedTasks: results.length, results }));
  }
} finally {
  await prisma.$disconnect();
}

function readTaskId(args: string[]) {
  const inline = args.find((arg) => arg.startsWith("--task-id="));
  if (inline) return inline.slice("--task-id=".length).trim() || null;
  const index = args.indexOf("--task-id");
  return index >= 0 ? args[index + 1]?.trim() || null : null;
}
