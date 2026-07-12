import { afterEach, describe, expect, it } from "vitest";
import { AiCircuitOpenError, executeWithAiCircuit, getAiCircuitStatus, recordAiFailure } from "./ai-circuit.js";
import { prisma } from "./prisma.js";

const provider = `test-provider-${Date.now()}`;
const model = "test-model";

afterEach(async () => {
  await prisma.aiProviderCircuit.deleteMany({ where: { provider } });
});

describe("AI provider circuit", () => {
  it("opens after consecutive retryable failures and recovers through one half-open probe", async () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    await recordAiFailure(provider, model, new Error("network"), now);
    await recordAiFailure(provider, model, new Error("network"), now);
    await recordAiFailure(provider, model, new Error("network"), now);
    const open = await getAiCircuitStatus(provider, model, now);
    expect(open).toMatchObject({ state: "OPEN", consecutiveFailures: 3, backoffLevel: 1 });
    await expect(executeWithAiCircuit(provider, model, async () => "unexpected", now)).rejects.toBeInstanceOf(AiCircuitOpenError);

    const recovered = await executeWithAiCircuit(provider, model, async () => "ok", new Date(now.getTime() + 31_000));
    expect(recovered).toBe("ok");
    expect(await getAiCircuitStatus(provider, model, new Date(now.getTime() + 31_000))).toMatchObject({ state: "CLOSED", consecutiveFailures: 0 });
  });
});
