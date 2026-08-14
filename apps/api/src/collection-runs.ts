import type { CollectionRunStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  assessCollectionQuality,
  collectionFreshnessPolicy,
  collectionRouteKeys,
  defaultRequiredCollectionRoutes,
  evaluateCollectionRouteDiagnostic,
  normalizeCollectionRouteKey,
  type CollectionRouteKey
} from "@douyin-local-life/shared";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { findCurrentSnapshotIdsByRoute } from "./current-snapshots.js";

export const createCollectionRunSchema = z.object({
  requiredRoutes: z.array(z.enum(collectionRouteKeys))
    .min(1)
    .max(collectionRouteKeys.length)
    .refine((routes) => routes.every((route) => route !== "UNKNOWN"), "采集路线不能包含 UNKNOWN")
    .default(defaultRequiredCollectionRoutes)
});

export const reportCollectionRouteFailureSchema = z.object({
  routeKey: z.enum(collectionRouteKeys).refine((route) => route !== "UNKNOWN", "失败路线不能为 UNKNOWN"),
  errorCode: z.enum([
    "CONTENT_SCRIPT_UNAVAILABLE",
    "PAGE_NOT_READY",
    "ROUTE_UNVERIFIED",
    "UPLOAD_NETWORK_ERROR",
    "UPLOAD_HTTP_ERROR",
    "UNKNOWN"
  ]).default("UNKNOWN"),
  error: z.string().trim().min(1).max(500).optional()
});

const legacyDefaultRequiredCollectionRoutes: CollectionRouteKey[] = [
  "LOCAL_PROMOTION_DASHBOARD",
  "LIVE_DATA_SCREEN",
  "TASK_TABLE"
];

export function requiredRoutesFromJson(value: Prisma.JsonValue | null | undefined): CollectionRouteKey[] {
  if (!Array.isArray(value)) return [...defaultRequiredCollectionRoutes];
  const routes = value.filter((route): route is CollectionRouteKey => collectionRouteKeys.includes(route as CollectionRouteKey));
  const uniqueRoutes = [...new Set(routes)];
  if (sameCollectionRouteSet(uniqueRoutes, legacyDefaultRequiredCollectionRoutes)) {
    return [...defaultRequiredCollectionRoutes];
  }
  return uniqueRoutes.length ? uniqueRoutes : [...defaultRequiredCollectionRoutes];
}

export function assessCollectionRunQuality(
  requiredRoutesJson: Prisma.JsonValue | null | undefined,
  snapshots: Array<{
    routeKey?: string | null;
    pageType?: string | null;
    sourceUrl?: string | null;
    pageTitle?: string | null;
    localCollectedAt: Date | string;
    id?: string;
    routeVerificationStatus?: string | null;
    captureMetaJson?: Prisma.JsonValue | null;
  }>,
  routeHealth: Array<{
    routeKey: string;
    consecutiveFailures: number;
    lastAttemptAt?: Date | string | null;
    lastSuccessAt?: Date | string | null;
    lastErrorCode?: string | null;
    lastError?: string | null;
  }> = [],
  context: {
    startedAt?: Date | string | null;
    status?: CollectionRunStatus;
    now?: Date;
  } = {}
) {
  const now = context.now || new Date();
  const quality = assessCollectionQuality(requiredRoutesFromJson(requiredRoutesJson), snapshots, now);
  const latestSnapshots = new Map<CollectionRouteKey, typeof snapshots[number]>();
  for (const snapshot of snapshots) {
    const routeKey = normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType);
    const current = latestSnapshots.get(routeKey);
    if (!current || new Date(snapshot.localCollectedAt) > new Date(current.localCollectedAt)) {
      latestSnapshots.set(routeKey, snapshot);
    }
  }
  const heartbeatByRoute = new Map(routeHealth.map((heartbeat) => [
    normalizeCollectionRouteKey(heartbeat.routeKey),
    heartbeat
  ]));
  quality.diagnostics = quality.requiredRoutes.map((routeKey) => {
    const snapshot = latestSnapshots.get(routeKey);
    return evaluateCollectionRouteDiagnostic({
      routeKey,
      required: true,
      runActive: context.status === "ACTIVE" || context.status === "DEGRADED",
      runStartedAt: context.startedAt,
      snapshot: snapshot ? {
        id: snapshot.id,
        localCollectedAt: snapshot.localCollectedAt,
        routeVerificationStatus: snapshot.routeVerificationStatus,
        captureMeta: readCaptureMeta(snapshot.captureMetaJson)
      } : null,
      heartbeat: heartbeatByRoute.get(routeKey)
    }, now.getTime());
  });
  const blockedRoutes = quality.diagnostics
    .filter((diagnostic) => diagnostic.blocksStrongActions)
    .map((diagnostic) => diagnostic.routeKey);
  quality.staleRoutes = [...new Set([
    ...quality.staleRoutes,
    ...quality.diagnostics
      .filter((diagnostic) => diagnostic.summaryStatus === "FAILED")
      .map((diagnostic) => diagnostic.routeKey)
  ])];
  const failedRoutes = new Set(quality.diagnostics
    .filter((diagnostic) => diagnostic.summaryStatus === "FAILED")
    .map((diagnostic) => diagnostic.routeKey));
  quality.routes = quality.routes.map((route) =>
    failedRoutes.has(route.routeKey) && route.state !== "MISSING"
      ? { ...route, state: "STALE" }
      : route
  );
  quality.blocksStrongActions = blockedRoutes.length > 0;
  return quality;
}

export function sameCollectionRouteSet(left: readonly CollectionRouteKey[], right: readonly CollectionRouteKey[]) {
  const normalize = (routes: readonly CollectionRouteKey[]) => [...new Set(routes)].sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export async function hydrateCurrentRunSnapshots<T extends { id: string; taskId: string; requiredRoutesJson: Prisma.JsonValue }>(
  client: Prisma.TransactionClient | PrismaClient,
  runs: T[]
) {
  const idsByRun = new Map<string, string[]>();
  await Promise.all(runs.map(async (run) => idsByRun.set(run.id, await findCurrentSnapshotIdsByRoute(client, {
    taskId: run.taskId,
    collectionRunId: run.id,
    routeKeys: requiredRoutesFromJson(run.requiredRoutesJson)
  }))));
  const ids = [...new Set([...idsByRun.values()].flat())];
  const snapshots = ids.length ? await client.dataSnapshot.findMany({
    where: { id: { in: ids } },
    orderBy: [{ localCollectedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      collectionRunId: true,
      routeKey: true,
      pageType: true,
      localCollectedAt: true,
      routeVerificationStatus: true,
      captureMetaJson: true
    }
  }) : [];
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  return runs.map((run) => ({
    ...run,
    snapshots: (idsByRun.get(run.id) || []).flatMap((id) => byId.get(id) ? [byId.get(id)!] : [])
  }));
}

export async function getOwnedCollectionRun(userId: string, id: string) {
  const run = await prisma.collectionRun.findFirst({
    where: { id, task: { project: { workspace: { ownerId: userId } } } },
    include: {
      task: { include: { project: true } },
      routeHealth: true
    }
  });
  return run ? (await hydrateCurrentRunSnapshots(prisma, [run]))[0] || null : null;
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
    lastErrorCode?: string | null;
    lastError: string | null;
  }>;
}) {
  const quality = assessCollectionRunQuality(run.requiredRoutesJson, run.snapshots, run.routeHealth, {
    startedAt: run.startedAt,
    status: run.status
  });
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
      routeHealth: true
    }
  });
  if (!run || run.status === "STOPPED") return run;
  const [hydratedRun, latestSnapshot] = await Promise.all([
    hydrateCurrentRunSnapshots(tx, [run]),
    tx.dataSnapshot.findFirst({
      where: { collectionRunId: run.id },
      orderBy: [{ localCollectedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { localCollectedAt: true }
    })
  ]);
  const snapshots = hydratedRun[0]?.snapshots || [];
  const quality = assessCollectionRunQuality(run.requiredRoutesJson, snapshots, run.routeHealth, {
    startedAt: run.startedAt,
    status: run.status
  });
  const status: CollectionRunStatus = run.routeHealth.some((route) => route.consecutiveFailures >= collectionFreshnessPolicy.routeFailureThreshold)
    ? "DEGRADED"
    : quality.blocksStrongActions
      ? "ACTIVE"
      : "COMPLETED";
  return tx.collectionRun.update({
    where: { id: run.id },
    data: {
      status,
      // Freshness must reflect the newest evidence in the run, including optional routes.
      lastSnapshotAt: latestSnapshot?.localCollectedAt || run.lastSnapshotAt,
      completedAt: status === "COMPLETED" ? run.completedAt || new Date() : null
    }
  });
}

function readCaptureMeta(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return {
    completeness: typeof candidate.completeness === "string" ? candidate.completeness : null,
    coverageRatio: typeof candidate.coverageRatio === "number" ? candidate.coverageRatio : null,
    adapterId: typeof candidate.adapterId === "string" ? candidate.adapterId : null,
    adapterVersion: typeof candidate.adapterVersion === "string" ? candidate.adapterVersion : null,
    pageFingerprint: typeof candidate.pageFingerprint === "string" ? candidate.pageFingerprint : null,
    expectedFields: Array.isArray(candidate.expectedFields)
      ? candidate.expectedFields.filter((item): item is string => typeof item === "string")
      : [],
    extractedFields: Array.isArray(candidate.extractedFields)
      ? candidate.extractedFields.filter((item): item is string => typeof item === "string")
      : [],
    truncationReasons: Array.isArray(candidate.truncationReasons)
      ? candidate.truncationReasons.filter((item): item is string => typeof item === "string")
      : []
  };
}
