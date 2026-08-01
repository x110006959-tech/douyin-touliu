import { Router } from "express";
import { DEFAULT_DEEPSEEK_MODEL } from "@douyin-local-life/llm";
import { hydrateCurrentRunSnapshots, toCollectionRunDTO } from "../collection-runs.js";
import { getAiCircuitStatus } from "../ai-circuit.js";
import { prisma } from "../prisma.js";
import { sendSuccess } from "../response.js";
import { currentUser } from "../server-utils.js";

export function createSystemHealthRouter() {
  const router = Router();

  router.get("/system-health", async (req, res) => {
    const user = currentUser(req);
    const aiProvider = { name: "deepseek", model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL };
    const [rawRuns, aiCircuit] = await Promise.all([
      prisma.collectionRun.findMany({
        where: { task: { project: { workspace: { ownerId: user.id } } } },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { routeHealth: true }
      }),
      getAiCircuitStatus(aiProvider.name, aiProvider.model)
    ]);
    const runs = await hydrateCurrentRunSnapshots(prisma, rawRuns);
    const latestByTask = [...new Map(runs.map((run) => [run.taskId, run])).values()];
    const collectionRuns = latestByTask.map(toCollectionRunDTO);
    const degradedRuns = collectionRuns.filter((run) => run.status === "DEGRADED" || run.quality.blocksStrongActions).length;
    const collectionDiagnostics = collectionRuns.flatMap((run) => run.quality.diagnostics || []);
    const routeStatusCounts = Object.fromEntries([
      "UPLOADED",
      "AGING",
      "PARTIAL",
      "UNVERIFIED",
      "MANUAL_PENDING",
      "STALE",
      "FAILED",
      "MISSING"
    ].map((status) => [
      status,
      collectionDiagnostics.filter((diagnostic) => diagnostic.summaryStatus === status).length
    ]));
    const routeIssueCounts = collectionDiagnostics
      .flatMap((diagnostic) => diagnostic.issues)
      .reduce<Record<string, number>>((counts, issue) => {
        counts[issue.code] = (counts[issue.code] || 0) + 1;
        return counts;
      }, {});
    const aiCircuitOpen = aiCircuit.state !== "CLOSED";
    return sendSuccess(res, {
      status: degradedRuns > 0 || aiCircuitOpen ? "DEGRADED" : "HEALTHY",
      database: "READY",
      collection: {
        activeRuns: collectionRuns.filter((run) => run.status === "ACTIVE" || run.status === "COMPLETED").length,
        degradedRuns,
        routeStatusCounts,
        routeIssueCounts,
        runs: collectionRuns
      },
      ai: {
        status: aiCircuit.state,
        cooldownEndsAt: aiCircuit.cooldownEndsAt,
        recentFailures: aiCircuit.consecutiveFailures,
        backoffLevel: aiCircuit.backoffLevel
      },
      checkedAt: new Date().toISOString()
    });
  });

  return router;
}
