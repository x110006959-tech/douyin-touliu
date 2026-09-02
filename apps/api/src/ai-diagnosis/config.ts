import {
  DEFAULT_AI_DIAGNOSIS_TIMEOUT_MS,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  createDeepSeekTransport,
  LlmTransportError,
  type ChatTransport
} from "@douyin-local-life/llm";

export function aiDiagnosisEnabled() {
  return process.env.AI_DIAGNOSIS_ENABLED === "true" || process.env.NODE_ENV === "test";
}

export type AiDiagnosisConfigurationIssue = {
  code: "DEEPSEEK_API_KEY_MISSING";
  message: string;
};

/**
 * Real diagnosis is explicitly opted in outside tests. Validate its credential
 * before a run is queued or a Worker claims a lease.
 */
export function aiDiagnosisConfigurationIssue(): AiDiagnosisConfigurationIssue | null {
  if (process.env.AI_DIAGNOSIS_ENABLED !== "true") return null;
  if (process.env.DEEPSEEK_API_KEY?.trim()) return null;
  return {
    code: "DEEPSEEK_API_KEY_MISSING",
    message: "AI 诊断已开启，但服务端未配置 DEEPSEEK_API_KEY"
  };
}

export function aiDiagnosisTimeoutMs() {
  const parsed = Number(process.env.AI_DIAGNOSIS_TIMEOUT_MS || DEFAULT_AI_DIAGNOSIS_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed >= 10_000 && parsed <= 300_000 ? parsed : DEFAULT_AI_DIAGNOSIS_TIMEOUT_MS;
}

export function createConfiguredDiagnosisTransport(): ChatTransport {
  const configurationIssue = aiDiagnosisConfigurationIssue();
  if (configurationIssue) {
    throw new LlmTransportError(configurationIssue.code, configurationIssue.message, false);
  }
  return createDeepSeekTransport({
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    model: process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL,
    baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
    // The worker/evaluator owns the 120s diagnosis-wide deadline via AbortSignal.
    // A shorter transport deadline incorrectly kills normal thinking responses.
    requestTimeoutMs: aiDiagnosisTimeoutMs()
  });
}
