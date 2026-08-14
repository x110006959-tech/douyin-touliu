import {
  metricValueSemantic,
  metricValueToRuleNumber,
  structuredCollectionDataSchema,
  structuredCollectionDataVersion,
  type CaptureMeta,
  type StructuredCollectionData
} from "@douyin-local-life/shared";

type LiveScreenMinuteRows = NonNullable<NonNullable<CaptureMeta["liveScreenInternalApi"]>["minuteRows"]>;

export function structureLiveScreenMinuteTrend(input: {
  routeKey: string;
  capturedAt: string;
  adapterId?: string | null;
  adapterVersion?: string | null;
  minuteRows?: LiveScreenMinuteRows;
}): StructuredCollectionData | null {
  if (input.routeKey !== "LIVE_DATA_SCREEN" || !input.minuteRows?.length) return null;

  const rows = input.minuteRows.flatMap((row, rowIndex) => {
    const liveViews = metricValueToRuleNumber({ value: row.liveViews }, metricValueSemantic("hourly_live_views"));
    if (liveViews == null || liveViews < 0) return [];
    return [{
      intervalStart: null,
      intervalLabel: row.intervalLabel,
      spend: null,
      orders: null,
      roi: null,
      liveViews,
      naturalViews: null,
      commercialViews: null,
      provenance: {
        routeKey: "LIVE_DATA_SCREEN" as const,
        capturedAt: input.capturedAt,
        tableIndex: 0,
        rowIndex,
        adapterId: input.adapterId?.trim() || null,
        adapterVersion: input.adapterVersion?.trim() || null,
        schemaVersion: structuredCollectionDataVersion
      }
    }];
  });
  if (!rows.length) return null;

  return structuredCollectionDataSchema.parse({
    kind: "HOURLY_ROWS",
    routeKey: "LIVE_DATA_SCREEN",
    capturedAt: input.capturedAt,
    schemaVersion: structuredCollectionDataVersion,
    adapterId: input.adapterId?.trim() || null,
    adapterVersion: input.adapterVersion?.trim() || null,
    acceptedRowCount: rows.length,
    rejectedRowCount: input.minuteRows.length - rows.length,
    warnings: rows.length === input.minuteRows.length ? [] : ["部分分钟趋势行无法解析，已保留可验证行"],
    rows
  });
}
