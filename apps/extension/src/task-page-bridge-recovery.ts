import { developmentLoopbackHostnames, localWebPort } from "./build-target";
import type { ExtensionContext, ExtensionProject, ExtensionTask } from "./extension-context";

export type TaskPageBinding = {
  project: ExtensionProject;
  task: ExtensionTask;
};

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

export function resolveTaskPageBinding(context: ExtensionContext, taskId: string): TaskPageBinding | null {
  const project = context.account.projects.find((item) => item.tasks.some((task) => task.id === taskId));
  const task = project?.tasks.find((item) => item.id === taskId);
  return project && task ? { project, task } : null;
}

export function shouldBlockTaskSwitchForActivePulse(input: {
  boundTaskId: string | undefined;
  targetTaskId: string;
  hasActivePulse: boolean;
}) {
  return input.hasActivePulse && input.boundTaskId !== input.targetTaskId;
}

export function contextRefreshErrorCode(status: number): "PAIRING_REQUIRED" | "CONTEXT_REFRESH_FAILED" {
  return status === 401 || status === 403 ? "PAIRING_REQUIRED" : "CONTEXT_REFRESH_FAILED";
}
