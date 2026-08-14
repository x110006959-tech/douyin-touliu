import { z } from "zod";
import { collectionRouteKeys } from "./collection-routes.js";
import {
  liveScreenApiEvidencePurposes,
  liveScreenInternalApiEndpointKeys,
  liveScreenRoomIdPattern,
  liveScreenRoomIdSources
} from "./live-screen-internal-api.js";
import { metricValidationStatuses } from "./metric-value.js";
import { snapshotSafetyLimits } from "./safety.js";

export const pageTypes = ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN", "TASK_TABLE", "UNKNOWN"] as const;
export const metricSources = ["XHR_JSON", "TABLE", "DOM_TEXT", "SCREENSHOT", "MANUAL_INPUT", "UNKNOWN"] as const;
export const metricSourceStatuses = ["INTERNAL_API", "DOM_TEXT", "API_AND_DOM", "SOURCE_CONFLICT"] as const;
export const captureCompletenessValues = ["COMPLETE", "PARTIAL", "UNKNOWN"] as const;
export const captureTabStates = ["VISIBLE", "HIDDEN", "FROZEN", "DISCARDED", "UNKNOWN"] as const;

export type PageType = (typeof pageTypes)[number];
export type MetricSource = (typeof metricSources)[number];
export type MetricSourceStatus = (typeof metricSourceStatuses)[number];
export type CaptureCompleteness = (typeof captureCompletenessValues)[number];
export type CaptureTabState = (typeof captureTabStates)[number];

export const metricRawEvidenceSchema = z.object({
  sourceType: z.string().min(1),
  path: z.string().optional(),
  selector: z.string().optional(),
  tableIndex: z.number().int().optional(),
  rowIndex: z.number().int().optional(),
  columnName: z.string().optional(),
  url: z.string().optional(),
  method: z.string().optional(),
  jsonPath: z.string().optional(),
  textSnippet: z.string().max(500).optional(),
  fieldLabel: z.string().max(100).optional(),
  displayValue: z.string().max(100).optional(),
  normalizedValue: z.string().max(100).nullable().optional(),
  displayPrecision: z.number().int().min(0).max(20).nullable().optional(),
  multiplier: z.number().positive().optional(),
  unitSource: z.enum(["VALUE", "HEADER", "LABEL", "DEFAULT", "NONE"]).optional(),
  timeRange: z.string().max(100).nullable().optional(),
  timeRangeSource: z.enum(["COMPONENT", "TABLE_CONTEXT", "MANUAL"]).optional(),
  timeRangeLocation: z.string().max(300).nullable().optional(),
  bindingKind: z.enum(["CARD", "TABLE", "MANUAL"]).optional(),
  componentPath: z.string().max(300).optional(),
  rowIdentity: z.string().max(200).optional(),
  calibrationSignature: z.string().max(500).optional(),
  validationStatus: z.enum(metricValidationStatuses).optional(),
  validationReasons: z.array(z.string().max(100)).max(20).optional(),
  sourceStatus: z.enum(metricSourceStatuses).optional(),
  apiCandidate: z.object({
    value: z.string().max(100), displayValue: z.string().max(100), unit: z.string().nullable(), timeRange: z.string().max(100),
    displayPrecision: z.number().int().min(0).max(20), fieldPath: z.string().max(300), fieldLabel: z.string().max(100)
  }).optional(),
  domCandidate: z.object({
    value: z.string().max(100), displayValue: z.string().max(100), unit: z.string().nullable(), timeRange: z.string().max(100),
    displayPrecision: z.number().int().min(0).max(20), fieldPath: z.string().max(300), fieldLabel: z.string().max(100)
  }).optional(),
  selectionReason: z.string().max(200).optional(),
  manualSourceSelection: z.enum(["API", "DOM", "IGNORE"]).optional(),
  semanticScope: z.string().max(100).optional(),
  apiContractVersion: z.string().max(50).optional(),
  apiAdapterVersion: z.string().max(50).optional(),
  endpointKey: z.string().max(100).optional(),
  evidencePurpose: z.enum(liveScreenApiEvidencePurposes).optional()
});

export const visibleMetricSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().nullable().optional(),
  source: z.enum(["dom", "table", "network", "manual"]),
  metricSource: z.enum(metricSources).optional(),
  confidence: z.number().min(0).max(1).optional(),
  rawEvidence: metricRawEvidenceSchema.nullable().optional()
});

export const networkRecordSchema = z.object({
  url: z.string().url().max(snapshotSafetyLimits.urlChars),
  method: z.string().min(1).max(16),
  status: z.number().int().min(0).max(599),
  responseJson: z.unknown(),
  capturedAt: z.string().datetime()
});

export const captureMetaSchema = z.object({
  adapterId: z.string().min(1).max(100),
  adapterVersion: z.string().min(1).max(50),
  pageFingerprint: z.string().min(1).max(128),
  completeness: z.enum(captureCompletenessValues),
  coverageRatio: z.number().min(0).max(1),
  expectedFields: z.array(z.string().max(100)).max(100),
  extractedFields: z.array(z.string().max(100)).max(100),
  visibleRegions: z.array(z.string().max(100)).max(50),
  renderModes: z.array(z.enum(["DOM", "TABLE", "CANVAS", "VIRTUALIZED"])).max(4),
  tableBindings: z.array(z.object({
    tableIndex: z.number().int().min(0).max(3),
    headers: z.array(z.string().max(100)).min(1).max(100),
    identityColumn: z.string().max(100).nullable(),
    identityColumnIndex: z.number().int().min(0).max(99).nullable().optional(),
    timeRange: z.string().max(100).nullable().optional(),
    timeRangeLocation: z.string().max(300).nullable().optional(),
    componentPath: z.string().max(300).nullable().optional(),
    bindingSignature: z.string().min(1).max(500),
    validationStatus: z.enum(metricValidationStatuses),
    validationReasons: z.array(z.string().max(100)).max(20)
  })).max(4).optional(),
  tabState: z.enum(captureTabStates),
  originalBytes: z.number().int().min(0),
  acceptedBytes: z.number().int().min(0),
  truncatedFields: z.array(z.string().max(100)).max(100),
  truncationReasons: z.array(z.string().max(200)).max(100),
  routeDetection: z.object({
    routeKey: z.enum(collectionRouteKeys),
    source: z.enum(["MANUAL", "URL", "ACTIVE_TAB", "VISIBLE_CONTENT", "PAGE_TYPE", "UNKNOWN"]),
    confidence: z.number().min(0).max(1),
    manuallyConfirmed: z.boolean(),
    evidence: z.array(z.string().max(200)).max(20)
  }).optional(),
  liveScreenInternalApi: z.object({
    contractVersion: z.string().max(50),
    adapterVersion: z.string().max(50),
    enabled: z.boolean(),
    roomId: z.string().regex(liveScreenRoomIdPattern).nullable().optional(),
    roomIdSource: z.enum(liveScreenRoomIdSources),
    roomIdEvidence: z.object({
      urlRoomIds: z.array(z.string().regex(liveScreenRoomIdPattern)).max(2),
      domRoomIds: z.array(z.string().regex(liveScreenRoomIdPattern)).max(2)
    }).optional(),
    endpointStatuses: z.array(z.object({
      endpoint: z.enum(liveScreenInternalApiEndpointKeys),
      status: z.enum(["SUCCESS", "SKIPPED", "FAILED", "ABORTED"]),
      acceptedBytes: z.number().int().min(0).max(384 * 1024),
      reason: z.string().max(100).optional()
    })).max(liveScreenInternalApiEndpointKeys.length),
    minuteRows: z.array(z.object({
      intervalLabel: z.string().min(1).max(100),
      liveViews: z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
    })).max(120).optional()
  }).optional()
});

export const collectionSnapshotSchema = z.object({
  pageType: z.enum(pageTypes).default("UNKNOWN"),
  sourceUrl: z.string().url().max(snapshotSafetyLimits.urlChars),
  pageTitle: z.string().max(snapshotSafetyLimits.pageTitleChars).default(""),
  rawDomText: z.string().max(snapshotSafetyLimits.rawDomTextChars).default(""),
  rawNetworkJson: z.array(networkRecordSchema).max(snapshotSafetyLimits.networkRecords).default([]),
  rawTableData: z.array(z.unknown()).max(snapshotSafetyLimits.tableItems).default([]),
  visibleMetricsJson: z.array(visibleMetricSchema).max(snapshotSafetyLimits.visibleMetrics).default([]),
  screenshotUrl: z.string().url().max(snapshotSafetyLimits.urlChars).nullable().optional(),
  localCollectedAt: z.string().datetime(),
  collectionRunId: z.string().min(1).max(128).nullable().optional(),
  routeKey: z.enum(collectionRouteKeys).optional(),
  captureProtocolVersion: z.number().int().min(1).max(100).optional(),
  captureMeta: captureMetaSchema.optional()
});

export const metricPulseSchema = z.object({
  collectionRunId: z.string().min(1).max(128).nullable().optional(),
  routeKey: z.enum(collectionRouteKeys),
  pageType: z.enum(pageTypes),
  localCapturedAt: z.string().datetime(),
  tabState: z.enum(captureTabStates),
  metrics: z.array(visibleMetricSchema).max(32),
  captureMeta: captureMetaSchema,
  sourceUrl: z.string().url().max(snapshotSafetyLimits.urlChars).nullable().optional(),
  captureProtocolVersion: z.number().int().min(1).max(100).optional()
});
