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

export const aiDisclaimer = "AI 诊断结果仅供投流决策参考，请结合业务目标、预算和平台规则人工确认。第一版系统不会自动执行任何投放操作。";

export const extensionSafetyNotice =
  "本插件仅在用户授权并打开目标后台页面时采集可见 DOM、真实表格和白名单指标，不读取平台网络响应正文。插件不会自动点击、修改预算、暂停任务、创建计划或提交任何平台操作。";

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
const persistedSensitiveValuePattern = /(?:\bbearer\s+|\b(?:access|refresh)[_-]?token\s*[:=]|\b(?:api[_-]?key|password|passwd|authorization|cookie|secret|session|credential)\s*[:=])[A-Za-z0-9._~+/=-]+/i;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
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

export type PersistedInputValidation = {
  value: unknown;
  hasSensitiveData: boolean;
  violations: string[];
};

export function sanitizeAndValidatePersistedInput(value: unknown): PersistedInputValidation {
  const holder: { value?: unknown } = {};
  const violations: string[] = [];
  const stack: Array<{ input: unknown; parent: Record<string | number, unknown>; key: string | number; path: string; depth: number }> = [
    { input: value, parent: holder as Record<string | number, unknown>, key: "value", path: "$", depth: 0 }
  ];
  const seen = new WeakSet<object>();

  while (stack.length) {
    const current = stack.pop()!;
    if (current.depth > snapshotSafetyLimits.depth) {
      current.parent[current.key] = truncated;
      violations.push(`${current.path}: maximum nesting exceeded`);
      continue;
    }
    if (typeof current.input === "string") {
      const sensitive = persistedSensitiveValuePattern.test(current.input) || jwtPattern.test(current.input);
      current.parent[current.key] = sensitive
        ? sanitizeVisibleText(current.input).replace(persistedSensitiveValuePattern, redacted).replace(jwtPattern, redacted)
        : sanitizeVisibleText(current.input, snapshotSafetyLimits.stringChars);
      if (sensitive) violations.push(`${current.path}: sensitive value`);
      continue;
    }
    if (!current.input || typeof current.input !== "object") {
      current.parent[current.key] = current.input;
      continue;
    }
    if (seen.has(current.input)) {
      current.parent[current.key] = truncated;
      violations.push(`${current.path}: cyclic value`);
      continue;
    }
    seen.add(current.input);
    if (Array.isArray(current.input)) {
      const output: unknown[] = [];
      current.parent[current.key] = output;
      if (current.input.length > snapshotSafetyLimits.arrayItems) violations.push(`${current.path}: too many array items`);
      const length = Math.min(current.input.length, snapshotSafetyLimits.arrayItems);
      for (let index = length - 1; index >= 0; index -= 1) {
        stack.push({ input: current.input[index], parent: output as Record<number, unknown>, key: index, path: `${current.path}[${index}]`, depth: current.depth + 1 });
      }
      continue;
    }
    const output: Record<string, unknown> = {};
    current.parent[current.key] = output;
    const entries = Object.entries(current.input as Record<string, unknown>);
    if (entries.length > snapshotSafetyLimits.objectKeys) violations.push(`${current.path}: too many object keys`);
    for (const [key, raw] of entries.slice(0, snapshotSafetyLimits.objectKeys).reverse()) {
      if (shouldRedactSensitiveKey(key)) {
        output[key] = redacted;
        violations.push(`${current.path}.${key}: sensitive key`);
      } else {
        stack.push({ input: raw, parent: output, key, path: `${current.path}.${key}`, depth: current.depth + 1 });
      }
    }
  }

  return { value: holder.value, hasSensitiveData: violations.some((violation) => violation.includes("sensitive")), violations };
}

export function containsSensitivePersistedInput(value: unknown) {
  return sanitizeAndValidatePersistedInput(value).hasSensitiveData;
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
  const holder: { value?: unknown } = {};
  const stack: Array<{ input: unknown; parent: Record<string | number, unknown>; key: string | number; depth: number }> = [
    { input: value, parent: holder as Record<string | number, unknown>, key: "value", depth }
  ];
  const seen = new WeakSet<object>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current.depth > snapshotSafetyLimits.depth) {
      current.parent[current.key] = truncated;
      continue;
    }
    if (typeof current.input === "string") {
      current.parent[current.key] = sanitizeVisibleText(current.input);
      continue;
    }
    if (!current.input || typeof current.input !== "object") {
      current.parent[current.key] = current.input;
      continue;
    }
    if (seen.has(current.input)) {
      current.parent[current.key] = truncated;
      continue;
    }
    seen.add(current.input);
    if (Array.isArray(current.input)) {
      const output: unknown[] = [];
      current.parent[current.key] = output;
      const length = Math.min(current.input.length, snapshotSafetyLimits.arrayItems);
      for (let index = length - 1; index >= 0; index -= 1) {
        stack.push({ input: current.input[index], parent: output as Record<number, unknown>, key: index, depth: current.depth + 1 });
      }
      continue;
    }
    const output: Record<string, unknown> = {};
    current.parent[current.key] = output;
    const entries: Array<[string, unknown]> = [];
    let count = 0;
    for (const key in current.input as Record<string, unknown>) {
      if (!Object.prototype.hasOwnProperty.call(current.input, key)) continue;
      entries.push([key, (current.input as Record<string, unknown>)[key]]);
      count += 1;
      if (count >= snapshotSafetyLimits.objectKeys) break;
    }
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, raw] = entries[index]!;
      if (shouldRedactSensitiveKey(key)) output[key] = redacted;
      else stack.push({ input: raw, parent: output, key, depth: current.depth + 1 });
    }
  }
  return holder.value;
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
  const truncatedFields = [
    ...(snapshot.rawDomText.length > snapshotSafetyLimits.rawDomTextChars ? ["rawDomText"] : []),
    ...(snapshot.rawNetworkJson.length ? ["rawNetworkJson"] : []),
    ...(snapshot.rawTableData.length > snapshotSafetyLimits.tableItems ? ["rawTableData"] : []),
    ...((snapshot.visibleMetricsJson?.length || 0) > snapshotSafetyLimits.visibleMetrics ? ["visibleMetricsJson"] : [])
  ];
  const sanitized = {
    ...snapshot,
    sourceUrl: sanitizeCaptureUrl(snapshot.sourceUrl || ""),
    pageTitle: sanitizeVisibleText(snapshot.pageTitle || "", snapshotSafetyLimits.pageTitleChars),
    rawDomText: sanitizeVisibleText(snapshot.rawDomText || "", snapshotSafetyLimits.rawDomTextChars),
    rawNetworkJson: [],
    rawTableData: limitArrayValue(
      sanitizeSensitiveData(snapshot.rawTableData.slice(0, snapshotSafetyLimits.tableItems)) as unknown[],
      snapshotSafetyLimits.networkTotalChars
    ),
    visibleMetricsJson: (snapshot.visibleMetricsJson || []).slice(0, snapshotSafetyLimits.visibleMetrics).map(sanitizeVisibleMetric),
    screenshotUrl: snapshot.screenshotUrl ? sanitizeCaptureUrl(snapshot.screenshotUrl) : snapshot.screenshotUrl
  } as T;
  if ("captureMeta" in snapshot && snapshot.captureMeta && typeof snapshot.captureMeta === "object") {
    const meta = snapshot.captureMeta as Record<string, unknown>;
    (sanitized as T & { captureMeta: Record<string, unknown> }).captureMeta = {
      ...meta,
      acceptedBytes: serializedLength({ rawDomText: sanitized.rawDomText, rawTableData: sanitized.rawTableData, visibleMetricsJson: sanitized.visibleMetricsJson }),
      truncatedFields: [...new Set([...(Array.isArray(meta.truncatedFields) ? meta.truncatedFields.map(String) : []), ...truncatedFields])],
      truncationReasons: [...new Set([...(Array.isArray(meta.truncationReasons) ? meta.truncationReasons.map(String) : []), ...(snapshot.rawNetworkJson.length ? ["NETWORK_CAPTURE_DISABLED"] : []), ...(truncatedFields.length ? ["SNAPSHOT_SAFETY_LIMIT"] : [])])]
    };
  }
  return sanitized;
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
