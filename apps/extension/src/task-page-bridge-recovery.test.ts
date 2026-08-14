import { describe, expect, it, vi } from "vitest";
import {
  createTaskPageConnectionActivity,
  isTaskBridgePageUrl,
  restoreBoundTaskPageConnection,
  restoreTaskPageConnection,
  taskIdFromBridgePageUrl
} from "./task-page-bridge-recovery";

describe("task-page bridge recovery", () => {
  it("restores a saved binding only for the active exact task page", async () => {
    const restore = vi.fn().mockResolvedValue({ ok: true as const });
    const result = await restoreBoundTaskPageConnection({
      paired: true,
      boundTaskId: "task-1",
      sender: { tab: { active: true, url: "https://www.pxxis.cn/tasks/task-1" } },
      restore
    });

    expect(result).toEqual({ attempted: true, result: { ok: true } });
    expect(restore).toHaveBeenCalledWith("https://www.pxxis.cn/tasks/task-1");
  });

  it("does not depend on the unreliable sender tab active flag", async () => {
    const restore = vi.fn().mockResolvedValue({ ok: true as const });
    await expect(restoreBoundTaskPageConnection({
      paired: true,
      boundTaskId: "task-1",
      sender: { tab: { active: false, url: "https://www.pxxis.cn/tasks/task-1" } },
      restore
    })).resolves.toEqual({ attempted: true, result: { ok: true } });
    expect(restore).toHaveBeenCalledOnce();
  });

  it("fails closed for unpaired, mismatched-task and non-task pages", async () => {
    const restore = vi.fn().mockResolvedValue({ ok: true as const });
    const inputs = [
      { paired: false, boundTaskId: "task-1", sender: { tab: { active: true, url: "https://www.pxxis.cn/tasks/task-1" } } },
      { paired: true, boundTaskId: "task-1", sender: { tab: { active: true, url: "https://www.pxxis.cn/tasks/task-2" } } },
      { paired: true, boundTaskId: "task-1", sender: { tab: { active: true, url: "https://www.pxxis.cn/tasks/task-1/collection-dashboard" } } }
    ];

    await Promise.all(inputs.map((input) => restoreBoundTaskPageConnection({ ...input, restore })));

    expect(restore).not.toHaveBeenCalled();
    expect(isTaskBridgePageUrl("https://www.pxxis.cn/tasks/task-1")).toBe(true);
    expect(taskIdFromBridgePageUrl("https://www.pxxis.cn/tasks/task-1")).toBe("task-1");
    expect(isTaskBridgePageUrl("https://www.pxxis.cn/tasks/task-1/collection-dashboard")).toBe(false);
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

  it("refreshes context before reporting the non-collectable heartbeat", async () => {
    const calls: string[] = [];
    const refreshContext = vi.fn(async () => {
      calls.push("context");
      return { ok: true as const };
    });
    const reportHeartbeat = vi.fn(async () => {
      calls.push("heartbeat");
      return { ok: true as const };
    });
    const appendLog = vi.fn(async () => {
      calls.push("log");
    });

    await expect(restoreTaskPageConnection({
      taskPageUrl: "https://www.pxxis.cn/tasks/task-1",
      timeoutMs: 1_800,
      observedAt: "2026-08-08T00:00:00.000Z",
      refreshContext,
      reportHeartbeat,
      appendLog
    })).resolves.toEqual({ ok: true });

    expect(calls).toEqual(["context", "heartbeat", "log"]);
    expect(refreshContext).toHaveBeenCalledWith(1_800);
    expect(reportHeartbeat).toHaveBeenCalledWith({
      currentUrl: "https://www.pxxis.cn/tasks/task-1",
      pageType: "TASK_TABLE",
      routeKey: "UNKNOWN",
      collectable: false,
      tabState: "VISIBLE",
      observedAt: "2026-08-08T00:00:00.000Z"
    }, 1_800);
  });

  it("stops recovery when context refresh or heartbeat fails", async () => {
    const heartbeat = vi.fn().mockResolvedValue({ ok: true as const });
    const appendLog = vi.fn().mockResolvedValue(undefined);
    await expect(restoreTaskPageConnection({
      taskPageUrl: "https://www.pxxis.cn/tasks/task-1",
      timeoutMs: 1_800,
      refreshContext: vi.fn().mockResolvedValue({ ok: false as const, error: "上下文失效" }),
      reportHeartbeat: heartbeat,
      appendLog
    })).resolves.toEqual({ ok: false, error: "上下文失效" });
    expect(heartbeat).not.toHaveBeenCalled();

    await expect(restoreTaskPageConnection({
      taskPageUrl: "https://www.pxxis.cn/tasks/task-1",
      timeoutMs: 1_800,
      refreshContext: vi.fn().mockResolvedValue({ ok: true as const }),
      reportHeartbeat: vi.fn().mockResolvedValue({ ok: false as const, error: "心跳失败" }),
      appendLog
    })).resolves.toEqual({ ok: false, error: "心跳失败" });
    expect(appendLog).not.toHaveBeenCalled();
  });
});
