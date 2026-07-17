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
