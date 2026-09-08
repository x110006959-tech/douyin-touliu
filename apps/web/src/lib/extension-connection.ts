import { extensionBridgeProtocolVersion, type ExtensionStatusDTO } from "@douyin-local-life/shared";
import type { WebExtensionBridgeResponse } from "./extension-bridge";

type BridgeState = { state: string; response: WebExtensionBridgeResponse | null };
const connectedStates = new Set(["READY", "PAGE_UNSUPPORTED", "PAGE_INACTIVE", "ROUTE_UNVERIFIED"]);

export function isCurrentExtensionConnected(taskId: string, bridge: BridgeState, server: ExtensionStatusDTO | null, now = Date.now()) {
  const local = bridge.response;
  const age = now - Date.parse(server?.lastHeartbeatAt || "");
  return Boolean(bridge.state === "READY" && local?.ok && local.paired && !local.pendingConfirmation
    && local.boundTaskId === taskId && local.connectionSessionId
    && server?.paired && server.boundTaskId === taskId
    && server.connectionSessionId === local.connectionSessionId
    && server.extensionVersion === local.extensionVersion
    && server.bridgeProtocolVersion === extensionBridgeProtocolVersion
    && local.protocolVersion === extensionBridgeProtocolVersion
    && local.buildFingerprint && server.buildFingerprint === local.buildFingerprint
    && connectedStates.has(server.state) && age >= 0 && age <= 15_000);
}

export function shouldRecoverExtensionTask(input: {
  taskId: string;
  status: WebExtensionBridgeResponse;
  synchronizedSession: string | null;
  force: boolean;
}) {
  const { status, taskId, synchronizedSession, force } = input;
  if (!status.ok || !status.paired || status.pendingConfirmation || !status.connectionSessionId) return false;
  // Renew only this task after entry; another open task page must not keep
  // stealing a binding the user subsequently switched in the popup.
  return force || synchronizedSession !== status.connectionSessionId || status.boundTaskId === taskId;
}
