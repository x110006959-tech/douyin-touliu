import type { CollectionRunStatus, Prisma } from "@prisma/client";
import {
  assessCollectionQuality,
  collectionFreshnessPolicy,
  collectionRouteKeys,
  defaultRequiredCollectionRoutes,
  type CollectionRouteKey
} from "@douyin-local-life/shared";
import { z } from "zod";
import { prisma } from "./prisma.js";

export const createCollectionRunSchema = z.object({
  requiredRoutes: z.array(z.enum(collectionRouteKeys)).min(1).max(collectionRouteKeys.length).default(defaultRequiredCollectionRoutes)
});

export const reportCollectionRouteFailureSchema = z.object({
  routeKey: z.enum(collectionRouteKeys),
  error: z.string().trim().min(1).max(500)
});

export function requiredRoutesFromJson(value: Prisma.JsonValue | null | undefined): CollectionRouteKey[] {
  if (!Array.isArray(value)) return [...defaultRequiredCollectionRoutes];
  const routes = value.filter((route): route is CollectionRouteKey => collectionRouteKeys.includes(route as CollectionRouteKey));
  return routes.length ? [...new Set(routes)] : [...defaultRequiredCollectionRoutes];
}

export function assessCollectionRunQuality(
  requiredRoutesJson: Prisma.JsonValue | null | undefined,
  snapshots: Array<{
    routeKey?: string | null;
    pageType?: string | null;
    sourceUrl?: string | null;
    pageTitle?: string | null;
    localCollectedAt: Date | string;
  }>,
  routeHealth: Array<{ routeKey: string; consecutiveFailures: number }> = []
) {
  const quality = assessCollectionQuality(requiredRoutesFromJson(requiredRoutesJson), snapshots);
  const failedRoutes = routeHealth
    .filter((route) => route.consecutiveFailures >= collectionFreshnessPolicy.routeFailureThreshold)
    .map((route) => route.routeKey as CollectionRouteKey)
    .filter((route) => quality.requiredRoutes.includes(route));
  if (!failedRoutes.length) return quality;

  quality.staleRoutes = [...new Set([...quality.staleRoutes, ...failedRoutes])];
  quality.blocksStrongActions = true;
  quality.routes = quality.routes.map((route) =>
    failedRoutes.includes(route.routeKey) && route.state !== "MISSING" ? { ...route, state: "STALE" } : route
  );
  return quality;
}

export function getOwnedCollectionRun(userId: string, id: string) {
  return prisma.collectionRun.findFirst({
    where: { id, task: { project: { workspace: { ownerId: userId } } } },
    include: {
      task: { include: { project: true } },
      snapshots: { orderBy: { localCollectedAt: "desc" }, take: 100 },
      routeHealth: true
    }
  });
}

export function toCollectionRunDTO(run: {
  id: string;
  taskId: string;
  status: CollectionRunStatus;
  requiredRoutesJson: Prisma.JsonValue;
  startedAt: Date;
  lastSnapshotAt: Date | null;
  completedAt: Date | null;
  stoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  snapshots: Array<{
    routeKey: string | null;
    pageType: string | null;
    localCollectedAt: Date;
  }>;
  routeHealth?: Array<{
    routeKey: string;
    consecutiveFailures: number;
    lastAttemptAt: Date;
    lastSuccessAt: Date | null;
    lastError: string | null;
  }>;
}) {
  const quality = assessCollectionRunQuality(run.requiredRoutesJson, run.snapshots, run.routeHealth);
  const consecutiveFailureState = run.routeHealth?.some(
    (route) => route.consecutiveFailures >= collectionFreshnessPolicy.routeFailureThreshold
  ) || run.status === "DEGRADED";
  return {
    id: run.id,
    taskId: run.taskId,
    status: consecutiveFailureState ? "DEGRADED" : run.status,
    requiredRoutes: quality.requiredRoutes,
    startedAt: run.startedAt.toISOString(),
    lastSnapshotAt: run.lastSnapshotAt?.toISOString() || null,
    completedAt: run.completedAt?.toISOString() || null,
    stoppedAt: run.stoppedAt?.toISOString() || null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    quality,
    routeHealth: run.routeHealth || [],
    freshnessPolicy: collectionFreshnessPolicy
  };
}

export async function refreshCollectionRunStatus(tx: Prisma.TransactionClient, collectionRunId: string) {
  const run = await tx.collectionRun.findUnique({
    where: { id: collectionRunId },
    include: {
      snapshots: { orderBy: { localCollectedAt: "desc" }, take: 100 },
      routeHealth: true
    }
  });
  if (!run || run.status === "STOPPED") return run;
  const quality = assessCollectionRunQuality(run.requiredRoutesJson, run.snapshots, run.routeHealth);
  const status: CollectionRunStatus = run.routeHealth.some((route) => route.consecutiveFailures >= collectionFreshnessPolicy.routeFailureThreshold)
    ? "DEGRADED"
    : quality.blocksStrongActions
      ? "ACTIVE"
      : "COMPLETED";
  return tx.collectionRun.update({
    where: { id: run.id },
    data: {
      status,
      lastSnapshotAt: run.snapshots[0]?.localCollectedAt || run.lastSnapshotAt,
      completedAt: status === "COMPLETED" ? run.completedAt || new Date() : null
    }
  });
}
