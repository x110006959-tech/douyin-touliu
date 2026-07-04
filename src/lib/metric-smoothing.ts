import type { LiveSnapshot } from "@prisma/client";
import type { MetricSmoothingSignal, MetricSmoothingSignals, SmoothedRiskMetric } from "./diagnosis";
import { prisma } from "./prisma";

type SnapshotMetricPoint = Pick<
  LiveSnapshot,
  "id" | "accountId" | "liveRoomName" | "capturedAt" | "sourceEvidenceId" | "sourceQuality" | "complaintRate" | "badReviewRate" | "refundRate"
>;

const smoothingConfig: Record<SmoothedRiskMetric, { label: string; threshold: number }> = {
  complaintRate: { label: "投诉升高", threshold: 0.02 },
  badReviewRate: { label: "差评升高", threshold: 0.03 },
  refundRate: { label: "退款升高", threshold: 0.12 }
};

const defaultSampleCount = 3;
const defaultWindowMinutes = 3;

function metricValue(snapshot: SnapshotMetricPoint, field: SmoothedRiskMetric) {
  const value = snapshot[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function uniqueById(snapshots: SnapshotMetricPoint[]) {
  const seen = new Set<string>();
  return snapshots.filter((snapshot) => {
    if (seen.has(snapshot.id)) return false;
    seen.add(snapshot.id);
    return true;
  });
}

function isStrictlyIncreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

export function evaluateMetricSmoothing(
  snapshot: SnapshotMetricPoint,
  history: SnapshotMetricPoint[],
  sampleCount = defaultSampleCount,
  windowMinutes = defaultWindowMinutes
): MetricSmoothingSignals {
  const currentTime = snapshot.capturedAt.getTime();
  const windowStart = currentTime - windowMinutes * 60 * 1000;
  const points = uniqueById([snapshot, ...history])
    .filter((point) => {
      const captured = point.capturedAt.getTime();
      return captured >= windowStart && captured <= currentTime;
    })
    .sort((left, right) => left.capturedAt.getTime() - right.capturedAt.getTime());

  return Object.fromEntries(
    (Object.keys(smoothingConfig) as SmoothedRiskMetric[]).map((field) => {
      const config = smoothingConfig[field];
      const values = points
        .map((point) => metricValue(point, field))
        .filter((value): value is number => value !== null)
        .slice(-sampleCount);
      const latestValue = metricValue(snapshot, field);
      const enoughSamples = values.length >= sampleCount;
      const increasing = enoughSamples && isStrictlyIncreasing(values);
      const signal: MetricSmoothingSignal = {
        field,
        label: config.label,
        threshold: config.threshold,
        values,
        sampleCount,
        windowMinutes,
        latestValue,
        trend: enoughSamples ? (increasing ? "increasing" : "not_increasing") : "insufficient",
        confirmed: Boolean(latestValue !== null && latestValue > config.threshold && increasing)
      };
      return [field, signal];
    })
  ) as MetricSmoothingSignals;
}

function shouldSmoothSnapshot(snapshot: SnapshotMetricPoint) {
  return Boolean(snapshot.sourceEvidenceId || snapshot.sourceQuality !== "manual");
}

export async function buildMetricSignalsForSnapshot(snapshot: LiveSnapshot) {
  if (!shouldSmoothSnapshot(snapshot)) return undefined;

  const history = await prisma.liveSnapshot.findMany({
    where: {
      id: { not: snapshot.id },
      liveRoomName: snapshot.liveRoomName,
      ...(snapshot.accountId ? { accountId: snapshot.accountId } : {})
    },
    orderBy: { capturedAt: "desc" },
    take: 12
  });

  return evaluateMetricSmoothing(snapshot, history);
}
