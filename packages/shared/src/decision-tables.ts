import { z } from "zod";
import { collectionRouteKeys, type CollectionRouteKey } from "./collection-routes.js";

export type DecisionTableCell = string | number | boolean | null;

export type DecisionTableInput = {
  routeKey: CollectionRouteKey | null;
  pageType: string | null;
  rows: DecisionTableCell[][];
};

export const decisionTableCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const decisionTableInputSchema = z.object({
  routeKey: z.enum(collectionRouteKeys).nullable(),
  pageType: z.string().nullable(),
  rows: z.array(z.array(decisionTableCellSchema).max(100)).max(1_000)
});

export function projectRawTableData(
  raw: unknown,
  context: { routeKey: CollectionRouteKey | null; pageType: string | null }
): DecisionTableInput[] {
  if (!Array.isArray(raw) || !raw.length) return [];
  const tables = isTableMatrix(raw)
    ? [raw]
    : raw.filter((candidate): candidate is unknown[] => Array.isArray(candidate));
  return tables
    .filter(isTableMatrix)
    .map((rows) => ({
      ...context,
      rows: rows.slice(0, 1_000).map((row) =>
        (row as unknown[]).slice(0, 100).map(normalizeDecisionTableCell)
      )
    }));
}

function normalizeDecisionTableCell(value: unknown): DecisionTableCell {
  if (value == null) return null;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}

function isTableMatrix(value: unknown[]): boolean {
  return value.length > 0
    && value.every((row) => Array.isArray(row))
    && value.some((row) =>
      (row as unknown[]).some((cell) =>
        !Array.isArray(cell) && (cell == null || ["string", "number", "boolean"].includes(typeof cell))
      )
    );
}
