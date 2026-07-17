import { describe, expect, it } from "vitest";
import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";
import { isAllowedBridgeApiBaseUrl, isAllowedBridgeOrigin, parseBridgeRequest, sanitizeBridgeResponse } from "./bridge-protocol";

describe("extension web bridge protocol", () => {
  it("accepts only the product site and local development origins", () => {
    expect(isAllowedBridgeOrigin("https://www.pxxis.cn")).toBe(true);
    expect(isAllowedBridgeOrigin("http://127.0.0.1:3300")).toBe(true);
    expect(isAllowedBridgeOrigin("https://attacker.example.com")).toBe(false);
    expect(isAllowedBridgeApiBaseUrl("https://api.pxxis.cn")).toBe(true);
    expect(isAllowedBridgeApiBaseUrl("http://localhost:4300")).toBe(true);
    expect(isAllowedBridgeApiBaseUrl("https://attacker.example.com")).toBe(false);
  });

  it("rejects malformed and incompatible requests", () => {
    expect(parseBridgeRequest({ requestId: "ok-1", protocolVersion: extensionBridgeProtocolVersion, type: "GET_STATUS" })).toEqual(expect.objectContaining({ type: "GET_STATUS" }));
    expect(parseBridgeRequest({ requestId: "ok-1", protocolVersion: extensionBridgeProtocolVersion - 1, type: "GET_STATUS" })).toBeNull();
    expect(parseBridgeRequest({ requestId: "<script>", protocolVersion: extensionBridgeProtocolVersion, type: "PAIR_TASK" })).toBeNull();
  });

  it("never exposes credentials through page events", () => {
    const response = sanitizeBridgeResponse({
      requestId: "pair-1",
      extensionVersion: "0.2.2",
      buildFingerprint: "abc123",
      runtimeResult: {
        ok: true,
        hasToken: true,
        token: "secret-token",
        authorization: "Bearer private",
        config: { accountProfileId: "account-a", collectionTaskId: "task-a", cookie: "private-cookie" },
        context: { password: "private-password" }
      }
    });
    expect(response).toEqual(expect.objectContaining({ ok: true, paired: true, boundTaskId: "task-a" }));
    expect(JSON.stringify(response)).not.toMatch(/secret-token|Bearer private|private-cookie|private-password/);
  });
});

