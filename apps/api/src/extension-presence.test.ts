import { afterEach, describe, expect, it, vi } from "vitest";
import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";
import { clearExtensionPresenceForTests, getExtensionStatus, recordExtensionPresence } from "./extension-presence.js";

describe("extension task presence", () => {
  it("keeps fresh platform evidence during task-page renewal but never revives stale collection state", () => {
    vi.useFakeTimers();
    const identity = { credentialId: "credential-1", accountProfileId: "account-1" };
    const heartbeat = {
      collectionTaskId: "task-1", extensionVersion: "0.2.6", bridgeProtocolVersion: extensionBridgeProtocolVersion,
      connectionSessionId: "current-worker", buildFingerprint: "build-current",
      currentUrl: "https://eos.douyin.com/dp/liveScreen", pageType: "LIVE_DATA_SCREEN" as const,
      routeKey: "LIVE_DATA_SCREEN" as const, collectable: true, tabState: "VISIBLE" as const, observedAt: new Date().toISOString()
    };
    const taskHeartbeat = { ...heartbeat, currentUrl: "https://www.pxxis.cn/tasks/task-1", pageType: "TASK_TABLE" as const, collectable: false };
    const input = { collectionTaskId: "task-1", taskTitle: "任务", accountProfileId: "account-1", activeCredentialIds: ["credential-1"], expectedVersion: "0.2.6", connectionSessionId: "current-worker" };
    recordExtensionPresence({ ...identity, heartbeat });
    vi.advanceTimersByTime(5_000);
    recordExtensionPresence({ ...identity, heartbeat: taskHeartbeat });
    expect(getExtensionStatus(input)).toMatchObject({ state: "READY", collectable: true, currentUrl: heartbeat.currentUrl });
    vi.advanceTimersByTime(11_000);
    recordExtensionPresence({ ...identity, heartbeat: taskHeartbeat });
    expect(getExtensionStatus(input)).toMatchObject({ state: "PAGE_UNSUPPORTED", collectable: false });
  });

  it("does not reuse another worker's fresh page heartbeat after reload", () => {
    const identity = { credentialId: "credential-1", accountProfileId: "account-1" };
    const heartbeat = {
      collectionTaskId: "task-1", extensionVersion: "0.2.6", bridgeProtocolVersion: extensionBridgeProtocolVersion,
      connectionSessionId: "old-worker", buildFingerprint: "build-current",
      currentUrl: "https://eos.douyin.com/dp/liveScreen", pageType: "LIVE_DATA_SCREEN" as const,
      routeKey: "LIVE_DATA_SCREEN" as const, collectable: true, tabState: "VISIBLE" as const, observedAt: new Date().toISOString()
    };
    recordExtensionPresence({ ...identity, heartbeat });
    recordExtensionPresence({ ...identity, heartbeat: { ...heartbeat, connectionSessionId: "new-worker", pageType: "TASK_TABLE", collectable: false } });
    expect(getExtensionStatus({ collectionTaskId: "task-1", taskTitle: "任务", accountProfileId: "account-1", activeCredentialIds: ["credential-1"], expectedVersion: "0.2.6", connectionSessionId: "new-worker" })).toMatchObject({ state: "PAGE_UNSUPPORTED", collectable: false, connectionSessionId: "new-worker" });
  });
  afterEach(() => {
    clearExtensionPresenceForTests();
    vi.useRealTimers();
  });

  it("reports a matching active task as ready and turns stale heartbeats offline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T10:00:00.000Z"));
    recordExtensionPresence({
      credentialId: "credential-1",
      accountProfileId: "account-1",
      heartbeat: {
        collectionTaskId: "task-1",
        extensionVersion: "0.2.2",
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: "build-a",
        currentUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
        pageType: "LIVE_DATA_SCREEN",
        routeKey: "LIVE_DATA_SCREEN",
        collectable: true,
        tabState: "VISIBLE",
        observedAt: new Date().toISOString()
      }
    });
    const input = { collectionTaskId: "task-1", taskTitle: "直播大屏", accountProfileId: "account-1", activeCredentialIds: ["credential-1"], expectedVersion: "0.2.2" };
    expect(getExtensionStatus(input)).toMatchObject({ state: "READY", boundTaskId: "task-1", collectable: true });
    vi.advanceTimersByTime(16_000);
    expect(getExtensionStatus(input)).toMatchObject({ state: "OFFLINE", boundTaskId: "task-1" });
  });

  it("does not treat another account or another task as the current task", () => {
    recordExtensionPresence({
      credentialId: "credential-2",
      accountProfileId: "account-1",
      heartbeat: {
        collectionTaskId: "task-other",
        extensionVersion: "0.2.2",
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: "build-a",
        currentUrl: "https://localads.chengzijianzhan.cn/",
        pageType: "LOCAL_PROMOTION_DASHBOARD",
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        collectable: true,
        tabState: "VISIBLE",
        observedAt: new Date().toISOString()
      }
    });
    expect(getExtensionStatus({ collectionTaskId: "task-1", taskTitle: "任务", accountProfileId: "account-1", activeCredentialIds: ["credential-2"], expectedVersion: "0.2.2" }).state).toBe("BOUND_OTHER_TASK");
    expect(getExtensionStatus({ collectionTaskId: "task-1", taskTitle: "任务", accountProfileId: "account-2", activeCredentialIds: ["credential-2"], expectedVersion: "0.2.2" })).toMatchObject({
      state: "PAIRED_NOT_CONNECTED",
      message: expect.stringContaining("历史授权")
    });
  });

  it("distinguishes an old background worker from an unknown live section", () => {
    const baseHeartbeat = {
      collectionTaskId: "task-1",
      extensionVersion: "0.2.2",
      currentUrl: "https://eos.douyin.com/dp/liveScreen",
      pageType: "LIVE_DATA_SCREEN" as const,
      routeKey: "UNKNOWN" as const,
      collectable: true,
      tabState: "VISIBLE" as const,
      observedAt: new Date().toISOString()
    };
    const statusInput = { collectionTaskId: "task-1", taskTitle: "直播大屏", accountProfileId: "account-1", activeCredentialIds: ["credential-3"], expectedVersion: "0.2.2" };
    recordExtensionPresence({ credentialId: "credential-3", accountProfileId: "account-1", heartbeat: baseHeartbeat });
    expect(getExtensionStatus(statusInput).state).toBe("VERSION_OUTDATED");
    recordExtensionPresence({
      credentialId: "credential-3",
      accountProfileId: "account-1",
      heartbeat: { ...baseHeartbeat, bridgeProtocolVersion: extensionBridgeProtocolVersion, buildFingerprint: "build-b" }
    });
    expect(getExtensionStatus(statusInput).state).toBe("ROUTE_UNVERIFIED");
  });

  it("treats a verified task-page heartbeat as connected while keeping collection unavailable", () => {
    recordExtensionPresence({
      credentialId: "credential-task-page",
      accountProfileId: "account-1",
      heartbeat: {
        collectionTaskId: "task-1",
        extensionVersion: "0.2.2",
        bridgeProtocolVersion: extensionBridgeProtocolVersion,
        buildFingerprint: "build-task-page",
        currentUrl: "http://127.0.0.1:3300/tasks/task-1",
        pageType: "TASK_TABLE",
        routeKey: "UNKNOWN",
        collectable: false,
        tabState: "VISIBLE",
        observedAt: new Date().toISOString()
      }
    });

    expect(getExtensionStatus({
      collectionTaskId: "task-1",
      taskTitle: "任务",
      accountProfileId: "account-1",
      activeCredentialIds: ["credential-task-page"],
      expectedVersion: "0.2.2"
    })).toMatchObject({ state: "PAGE_UNSUPPORTED", boundTaskId: "task-1", collectable: false });
  });
});
