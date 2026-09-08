import { describe, expect, it } from "vitest";
import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";
import {
  isAllowedBridgeApiBaseUrl,
  isAllowedBridgeOrigin,
  parseBridgeRequest,
  parseBridgeWindowMessage,
  sanitizeBridgeResponse,
  serializeBridgeWindowMessage
} from "./bridge-protocol";

describe("extension web bridge protocol", () => {
  it("does not infer a local credential from historical account configuration", () => {
    expect(sanitizeBridgeResponse({ requestId: "stale-config", extensionVersion: "0.2.6", buildFingerprint: "build-a", runtimeResult: {
      ok: true, config: { accountProfileId: "account-a", collectionTaskId: "task-a" }, hasToken: false
    } })).toMatchObject({ paired: false, boundTaskId: null });
  });

  it("requires a page refresh when the worker and injected bridge builds differ", () => {
    expect(sanitizeBridgeResponse({ requestId: "reload", extensionVersion: "0.2.6", buildFingerprint: "old-build", runtimeResult: {
      ok: true, paired: true, boundTaskId: "task-a", buildFingerprint: "new-build", extensionVersion: "0.2.6"
    } })).toMatchObject({ ok: false, errorCode: "EXTENSION_CONTEXT_INVALIDATED" });
  });
  it("accepts only the product site and local development origins", () => {
    expect(isAllowedBridgeOrigin("https://www.pxxis.cn")).toBe(true);
    expect(isAllowedBridgeOrigin("http://127.0.0.1:3300", ["localhost", "127.0.0.1"])).toBe(true);
    expect(isAllowedBridgeOrigin("https://attacker.example.com")).toBe(false);
    expect(isAllowedBridgeApiBaseUrl("https://api.pxxis.cn")).toBe(true);
    expect(isAllowedBridgeApiBaseUrl("http://localhost:4300", ["localhost", "127.0.0.1"])).toBe(true);
    expect(isAllowedBridgeApiBaseUrl("https://attacker.example.com")).toBe(false);
  });

  it("rejects malformed and incompatible requests", () => {
    expect(parseBridgeRequest({ requestId: "ok-1", protocolVersion: extensionBridgeProtocolVersion, type: "GET_STATUS" })).toEqual(expect.objectContaining({ type: "GET_STATUS" }));
    expect(parseBridgeRequest({ requestId: "sync-1", protocolVersion: extensionBridgeProtocolVersion, type: "SYNC_CURRENT_TASK" })).toEqual(expect.objectContaining({ type: "SYNC_CURRENT_TASK" }));
    expect(parseBridgeRequest({ requestId: "ok-1", protocolVersion: extensionBridgeProtocolVersion - 1, type: "GET_STATUS" })).toBeNull();
    expect(parseBridgeRequest({ requestId: "<script>", protocolVersion: extensionBridgeProtocolVersion, type: "PAIR_TASK" })).toBeNull();
    expect(parseBridgeRequest({ requestId: "unknown-1", protocolVersion: extensionBridgeProtocolVersion, type: "SELECT_TASK" })).toBeNull();
  });

  it("accepts the web pairing request without exposing extra credentials", () => {
    const request = parseBridgeRequest({
      requestId: "pair-web-1",
      protocolVersion: extensionBridgeProtocolVersion,
      type: "PAIR_TASK",
      payload: { code: "123456", apiBaseUrl: "http://127.0.0.1:4300" }
    });
    expect(request).toEqual({
      requestId: "pair-web-1",
      protocolVersion: extensionBridgeProtocolVersion,
      type: "PAIR_TASK",
      payload: { code: "123456", apiBaseUrl: "http://127.0.0.1:4300" }
    });
    expect(parseBridgeRequest({
      requestId: "pair-web-extra",
      protocolVersion: extensionBridgeProtocolVersion,
      type: "PAIR_TASK",
      payload: { code: "123456", apiBaseUrl: "http://127.0.0.1:4300", taskPageUrl: "http://127.0.0.1:3300/tasks/task-1" }
    })).toBeNull();
    expect(parseBridgeRequest({
      requestId: "pair-web-label",
      protocolVersion: extensionBridgeProtocolVersion,
      type: "PAIR_TASK",
      payload: { code: "123456", apiBaseUrl: "http://127.0.0.1:4300", label: "网页任务一键配对" }
    })).toBeNull();
  });

  it("rejects payloads on read-only bridge requests", () => {
    expect(parseBridgeRequest({
      requestId: "status-with-payload",
      protocolVersion: extensionBridgeProtocolVersion,
      type: "GET_STATUS",
      payload: { code: "123456" }
    })).toBeNull();
  });

  it("accepts only valid JSON postMessage envelopes", () => {
    const request = { requestId: "json-1", protocolVersion: extensionBridgeProtocolVersion, type: "GET_STATUS" };
    const envelope = serializeBridgeWindowMessage("REQUEST", request);
    expect(parseBridgeWindowMessage(envelope)).toEqual(expect.objectContaining({ type: "REQUEST", payload: request }));
    expect(parseBridgeWindowMessage(JSON.stringify({ channel: "other", type: "REQUEST", payload: request }))).toBeNull();
    expect(parseBridgeWindowMessage("not-json")).toBeNull();
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

  it("returns an existing task binding without exposing local configuration", () => {
    const response = sanitizeBridgeResponse({
      requestId: "pair-existing-task",
      extensionVersion: "0.2.2",
      buildFingerprint: "abc123",
      runtimeResult: {
        ok: true,
        paired: true,
        boundTaskId: "task-a",
        message: "插件已配对并绑定当前任务，无需重复确认。"
      }
    });

    expect(response).toEqual(expect.objectContaining({ ok: true, paired: true, boundTaskId: "task-a", pendingConfirmation: false }));
  });

  it("reduces unknown runtime failures to a fixed safe code and message", () => {
    const response = sanitizeBridgeResponse({
      requestId: "pair-error",
      extensionVersion: "0.2.4",
      buildFingerprint: "abc123",
      runtimeResult: { ok: false, errorCode: "SERVER_INTERNAL_SECRET", error: "token=private" }
    });

    expect(response.errorCode).toBe("BRIDGE_REQUEST_FAILED");
    expect(response.message).not.toContain("private");
    expect(JSON.stringify(response)).not.toContain("SERVER_INTERNAL_SECRET");
  });

  it("keeps a pairing transport failure actionable without exposing runtime details", () => {
    const response = sanitizeBridgeResponse({
      requestId: "pair-transport-error",
      extensionVersion: "0.2.4",
      buildFingerprint: "abc123",
      runtimeResult: { ok: false, errorCode: "PAIRING_REQUEST_FAILED", error: "private network detail" }
    });

    expect(response.errorCode).toBe("PAIRING_REQUEST_FAILED");
    expect(response.message).toContain("无法连接诊断服务");
    expect(JSON.stringify(response)).not.toContain("private network detail");
  });
});
