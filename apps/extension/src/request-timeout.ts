export const extensionRequestTimeoutMs = 10_000;
export const bridgeRecoveryRequestTimeoutMs = 1_800;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = extensionRequestTimeoutMs
) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function isRequestTimeout(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
