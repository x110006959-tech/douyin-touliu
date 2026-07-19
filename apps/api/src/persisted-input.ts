import { sanitizeAndValidatePersistedInput, sanitizeVisibleText } from "@douyin-local-life/shared";

export class SensitivePersistedInputError extends Error {
  readonly statusCode = 400;
  readonly code = "SENSITIVE_DATA_FORBIDDEN";
  readonly publicMessage = "输入包含敏感认证信息，已拒绝保存";

  constructor() {
    super("Persisted input contains sensitive authentication data");
  }
}

export function sanitizePersistedJson(value: unknown) {
  const validation = sanitizeAndValidatePersistedInput(value);
  if (validation.hasSensitiveData) throw new SensitivePersistedInputError();
  return validation.value;
}

export function sanitizeDerivedPersistedJson(value: unknown) {
  return sanitizeAndValidatePersistedInput(value).value;
}

export function readSafeOptionalText(value: unknown, maxChars = 1_000) {
  if (typeof value !== "string" || !value.trim()) return { value: null, error: null };
  if (value.trim().length > maxChars) return { value: null, error: `输入不能超过 ${maxChars} 个字符` };
  const validation = sanitizeAndValidatePersistedInput(value.trim());
  if (validation.hasSensitiveData) return { value: null, error: "输入包含敏感认证信息，已拒绝保存" };
  return { value: sanitizeVisibleText(String(validation.value), maxChars), error: null };
}

export function sanitizeRequestMetadata(value: unknown, maxChars = 1_000) {
  if (typeof value !== "string" || !value.trim()) return null;
  return sanitizeVisibleText(value.trim(), maxChars);
}
