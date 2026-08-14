import {
  sanitizeCollectionSnapshotPayload,
  sanitizeSensitiveData,
  shouldRedactSensitiveKey
} from "@douyin-local-life/shared";
import { developmentLoopbackHostnames, isLocalBuild } from "./build-target";

export const sanitizeSnapshotPayload = sanitizeCollectionSnapshotPayload;
export const sanitizeSensitiveFields = sanitizeSensitiveData;
export const shouldRedactKey = shouldRedactSensitiveKey;

export function normalizeApiBaseUrl(value: string, allowedLoopbackHostnames = developmentLoopbackHostnames) {
  try {
    const url = new URL(value);
    const isLocal = isLocalBuild && allowedLoopbackHostnames.includes(url.hostname);
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
    return url.hostname === "localads.chengzijianzhan.cn"
      && /^\/lamp\/pc\/liveboard2(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}
