import {
  sanitizeCollectionSnapshotPayload,
  sanitizeSensitiveData,
  shouldRedactSensitiveKey
} from "@douyin-local-life/shared/safety";

export const sanitizeSnapshotPayload = sanitizeCollectionSnapshotPayload;
export const sanitizeSensitiveFields = sanitizeSensitiveData;
export const shouldRedactKey = shouldRedactSensitiveKey;
const isLocalBuild = typeof __PXXIS_EXTENSION_TARGET__ === "undefined" || __PXXIS_EXTENSION_TARGET__ === "local";

export function normalizeApiBaseUrl(value: string) {
  try {
    const url = new URL(value);
    const isLocal = isLocalBuild && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal))) return null;
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isSupportedExtensionCollectionUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "eos.douyin.com") return url.pathname === "/dp/liveScreen";
    if (url.hostname !== "localads.chengzijianzhan.cn") return false;
    return url.pathname === "/lamp/pc/liveboard2" || url.pathname === "/lamp/pc/promotion/roi2";
  } catch {
    return false;
  }
}
