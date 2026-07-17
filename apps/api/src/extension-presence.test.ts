import { afterEach, describe, expect, it, vi } from "vitest";
import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";
import { clearExtensionPresenceForTests, getExtensionStatus, recordExtensionPresence } from "./extension-presence.js";

describe("extension task presence", () => {
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
        accountMatchStatus: "MATCHED",
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
        accountMatchStatus: "MATCHED",
        observedAt: new Date().toISOString()
      }
    });
    expect(getExtensionStatus({ collectionTaskId: "task-1", taskTitle: "任务", accountProfileId: "account-1", activeCredentialIds: ["credential-2"], expectedVersion: "0.2.2" }).state).toBe("BOUND_OTHER_TASK");
    expect(getExtensionStatus({ collectionTaskId: "task-1", taskTitle: "任务", accountProfileId: "account-2", activeCredentialIds: ["credential-2"], expectedVersion: "0.2.2" }).state).toBe("PAIRED_NOT_CONNECTED");
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
      accountMatchStatus: "MATCHED" as const,
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
});
