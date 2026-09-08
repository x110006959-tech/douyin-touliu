"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptureSummaryDTO, ExtensionStatusDTO } from "@douyin-local-life/shared";
import { apiFetch } from "@/lib/api";
import { shouldRecoverExtensionTask } from "@/lib/extension-connection";
import {
  announceExtensionBridge,
  ExtensionBridgeError,
  getExtensionBridgeStatus,
  onExtensionBridgeReady,
  readExtensionBridgeMarker,
  syncExtensionCurrentTask,
  type WebExtensionBridgeResponse
} from "@/lib/extension-bridge";

export type WebBridgeUiState = {
  state: "CHECKING" | "NOT_ACTIVE" | "BACKGROUND_UNRESPONSIVE" | "VERSION_OUTDATED" | "SYNC_FAILED" | "READY";
  response: WebExtensionBridgeResponse | null;
  message: string;
};

type UseExtensionTaskStatusOptions = {
  taskId: string;
  token: string | null;
  reloadTask: () => Promise<void>;
  onCaptureCompleted?: () => void;
};

type RefreshBridgeStatusOptions = {
  syncCurrentTask?: boolean;
  forceTaskSync?: boolean;
};

export function useExtensionTaskStatus({ taskId, token, reloadTask, onCaptureCompleted }: UseExtensionTaskStatusOptions) {
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatusDTO | null>(null);
  const [captureSummary, setCaptureSummary] = useState<CaptureSummaryDTO | null>(null);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [connectionStatusLoading, setConnectionStatusLoading] = useState(true);
  const [webBridge, setWebBridge] = useState<WebBridgeUiState>({
    state: "CHECKING",
    response: null,
    message: "正在检查插件与网页连接..."
  });
  const latestCaptureAt = useRef<string | null>(null);
  const hasObservedCaptureStatus = useRef(false);
  const bridgeStatusReadInFlight = useRef<Promise<WebExtensionBridgeResponse> | null>(null);
  const bridgeSyncInFlight = useRef<Promise<WebExtensionBridgeResponse> | null>(null);
  const lastSyncFailure = useRef<WebExtensionBridgeResponse | null>(null);
  const synchronizedSession = useRef<string | null>(null);
  const currentBridgeResponse = useRef<WebExtensionBridgeResponse | null>(null);
  const connectionRefreshGeneration = useRef(0);

  const readBridgeStatus = useCallback(async () => {
    if (bridgeStatusReadInFlight.current) return bridgeStatusReadInFlight.current;
    const pending = getExtensionBridgeStatus();
    bridgeStatusReadInFlight.current = pending;
    try {
      return await pending;
    } finally {
      if (bridgeStatusReadInFlight.current === pending) bridgeStatusReadInFlight.current = null;
    }
  }, []);

  const synchronizeCurrentTask = useCallback(async () => {
    if (bridgeSyncInFlight.current) return bridgeSyncInFlight.current;
    const pending = syncExtensionCurrentTask();
    bridgeSyncInFlight.current = pending;
    try {
      return await pending;
    } finally {
      if (bridgeSyncInFlight.current === pending) bridgeSyncInFlight.current = null;
    }
  }, []);

  const beginPairingAttempt = useCallback(() => {
    // A pairing attempt establishes a new credential/binding candidate. An
    // earlier automatic-sync failure must not overwrite its result or the
    // read-only recovery state when the bridge response is lost.
    connectionRefreshGeneration.current += 1;
    lastSyncFailure.current = null;
  }, []);

  const acceptPairingResponse = useCallback((response: WebExtensionBridgeResponse) => {
    connectionRefreshGeneration.current += 1;
    lastSyncFailure.current = null;
    synchronizedSession.current = response.connectionSessionId;
    currentBridgeResponse.current = response;
    setExtensionDetected(true);
    setWebBridge({ state: "READY", response, message: response.message });
  }, [taskId]);

  const refreshBridgeStatus = useCallback(async ({ syncCurrentTask = false, forceTaskSync = false }: RefreshBridgeStatusOptions = {}) => {
    const refreshGeneration = connectionRefreshGeneration.current;
    const marker = readExtensionBridgeMarker();
    if (!marker.active) {
      currentBridgeResponse.current = null;
      setExtensionDetected(false);
      setWebBridge({
        state: "NOT_ACTIVE",
        response: null,
        message: "插件未在当前网页激活。本地开发请重新加载扩展，再刷新本页。"
      });
      return;
    }
    setExtensionDetected(true);
    if (!marker.compatible) {
      currentBridgeResponse.current = null;
      setWebBridge({
        state: "VERSION_OUTDATED",
        response: null,
        message: `插件协议 ${marker.protocolVersion ?? "未知"} 与当前网页不兼容，请重新加载本地扩展。`
      });
      return;
    }
    try {
      const status = await readBridgeStatus();
      if (connectionRefreshGeneration.current !== refreshGeneration) return;
      let response = status;
      const shouldSynchronize = syncCurrentTask && shouldRecoverExtensionTask({
        taskId, status, synchronizedSession: synchronizedSession.current, force: forceTaskSync
      });
      if (shouldSynchronize) {
        response = await synchronizeCurrentTask();
        if (connectionRefreshGeneration.current !== refreshGeneration) return;
        if (response.ok) synchronizedSession.current = response.connectionSessionId;
        lastSyncFailure.current = response.ok ? null : response;
      } else if (status.ok && !status.paired) {
        lastSyncFailure.current = null;
        synchronizedSession.current = null;
      } else if (status.ok && lastSyncFailure.current) {
        response = lastSyncFailure.current;
      }
      setExtensionDetected(true);
      currentBridgeResponse.current = response;
      const protocolExpired = ["PROTOCOL_MISMATCH", "SERVICE_UPDATE_REQUIRED", "EXTENSION_UPDATE_REQUIRED"].includes(response.errorCode || "");
      setWebBridge({
        state: response.ok
          ? "READY"
          : ["BACKGROUND_UNRESPONSIVE", "EXTENSION_CONTEXT_INVALIDATED"].includes(response.errorCode || "")
            ? "BACKGROUND_UNRESPONSIVE"
            : protocolExpired
              ? "VERSION_OUTDATED"
              : "SYNC_FAILED",
        response,
        message: response.message
      });
    } catch (error) {
      if (connectionRefreshGeneration.current !== refreshGeneration) return;
      currentBridgeResponse.current = null;
      const code = error instanceof ExtensionBridgeError ? error.code : "BACKGROUND_UNRESPONSIVE";
      setWebBridge({
        state: code === "PROTOCOL_MISMATCH" ? "VERSION_OUTDATED" : code === "BRIDGE_NOT_ACTIVE" ? "NOT_ACTIVE" : "BACKGROUND_UNRESPONSIVE",
        response: null,
        message: error instanceof Error ? error.message : "插件后台未响应，请重新加载插件。"
      });
    }
  }, [readBridgeStatus, synchronizeCurrentTask, taskId]);

  const refreshCaptureStatus = useCallback(async () => {
    if (!token) return;
    const refreshGeneration = connectionRefreshGeneration.current;
    const sessionId = currentBridgeResponse.current?.connectionSessionId;
    const sessionQuery = sessionId ? `?connectionSessionId=${encodeURIComponent(sessionId)}` : "";
    const [nextStatus, nextSummary] = await Promise.all([
      apiFetch<ExtensionStatusDTO>(`/collection-tasks/${taskId}/extension-status${sessionQuery}`, token),
      apiFetch<CaptureSummaryDTO>(`/collection-tasks/${taskId}/capture-summary`, token)
    ]);
    if (connectionRefreshGeneration.current !== refreshGeneration) return;
    setExtensionStatus({ ...nextStatus, installedDetectedByWeb: extensionDetected });
    setCaptureSummary(nextSummary);
    const captureJustCompleted = hasObservedCaptureStatus.current
      && Boolean(nextSummary.latestCapturedAt)
      && latestCaptureAt.current !== nextSummary.latestCapturedAt;
    latestCaptureAt.current = nextSummary.latestCapturedAt;
    hasObservedCaptureStatus.current = true;
    if (captureJustCompleted) {
      await reloadTask();
      onCaptureCompleted?.();
    }
  }, [extensionDetected, onCaptureCompleted, reloadTask, taskId, token]);

  const refreshConnectionStatus = useCallback(async ({ syncCurrentTask = true, forceTaskSync = true }: RefreshBridgeStatusOptions = {}) => {
    const refreshGeneration = connectionRefreshGeneration.current;
    try {
      await refreshBridgeStatus({ syncCurrentTask, forceTaskSync });
      if (connectionRefreshGeneration.current !== refreshGeneration) return;
      await refreshCaptureStatus();
    } finally {
      if (connectionRefreshGeneration.current === refreshGeneration) setConnectionStatusLoading(false);
    }
  }, [refreshBridgeStatus, refreshCaptureStatus]);

  useEffect(() => {
    connectionRefreshGeneration.current += 1;
    synchronizedSession.current = null;
    currentBridgeResponse.current = null;
    lastSyncFailure.current = null;
    bridgeStatusReadInFlight.current = null;
    bridgeSyncInFlight.current = null;
    hasObservedCaptureStatus.current = false;
    setConnectionStatusLoading(true);
    setExtensionStatus(null);
    setWebBridge({ state: "CHECKING", response: null, message: "正在恢复当前任务连接..." });
    return () => { connectionRefreshGeneration.current += 1; };
  }, [taskId, token]);

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    const detectBridge = async () => {
      const marker = readExtensionBridgeMarker();
      if (!marker.active) {
        if (!stopped) {
          setExtensionDetected(false);
          setWebBridge({
            state: "NOT_ACTIVE",
            response: null,
            message: "插件未在当前网页激活。本地开发请重新加载扩展，再刷新本页。"
          });
        }
        return;
      }
      setExtensionDetected(true);
      if (!marker.compatible) {
        if (!stopped) {
          setWebBridge({
            state: "VERSION_OUTDATED",
            response: null,
            message: `插件协议 ${marker.protocolVersion ?? "未知"} 与当前网页不兼容，请重新加载本地扩展。`
          });
        }
        return;
      }
      await refreshBridgeStatus({ syncCurrentTask: true });
    };

    const removeReadyListener = onExtensionBridgeReady(() => void detectBridge());
    announceExtensionBridge();
    const timer = window.setTimeout(() => void detectBridge(), 300);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      removeReadyListener();
    };
  }, [refreshBridgeStatus, token]);

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let refreshing = false;
    const refresh = async (syncCurrentTask: boolean) => {
      if (refreshing) return;
      refreshing = true;
      try {
        await refreshConnectionStatus({ syncCurrentTask, forceTaskSync: false });
      } catch {
        if (!stopped && token) {
          setExtensionStatus((current) => current
            ? { ...current, state: "OFFLINE", message: "暂时无法读取插件状态，请检查本地 API。" }
            : null);
        }
      } finally {
        refreshing = false;
      }
    };
    void refresh(true);
    const timer = window.setInterval(() => void refresh(true), 5_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [refreshConnectionStatus, token]);

  return {
    acceptPairingResponse,
    beginPairingAttempt,
    captureSummary,
    connectionStatusLoading,
    extensionDetected,
    extensionStatus,
    refreshConnectionStatus,
    refreshCaptureStatus,
    webBridge
  };
}
