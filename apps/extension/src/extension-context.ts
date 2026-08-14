export type ExtensionConfig = {
  apiBaseUrl?: string;
  collectionTaskId?: string;
  accountProfileId?: string;
  accountName?: string;
  projectId?: string;
  projectName?: string;
};

export type ExtensionTask = {
  id: string;
  pageTitle: string | null;
  routeSources: Array<{ routeKey: string; required: boolean }>;
};

export type ExtensionProject = {
  id: string;
  name: string;
  tasks: ExtensionTask[];
};

export type ExtensionContext = {
  account: {
    id: string;
    accountName: string;
    projects: ExtensionProject[];
  };
  collectionProtocolVersion: number;
  liveScreenInternalApi: {
    enabled: boolean;
    contractVersion: string;
    adapterVersion: string;
  };
};

export type ExtensionContextProtocolCheck =
  | { ok: true; version: number }
  | { ok: false; code: "SERVICE_UPDATE_REQUIRED" | "EXTENSION_UPDATE_REQUIRED" | "INVALID_CONTEXT" };

export function checkExtensionContextProtocol(
  value: unknown,
  supportedVersion: number
): ExtensionContextProtocolCheck {
  if (!isRecord(value)) return { ok: false, code: "INVALID_CONTEXT" };
  const version = value.collectionProtocolVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return Object.prototype.hasOwnProperty.call(value, "collectionProtocolVersion")
      ? { ok: false, code: "INVALID_CONTEXT" }
      : { ok: false, code: "SERVICE_UPDATE_REQUIRED" };
  }
  if (version < supportedVersion) return { ok: false, code: "SERVICE_UPDATE_REQUIRED" };
  if (version > supportedVersion) return { ok: false, code: "EXTENSION_UPDATE_REQUIRED" };
  return { ok: true, version };
}

export function parseExtensionContext(value: unknown): ExtensionContext | null {
  if (!isRecord(value) || !isRecord(value.account)) return null;
  const account = value.account;
  const id = optionalString(account.id);
  const accountName = optionalString(account.accountName);
  const collectionProtocolVersion = value.collectionProtocolVersion;
  const liveScreenInternalApi = value.liveScreenInternalApi;
  if (!id || !accountName || !Array.isArray(account.projects) || typeof collectionProtocolVersion !== "number" || !Number.isInteger(collectionProtocolVersion) || collectionProtocolVersion < 1 || !isRecord(liveScreenInternalApi) || typeof liveScreenInternalApi.enabled !== "boolean" || !optionalString(liveScreenInternalApi.contractVersion) || !optionalString(liveScreenInternalApi.adapterVersion)) return null;

  const projects: ExtensionProject[] = [];
  for (const item of account.projects) {
    if (!isRecord(item)) return null;
    const projectId = optionalString(item.id);
    const projectName = optionalString(item.name);
    if (!projectId || !projectName || !Array.isArray(item.tasks)) return null;

    const tasks: ExtensionTask[] = [];
    for (const taskItem of item.tasks) {
      if (!isRecord(taskItem)) return null;
      const taskId = optionalString(taskItem.id);
      const pageTitle = optionalNullableString(taskItem.pageTitle);
      if (!taskId || pageTitle === undefined || !Array.isArray(taskItem.routeSources)) return null;

      const routeSources: ExtensionTask["routeSources"] = [];
      for (const routeItem of taskItem.routeSources) {
        if (!isRecord(routeItem)) return null;
        const routeKey = optionalString(routeItem.routeKey);
        if (!routeKey || typeof routeItem.required !== "boolean") return null;
        routeSources.push({ routeKey, required: routeItem.required });
      }
      tasks.push({ id: taskId, pageTitle, routeSources });
    }
    projects.push({ id: projectId, name: projectName, tasks });
  }

  return {
    account: { id, accountName, projects },
    collectionProtocolVersion,
    liveScreenInternalApi: {
      enabled: liveScreenInternalApi.enabled,
      contractVersion: optionalString(liveScreenInternalApi.contractVersion)!,
      adapterVersion: optionalString(liveScreenInternalApi.adapterVersion)!
    }
  };
}

export function refreshConfigFromContext(config: ExtensionConfig, context: ExtensionContext): ExtensionConfig | null {
  const collectionTaskId = config.collectionTaskId?.trim();
  if (!collectionTaskId) return null;
  const project = context.account.projects.find((item) => item.tasks.some((task) => task.id === collectionTaskId));
  if (!project) return null;

  return {
    ...config,
    accountProfileId: context.account.id,
    accountName: context.account.accountName,
    collectionTaskId,
    projectId: project.id,
    projectName: project.name
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}
