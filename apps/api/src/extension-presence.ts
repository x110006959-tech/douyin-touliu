import type {
  ExtensionConnectionState,
  ExtensionHeartbeatPayload,
  ExtensionStatusDTO
} from "@douyin-local-life/shared";
import { extensionBridgeProtocolVersion } from "@douyin-local-life/shared";

const heartbeatFreshMs = 15_000;
const heartbeatRetentionMs = 5 * 60_000;
const maxPresenceRecords = 500;

type ExtensionPresence = ExtensionHeartbeatPayload & {
  credentialId: string;
  accountProfileId: string;
  receivedAt: number;
};

const presenceByCredential = new Map<string, ExtensionPresence>();

export function recordExtensionPresence(input: {
  credentialId: string;
  accountProfileId: string;
  heartbeat: ExtensionHeartbeatPayload;
}) {
  prunePresence();
  presenceByCredential.set(input.credentialId, {
    ...input.heartbeat,
    credentialId: input.credentialId,
    accountProfileId: input.accountProfileId,
    receivedAt: Date.now()
  });
  if (presenceByCredential.size > maxPresenceRecords) {
    const oldest = [...presenceByCredential.entries()].sort((left, right) => left[1].receivedAt - right[1].receivedAt);
    for (const [credentialId] of oldest.slice(0, presenceByCredential.size - maxPresenceRecords)) {
      presenceByCredential.delete(credentialId);
    }
  }
}

export function removeExtensionPresence(credentialId: string) {
  presenceByCredential.delete(credentialId);
}

export function getExtensionStatus(input: {
  collectionTaskId: string;
  taskTitle: string;
  accountProfileId: string;
  activeCredentialIds: string[];
  expectedVersion: string;
}): ExtensionStatusDTO {
  prunePresence();
  const activeIds = new Set(input.activeCredentialIds);
  const accountPresence = [...presenceByCredential.values()]
    .filter((item) => item.accountProfileId === input.accountProfileId && activeIds.has(item.credentialId))
    .sort((left, right) => right.receivedAt - left.receivedAt);
  const exact = accountPresence.find((item) => item.collectionTaskId === input.collectionTaskId);
  if (exact) return statusFromPresence(exact, input.taskTitle, input.expectedVersion);

  const currentOtherTask = accountPresence.find((item) => Date.now() - item.receivedAt <= heartbeatFreshMs);
  if (currentOtherTask) {
    return {
      ...emptyStatus("BOUND_OTHER_TASK", true, "插件已连接同一账号，但当前绑定的是其他采集任务，请在插件中切换任务。"),
      boundTaskId: currentOtherTask.collectionTaskId,
      extensionVersion: currentOtherTask.extensionVersion,
      bridgeProtocolVersion: currentOtherTask.bridgeProtocolVersion || null,
      buildFingerprint: currentOtherTask.buildFingerprint || null,
      currentUrl: currentOtherTask.currentUrl,
      pageType: currentOtherTask.pageType,
      routeKey: currentOtherTask.routeKey || null,
      collectable: currentOtherTask.collectable,
      tabState: currentOtherTask.tabState,
      lastHeartbeatAt: new Date(currentOtherTask.receivedAt).toISOString(),
      lastError: currentOtherTask.lastError || null
    };
  }

  if (input.activeCredentialIds.length) {
    return emptyStatus("PAIRED_NOT_CONNECTED", true, "服务器发现该账号存在有效历史授权；当前浏览器尚未完成本地凭证与当前任务心跳验证。");
  }
  return emptyStatus("UNPAIRED", false, "当前账号尚未配对采集插件，请生成任务配对码。");
}

export function clearExtensionPresenceForTests() {
  presenceByCredential.clear();
}

function statusFromPresence(presence: ExtensionPresence, taskTitle: string, expectedVersion: string): ExtensionStatusDTO {
  const ageMs = Date.now() - presence.receivedAt;
  let state: ExtensionConnectionState = "READY";
  let message = "插件连接正常，当前页面可以采集。";
  if (ageMs > heartbeatFreshMs) {
    state = "OFFLINE";
    message = "插件连接已中断，请打开目标页面或重新加载插件。";
  } else if (presence.bridgeProtocolVersion !== extensionBridgeProtocolVersion) {
    state = "VERSION_OUTDATED";
    message = "插件通信协议已过期，请在扩展管理页重新加载当前本地版本。";
  } else if (presence.extensionVersion !== expectedVersion) {
    state = "VERSION_OUTDATED";
    message = `插件版本 ${presence.extensionVersion} 与当前系统 ${expectedVersion} 不一致，请重新构建并加载插件。`;
  } else if (presence.lastError) {
    state = "ERROR";
    message = presence.lastError;
  } else if (!presence.collectable) {
    state = "PAGE_UNSUPPORTED";
    message = "当前页面不在采集白名单内，请打开任务列出的目标网页。";
  } else if (presence.tabState !== "VISIBLE") {
    state = "PAGE_INACTIVE";
    message = "目标页面当前不活跃，请切回该标签页后再采集。";
  } else if (!presence.routeKey || presence.routeKey === "UNKNOWN") {
    state = "ROUTE_UNVERIFIED";
    message = "当前页面可采集，但无法确认所处分栏；请在插件中为本次采集选择概览、商品或流量。";
  }

  return {
    state,
    installedDetectedByWeb: false,
    paired: true,
    boundTaskId: presence.collectionTaskId,
    boundTaskTitle: taskTitle,
    extensionVersion: presence.extensionVersion,
    bridgeProtocolVersion: presence.bridgeProtocolVersion || null,
    buildFingerprint: presence.buildFingerprint || null,
    currentUrl: presence.currentUrl,
    pageType: presence.pageType,
    routeKey: presence.routeKey || null,
    collectable: presence.collectable,
    tabState: presence.tabState,
    lastHeartbeatAt: new Date(presence.receivedAt).toISOString(),
    lastError: presence.lastError || null,
    message
  };
}

function emptyStatus(state: ExtensionConnectionState, paired: boolean, message: string): ExtensionStatusDTO {
  return {
    state,
    installedDetectedByWeb: false,
    paired,
    boundTaskId: null,
    boundTaskTitle: null,
    extensionVersion: null,
    bridgeProtocolVersion: null,
    buildFingerprint: null,
    currentUrl: null,
    pageType: null,
    routeKey: null,
    collectable: false,
    tabState: null,
    lastHeartbeatAt: null,
    lastError: null,
    message
  };
}

function prunePresence() {
  const cutoff = Date.now() - heartbeatRetentionMs;
  for (const [credentialId, presence] of presenceByCredential) {
    if (presence.receivedAt < cutoff) presenceByCredential.delete(credentialId);
  }
}
