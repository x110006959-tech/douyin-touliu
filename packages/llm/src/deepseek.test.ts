import { describe, expect, it, vi } from "vitest";
import { createDeepSeekTransport, LlmTransportError, type ChatTransport } from "./deepseek.js";
import { completeJsonWithRepair, runToolLoop } from "./tool-loop.js";

describe("DeepSeek transport", () => {
  it("retries one 429 without exposing the api key", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const transport = createDeepSeekTransport({ apiKey: "test-secret-key", fetchImpl });
    const result = await transport.chat({ messages: [{ role: "user", content: "test" }] });
    expect(result.usage.totalTokens).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects missing credentials", () => {
    expect(() => createDeepSeekTransport({ apiKey: "" })).toThrow(LlmTransportError);
  });

  it("keeps a sanitized upstream validation message", async () => {
    const apiKey = "sk-test-secret-value";
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: `Invalid request for ${apiKey}` }
    }), { status: 400, headers: { "Content-Type": "application/json" } }));
    const transport = createDeepSeekTransport({ apiKey, fetchImpl });

    await expect(transport.chat({ messages: [{ role: "user", content: "test" }] })).rejects.toMatchObject({
      code: "DEEPSEEK_REQUEST_REJECTED",
      message: "DeepSeek 请求失败（HTTP 400）：Invalid request for [REDACTED]"
    });
  });
});

describe("generic tool loop", () => {
  it("forces the first tool and keeps reasoning only inside the request chain", async () => {
    const requests: unknown[] = [];
    let call = 0;
    const transport: ChatTransport = {
      provider: "fake",
      model: "fake",
      async chat(request) {
        requests.push(request);
        call += 1;
        return call === 1
          ? {
              message: { role: "assistant", content: null, reasoning_content: "ephemeral", tool_calls: [{ id: "1", type: "function", function: { name: "audit", arguments: "{}" } }] },
              finishReason: "tool_calls",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
            }
          : { message: { role: "assistant", content: "done" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      }
    };
    const result = await runToolLoop({
      transport,
      messages: [{ role: "user", content: "diagnose" }],
      initialRequiredToolName: "audit",
      tools: [{ definition: { type: "function", function: { name: "audit", description: "audit", parameters: { type: "object" } } }, execute: async () => ({ ready: true }) }]
    });
    expect(result.calledTools).toEqual(["audit"]);
    expect(JSON.stringify(result)).not.toContain("ephemeral");
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      tool_choice: "auto",
      tools: [{ function: { name: "audit" } }]
    });
  });

  it("fails closed when the required first tool is not called", async () => {
    const transport: ChatTransport = {
      provider: "fake",
      model: "fake",
      async chat() {
        return { message: { role: "assistant", content: "skip" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      }
    };

    await expect(runToolLoop({
      transport,
      messages: [{ role: "user", content: "diagnose" }],
      initialRequiredToolName: "audit",
      tools: [{ definition: { type: "function", function: { name: "audit", description: "audit", parameters: { type: "object" } } }, execute: async () => ({ ready: true }) }]
    })).rejects.toMatchObject({ code: "DIAGNOSIS_REQUIRED_TOOL_MISSING" });
  });

  it("can stop after executing the first tool batch without a no-op completion round", async () => {
    const chat = vi.fn(async () => ({
      message: { role: "assistant" as const, content: null, tool_calls: [{ id: "1", type: "function" as const, function: { name: "audit", arguments: "{}" } }] },
      finishReason: "tool_calls",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    }));
    const transport: ChatTransport = { provider: "fake", model: "fake", chat };

    const result = await runToolLoop({
      transport,
      messages: [{ role: "user", content: "diagnose" }],
      tools: [{ definition: { type: "function", function: { name: "audit", description: "audit", parameters: { type: "object" } } }, execute: async () => ({ ready: true }) }],
      stopAfterToolBatch: true
    });

    expect(result).toMatchObject({ rounds: 1, toolCalls: 1, calledTools: ["audit"] });
    expect(chat).toHaveBeenCalledOnce();
  });

  it("repairs invalid JSON once", async () => {
    let call = 0;
    const transport: ChatTransport = {
      provider: "fake",
      model: "fake",
      async chat() {
        call += 1;
        return { message: { role: "assistant", content: call === 1 ? "not-json" : "{\"ok\":true}" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      }
    };
    const result = await completeJsonWithRepair({
      transport,
      messages: [{ role: "user", content: "json" }],
      parse: (value) => value as { ok: boolean },
      repairInstruction: "repair"
    });
    expect(result.value.ok).toBe(true);
    expect(call).toBe(2);
  });

  it("passes field-level validation issues to the single repair request", async () => {
    const requests: import("./deepseek.js").ChatRequest[] = [];
    const transport: ChatTransport = {
      provider: "fake",
      model: "fake",
      async chat(request) {
        requests.push(request);
        return { message: { role: "assistant", content: "{}" }, finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      }
    };

    await expect(completeJsonWithRepair({
      transport,
      messages: [{ role: "user", content: "json" }],
      parse: () => {
        throw { issues: [{ path: ["confidence"], message: "Required" }] };
      },
      repairInstruction: "repair"
    })).rejects.toThrow("顶层键：<none>；confidence: Required");
    expect(requests[1]?.messages.at(-1)?.content).toContain("顶层键：<none>；confidence: Required");
    expect(requests[1]?.thinking).toBe("disabled");
  });
});
