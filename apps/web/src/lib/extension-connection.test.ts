import { describe, expect, it } from "vitest";
import { extensionBridgeProtocolVersion, type ExtensionStatusDTO } from "@douyin-local-life/shared";
import type { WebExtensionBridgeResponse } from "./extension-bridge";
import { isCurrentExtensionConnected, shouldRecoverExtensionTask } from "./extension-connection";

const now = Date.now();
const local: WebExtensionBridgeResponse = {
  requestId: "request-1", ok: true, protocolVersion: extensionBridgeProtocolVersion,
  extensionVersion: "0.2.6", buildFingerprint: "build-current", connectionSessionId: "session-current",
  paired: true, pendingConfirmation: false, boundTaskId: "task-1", errorCode: null, message: "已连接"
};
const server: ExtensionStatusDTO = {
  state: "PAGE_UNSUPPORTED", installedDetectedByWeb: false, paired: true, boundTaskId: "task-1", boundTaskTitle: "任务一",
  extensionVersion: local.extensionVersion, bridgeProtocolVersion: extensionBridgeProtocolVersion,
  buildFingerprint: local.buildFingerprint, connectionSessionId: local.connectionSessionId,
  currentUrl: "https://www.pxxis.cn/tasks/task-1", pageType: "TASK_TABLE", routeKey: "UNKNOWN", collectable: false,
  tabState: "VISIBLE", lastHeartbeatAt: new Date(now).toISOString(), lastError: null, message: "当前任务页不可采集"
};
const bridge = { state: "READY", response: local };

describe("current browser connection contract", () => {
  it("accepts a verified task page without claiming the page is collectable", () => {
    expect(isCurrentExtensionConnected("task-1", bridge, server, now)).toBe(true);
    expect(server.collectable).toBe(false);
  });
  it.each([
    { paired: false }, { boundTaskId: "task-other" }, { connectionSessionId: "previous-worker" },
    { buildFingerprint: "old-build" }, { extensionVersion: "0.2.5" }, { protocolVersion: extensionBridgeProtocolVersion - 1 },
    { ok: false }, { pendingConfirmation: true }
  ])("rejects a mismatched local state %j even with a fresh server heartbeat", (change) => {
    expect(isCurrentExtensionConnected("task-1", { ...bridge, response: { ...local, ...change } }, server, now)).toBe(false);
  });
  it.each<Partial<ExtensionStatusDTO>>([
    { state: "OFFLINE" }, { state: "VERSION_OUTDATED" }, { state: "ERROR" }, { state: "BOUND_OTHER_TASK" },
    { paired: false }, { boundTaskId: "task-other" }, { connectionSessionId: "other-browser" }, { connectionSessionId: undefined },
    { buildFingerprint: "old-build" }, { extensionVersion: "0.2.5" }, { bridgeProtocolVersion: extensionBridgeProtocolVersion - 1 },
    { lastHeartbeatAt: new Date(now - 15_001).toISOString() }, { lastHeartbeatAt: "invalid" }, { lastHeartbeatAt: null }
  ])("rejects stale or mismatched server state %j", (change) => {
    expect(isCurrentExtensionConnected("task-1", bridge, { ...server, ...change }, now)).toBe(false);
  });
  it("does not accept history while the bridge is unavailable or recovering", () => {
    expect(isCurrentExtensionConnected("task-1", { ...bridge, state: "SYNC_FAILED" }, server, now)).toBe(false);
    expect(isCurrentExtensionConnected("task-1", { state: "CHECKING", response: null }, server, now)).toBe(false);
  });
  it("retries failed entry, newly paired popup and restarted worker, and renews this task", () => {
    for (const synchronizedSession of [null, "old-worker", local.connectionSessionId]) {
      expect(shouldRecoverExtensionTask({ taskId: "task-1", status: local, synchronizedSession, force: false })).toBe(true);
    }
    expect(shouldRecoverExtensionTask({ taskId: "task-1", status: { ...local, paired: false }, synchronizedSession: null, force: false })).toBe(false);
  });
  it("does not steal a later manual task switch from another open page", () => {
    const input = { taskId: "task-1", status: { ...local, boundTaskId: "task-2" }, synchronizedSession: local.connectionSessionId, force: false };
    expect(shouldRecoverExtensionTask(input)).toBe(false);
    expect(shouldRecoverExtensionTask({ ...input, force: true })).toBe(true);
  });
});
