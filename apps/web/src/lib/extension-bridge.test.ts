import { describe, expect, it } from "vitest";
import { parseBridgeResponse } from "./extension-bridge";

function bridgeResponse(overrides: Partial<Parameters<typeof parseBridgeResponse>[0] & object> = {}) {
  return {
    requestId: "web:test",
    ok: true,
    protocolVersion: 9,
    extensionVersion: "0.2.6",
    buildFingerprint: "e367e69e1ea3",
    connectionSessionId: "019621df-3b10-4c6a-8a2f-1a1d3e4f5a6b",
    paired: true,
    pendingConfirmation: false,
    boundTaskId: "task-1",
    errorCode: null,
    message: "插件已连接",
    ...overrides
  };
}

describe("web extension bridge response parser", () => {
  it("accepts a valid UUID connection session id", () => {
    expect(parseBridgeResponse(bridgeResponse())).toMatchObject({
      requestId: "web:test",
      connectionSessionId: "019621df-3b10-4c6a-8a2f-1a1d3e4f5a6b"
    });
  });

  it("rejects a malformed connection session id", () => {
    expect(parseBridgeResponse(bridgeResponse({ connectionSessionId: "------------------------------------" }))).toBeNull();
    expect(parseBridgeResponse(bridgeResponse({ connectionSessionId: "019621df-3b10-4c6a-8a2f-1a1d3e4f5a6b-extra" }))).toBeNull();
  });
});
