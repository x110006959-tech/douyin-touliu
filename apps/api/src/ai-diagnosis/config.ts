import {
  DEFAULT_AI_DIAGNOSIS_TIMEOUT_MS,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  createDeepSeekTransport,
  type ChatTransport
} from "@douyin-local-life/llm";

export function aiDiagnosisEnabled() {
  return process.env.AI_DIAGNOSIS_ENABLED === "true" || process.env.NODE_ENV === "test";
}

export function aiDiagnosisTimeoutMs() {
  const parsed = Number(process.env.AI_DIAGNOSIS_TIMEOUT_MS || DEFAULT_AI_DIAGNOSIS_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed >= 10_000 && parsed <= 300_000 ? parsed : DEFAULT_AI_DIAGNOSIS_TIMEOUT_MS;
}

export function createConfiguredDiagnosisTransport(): ChatTransport {
  return createDeepSeekTransport({
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
    // The worker/evaluator owns the 120s diagnosis-wide deadline via AbortSignal.
    // A shorter transport deadline incorrectly kills normal thinking responses.
    requestTimeoutMs: aiDiagnosisTimeoutMs()
  });
}
