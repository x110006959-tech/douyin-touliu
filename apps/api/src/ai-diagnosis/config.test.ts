import { afterEach, describe, expect, it } from "vitest";
import { LlmTransportError } from "@douyin-local-life/llm";
import { aiDiagnosisConfigurationIssue, createConfiguredDiagnosisTransport } from "./config.js";

const originalEnabled = process.env.AI_DIAGNOSIS_ENABLED;
const originalApiKey = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
  restoreEnvironment("AI_DIAGNOSIS_ENABLED", originalEnabled);
  restoreEnvironment("DEEPSEEK_API_KEY", originalApiKey);
});

describe("AI diagnosis configuration", () => {
  it("fails before transport creation when the real switch is enabled without a key", () => {
    process.env.AI_DIAGNOSIS_ENABLED = "true";
    delete process.env.DEEPSEEK_API_KEY;

    expect(aiDiagnosisConfigurationIssue()).toEqual({
      code: "DEEPSEEK_API_KEY_MISSING",
      message: "AI 诊断已开启，但服务端未配置 DEEPSEEK_API_KEY"
    });
    expect(() => createConfiguredDiagnosisTransport()).toThrow(LlmTransportError);
  });

  it("does not require a credential while the real switch remains off", () => {
    process.env.AI_DIAGNOSIS_ENABLED = "false";
    delete process.env.DEEPSEEK_API_KEY;

    expect(aiDiagnosisConfigurationIssue()).toBeNull();
  });
});

function restoreEnvironment(name: "AI_DIAGNOSIS_ENABLED" | "DEEPSEEK_API_KEY", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
