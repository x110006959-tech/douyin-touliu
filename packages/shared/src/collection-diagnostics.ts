import {
  collectionFreshnessPolicy,
  normalizeCollectionRouteKey,
  type CollectionRouteKey
} from "./collection-routes.js";
import { z } from "zod";

export const collectionRouteDiagnosticStatuses = [
  "UPLOADED",
  "AGING",
  "PARTIAL",
  "UNVERIFIED",
  "MANUAL_PENDING",
  "STALE",
  "FAILED",
  "MISSING"
] as const;

export const collectionIssueCodes = [
  "NO_SNAPSHOT",
  "SNAPSHOT_STALE",
  "COLLECTOR_STALLED",
  "CONSECUTIVE_FAILURES",
  "ROUTE_UNVERIFIED",
  "PARTIAL_CAPTURE",
  "LOW_FIELD_COVERAGE",
  "CAPTURE_TRUNCATED",
  "UPLOAD_FAILED"
] as const;

export const collectionRouteFailureCodes = [
  "CONTENT_SCRIPT_UNAVAILABLE",
  "PAGE_NOT_READY",
  "ROUTE_UNVERIFIED",
  "UPLOAD_NETWORK_ERROR",
  "UPLOAD_HTTP_ERROR",
  "UNKNOWN"
] as const;

export type CollectionRouteDiagnosticStatus = (typeof collectionRouteDiagnosticStatuses)[number];
export type CollectionIssueCode = (typeof collectionIssueCodes)[number];
export type CollectionRouteFailureCode = (typeof collectionRouteFailureCodes)[number];
export type CollectionIssueSeverity = "INFO" | "WARNING" | "ERROR";

export type CollectionDiagnosticIssue = {
  code: CollectionIssueCode;
  severity: CollectionIssueSeverity;
  message: string;
  recoveryAction: string;
};

export type CollectionDataProvenance = {
  snapshotId: string | null;
  routeKey: CollectionRouteKey;
  capturedAt: string | null;
  adapterId: string | null;
  adapterVersion: string | null;
  pageFingerprint: string | null;
};

export type CollectionRouteDiagnostic = {
  routeKey: CollectionRouteKey;
  required: boolean;
  summaryStatus: CollectionRouteDiagnosticStatus;
  freshnessState: "FRESH" | "AGING" | "STALE" | "MISSING";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastCapturedAt: string | null;
  ageMs: number | null;
  consecutiveFailures: number;
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN" | null;
  coverageRatio: number | null;
  adapterId: string | null;
  adapterVersion: string | null;
  pageFingerprint: string | null;
  expectedFields: string[];
  extractedFields: string[];
  missingFields: string[];
  truncationReasons: string[];
  issues: CollectionDiagnosticIssue[];
  blocksFormalDecision: boolean;
  blocksStrongActions: boolean;
};

export type CollectionRouteDiagnosticInput = {
  routeKey: unknown;
  required: boolean;
  runActive?: boolean;
  runStartedAt?: Date | string | null;
  snapshot?: {
    id?: string | null;
    localCollectedAt?: Date | string | null;
    routeVerificationStatus?: string | null;
    captureMeta?: {
      completeness?: string | null;
      coverageRatio?: number | null;
      adapterId?: string | null;
      adapterVersion?: string | null;
      pageFingerprint?: string | null;
      expectedFields?: string[] | null;
      extractedFields?: string[] | null;
      truncationReasons?: string[] | null;
    } | null;
  } | null;
  heartbeat?: {
    consecutiveFailures?: number | null;
    lastAttemptAt?: Date | string | null;
    lastSuccessAt?: Date | string | null;
    lastErrorCode?: string | null;
    lastError?: string | null;
  } | null;
};

export const collectionRouteDiagnosticSchema = z.object({
  routeKey: z.enum([
    "LOCAL_PROMOTION_DASHBOARD",
    "LIVE_DATA_SCREEN",
    "LIVE_PRODUCT_TAB",
    "LIVE_TRAFFIC_TAB",
    "TASK_TABLE",
    "MATERIAL_LIBRARY",
    "HOURLY_TREND",
    "UNKNOWN"
  ]),
  required: z.boolean(),
  summaryStatus: z.enum(collectionRouteDiagnosticStatuses),
  freshnessState: z.enum(["FRESH", "AGING", "STALE", "MISSING"]),
  lastAttemptAt: z.string().datetime().nullable(),
  lastSuccessAt: z.string().datetime().nullable(),
  lastCapturedAt: z.string().datetime().nullable(),
  ageMs: z.number().nonnegative().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  completeness: z.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]).nullable(),
  coverageRatio: z.number().min(0).max(1).nullable(),
  adapterId: z.string().nullable(),
  adapterVersion: z.string().nullable(),
  pageFingerprint: z.string().nullable(),
  expectedFields: z.array(z.string()),
  extractedFields: z.array(z.string()),
  missingFields: z.array(z.string()),
  truncationReasons: z.array(z.string()),
  issues: z.array(z.object({
    code: z.enum(collectionIssueCodes),
    severity: z.enum(["INFO", "WARNING", "ERROR"]),
    message: z.string(),
    recoveryAction: z.string()
  })),
  blocksFormalDecision: z.boolean(),
  blocksStrongActions: z.boolean()
});

export function evaluateCollectionRouteDiagnostic(
  input: CollectionRouteDiagnosticInput,
  now = Date.now()
): CollectionRouteDiagnostic {
  const routeKey = normalizeCollectionRouteKey(input.routeKey);
  const capturedAt = toTimestamp(input.snapshot?.localCollectedAt);
  const lastAttemptAt = toTimestamp(input.heartbeat?.lastAttemptAt);
  const lastSuccessAt = toTimestamp(input.heartbeat?.lastSuccessAt);
  const runStartedAt = toTimestamp(input.runStartedAt);
  const ageMs = capturedAt == null ? null : Math.max(0, now - capturedAt);
  const consecutiveFailures = Math.max(0, Math.trunc(input.heartbeat?.consecutiveFailures || 0));
  const meta = input.snapshot?.captureMeta;
  const completeness = normalizeCompleteness(meta?.completeness);
  const coverageRatio = normalizeRatio(meta?.coverageRatio);
  const expectedFields = normalizeStringList(meta?.expectedFields);
  const extractedFields = normalizeStringList(meta?.extractedFields);
  const extractedSet = new Set(extractedFields);
  const missingFields = expectedFields.filter((field) => !extractedSet.has(field));
  const truncationReasons = normalizeStringList(meta?.truncationReasons);
  const issues: CollectionDiagnosticIssue[] = [];

  if (capturedAt == null) {
    issues.push(issue(
      "NO_SNAPSHOT",
      "ERROR",
      "当前路线尚无可用快照。",
      "打开任务列出的目标页面，确认页面可见后手动点击采集。"
    ));
  }

  const stale = ageMs != null && ageMs >= collectionFreshnessPolicy.staleAfterMs;
  if (stale) {
    issues.push(issue(
      "SNAPSHOT_STALE",
      "WARNING",
      "当前路线的数据已超过 10 分钟未更新。",
      "刷新目标页面并重新点击采集，确认页面数据已经加载完成。"
    ));
  }

  const progressAt = Math.max(lastAttemptAt || 0, lastSuccessAt || 0, capturedAt || 0, runStartedAt || 0);
  const stalled = Boolean(
    input.required
      && input.runActive
      && progressAt
      && now - progressAt >= collectionFreshnessPolicy.staleAfterMs
  );
  if (stalled) {
    issues.push(issue(
      "COLLECTOR_STALLED",
      "ERROR",
      "采集运行超过 10 分钟没有新的尝试或成功记录。",
      "切回目标标签页，确认页面仍可见，再手动重新启动采集。"
    ));
  }

  if (consecutiveFailures >= collectionFreshnessPolicy.routeFailureThreshold) {
    issues.push(issue(
      "CONSECUTIVE_FAILURES",
      "ERROR",
      `当前路线已连续失败 ${consecutiveFailures} 次。`,
      "检查目标页面是否加载完成、路线是否正确，再手动重试采集。"
    ));
  }

  if (input.snapshot?.routeVerificationStatus === "MANUAL_PENDING") {
    issues.push(issue(
      "ROUTE_UNVERIFIED",
      "ERROR",
      "当前快照的页面路线尚未确认。",
      "在插件中选择本次采集路线，或在任务页确认该快照所属路线。"
    ));
  }

  if (input.snapshot && (completeness === "PARTIAL" || completeness === "UNKNOWN")) {
    issues.push(issue(
      "PARTIAL_CAPTURE",
      "WARNING",
      "当前页面仅完成部分可见数据采集。",
      "确认目标分栏完整可见；若页面依赖虚拟列表，请按当前可见范围人工核对。"
    ));
  }

  if (input.snapshot && (missingFields.length > 0 || (coverageRatio != null && coverageRatio < 1))) {
    issues.push(issue(
      "LOW_FIELD_COVERAGE",
      "WARNING",
      missingFields.length
        ? `当前采集缺少字段：${missingFields.join("、")}。`
        : "当前采集字段覆盖率不足。",
      "确认页面数据已加载，并切换到任务要求的正确可见分栏后重新采集。"
    ));
  }

  if (input.snapshot && truncationReasons.length > 0) {
    issues.push(issue(
      "CAPTURE_TRUNCATED",
      "WARNING",
      "采集内容触发了本地安全预算，部分可见数据被截断。",
      "缩小页面数据范围或使用更精确的目标分栏后重新采集。"
    ));
  }

  if (input.heartbeat?.lastErrorCode || input.heartbeat?.lastError) {
    issues.push(issue(
      "UPLOAD_FAILED",
      "WARNING",
      failureMessage(input.heartbeat?.lastErrorCode),
      "检查网络与 API 状态后重新点击采集；仍失败时查看任务页诊断。"
    ));
  }

  const freshnessState = capturedAt == null
    ? "MISSING"
    : stale
      ? "STALE"
      : ageMs! >= collectionFreshnessPolicy.agingAfterMs
        ? "AGING"
        : "FRESH";
  const failed = consecutiveFailures >= collectionFreshnessPolicy.routeFailureThreshold
    || (stalled && capturedAt == null);
  const summaryStatus: CollectionRouteDiagnosticStatus = capturedAt == null
    ? failed
      ? "FAILED"
      : "MISSING"
    : input.snapshot?.routeVerificationStatus === "MANUAL_PENDING"
      ? "MANUAL_PENDING"
      : consecutiveFailures >= collectionFreshnessPolicy.routeFailureThreshold
        ? "FAILED"
        : stale
          ? "STALE"
          : completeness === "PARTIAL" || completeness === "UNKNOWN"
            ? "PARTIAL"
            : freshnessState === "AGING"
              ? "AGING"
              : "UPLOADED";
  const blocksFormalDecision = issues.some((item) =>
    item.code === "NO_SNAPSHOT" || item.code === "ROUTE_UNVERIFIED"
  );
  const blocksStrongActions = blocksFormalDecision || failed || stale;

  return {
    routeKey,
    required: input.required,
    summaryStatus,
    freshnessState,
    lastAttemptAt: toIso(lastAttemptAt),
    lastSuccessAt: toIso(lastSuccessAt),
    lastCapturedAt: toIso(capturedAt),
    ageMs,
    consecutiveFailures,
    completeness,
    coverageRatio,
    adapterId: normalizeNullableString(meta?.adapterId),
    adapterVersion: normalizeNullableString(meta?.adapterVersion),
    pageFingerprint: normalizeNullableString(meta?.pageFingerprint),
    expectedFields,
    extractedFields,
    missingFields,
    truncationReasons,
    issues,
    blocksFormalDecision,
    blocksStrongActions
  };
}

export function collectionDataProvenance(
  diagnostic: CollectionRouteDiagnostic,
  snapshotId: string | null
): CollectionDataProvenance {
  return {
    snapshotId,
    routeKey: diagnostic.routeKey,
    capturedAt: diagnostic.lastCapturedAt,
    adapterId: diagnostic.adapterId,
    adapterVersion: diagnostic.adapterVersion,
    pageFingerprint: diagnostic.pageFingerprint
  };
}

function issue(
  code: CollectionIssueCode,
  severity: CollectionIssueSeverity,
  message: string,
  recoveryAction: string
): CollectionDiagnosticIssue {
  return { code, severity, message, recoveryAction };
}

function failureMessage(value: string | null | undefined) {
  switch (value) {
    case "CONTENT_SCRIPT_UNAVAILABLE":
      return "插件尚未注入当前页面。";
    case "PAGE_NOT_READY":
      return "目标页面尚未完成加载。";
    case "ROUTE_UNVERIFIED":
      return "插件无法确认当前页面路线。";
    case "UPLOAD_NETWORK_ERROR":
      return "采集数据上传时网络连接失败。";
    case "UPLOAD_HTTP_ERROR":
      return "采集服务拒绝了本次上传。";
    default:
      return "最近一次采集或上传失败。";
  }
}

function normalizeCompleteness(value: string | null | undefined): CollectionRouteDiagnostic["completeness"] {
  return value === "COMPLETE" || value === "PARTIAL" || value === "UNKNOWN" ? value : null;
}

function normalizeRatio(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}

function normalizeStringList(value: string[] | null | undefined) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
    : [];
}

function normalizeNullableString(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: number | null) {
  return value == null ? null : new Date(value).toISOString();
}
