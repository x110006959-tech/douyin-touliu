import type { ChatMessage, ChatTokenUsage, ChatToolDefinition, ChatTransport } from "./deepseek.js";
import { LlmTransportError } from "./deepseek.js";

export type ToolLoopTool = {
  definition: ChatToolDefinition;
  execute(argumentsValue: unknown): Promise<unknown>;
};

export type ToolLoopResult = {
  finalContent: string | null;
  calledTools: string[];
  rounds: number;
  toolCalls: number;
  usage: ChatTokenUsage;
};

export async function runToolLoop(input: {
  transport: ChatTransport;
  messages: ChatMessage[];
  tools: ToolLoopTool[];
  initialRequiredToolName?: string;
  maxRounds?: number;
  maxToolCalls?: number;
  concurrency?: number;
  maxTokens?: number;
  thinking?: "enabled" | "disabled";
  stopAfterToolBatch?: boolean;
  signal?: AbortSignal;
}): Promise<ToolLoopResult> {
  const maxRounds = input.maxRounds ?? 8;
  const maxToolCalls = input.maxToolCalls ?? 12;
  const concurrency = input.concurrency ?? 3;
  const messages = [...input.messages];
  const toolsByName = new Map(input.tools.map((tool) => [tool.definition.function.name, tool]));
  const calledTools: string[] = [];
  const usage = emptyUsage();
  let toolCallCount = 0;

  for (let round = 0; round < maxRounds; round += 1) {
    const requiredToolName = round === 0 ? input.initialRequiredToolName : undefined;
    const availableTools = requiredToolName
      ? input.tools.filter((tool) => tool.definition.function.name === requiredToolName)
      : input.tools;
    if (requiredToolName && availableTools.length !== 1) {
      throw new LlmTransportError("DIAGNOSIS_REQUIRED_TOOL_UNKNOWN", `必需的诊断 Skill 未注册：${requiredToolName}`, false);
    }
    const response = await input.transport.chat({
      messages,
      tools: availableTools.map((tool) => tool.definition),
      // DeepSeek thinking mode only accepts automatic tool selection. Exposing only
      // the required first tool plus local validation preserves deterministic order.
      tool_choice: "auto",
      thinking: input.thinking,
      max_tokens: input.maxTokens,
      signal: input.signal
    });
    addUsage(usage, response.usage);
    messages.push(response.message);
    const toolCalls = response.message.tool_calls || [];
    if (requiredToolName && (toolCalls.length !== 1 || toolCalls[0]?.function.name !== requiredToolName)) {
      throw new LlmTransportError("DIAGNOSIS_REQUIRED_TOOL_MISSING", `诊断必须首先且仅调用 ${requiredToolName}`, false);
    }
    if (!toolCalls.length) {
      return { finalContent: response.message.content, calledTools, rounds: round + 1, toolCalls: toolCallCount, usage };
    }
    if (toolCallCount + toolCalls.length > maxToolCalls) {
      throw new LlmTransportError("DIAGNOSIS_TOOL_LIMIT", "诊断工具调用超过上限", false);
    }
    toolCallCount += toolCalls.length;
    const results = await mapLimit(toolCalls, concurrency, async (call) => {
      const tool = toolsByName.get(call.function.name);
      if (!tool) throw new LlmTransportError("DIAGNOSIS_TOOL_UNKNOWN", `模型请求了未知诊断 Skill：${call.function.name}`, false);
      let argumentsValue: unknown;
      try {
        argumentsValue = JSON.parse(call.function.arguments || "{}");
      } catch {
        throw new LlmTransportError("DIAGNOSIS_TOOL_ARGUMENTS_INVALID", `诊断 Skill ${call.function.name} 参数不是合法 JSON`, false);
      }
      const value = await tool.execute(argumentsValue);
      calledTools.push(call.function.name);
      return { callId: call.id, name: call.function.name, content: JSON.stringify(value) };
    });
    for (const result of results) {
      messages.push({ role: "tool", tool_call_id: result.callId, name: result.name, content: result.content });
    }
    if (input.stopAfterToolBatch) {
      return { finalContent: null, calledTools, rounds: round + 1, toolCalls: toolCallCount, usage };
    }
  }
  throw new LlmTransportError("DIAGNOSIS_ROUND_LIMIT", "诊断编排轮数超过上限", false);
}

export async function completeJsonWithRepair<T>(input: {
  transport: ChatTransport;
  messages: ChatMessage[];
  parse(value: unknown): T;
  repairInstruction: string;
  maxTokens?: number;
  thinking?: "enabled" | "disabled";
  signal?: AbortSignal;
}): Promise<{ value: T; usage: ChatTokenUsage }> {
  const usage = emptyUsage();
  const first = await input.transport.chat({
    messages: input.messages,
    response_format: { type: "json_object" },
    thinking: input.thinking,
    max_tokens: input.maxTokens,
    signal: input.signal
  });
  addUsage(usage, first.usage);
  const parsed = parseJson(first.message.content, input.parse);
  if (parsed.ok) return { value: parsed.value, usage };

  const repair = await input.transport.chat({
    messages: [
      ...input.messages,
      {
        role: "user",
        content: JSON.stringify({
          repairInstruction: input.repairInstruction,
          validationIssue: parsed.issue,
          invalidOutput: first.message.content
        })
      }
    ],
    response_format: { type: "json_object" },
    thinking: "disabled",
    max_tokens: input.maxTokens,
    signal: input.signal
  });
  addUsage(usage, repair.usage);
  const repaired = parseJson(repair.message.content, input.parse);
  if (repaired.ok) return { value: repaired.value, usage };
  throw new LlmTransportError("DIAGNOSIS_OUTPUT_INVALID", `模型结构化诊断在一次修复后仍不合法：${repaired.issue}`, false);
}

function parseJson<T>(content: string | null, parse: (value: unknown) => T): { ok: true; value: T } | { ok: false; issue: string } {
  if (!content) return { ok: false, issue: "输出内容为空" };
  try {
    const value: unknown = JSON.parse(content);
    return { ok: true, value: parse(value) };
  } catch (error) {
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      return { ok: false, issue: "输出不是合法 JSON" };
    }
    return { ok: false, issue: validationIssue(error, value) };
  }
}

function validationIssue(error: unknown, value: unknown) {
  const rootKeys = value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>).slice(0, 20)
    : [];
  const rootSummary = `顶层键：${rootKeys.length ? rootKeys.join(",") : "<none>"}`;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const issues = (error as { issues?: unknown }).issues;
    if (Array.isArray(issues)) {
      const summary = issues.slice(0, 12).flatMap((issue): string[] => {
        if (!issue || typeof issue !== "object" || Array.isArray(issue)) return [];
        const record = issue as Record<string, unknown>;
        const path = Array.isArray(record.path) ? record.path.map(String).join(".") : "";
        const message = typeof record.message === "string" ? record.message : "结构不合法";
        return [`${path || "<root>"}: ${message}`];
      });
      if (summary.length) return `${rootSummary}；${summary.join("；")}`.slice(0, 1_500);
    }
  }
  return `${rootSummary}；输出未通过结构校验`;
}

async function mapLimit<T, R>(values: T[], limit: number, handler: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await handler(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function emptyUsage(): ChatTokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(target: ChatTokenUsage, value: ChatTokenUsage) {
  target.inputTokens += value.inputTokens;
  target.outputTokens += value.outputTokens;
  target.totalTokens += value.totalTokens;
}
