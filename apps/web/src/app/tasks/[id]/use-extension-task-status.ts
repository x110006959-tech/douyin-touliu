"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptureSummaryDTO, ExtensionStatusDTO } from "@douyin-local-life/shared";
import { apiFetch } from "@/lib/api";
import {
  announceExtensionBridge,
  ExtensionBridgeError,
  getExtensionBridgeStatus,
  onExtensionBridgeReady,
  readExtensionBridgeMarker,
  type WebExtensionBridgeResponse
} from "@/lib/extension-bridge";

export type WebBridgeUiState = {
  state: "CHECKING" | "NOT_ACTIVE" | "BACKGROUND_UNRESPONSIVE" | "VERSION_OUTDATED" | "READY";
  response: WebExtensionBridgeResponse | null;
  message: string;
};

type UseExtensionTaskStatusOptions = {
  taskId: string;
  token: string | null;
  reloadTask: () => Promise<void>;
  onCaptureCompleted?: () => void;
};

export function useExtensionTaskStatus({ taskId, token, reloadTask, onCaptureCompleted }: UseExtensionTaskStatusOptions) {
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatusDTO | null>(null);
  const [captureSummary, setCaptureSummary] = useState<CaptureSummaryDTO | null>(null);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [webBridge, setWebBridge] = useState<WebBridgeUiState>({
    state: "CHECKING",
    response: null,
    message: "正在检查插件与网页连接..."
  });
  const latestCaptureAt = useRef<string | null>(null);
  const hasObservedCaptureStatus = useRef(false);

  const refreshBridgeStatus = useCallback(async () => {
    const marker = readExtensionBridgeMarker();
    if (!marker.active) {
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
      setWebBridge({
        state: "VERSION_OUTDATED",
        response: null,
        message: `插件协议 ${marker.protocolVersion ?? "未知"} 与当前网页不兼容，请重新加载本地扩展。`
      });
      return;
    }
    try {
      const response = await getExtensionBridgeStatus();
      setExtensionDetected(true);
      setWebBridge({
        state: response.ok ? "READY" : response.errorCode === "BACKGROUND_UNRESPONSIVE" ? "BACKGROUND_UNRESPONSIVE" : "VERSION_OUTDATED",
        response,
        message: response.message
      });
    } catch (error) {
      const code = error instanceof ExtensionBridgeError ? error.code : "BACKGROUND_UNRESPONSIVE";
      setWebBridge({
        state: code === "PROTOCOL_MISMATCH" ? "VERSION_OUTDATED" : code === "BRIDGE_NOT_ACTIVE" ? "NOT_ACTIVE" : "BACKGROUND_UNRESPONSIVE",
        response: null,
        message: error instanceof Error ? error.message : "插件后台未响应，请重新加载插件。"
      });
    }
  }, []);

  const refreshCaptureStatus = useCallback(async () => {
    if (!token) return;
    const [nextStatus, nextSummary] = await Promise.all([
      apiFetch<ExtensionStatusDTO>(`/collection-tasks/${taskId}/extension-status`, token),
      apiFetch<CaptureSummaryDTO>(`/collection-tasks/${taskId}/capture-summary`, token)
    ]);
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

  const refreshConnectionStatus = useCallback(async () => {
    await Promise.all([refreshBridgeStatus(), refreshCaptureStatus()]);
  }, [refreshBridgeStatus, refreshCaptureStatus]);

  useEffect(() => {
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
      await refreshBridgeStatus();
    };

    const removeReadyListener = onExtensionBridgeReady(() => void detectBridge());
    announceExtensionBridge();
    const timer = window.setTimeout(() => void detectBridge(), 300);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      removeReadyListener();
    };
  }, [refreshBridgeStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => void refreshBridgeStatus(), 3_000);
    return () => window.clearInterval(timer);
  }, [refreshBridgeStatus]);

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        await refreshCaptureStatus();
      } catch {
        if (!stopped) {
          setExtensionStatus((current) => current
            ? { ...current, state: "OFFLINE", message: "暂时无法读取插件状态，请检查本地 API。" }
            : null);
        }
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [refreshCaptureStatus, token]);

  return {
    captureSummary,
    extensionDetected,
    extensionStatus,
    refreshConnectionStatus,
    refreshCaptureStatus,
    setExtensionDetected,
    setWebBridge,
    webBridge
  };
}
