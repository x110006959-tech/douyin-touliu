import { sanitizeAndValidatePersistedInput, sanitizeVisibleText } from "@douyin-local-life/shared";

export function sanitizePersistedJson(value: unknown) {
  return sanitizeAndValidatePersistedInput(value).value;
}

export function readSafeOptionalText(value: unknown, maxChars = 1_000) {
  if (typeof value !== "string" || !value.trim()) return { value: null, error: null };
  const validation = sanitizeAndValidatePersistedInput(value.trim());
  if (validation.hasSensitiveData) return { value: null, error: "输入包含敏感认证信息，已拒绝保存" };
  return { value: sanitizeVisibleText(String(validation.value), maxChars), error: null };
}
