import type { Prisma } from "@prisma/client";
import {
  isAllowedCollectionMetricLabel,
  metricValueSemantic,
  metricValueText,
  normalizeCollectionRouteKey,
  projectRawTableData,
  type CaptureMeta,
  type CollectionRouteKey,
  type MetricRawEvidence,
  type VisibleMetric
} from "@douyin-local-life/shared";

type CalibrationClient = Pick<Prisma.TransactionClient, "collectionBindingCalibration">;

type TableCalibrationClient = Pick<Prisma.TransactionClient, "collectionBindingCalibration" | "tableCellReview">;

export async function qualifyCapturedMetrics(
  db: CalibrationClient,
  input: {
    workspaceId: string;
    routeKey: string;
    captureMeta?: CaptureMeta;
    metrics: VisibleMetric[];
  }
  ) {
  const routeKey = normalizeCollectionRouteKey(input.routeKey);
  const pageFingerprint = input.captureMeta?.pageFingerprint || "";
  const candidates = input.metrics.flatMap((metric) => {
    const evidence = metric.rawEvidence;
    if (!pageFingerprint || evidence?.validationStatus === "INVALID" || !evidence?.calibrationSignature) return [];
    return [{ bindingKind: "METRIC" as const, bindingKey: String(metric.key), bindingSignature: evidence.calibrationSignature }];
  });
  const calibrations = candidates.length
    ? await db.collectionBindingCalibration.findMany({
        where: {
          workspaceId: input.workspaceId,
          routeKey: normalizeCollectionRouteKey(input.routeKey),
          pageFingerprint,
          OR: candidates
        },
        select: { bindingKind: true, bindingKey: true, bindingSignature: true }
      })
    : [];
  const calibrated = new Set(calibrations.map((item) => `${item.bindingKind}:${item.bindingKey}:${item.bindingSignature}`));
  const qualified = input.metrics.map((metric) => qualifyMetric(metric, calibrated, routeKey));
  return applyRoiCrossCheck(qualified);
}

export function isInvalidMetricEvidence(value: unknown) {
  return metricEvidence(value)?.validationStatus === "INVALID";
}

export function needsManualBindingReview(value: unknown) {
  return metricEvidence(value)?.validationStatus === "REQUIRES_REVIEW";
}

export function canAutoConfirmMetric(metric: { metricSource: string; rawEvidence: unknown }) {
  if (isInvalidMetricEvidence(metric.rawEvidence)) return false;
  if (metric.metricSource === "MANUAL_INPUT") return true;
  return metricEvidence(metric.rawEvidence)?.validationStatus === "TRUSTED";
}

export function isConfirmableMetricEvidence(value: unknown) {
  const evidence = metricEvidence(value);
  if (!evidence) return false;
  if (evidence.validationStatus === "INVALID") return false;
  if (evidence.bindingKind === "MANUAL" || evidence.sourceType === "MANUAL_INPUT") return true;
  return metricEvidenceProblems(evidence).length === 0;
}

export function calibrationInputForMetric(input: {
  workspaceId: string;
  routeKey: string | null | undefined;
  captureMetaJson: unknown;
  metricKey: string;
  rawEvidence: unknown;
  reviewerId: string;
}) {
  const meta = captureMeta(input.captureMetaJson);
  const evidence = metricEvidence(input.rawEvidence);
  const routeKey = normalizeCollectionRouteKey(input.routeKey);
  if (
    !meta?.pageFingerprint
    || !evidence?.calibrationSignature
    || !isConfirmableMetricEvidence(evidence)
    || !evidence.fieldLabel
    || !isAllowedCollectionMetricLabel(routeKey, input.metricKey, evidence.fieldLabel)
  ) return null;
  return {
    workspaceId: input.workspaceId,
    routeKey,
    pageFingerprint: meta.pageFingerprint,
    bindingKind: "METRIC" as const,
    bindingKey: input.metricKey,
    bindingSignature: evidence.calibrationSignature,
    confirmedById: input.reviewerId
  };
}

export async function recordMetricBindingCalibration(
  db: CalibrationClient,
  input: Parameters<typeof calibrationInputForMetric>[0]
) {
  const calibration = calibrationInputForMetric(input);
  if (!calibration) return;
  await db.collectionBindingCalibration.upsert({
    where: { workspaceId_routeKey_pageFingerprint_bindingKind_bindingKey_bindingSignature: {
      workspaceId: calibration.workspaceId,
      routeKey: calibration.routeKey,
      pageFingerprint: calibration.pageFingerprint,
      bindingKind: calibration.bindingKind,
      bindingKey: calibration.bindingKey,
      bindingSignature: calibration.bindingSignature
    } },
    create: calibration,
    update: { confirmedById: calibration.confirmedById }
  });
}

export async function hasTrustedTableBindings(
  db: CalibrationClient,
  input: { workspaceId: string; routeKey: string | null | undefined; captureMetaJson: unknown }
) {
  const meta = captureMeta(input.captureMetaJson);
  if (!meta || !("tableBindings" in meta)) return false;
  const bindings = meta.tableBindings || [];
  if (!meta.pageFingerprint || !bindings.length) return false;
  const trusted = await trustedTableBindingKeys(db, input, meta);
  return bindings.every((binding) => (
    !isTableBindingInvalid(binding)
    && trusted.has(`${binding.tableIndex}:${binding.bindingSignature}`)
  ));
}

export async function hasTrustedTableBinding(
  db: CalibrationClient,
  input: { workspaceId: string; routeKey: string | null | undefined; captureMetaJson: unknown; tableIndex: number }
) {
  const meta = captureMeta(input.captureMetaJson);
  if (!meta || !("tableBindings" in meta)) return false;
  const binding = meta.tableBindings?.find((item) => item.tableIndex === input.tableIndex);
  if (!meta.pageFingerprint || !binding || isTableBindingInvalid(binding)) return false;
  const trusted = await trustedTableBindingKeys(db, input, meta);
  return trusted.has(`${binding.tableIndex}:${binding.bindingSignature}`);
}

export async function qualifyTableBindings(
  db: CalibrationClient,
  input: { workspaceId: string; routeKey: string | null | undefined; captureMeta?: CaptureMeta; rawTableData?: unknown }
) {
  const meta = input.captureMeta;
  const routeKey = normalizeCollectionRouteKey(input.routeKey);
  const rawTables = input.rawTableData === undefined
    ? null
    : projectRawTableData(input.rawTableData, { routeKey, pageType: null });
  const bindings = (meta?.tableBindings || []).map((binding) => {
    const problems = rawTables ? tableBindingDataProblems(binding, rawTables, meta?.tableBindings?.length || 0) : [];
    return problems.length
      ? { ...binding, validationStatus: "INVALID" as const, validationReasons: [...new Set([...binding.validationReasons, ...problems])] }
      : binding;
  });
  if (!meta?.pageFingerprint || !bindings.length) return meta;
  const verifiedMeta = { ...meta, tableBindings: bindings } as CaptureMeta;
  const trusted = await trustedTableBindingKeys(db, input, verifiedMeta);
  return {
    ...verifiedMeta,
    tableBindings: bindings.map((binding) => ({
      ...binding,
      validationStatus: isTableBindingInvalid(binding)
        ? "INVALID"
        : trusted.has(`${binding.tableIndex}:${binding.bindingSignature}`)
          ? "TRUSTED"
          : "REQUIRES_REVIEW"
    }))
  } as CaptureMeta;
}

export function hasTrustedMetricEvidence(value: unknown) {
  return metricEvidence(value)?.validationStatus === "TRUSTED";
}

export async function calibrateFullyReviewedTables(
  db: TableCalibrationClient,
  input: {
    workspaceId: string;
    routeKey: string | null | undefined;
    captureMetaJson: unknown;
    snapshotId: string;
    totalCellCountsByTable: Map<number, number>;
    reviewerId: string;
  }
) {
  const meta = captureMeta(input.captureMetaJson);
  const bindings = meta?.tableBindings || [];
  if (!meta?.pageFingerprint || !bindings.length) return null;
  const reviews = await db.tableCellReview.findMany({
    where: { snapshotId: input.snapshotId },
    select: { tableIndex: true, reviewStatus: true }
  });
  for (const binding of bindings) {
    if (isTableBindingInvalid(binding)) continue;
    const totalForTable = input.totalCellCountsByTable.get(binding.tableIndex) || 0;
    const confirmedForTable = reviews.filter((review) => review.tableIndex === binding.tableIndex && review.reviewStatus !== "PENDING").length;
    if (!totalForTable || confirmedForTable < totalForTable) continue;
    await db.collectionBindingCalibration.upsert({
      where: { workspaceId_routeKey_pageFingerprint_bindingKind_bindingKey_bindingSignature: {
        workspaceId: input.workspaceId,
        routeKey: normalizeCollectionRouteKey(input.routeKey),
        pageFingerprint: meta.pageFingerprint,
        bindingKind: "TABLE",
        bindingKey: String(binding.tableIndex),
        bindingSignature: binding.bindingSignature
      } },
      create: {
        workspaceId: input.workspaceId,
        routeKey: normalizeCollectionRouteKey(input.routeKey),
        pageFingerprint: meta.pageFingerprint,
        bindingKind: "TABLE",
        bindingKey: String(binding.tableIndex),
        bindingSignature: binding.bindingSignature,
        confirmedById: input.reviewerId
      },
      update: { confirmedById: input.reviewerId }
    });
  }
  const allCalibrated = bindings.every((binding) => {
    if (isTableBindingInvalid(binding)) return false;
    const totalForTable = input.totalCellCountsByTable.get(binding.tableIndex) || 0;
    const confirmedForTable = reviews.filter((review) => review.tableIndex === binding.tableIndex && review.reviewStatus !== "PENDING").length;
    return totalForTable > 0 && confirmedForTable >= totalForTable;
  });
  return allCalibrated
    ? { ...meta, tableBindings: bindings.map((binding) => ({ ...binding, validationStatus: "TRUSTED" as const })) }
    : null;
}

export async function confirmTableBindingCalibration(
  db: CalibrationClient,
  input: {
    workspaceId: string;
    routeKey: string | null | undefined;
    captureMetaJson: unknown;
    tableIndex: number;
    reviewerId: string;
  }
) {
  const meta = captureMeta(input.captureMetaJson);
  const binding = meta?.tableBindings?.find((item) => item.tableIndex === input.tableIndex);
  if (!meta?.pageFingerprint || !binding || isTableBindingInvalid(binding)) return null;
  const routeKey = normalizeCollectionRouteKey(input.routeKey);
  await db.collectionBindingCalibration.upsert({
    where: { workspaceId_routeKey_pageFingerprint_bindingKind_bindingKey_bindingSignature: {
      workspaceId: input.workspaceId,
      routeKey,
      pageFingerprint: meta.pageFingerprint,
      bindingKind: "TABLE",
      bindingKey: String(binding.tableIndex),
      bindingSignature: binding.bindingSignature
    } },
    create: {
      workspaceId: input.workspaceId,
      routeKey,
      pageFingerprint: meta.pageFingerprint,
      bindingKind: "TABLE",
      bindingKey: String(binding.tableIndex),
      bindingSignature: binding.bindingSignature,
      confirmedById: input.reviewerId
    },
    update: { confirmedById: input.reviewerId }
  });
  return {
    ...meta,
    tableBindings: meta.tableBindings?.map((item) => item.tableIndex === input.tableIndex
      ? { ...item, validationStatus: "TRUSTED" as const }
      : item)
  } as CaptureMeta;
}

async function trustedTableBindingKeys(
  db: CalibrationClient,
  input: { workspaceId: string; routeKey: string | null | undefined },
  meta: CaptureMeta
) {
  const bindings = meta.tableBindings || [];
  if (!meta.pageFingerprint || !bindings.length) return new Set<string>();
  const calibrations = await db.collectionBindingCalibration.findMany({
    where: {
      workspaceId: input.workspaceId,
      routeKey: normalizeCollectionRouteKey(input.routeKey),
      pageFingerprint: meta.pageFingerprint,
      bindingKind: "TABLE",
      OR: bindings.map((binding) => ({ bindingKey: String(binding.tableIndex), bindingSignature: binding.bindingSignature }))
    },
    select: { bindingKey: true, bindingSignature: true }
  });
  return new Set(calibrations.map((item) => `${item.bindingKey}:${item.bindingSignature}`));
}

function qualifyMetric(metric: VisibleMetric, calibrated: Set<string>, routeKey: CollectionRouteKey): VisibleMetric {
  const evidence = metricEvidence(metric.rawEvidence);
  if (!evidence) return invalidate({
    ...metric,
    rawEvidence: { sourceType: metric.metricSource || "UNKNOWN", validationStatus: "INVALID", validationReasons: [] }
  }, "BINDING_EVIDENCE_MISSING");
  const problems = metricEvidenceProblems(evidence, routeKey, String(metric.key));
  if (evidence.validationStatus === "INVALID" || problems.length) {
    return problems.reduce((current, reason) => invalidate(current, reason), metric);
  }
  if (metric.metricSource === "MANUAL_INPUT" || evidence.sourceType === "MANUAL_INPUT" || evidence.bindingKind === "MANUAL") {
    return { ...metric, confidence: 1, rawEvidence: { ...evidence, validationStatus: "TRUSTED", validationReasons: [] } };
  }
  const isTrusted = Boolean(evidence.calibrationSignature && calibrated.has(`METRIC:${metric.key}:${evidence.calibrationSignature}`));
  const validationStatus = isTrusted ? "TRUSTED" as const : "REQUIRES_REVIEW" as const;
  return {
    ...metric,
    confidence: isTrusted ? Math.max(metric.confidence ?? 0, 0.95) : metric.confidence,
    rawEvidence: { ...evidence, validationStatus, validationReasons: evidence.validationReasons || [] }
  };
}

function applyRoiCrossCheck(metrics: VisibleMetric[]) {
  const spend = metrics.find((metric) => metric.key === "spend");
  const gmv = metrics.find((metric) => metric.key === "gmv");
  const roi = metrics.find((metric) => metric.key === "pay_roi");
  if (!spend || !gmv || !roi) return metrics;
  const evidence = [spend, gmv, roi].map((metric) => metricEvidence(metric.rawEvidence));
  const timeRanges = evidence.map((item) => item?.timeRange).filter((value): value is string => Boolean(value));
  if (timeRanges.length !== 3) {
    return metrics.map((metric) => ["spend", "gmv", "pay_roi"].includes(String(metric.key))
      ? invalidate(metric, "TIME_RANGE_MISSING")
      : metric);
  }
  if (new Set(timeRanges).size !== 1) {
    return metrics.map((metric) => ["spend", "gmv", "pay_roi"].includes(String(metric.key))
      ? invalidate(metric, "TIME_RANGE_MISMATCH")
      : metric);
  }
  const spendValue = decimalRatioValue(spend);
  const gmvValue = decimalRatioValue(gmv);
  const roiValue = decimalRatioValue(roi);
  if (!spendValue || !gmvValue || !roiValue || spendValue.integer <= 0n) return metrics;
  const precision = metricEvidence(roi.rawEvidence)?.displayPrecision ?? 2;
  if (roiMatchesDisplayedPrecision(gmvValue, spendValue, roiValue, precision)) return metrics;
  return metrics.map((metric) => ["spend", "gmv", "pay_roi"].includes(String(metric.key))
    ? invalidate(metric, "ROI_CROSS_CHECK_FAILED")
    : metric);
}

function invalidate(metric: VisibleMetric, reason: string): VisibleMetric {
  const evidence = metricEvidence(metric.rawEvidence);
  if (!evidence) return metric;
  return {
    ...metric,
    confidence: Math.min(metric.confidence ?? 0.1, 0.1),
    rawEvidence: {
      ...evidence,
      validationStatus: "INVALID",
      validationReasons: [...new Set([...(evidence.validationReasons || []), reason])]
    }
  };
}

function metricEvidenceProblems(evidence: MetricRawEvidence, routeKey?: CollectionRouteKey, metricKey?: string) {
  if (evidence.bindingKind === "MANUAL" || evidence.sourceType === "MANUAL_INPUT") return [];
  const reasons = [
    ...(!evidence.bindingKind ? ["BINDING_EVIDENCE_MISSING"] : []),
    ...(!evidence.fieldLabel ? ["FIELD_LABEL_MISSING"] : []),
    ...(typeof evidence.displayValue !== "string" || !evidence.displayValue.trim() ? ["DISPLAY_VALUE_MISSING"] : []),
    ...(!evidence.calibrationSignature ? ["BINDING_SIGNATURE_MISSING"] : []),
    ...(!evidence.timeRange ? ["TIME_RANGE_MISSING"] : []),
    ...(!evidence.timeRangeLocation ? ["TIME_RANGE_LOCATION_MISSING"] : []),
    ...(evidence.bindingKind === "CARD" && !evidence.componentPath ? ["COMPONENT_PATH_MISSING"] : []),
    ...(evidence.bindingKind === "TABLE" && (evidence.rowIndex == null || !evidence.columnName || !evidence.rowIdentity)
      ? ["TABLE_CELL_BINDING_MISSING"]
      : [])
  ];
  if (routeKey && metricKey && evidence.fieldLabel && !isAllowedCollectionMetricLabel(routeKey, metricKey, evidence.fieldLabel)) {
    reasons.push("FIELD_LABEL_NOT_ALLOWED");
  }
  return [...new Set(reasons)];
}

function isTableBindingInvalid(binding: NonNullable<CaptureMeta["tableBindings"]>[number]) {
  return binding.validationStatus === "INVALID"
    || !binding.headers.length
    || binding.identityColumnIndex == null
    || binding.identityColumnIndex < 0
    || binding.identityColumnIndex >= binding.headers.length
    || binding.headers[binding.identityColumnIndex] !== binding.identityColumn
    || !binding.timeRange
    || !binding.timeRangeLocation
    || !binding.componentPath;
}

function tableBindingDataProblems(
  binding: NonNullable<CaptureMeta["tableBindings"]>[number],
  tables: ReturnType<typeof projectRawTableData>,
  bindingCount: number
) {
  const table = tables[binding.tableIndex];
  if (!table) return ["TABLE_BINDING_DATA_MISSING"];
  const headers = table.rows[0]?.map((cell) => String(cell ?? "").trim()) || [];
  const reasons = [
    ...(tables.length !== bindingCount ? ["TABLE_BINDING_COUNT_MISMATCH"] : []),
    ...(headers.length !== binding.headers.length || headers.some((header, index) => header !== binding.headers[index])
      ? ["TABLE_HEADER_DATA_MISMATCH"]
      : []),
    ...(table.rows.some((row) => row.length !== headers.length) ? ["TABLE_COLUMN_COUNT_MISMATCH"] : [])
  ];
  const identityIndex = binding.identityColumnIndex;
  if (identityIndex == null || identityIndex < 0 || identityIndex >= headers.length || headers[identityIndex] !== binding.identityColumn) {
    reasons.push("TABLE_IDENTITY_COLUMN_MISMATCH");
    return [...new Set(reasons)];
  }
  const identities = table.rows.slice(1).map((row) => String(row[identityIndex] ?? "").trim());
  if (identities.some((identity) => !identity)) reasons.push("TABLE_ROW_IDENTITY_MISSING");
  if (new Set(identities).size !== identities.length) reasons.push("TABLE_ROW_IDENTITY_DUPLICATED");
  return [...new Set(reasons)];
}

type DecimalRatioValue = { integer: bigint; scale: bigint };

function decimalRatioValue(metric: VisibleMetric): DecimalRatioValue | null {
  const text = metricValueText(metric, metricValueSemantic(String(metric.key)));
  if (!text || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  return {
    integer: (negative ? -1n : 1n) * BigInt(`${whole}${fraction}`),
    scale: 10n ** BigInt(fraction.length)
  };
}

function roiMatchesDisplayedPrecision(gmv: DecimalRatioValue, spend: DecimalRatioValue, roi: DecimalRatioValue, precision: number) {
  const expectedNumerator = gmv.integer * spend.scale;
  const expectedDenominator = gmv.scale * spend.integer;
  const displayedNumerator = roi.integer;
  const displayedDenominator = roi.scale;
  const difference = absoluteBigInt(expectedNumerator * displayedDenominator - displayedNumerator * expectedDenominator);
  const precisionScale = 10n ** BigInt(Math.max(0, precision));
  // A displayed ROI rounded to N digits may differ by half of the smallest visible unit.
  return difference * 2n * precisionScale <= absoluteBigInt(expectedDenominator) * displayedDenominator;
}

function absoluteBigInt(value: bigint) {
  return value < 0n ? -value : value;
}

function captureMeta(value: unknown): CaptureMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const pageFingerprint = (value as Record<string, unknown>).pageFingerprint;
  return typeof pageFingerprint === "string" ? value as CaptureMeta : null;
}

function metricEvidence(value: unknown): MetricRawEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sourceType = (value as Record<string, unknown>).sourceType;
  return typeof sourceType === "string" ? value as MetricRawEvidence : null;
}
