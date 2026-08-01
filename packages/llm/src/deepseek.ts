export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_AI_DIAGNOSIS_TIMEOUT_MS = 120_000;

export type ChatTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
  reasoning_content?: string | null;
};

export type ChatRequest = {
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  tool_choice?: "auto" | "required" | { type: "function"; function: { name: string } };
  response_format?: { type: "json_object" };
  thinking?: "enabled" | "disabled";
  temperature?: number;
  max_tokens?: number;
  signal?: AbortSignal;
};

export type ChatResponse = {
  message: ChatMessage;
  finishReason: string | null;
  usage: ChatTokenUsage;
};

export type ChatTransport = {
  provider: string;
  model: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
};

export class LlmTransportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly status: number | null = null
  ) {
    super(message);
  }
}

export function createDeepSeekTransport(options: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}): ChatTransport {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new LlmTransportError("DEEPSEEK_API_KEY_MISSING", "DeepSeek API 密钥未配置", false);
  const model = options.model?.trim() || DEFAULT_DEEPSEEK_MODEL;
  const baseUrl = (options.baseUrl?.trim() || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
  const requestTimeoutMs = positiveInteger(options.requestTimeoutMs, 30_000);
  const fetchImpl = options.fetchImpl || fetch;

  return {
    provider: "deepseek",
    model,
    async chat(request) {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await sendRequest({ apiKey, model, baseUrl, requestTimeoutMs, fetchImpl, request });
        } catch (error) {
          lastError = error;
          if (!(error instanceof LlmTransportError) || !error.retryable || attempt > 0) throw error;
        }
      }
      throw lastError;
    }
  };
}

async function sendRequest(input: {
  apiKey: string;
  model: string;
  baseUrl: string;
  requestTimeoutMs: number;
  fetchImpl: typeof fetch;
  request: ChatRequest;
}): Promise<ChatResponse> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), input.requestTimeoutMs);
  const signal = combineSignals(input.request.signal, timeout.signal);
  try {
    const response = await input.fetchImpl(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.request.messages,
        tools: input.request.tools,
        tool_choice: input.request.tool_choice,
        response_format: input.request.response_format,
        temperature: input.request.temperature ?? 0.1,
        max_tokens: input.request.max_tokens,
        thinking: { type: input.request.thinking ?? "enabled" },
        stream: false
      }),
      signal
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const upstreamDetail = await readUpstreamErrorDetail(response, input.apiKey);
      throw new LlmTransportError(
        response.status === 429 ? "DEEPSEEK_RATE_LIMITED" : response.status >= 500 ? "DEEPSEEK_UPSTREAM_ERROR" : "DEEPSEEK_REQUEST_REJECTED",
        `DeepSeek 请求失败（HTTP ${response.status}）${upstreamDetail ? `：${upstreamDetail}` : ""}`,
        retryable,
        response.status
      );
    }
    const payload = await response.json() as Record<string, unknown>;
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message;
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new LlmTransportError("DEEPSEEK_INVALID_RESPONSE", "DeepSeek 返回缺少消息内容", false);
    }
    const usage = payload.usage && typeof payload.usage === "object" && !Array.isArray(payload.usage)
      ? payload.usage as Record<string, unknown>
      : {};
    return {
      message: normalizeMessage(message as Record<string, unknown>),
      finishReason: typeof first?.finish_reason === "string" ? first.finish_reason : null,
      usage: {
        inputTokens: integer(usage.prompt_tokens),
        outputTokens: integer(usage.completion_tokens),
        totalTokens: integer(usage.total_tokens)
      }
    };
  } catch (error) {
    if (error instanceof LlmTransportError) throw error;
    if (timeout.signal.aborted || input.request.signal?.aborted) {
      throw new LlmTransportError("DEEPSEEK_TIMEOUT", "DeepSeek 请求超时", true);
    }
    throw new LlmTransportError("DEEPSEEK_NETWORK_ERROR", "DeepSeek 网络请求失败", true);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMessage(value: Record<string, unknown>): ChatMessage {
  const rawToolCalls = Array.isArray(value.tool_calls) ? value.tool_calls : [];
  const toolCalls = rawToolCalls.flatMap((item): ChatToolCall[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const fn = record.function;
    if (typeof record.id !== "string" || !fn || typeof fn !== "object" || Array.isArray(fn)) return [];
    const functionRecord = fn as Record<string, unknown>;
    if (typeof functionRecord.name !== "string" || typeof functionRecord.arguments !== "string") return [];
    return [{ id: record.id, type: "function", function: { name: functionRecord.name, arguments: functionRecord.arguments } }];
  });
  return {
    role: "assistant",
    content: typeof value.content === "string" ? value.content : null,
    reasoning_content: typeof value.reasoning_content === "string" ? value.reasoning_content : null,
    tool_calls: toolCalls.length ? toolCalls : undefined
  };
}

function combineSignals(external: AbortSignal | undefined, timeout: AbortSignal) {
  if (!external) return timeout;
  const combined = new AbortController();
  const abort = () => combined.abort();
  if (external.aborted || timeout.aborted) combined.abort();
  else {
    external.addEventListener("abort", abort, { once: true });
    timeout.addEventListener("abort", abort, { once: true });
  }
  return combined.signal;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

async function readUpstreamErrorDetail(response: Response, apiKey: string) {
  let body: string;
  try {
    body = await response.text();
  } catch {
    return null;
  }
  let payload: unknown = body;
  try {
    payload = JSON.parse(body);
  } catch {
    // Some gateways return a short plain-text validation error.
  }
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  const error = root?.error;
  const detail = error && typeof error === "object" && !Array.isArray(error)
    ? (error as Record<string, unknown>).message
    : typeof error === "string" ? error : root?.message ?? payload;
  if (typeof detail !== "string") return null;
  const redacted = detail
    .replaceAll(apiKey, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted ? redacted.slice(0, 300) : null;
}
