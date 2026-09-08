import { describe, expect, it, vi } from "vitest";
import type { ChatTransport } from "./deepseek.js";
import { completeJsonWithRepair } from "./tool-loop.js";

function fixture(content = '{"statement":"bad"}') {
  const chat = vi.fn<ChatTransport["chat"]>().mockResolvedValue({
    message: { role: "assistant", content },
    finishReason: "stop",
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
  });
  return {
    chat,
    input: {
      transport: { provider: "fake", model: "fake", chat },
      messages: [],
      repairInstruction: "repair",
      parse(value: unknown) {
        if (!value || typeof value !== "object" || !("statement" in value) || value.statement !== "safe") {
          throw Object.assign(new Error("比较性评价不受支持"), { code: "DIAGNOSIS_BENCHMARK_UNSUPPORTED" });
        }
        return { statement: value.statement };
      }
    }
  };
}

describe("final validation recovery", () => {
  it("revalidates a recovered result and accounts for exactly two model responses", async () => {
    const { input, chat } = fixture();
    const recovery = vi.fn(() => ({ statement: "safe" }));
    const parse = vi.fn(input.parse);
    const result = await completeJsonWithRepair({ ...input, parse, repairAfterValidation: recovery });
    expect(result).toEqual({ value: { statement: "safe" }, usage: { inputTokens: 2, outputTokens: 4, totalTokens: 6 } });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(parse).toHaveBeenCalledTimes(3);
    expect(recovery).toHaveBeenCalledExactlyOnceWith({ statement: "bad" }, expect.stringContaining("DIAGNOSIS_BENCHMARK_UNSUPPORTED"));
  });

  it("never invokes recovery for an already valid answer", async () => {
    const { input, chat } = fixture('{"statement":"safe"}');
    const recovery = vi.fn();
    await completeJsonWithRepair({ ...input, repairAfterValidation: recovery });
    expect(recovery).not.toHaveBeenCalled();
    expect(chat).toHaveBeenCalledOnce();
  });

  it.each(["not-json", "{}"])("fails closed when recovery cannot safely recover %s", async (content) => {
    const { input, chat } = fixture(content);
    await expect(completeJsonWithRepair({ ...input, repairAfterValidation: () => { throw new Error("private upstream text"); } }))
      .rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID", message: expect.not.stringContaining("private upstream text") });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("reports the actual safety error exposed by full revalidation", async () => {
    const { input, chat } = fixture();
    await expect(completeJsonWithRepair({
      ...input,
      repairAfterValidation: () => ({ statement: "safe" }),
      parse(value) {
        input.parse(value);
        throw Object.assign(new Error("证据引用不存在"), { code: "DIAGNOSIS_EVIDENCE_INVALID" });
      }
    })).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID", message: expect.stringContaining("DIAGNOSIS_EVIDENCE_INVALID") });
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
