import { describe, expect, it } from "vitest";
import {
  contextRefreshErrorCode,
  createTaskPageConnectionActivity,
  isTaskBridgePageUrl,
  resolveTaskPageBinding,
  shouldBlockTaskSwitchForActivePulse,
  taskIdFromBridgePageUrl
} from "./task-page-bridge-recovery";
import type { ExtensionContext } from "./extension-context";

const context: ExtensionContext = {
  account: {
    id: "account-1",
    accountName: "账号一",
    projects: [{
      id: "project-1",
      name: "项目一",
      tasks: [
        { id: "task-1", pageTitle: "任务一", routeSources: [] },
        { id: "task-2", pageTitle: "任务二", routeSources: [] }
      ]
    }]
  },
  collectionProtocolVersion: 1,
  liveScreenInternalApi: { enabled: true, contractVersion: "1", adapterVersion: "1" },
  localPromotionInternalApi: { enabled: true, contractVersion: "1", adapterVersion: "1" }
};

describe("task-page bridge recovery", () => {
  it("accepts only an exact trusted task page URL", () => {
    expect(isTaskBridgePageUrl("https://www.pxxis.cn/tasks/task-1")).toBe(true);
    expect(taskIdFromBridgePageUrl("https://www.pxxis.cn/tasks/task-1")).toBe("task-1");
    expect(isTaskBridgePageUrl("https://www.pxxis.cn/tasks/task-1/collection-dashboard")).toBe(false);
    expect(isTaskBridgePageUrl("https://example.com/tasks/task-1")).toBe(false);
  });

  it("reports task pages as connected but never collectable", () => {
    expect(createTaskPageConnectionActivity("https://www.pxxis.cn/tasks/task-1", "2026-08-08T00:00:00.000Z")).toEqual({
      currentUrl: "https://www.pxxis.cn/tasks/task-1",
      pageType: "TASK_TABLE",
      routeKey: "UNKNOWN",
      collectable: false,
      tabState: "VISIBLE",
      observedAt: "2026-08-08T00:00:00.000Z"
    });
  });

  it("resolves only tasks that belong to the paired account context", () => {
    expect(resolveTaskPageBinding(context, "task-2")).toEqual({
      project: context.account.projects[0],
      task: context.account.projects[0]?.tasks[1]
    });
    expect(resolveTaskPageBinding(context, "other-account-task")).toBeNull();
  });

  it("blocks only a real task switch while continuous collection is active", () => {
    expect(shouldBlockTaskSwitchForActivePulse({
      boundTaskId: "task-1",
      targetTaskId: "task-2",
      hasActivePulse: true
    })).toBe(true);
    expect(shouldBlockTaskSwitchForActivePulse({
      boundTaskId: "task-1",
      targetTaskId: "task-1",
      hasActivePulse: true
    })).toBe(false);
    expect(shouldBlockTaskSwitchForActivePulse({
      boundTaskId: "task-1",
      targetTaskId: "task-2",
      hasActivePulse: false
    })).toBe(false);
  });

  it("treats rejected credentials as a pairing failure", () => {
    expect(contextRefreshErrorCode(401)).toBe("PAIRING_REQUIRED");
    expect(contextRefreshErrorCode(403)).toBe("PAIRING_REQUIRED");
    expect(contextRefreshErrorCode(500)).toBe("CONTEXT_REFRESH_FAILED");
  });
});
