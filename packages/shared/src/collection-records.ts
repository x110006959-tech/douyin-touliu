import { z } from "zod";
import { collectionRouteKeys, type CollectionRouteKey } from "./collection-routes.js";

export const structuredCollectionDataVersion = "collection-records-v1" as const;

export type CollectionRecordProvenance = {
  routeKey: CollectionRouteKey;
  capturedAt: string;
  tableIndex: number;
  rowIndex: number;
  adapterId: string | null;
  adapterVersion: string | null;
  schemaVersion: typeof structuredCollectionDataVersion;
};

export type TaskCollectionRow = {
  taskId: string | null;
  taskName: string | null;
  status: string | null;
  budget: number | null;
  spend: number | null;
  roi: number | null;
  targetRoi: number | null;
  orders: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  provenance: CollectionRecordProvenance;
};

export type HourlyCollectionRow = {
  intervalStart: string | null;
  intervalLabel: string | null;
  spend: number | null;
  orders: number | null;
  roi: number | null;
  liveViews: number | null;
  naturalViews: number | null;
  commercialViews: number | null;
  provenance: CollectionRecordProvenance;
};

export type MaterialCollectionRow = {
  materialId: string | null;
  materialName: string | null;
  auditStatus: string | null;
  createdAt: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  orders: number | null;
  cvr: number | null;
  roi: number | null;
  provenance: CollectionRecordProvenance;
};

type StructuredCollectionDataBase = {
  routeKey: CollectionRouteKey;
  capturedAt: string;
  schemaVersion: typeof structuredCollectionDataVersion;
  adapterId: string | null;
  adapterVersion: string | null;
  acceptedRowCount: number;
  rejectedRowCount: number;
  warnings: string[];
};

export type StructuredCollectionData =
  | (StructuredCollectionDataBase & { kind: "TASK_ROWS"; rows: TaskCollectionRow[] })
  | (StructuredCollectionDataBase & { kind: "HOURLY_ROWS"; rows: HourlyCollectionRow[] })
  | (StructuredCollectionDataBase & { kind: "MATERIAL_ROWS"; rows: MaterialCollectionRow[] });

const nullableNumber = z.number().finite().nullable();
const provenanceSchema = z.object({
  routeKey: z.enum(collectionRouteKeys),
  capturedAt: z.string().datetime(),
  tableIndex: z.number().int().nonnegative(),
  rowIndex: z.number().int().nonnegative(),
  adapterId: z.string().nullable(),
  adapterVersion: z.string().nullable(),
  schemaVersion: z.literal(structuredCollectionDataVersion)
});
const baseSchema = {
  routeKey: z.enum(collectionRouteKeys),
  capturedAt: z.string().datetime(),
  schemaVersion: z.literal(structuredCollectionDataVersion),
  adapterId: z.string().nullable(),
  adapterVersion: z.string().nullable(),
  acceptedRowCount: z.number().int().nonnegative(),
  rejectedRowCount: z.number().int().nonnegative(),
  warnings: z.array(z.string())
};

export const taskCollectionRowSchema = z.object({
  taskId: z.string().nullable(),
  taskName: z.string().nullable(),
  status: z.string().nullable(),
  budget: nullableNumber,
  spend: nullableNumber,
  roi: nullableNumber,
  targetRoi: nullableNumber,
  orders: nullableNumber,
  impressions: nullableNumber,
  clicks: nullableNumber,
  ctr: nullableNumber,
  provenance: provenanceSchema
}).refine((row) => Boolean(row.taskId || row.taskName), "任务行必须包含 taskId 或 taskName");

const hourlyCollectionRowSchema = z.object({
  intervalStart: z.string().nullable(),
  intervalLabel: z.string().nullable(),
  spend: nullableNumber,
  orders: nullableNumber,
  roi: nullableNumber,
  liveViews: nullableNumber,
  naturalViews: nullableNumber,
  commercialViews: nullableNumber,
  provenance: provenanceSchema
});

const materialCollectionRowSchema = z.object({
  materialId: z.string().nullable(),
  materialName: z.string().nullable(),
  auditStatus: z.string().nullable(),
  createdAt: z.string().nullable(),
  spend: nullableNumber,
  impressions: nullableNumber,
  clicks: nullableNumber,
  ctr: nullableNumber,
  orders: nullableNumber,
  cvr: nullableNumber,
  roi: nullableNumber,
  provenance: provenanceSchema
}).refine((row) => Boolean(row.materialId || row.materialName), "素材行必须包含 materialId 或 materialName");

export const structuredCollectionDataSchema = z.discriminatedUnion("kind", [
  z.object({ ...baseSchema, kind: z.literal("TASK_ROWS"), rows: z.array(taskCollectionRowSchema) }),
  z.object({ ...baseSchema, kind: z.literal("HOURLY_ROWS"), rows: z.array(hourlyCollectionRowSchema) }),
  z.object({ ...baseSchema, kind: z.literal("MATERIAL_ROWS"), rows: z.array(materialCollectionRowSchema) })
]);
