export const allowedHostSuffixes = ["douyin.com", "douyinlife.com", "juliangengine.com", "oceanengine.com", "bytedance.com"];
export const networkRecordLimit = 50;

type NetworkRecordLike = {
  url: string;
  method: string;
  status: number;
  responseJson: unknown;
  capturedAt?: string;
};

type SnapshotLike = {
  rawDomText: string;
  rawNetworkJson: NetworkRecordLike[];
  rawTableData: unknown[];
};

const redacted = "[REDACTED]";
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
  "\u8eab\u4efd\u8bc1",
  "\u624b\u673a\u53f7"
]);

export function isAllowedCaptureUrl(inputUrl: string, pageHref = globalThis.location?.href || "") {
  try {
    const url = new URL(inputUrl, pageHref);
    const pageUrl = new URL(pageHref || url.href);
    return url.origin === pageUrl.origin || allowedHostSuffixes.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

export function isJsonContentType(contentType: string | null | undefined) {
  return /\bjson\b|\+json\b/i.test(contentType || "");
}

export function shouldRedactKey(key: string) {
  const normalized = normalizeKey(key);
  return sensitiveExact.has(normalized) || sensitiveContains.some((part) => normalized.includes(part));
}

export function sanitizeSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 200).map(sanitizeSensitiveFields);
  if (typeof value === "string") return sanitizeVisibleText(value);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    result[key] = shouldRedactKey(key) ? redacted : sanitizeSensitiveFields(raw);
  }
  return result;
}

export function sanitizeVisibleText(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, redacted)
    .replace(/\b1[3-9]\d{9}\b/g, redacted)
    .replace(/\b\d{17}[\dXx]\b/g, redacted)
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${redacted}`);
}

export function sanitizeNetworkRecord(record: NetworkRecordLike): NetworkRecordLike {
  return {
    url: sanitizeUrl(record.url),
    method: String(record.method || "GET").toUpperCase(),
    status: record.status,
    responseJson: sanitizeSensitiveFields(record.responseJson),
    capturedAt: record.capturedAt || new Date().toISOString()
  };
}

export function addNetworkRecord<T extends NetworkRecordLike>(records: T[], record: T, limit = networkRecordLimit) {
  records.unshift(sanitizeNetworkRecord(record) as T);
  if (records.length > limit) records.length = limit;
  return records;
}

export function sanitizeSnapshotPayload<T extends SnapshotLike>(snapshot: T): T {
  return {
    ...snapshot,
    rawDomText: sanitizeVisibleText(snapshot.rawDomText || ""),
    rawNetworkJson: snapshot.rawNetworkJson.slice(0, networkRecordLimit).map((record) => sanitizeNetworkRecord(record)),
    rawTableData: sanitizeSensitiveFields(snapshot.rawTableData) as unknown[]
  };
}

function sanitizeUrl(inputUrl: string) {
  try {
    const url = new URL(inputUrl, globalThis.location?.href || "https://example.invalid");
    url.username = url.username ? redacted : "";
    url.password = url.password ? redacted : "";
    for (const key of [...url.searchParams.keys()]) {
      if (shouldRedactKey(key)) url.searchParams.set(key, redacted);
    }
    return url.href;
  } catch {
    return inputUrl;
  }
}

function normalizeKey(key: string) {
  return key.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "").toLowerCase();
}
