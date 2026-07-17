import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  metricKeys,
  normalizeMetricLookupValue,
  pageTypes,
  type CollectionSnapshotPayload,
  type MetricKey,
  type VisibleMetric
} from "@douyin-local-life/shared";

export const metricAliasOverrideInputSchema = z.object({
  metricKey: z.enum(metricKeys).refine((key) => key !== "unknown", "metricKey cannot be unknown"),
  pageType: z.union([z.enum(pageTypes), z.literal("ANY")]).default("ANY"),
  note: z.string().trim().max(500).optional()
});

export const metricDriftStatusSchema = z.enum(["OPEN", "RESOLVED", "IGNORED"]);

export async function recordMetricDriftEvents(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    collectionTaskId: string;
    snapshotId: string;
    snapshot: CollectionSnapshotPayload;
    normalized: VisibleMetric[];
  }
) {
  const fingerprint = input.snapshot.captureMeta?.pageFingerprint || "unknown";
  const events = input.normalized
    .filter((metric) => metric.key === "unknown")
    .map((metric) => driftInput(input, String(metric.name || metric.key), "UNKNOWN_METRIC", fingerprint));
  if (input.snapshot.captureMeta?.completeness === "PARTIAL" || input.snapshot.captureMeta?.completeness === "UNKNOWN") {
    events.push(driftInput(input, `__coverage__:${input.snapshot.captureMeta.adapterId}`, `CAPTURE_${input.snapshot.captureMeta.completeness}`, fingerprint));
  }
  if (!events.length) return 0;
  const created = await tx.metricDriftEvent.createMany({ data: events, skipDuplicates: true });
  return created.count;
}

export function normalizeAlias(value: string) {
  return normalizeMetricLookupValue(value).slice(0, 200);
}

function driftInput(
  input: { projectId: string; collectionTaskId: string; snapshotId: string; snapshot: CollectionSnapshotPayload },
  rawField: string,
  reason: string,
  fingerprint: string
): Prisma.MetricDriftEventCreateManyInput {
  const aliasNormalized = normalizeAlias(rawField) || "unknown";
  return {
    dedupeKey: `${input.collectionTaskId}:${input.snapshot.pageType}:${fingerprint}:${aliasNormalized}:${reason}`.slice(0, 500),
    projectId: input.projectId,
    collectionTaskId: input.collectionTaskId,
    snapshotId: input.snapshotId,
    rawField: rawField.slice(0, 500),
    aliasNormalized,
    pageType: input.snapshot.pageType,
    reason,
    candidateKeysJson: candidateMetricKeys(rawField)
  };
}

function candidateMetricKeys(rawField: string): MetricKey[] {
  const value = normalizeAlias(rawField);
  if (value.includes("roi")) return ["pay_roi", "verify_roi", "gross_profit_roi"];
  if (value.includes("消耗") || value.includes("spend")) return ["spend", "recent_30m_spend"];
  if (value.includes("订单") || value.includes("order")) return ["orders", "recent_30m_orders"];
  if (value.includes("点击率") || value.includes("ctr")) return ["ctr"];
  if (value.includes("点击")) return ["clicks"];
  if (value.includes("曝光")) return ["impressions"];
  return [];
}
