import {
  addSafeNetworkRecord,
  sanitizeCollectionSnapshotPayload,
  sanitizeCapturedNetworkRecord,
  sanitizeSensitiveData,
  sanitizeVisibleText,
  shouldRedactSensitiveKey,
  snapshotSafetyLimits
} from "@douyin-local-life/shared";

export const sanitizeSnapshotPayload = sanitizeCollectionSnapshotPayload;
export const sanitizeSensitiveFields = sanitizeSensitiveData;
export const shouldRedactKey = shouldRedactSensitiveKey;
export const sanitizeNetworkRecord = sanitizeCapturedNetworkRecord;

export const allowedHostSuffixes = ["douyin.com", "douyinlife.com", "juliangengine.com", "oceanengine.com", "bytedance.com"];
export const networkRecordLimit = snapshotSafetyLimits.networkRecords;
export const networkResponseByteLimit = snapshotSafetyLimits.networkRecordChars;

type NetworkRecordLike = {
  url: string;
  method: string;
  status: number;
  responseJson: unknown;
  capturedAt?: string;
};

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

export function normalizeApiBaseUrl(value: string) {
  try {
    const url = new URL(value);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal))) return null;
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function addNetworkRecord<T extends NetworkRecordLike>(records: T[], record: T, limit = networkRecordLimit) {
  return addSafeNetworkRecord(records, record, limit);
}

// Keep these imports visible to the extension's source-concatenating build script.
void sanitizeVisibleText;
