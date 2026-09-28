import { MESSAGE, STORAGE } from "./messages";
import type { CollectionRouteKey, CollectionSnapshotPayload } from "@douyin-local-life/shared";

type RuntimePageActivity = {
  currentUrl: string;
  pageType: CollectionSnapshotPayload["pageType"];
  routeKey?: CollectionRouteKey;
  collectable: boolean;
  tabState: "VISIBLE" | "HIDDEN" | "FROZEN" | "DISCARDED" | "UNKNOWN";
  observedAt: string;
  lastError?: string | null;
};

type RuntimePulseState = {
  loopId: string;
  tabId: number;
  taskId: string;
  identityKey: string;
  routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD";
  currentUrl: string;
  collectionRunId: string | null;
  startedAt: string;
  consecutiveFailures: number;
  successCount: number;
  lastSuccessAt: string | null;
  lastMetricCount: number;
  lastMetricKeys: string[];
  lastFailureReason: string | null;
  lastFailureEndpoint: string | null;
  rateLimitedUntil: string | null;
  uploadController: AbortController | null;
};

type RuntimePulsePayload = {
  loopId?: string;
  pulseStartedAt?: number;
  snapshot?: CollectionSnapshotPayload;
  error?: string;
};

type RuntimeDependencies = {
  appendLog: (action: string, detail?: unknown) => Promise<void>;
  bridgeBindingResponse: (operation: () => Promise<object>) => Promise<object>;
  cancelPairingConfirmation: () => Promise<object>;
  captureAndUploadSingleFlight: (payload: { tabId?: number; currentUrl?: string; routeOverride?: CollectionRouteKey }) => Promise<object>;
  clearPairing: () => Promise<object>;
  confirmPairing: (sender: chrome.runtime.MessageSender) => Promise<object>;
  getBridgeStatus: () => Promise<object>;
  getState: (tabId?: number) => Promise<object>;
  handlePageActivity: (activity: RuntimePageActivity, tabId?: number) => Promise<object>;
  isPopupSender: (sender: chrome.runtime.MessageSender) => boolean;
  pairTaskFromWeb: (payload: { apiBaseUrl?: string; code?: string }, sender: chrome.runtime.MessageSender) => Promise<object>;
  requestPairingConfirmation: (payload: { apiBaseUrl?: string; code?: string; label?: string }) => Promise<object>;
  selectTask: (payload: { collectionTaskId?: string }) => Promise<object>;
  startLivePulse: (payload: { tabId?: number; currentUrl?: string }) => Promise<object>;
  startLocalPromotionPulse: (payload: { tabId?: number; currentUrl?: string }) => Promise<object>;
  stopLivePulse: (reason: string, endpoint?: string, lastFailureReason?: string, expectedState?: RuntimePulseState, tabId?: unknown) => Promise<void>;
  stopLivePulseForTab: (tabId: number, reason: string) => Promise<void>;
  stopLivePulseForTabUpdate: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => Promise<void>;
  submitLivePulse: (payload: RuntimePulsePayload, tabId?: number, senderUrl?: string) => Promise<object>;
  submitLocalPromotionPulse: (payload: RuntimePulsePayload, tabId?: number, senderUrl?: string) => Promise<object>;
  syncCurrentTaskFromBridge: (sender: chrome.runtime.MessageSender) => Promise<object>;
  updateBinding: <T>(operation: () => Promise<T>) => Promise<T>;
  verifyBoundContext: () => Promise<object>;
};

export function registerServiceWorkerRuntime(deps: RuntimeDependencies) {
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
      .then(() => deps.appendLog("extension.installed"));
  });
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void deps.stopLivePulseForTab(tabId, "TAB_CLOSED");
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    void deps.stopLivePulseForTabUpdate(tabId, changeInfo);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === MESSAGE.PAGE_ACTIVITY) {
      void deps.handlePageActivity(message.payload as RuntimePageActivity, sender.tab?.id).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.CAPTURE_AND_UPLOAD) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "采集确认只能在插件 Popup 中完成。" });
        return false;
      }
      void deps.captureAndUploadSingleFlight(message.payload || {}).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.START_LIVE_PULSE) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "实时脉冲只能在插件 Popup 中开启。" });
        return false;
      }
      void deps.startLivePulse(message.payload || {}).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.START_LOCAL_PROMOTION_PULSE) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "实时脉冲只能在插件 Popup 中开启。" });
        return false;
      }
      void deps.startLocalPromotionPulse(message.payload || {}).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.STOP_LIVE_PULSE) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "实时脉冲只能在插件 Popup 中停止。" });
        return false;
      }
      void deps.stopLivePulse("USER_STOPPED", undefined, undefined, undefined, message.payload?.tabId).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === MESSAGE.STOP_LOCAL_PROMOTION_PULSE) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "实时脉冲只能在插件 Popup 中停止。" });
        return false;
      }
      void deps.stopLivePulse("USER_STOPPED", undefined, undefined, undefined, message.payload?.tabId).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === MESSAGE.SUBMIT_LIVE_PULSE) {
      void deps.submitLivePulse(message.payload || {}, sender.tab?.id, sender.tab?.url).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.SUBMIT_LOCAL_PROMOTION_PULSE) {
      void deps.submitLocalPromotionPulse(message.payload || {}, sender.tab?.id, sender.tab?.url).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.GET_STATE) {
      void deps.getState(Number.isInteger(message.payload?.tabId) ? Number(message.payload.tabId) : undefined).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.VERIFY_BOUND_CONTEXT) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "配对校验只能在插件 Popup 中完成。" });
        return false;
      }
      void deps.updateBinding(deps.verifyBoundContext).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.GET_BRIDGE_STATUS) {
      void deps.getBridgeStatus().then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.SYNC_CURRENT_TASK) {
      void deps.bridgeBindingResponse(() => deps.syncCurrentTaskFromBridge(sender)).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.PAIR_TASK_FROM_WEB) {
      void deps.bridgeBindingResponse(() => deps.pairTaskFromWeb(message.payload || {}, sender)).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.REQUEST_PAIRING_CONFIRMATION) {
      void deps.requestPairingConfirmation(message.payload || {}).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.CONFIRM_PAIRING) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "配对确认只能在插件 Popup 中完成。" });
        return false;
      }
      void deps.updateBinding(() => deps.confirmPairing(sender)).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.CANCEL_PAIRING) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "配对取消只能在插件 Popup 中完成。" });
        return false;
      }
      void deps.cancelPairingConfirmation().then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.SELECT_TASK) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "任务切换只能在插件 Popup 中完成。" });
        return false;
      }
      void deps.updateBinding(() => deps.selectTask(message.payload || {})).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.CLEAR_PAIRING) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "解除配对只能在插件 Popup 中完成。" });
        return false;
      }
      void deps.updateBinding(deps.clearPairing).then(sendResponse);
      return true;
    }
    if (message?.type === MESSAGE.CLEAR_SNAPSHOT) {
      if (!deps.isPopupSender(sender)) {
        sendResponse({ ok: false, error: "清空本地快照只能在插件 Popup 中完成。" });
        return false;
      }
      void chrome.storage.local.remove(STORAGE.LATEST_SNAPSHOT).then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });
}
