import { developmentLoopbackHostnames, localWebPort } from "./build-target";

export type TaskPageBridgeSender = {
  tab?: { active?: boolean; url?: string };
  url?: string;
};

export type TaskPageConnectionRecoveryResult = { ok: true } | { ok: false; error: string };

export type TaskPageConnectionActivity = ReturnType<typeof createTaskPageConnectionActivity>;

export function taskIdFromBridgePageUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const isProductionTaskPage = url.protocol === "https:" && url.hostname === "www.pxxis.cn";
    const isLocalTaskPage = url.protocol === "http:"
      && developmentLoopbackHostnames.includes(url.hostname)
      && url.port === String(localWebPort);
    if (!isProductionTaskPage && !isLocalTaskPage) return null;
    const match = /^\/tasks\/([^/]+)\/?$/.exec(url.pathname);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function isTaskBridgePageUrl(value: string | undefined): value is string {
  return taskIdFromBridgePageUrl(value) !== null;
}

export function createTaskPageConnectionActivity(currentUrl: string, observedAt = new Date().toISOString()) {
  return {
    currentUrl,
    pageType: "TASK_TABLE" as const,
    routeKey: "UNKNOWN" as const,
    collectable: false,
    tabState: "VISIBLE" as const,
    observedAt
  };
}

export async function restoreTaskPageConnection(input: {
  taskPageUrl: string;
  timeoutMs: number;
  observedAt?: string;
  refreshContext: (timeoutMs: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  reportHeartbeat: (
    activity: TaskPageConnectionActivity,
    timeoutMs: number
  ) => Promise<{ ok: true } | { ok: false; error?: string }>;
  appendLog: (action: string, detail?: unknown) => Promise<void>;
}): Promise<TaskPageConnectionRecoveryResult> {
  const refreshed = await input.refreshContext(input.timeoutMs);
  if (!refreshed.ok) return refreshed;
  const heartbeat = await input.reportHeartbeat(
    createTaskPageConnectionActivity(input.taskPageUrl, input.observedAt),
    input.timeoutMs
  );
  if (!heartbeat.ok) {
    return { ok: false, error: heartbeat.error || "插件连接状态暂时无法同步到网页。" };
  }
  await input.appendLog("extension.connection_restored", { source: "task-page" });
  return { ok: true };
}

export async function restoreBoundTaskPageConnection(input: {
  paired: boolean;
  boundTaskId: string | undefined;
  sender: TaskPageBridgeSender;
  restore: (taskPageUrl: string) => Promise<TaskPageConnectionRecoveryResult>;
}): Promise<{ attempted: false } | { attempted: true; result: TaskPageConnectionRecoveryResult }> {
  const taskPageUrl = input.sender.tab?.url || input.sender.url;
  const taskPageTaskId = taskIdFromBridgePageUrl(taskPageUrl);
  if (!input.paired || !input.boundTaskId || !taskPageUrl || taskPageTaskId !== input.boundTaskId) {
    return { attempted: false };
  }
  return { attempted: true, result: await input.restore(taskPageUrl) };
}
