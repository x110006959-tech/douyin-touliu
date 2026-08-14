import { describe, expect, it } from "vitest";
import {
  checkExtensionContextProtocol,
  parseExtensionContext,
  refreshConfigFromContext
} from "./extension-context";

const contextResponse = {
  collectionProtocolVersion: 1,
  liveScreenInternalApi: {
    enabled: false,
    contractVersion: "test-contract",
    adapterVersion: "test-adapter"
  },
  account: {
    id: "account-1",
    accountName: "好想来测试",
    projects: [{
      id: "project-1",
      name: "好想来直播",
      tasks: [{
        id: "task-1",
        pageTitle: "直播采集",
        routeSources: [{ routeKey: "LOCAL_PROMOTION_DASHBOARD", required: true }]
      }]
    }]
  }
};

describe("extension collection context", () => {
  it("uses the latest server-side task context before a capture", () => {
    const context = parseExtensionContext(contextResponse);
    expect(context).not.toBeNull();
    expect(refreshConfigFromContext({
      accountProfileId: "account-1",
      accountName: "好想来测试",
      collectionTaskId: "task-1"
    }, context!)).toEqual(expect.objectContaining({
      accountProfileId: "account-1",
      projectId: "project-1",
      projectName: "好想来直播"
    }));
  });

  it("rejects a task that no longer belongs to the bound account", () => {
    const context = parseExtensionContext(contextResponse);
    expect(refreshConfigFromContext({ collectionTaskId: "other-task" }, context!)).toBeNull();
  });

  it("rejects malformed context responses instead of trusting them", () => {
    expect(parseExtensionContext({ account: { id: "account-1" } })).toBeNull();
    expect(parseExtensionContext({ ...contextResponse, collectionProtocolVersion: 0 })).toBeNull();
  });

  it("distinguishes an old local API from an old extension", () => {
    expect(checkExtensionContextProtocol({ account: {} }, 1)).toEqual({
      ok: false,
      code: "SERVICE_UPDATE_REQUIRED"
    });
    expect(checkExtensionContextProtocol({ collectionProtocolVersion: 1 }, 2)).toEqual({
      ok: false,
      code: "SERVICE_UPDATE_REQUIRED"
    });
    expect(checkExtensionContextProtocol({ collectionProtocolVersion: 2 }, 1)).toEqual({
      ok: false,
      code: "EXTENSION_UPDATE_REQUIRED"
    });
    expect(checkExtensionContextProtocol(contextResponse, 1)).toEqual({ ok: true, version: 1 });
  });

  it("rejects an older service protocol before exchanging a pairing code", () => {
    expect(checkExtensionContextProtocol({ collectionProtocolVersion: 4 }, 5)).toEqual({
      ok: false,
      code: "SERVICE_UPDATE_REQUIRED"
    });
  });
});
