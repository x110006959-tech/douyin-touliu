import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeCollectionRouteKey, type CollectionRouteKey } from "@douyin-local-life/shared";

type SnapshotSelectionInput = {
  id: string;
  collectionRunId?: string | null;
  routeKey?: string | null;
  pageType?: string | null;
  localCollectedAt?: Date;
  createdAt?: Date;
};

type SnapshotLookupClient = Prisma.TransactionClient | PrismaClient;

export async function findCurrentSnapshotIdsByRoute(
  client: SnapshotLookupClient,
  query: {
    taskId: string;
    collectionRunId?: string | null;
    routeKeys: ReadonlyArray<string | null | undefined>;
    accountMatchStatus?: Prisma.EnumAccountMatchStatusFilter;
  }
): Promise<string[]> {
  const routeKeys = [...new Set(query.routeKeys
    .map(normalizeCollectionRouteKey)
    .filter((routeKey): routeKey is CollectionRouteKey => routeKey !== "UNKNOWN"))];
  const snapshots = await Promise.all(routeKeys.map((routeKey) => client.dataSnapshot.findFirst({
    where: {
      taskId: query.taskId,
      ...(query.collectionRunId ? { collectionRunId: query.collectionRunId } : {}),
      ...(query.accountMatchStatus ? { accountMatchStatus: query.accountMatchStatus } : {}),
      OR: [{ routeKey }, { routeKey: null, pageType: routeKey }]
    },
    orderBy: [{ localCollectedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true }
  })));
  return snapshots.flatMap((snapshot) => snapshot ? [snapshot.id] : []);
}

export function selectLatestSnapshotsByRoute<T extends SnapshotSelectionInput>(
  snapshots: T[],
  latestCollectionRunId?: string | null
) {
  const candidates = latestCollectionRunId
    ? snapshots.filter((snapshot) => snapshot.collectionRunId === latestCollectionRunId)
    : snapshots;
  const ordered = [...candidates].sort((left, right) => {
    const collectedDiff = (right.localCollectedAt?.getTime() || 0) - (left.localCollectedAt?.getTime() || 0);
    if (collectedDiff) return collectedDiff;
    const createdDiff = (right.createdAt?.getTime() || 0) - (left.createdAt?.getTime() || 0);
    if (createdDiff) return createdDiff;
    return right.id.localeCompare(left.id);
  });
  const selected = new Map<string, T>();
  for (const snapshot of ordered) {
    const normalizedRoute = normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType);
    const routeIdentity = normalizedRoute === "UNKNOWN"
      ? snapshot.routeKey || snapshot.pageType || snapshot.id
      : normalizedRoute;
    if (!selected.has(routeIdentity)) selected.set(routeIdentity, snapshot);
  }
  return [...selected.values()];
}
