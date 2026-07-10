export const snapshotSafetyLimits = {
  rawDomTextChars: 200_000,
  pageTitleChars: 500,
  urlChars: 2_048,
  networkRecords: 50,
  networkRecordChars: 256_000,
  networkTotalChars: 1_000_000,
  tableItems: 20,
  visibleMetrics: 200,
  arrayItems: 200,
  objectKeys: 500,
  depth: 12,
  stringChars: 200_000
} as const;

type NetworkRecordLike = {
  url: string;
  method: string;
  status: number;
  responseJson?: unknown;
  capturedAt?: string;
};

type SnapshotLike = {
  sourceUrl?: string;
  pageTitle?: string;
  rawDomText: string;
  rawNetworkJson: NetworkRecordLike[];
  rawTableData: unknown[];
  visibleMetricsJson?: unknown[];
  screenshotUrl?: string | null;
};

const redacted = "[REDACTED]";
const truncated = "[TRUNCATED]";
const sensitiveContains = ["token", "cookie", "password", "passwd", "authorization", "secret", "session", "credential"];
const sensitiveExact = new Set([
  "accesstoken",
  "refreshtoken",
  "phone",
  "mobile",
  "idcard",
  "identitycard",
  "email",
  "name",
  "realname",
  "username",
  "nickname",
  "contactname",
  "legalperson",
  "身份证",
  "手机号",
  "姓名"
]);

export function shouldRedactSensitiveKey(key: string) {
  const normalized = normalizeKey(key);
  return sensitiveExact.has(normalized) || sensitiveContains.some((part) => normalized.includes(part));
}

export function sanitizeVisibleText(text: string, maxChars: number = snapshotSafetyLimits.stringChars) {
  let sanitized = truncateText(text, maxChars);
  if (sanitized.includes("@")) sanitized = sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, redacted);
  if (/\d/.test(sanitized)) {
    sanitized = sanitized.replace(/\b1[3-9]\d{9}\b/g, redacted).replace(/\b\d{17}[\dXx]\b/g, redacted);
  }
  if (/bearer/i.test(sanitized)) sanitized = sanitized.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${redacted}`);
  if (/password|passwd|token|authorization|cookie|secret|session|credential/i.test(sanitized)) {
    sanitized = sanitized.replace(
      /((?:password|passwd|token|authorization|cookie|secret|session|credential)\s*[:=]\s*)[^\s,;&]+/gi,
      `$1${redacted}`
    );
  }
  return truncateText(sanitized, maxChars);
}

export function sanitizeSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > snapshotSafetyLimits.depth) return truncated;
  if (Array.isArray(value)) {
    return value.slice(0, snapshotSafetyLimits.arrayItems).map((item) => sanitizeSensitiveData(item, depth + 1));
  }
  if (typeof value === "string") return sanitizeVisibleText(value);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, snapshotSafetyLimits.objectKeys)) {
    result[key] = shouldRedactSensitiveKey(key) ? redacted : sanitizeSensitiveData(raw, depth + 1);
  }
  return result;
}

export function sanitizeCaptureUrl(inputUrl: string, baseUrl = "https://example.invalid") {
  try {
    const url = new URL(inputUrl, baseUrl);
    url.username = url.username ? redacted : "";
    url.password = url.password ? redacted : "";
    for (const key of [...url.searchParams.keys()]) {
      if (shouldRedactSensitiveKey(key)) url.searchParams.set(key, redacted);
    }
    return truncateText(url.href, snapshotSafetyLimits.urlChars);
  } catch {
    return sanitizeVisibleText(inputUrl, snapshotSafetyLimits.urlChars);
  }
}

export function sanitizeCapturedNetworkRecord<T extends NetworkRecordLike>(record: T): T {
  const responseJson = limitSerializedValue(sanitizeSensitiveData(record.responseJson), snapshotSafetyLimits.networkRecordChars);
  return {
    ...record,
    url: sanitizeCaptureUrl(String(record.url || "")),
    method: String(record.method || "GET").toUpperCase().slice(0, 16),
    status: Number.isInteger(record.status) ? record.status : 0,
    responseJson,
    capturedAt: record.capturedAt || new Date().toISOString()
  };
}

export function addSafeNetworkRecord<T extends NetworkRecordLike>(records: T[], record: T, limit = snapshotSafetyLimits.networkRecords) {
  records.unshift(sanitizeCapturedNetworkRecord(record));
  if (records.length > limit) records.length = limit;
  trimNetworkRecordsToTotalLimit(records);
  return records;
}

export function sanitizeCollectionSnapshotPayload<T extends SnapshotLike>(snapshot: T): T {
  const networkRecords: NetworkRecordLike[] = [];
  for (const record of snapshot.rawNetworkJson.slice(0, snapshotSafetyLimits.networkRecords)) {
    networkRecords.push(sanitizeCapturedNetworkRecord(record));
  }
  trimNetworkRecordsToTotalLimit(networkRecords);

  return {
    ...snapshot,
    sourceUrl: sanitizeCaptureUrl(snapshot.sourceUrl || ""),
    pageTitle: sanitizeVisibleText(snapshot.pageTitle || "", snapshotSafetyLimits.pageTitleChars),
    rawDomText: sanitizeVisibleText(snapshot.rawDomText || "", snapshotSafetyLimits.rawDomTextChars),
    rawNetworkJson: networkRecords,
    rawTableData: limitArrayValue(
      sanitizeSensitiveData(snapshot.rawTableData.slice(0, snapshotSafetyLimits.tableItems)) as unknown[],
      snapshotSafetyLimits.networkTotalChars
    ),
    visibleMetricsJson: (snapshot.visibleMetricsJson || []).slice(0, snapshotSafetyLimits.visibleMetrics).map(sanitizeVisibleMetric),
    screenshotUrl: snapshot.screenshotUrl ? sanitizeCaptureUrl(snapshot.screenshotUrl) : snapshot.screenshotUrl
  };
}

function sanitizeVisibleMetric(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return sanitizeSensitiveData(value);
  const metric = value as Record<string, unknown>;
  const sanitized = sanitizeSensitiveData(metric) as Record<string, unknown>;
  return {
    ...sanitized,
    key: sanitizeVisibleText(String(metric.key || "unknown"), 100),
    name: sanitizeVisibleText(String(metric.name || ""), 200)
  };
}

function trimNetworkRecordsToTotalLimit<T extends NetworkRecordLike>(records: T[]) {
  let total = 0;
  const kept: T[] = [];
  for (const record of records) {
    const size = serializedLength(record);
    if (total + size > snapshotSafetyLimits.networkTotalChars) break;
    kept.push(record);
    total += size;
  }
  records.splice(0, records.length, ...kept);
}

function limitSerializedValue(value: unknown, maxChars: number): unknown {
  const serialized = safeStringify(value);
  if (serialized.length <= maxChars) return value;
  return {
    truncated: true,
    originalChars: serialized.length,
    preview: truncateText(serialized, Math.min(10_000, maxChars))
  };
}

function limitArrayValue(value: unknown[], maxChars: number): unknown[] {
  const limited = limitSerializedValue(value, maxChars);
  return Array.isArray(limited) ? limited : [limited];
}

function serializedLength(value: unknown) {
  return safeStringify(value).length;
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return JSON.stringify({ truncated: true, reason: "non_serializable" });
  }
}

function truncateText(value: string, maxChars: number) {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}${truncated}`;
}

function normalizeKey(key: string) {
  return key.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "").toLowerCase();
}
