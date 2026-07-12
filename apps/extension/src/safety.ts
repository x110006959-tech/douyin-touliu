import {
  sanitizeCollectionSnapshotPayload,
  sanitizeSensitiveData,
  shouldRedactSensitiveKey
} from "@douyin-local-life/shared/safety";

export const sanitizeSnapshotPayload = sanitizeCollectionSnapshotPayload;
export const sanitizeSensitiveFields = sanitizeSensitiveData;
export const shouldRedactKey = shouldRedactSensitiveKey;
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
