export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export function intOrNull(value: unknown): number | null {
  const next = numberOrNull(value);
  return next === null ? null : Math.trunc(next);
}

export function booleanFrom(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

export function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function safeJsonString(value: unknown, fallback = "{}") {
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return fallback;
    }
  }
  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

export function parseJsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseJsonRecord(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
