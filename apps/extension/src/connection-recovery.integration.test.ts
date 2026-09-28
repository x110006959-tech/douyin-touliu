import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extensionBridgeProtocolVersion, extensionCollectionProtocolVersion } from "@douyin-local-life/shared";
import { MESSAGE, STORAGE } from "./messages";
import { sanitizeBridgeResponse } from "./bridge-protocol";

type RuntimeListener = (message: { type: string; payload?: object }, sender: chrome.runtime.MessageSender, respond: (value: Record<string, unknown>) => void) => boolean;
let listener: RuntimeListener;
let installed: () => void;
let storage: Record<string, unknown>;
let contextStatus: number;
let heartbeatStatus: number;
let requests: string[];
let heartbeats: Record<string, unknown>[];
const taskUrl = "https://www.pxxis.cn/tasks/task-1";
const context = {
  account: { id: "account-1", accountName: "账号一", projects: [{ id: "project-1", name: "项目一", tasks: [
    { id: "task-1", pageTitle: "任务一", routeSources: [] }, { id: "task-2", pageTitle: "任务二", routeSources: [] }
  ] }] },
  collectionProtocolVersion: extensionCollectionProtocolVersion,
  liveScreenInternalApi: { enabled: false, contractVersion: "test", adapterVersion: "test" }
};

async function boot() {
  vi.resetModules();
  await import("./service-worker");
}

function send(type: string, payload?: object, url = taskUrl) {
  return new Promise<Record<string, unknown>>((resolve) => {
    listener({ type, payload }, { id: "test-extension", tab: { id: 1, url } as chrome.tabs.Tab, url }, resolve);
  });
}

function sendPopup(type: string, payload?: object) {
  return new Promise<Record<string, unknown>>((resolve) => {
    listener(
      { type, payload },
      { id: "test-extension", tab: { id: 1, url: taskUrl } as chrome.tabs.Tab, url: "chrome-extension://test-extension/popup.html" },
      resolve
    );
  });
}

function pair() {
  return send(MESSAGE.PAIR_TASK_FROM_WEB, { code: "123456", apiBaseUrl: "https://api.pxxis.cn" });
}

beforeEach(async () => {
  storage = {};
  contextStatus = 200;
  heartbeatStatus = 200;
  requests = [];
  heartbeats = [];
  vi.stubGlobal("__PXXIS_EXTENSION_BUILD__", "test-build");
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-extension", getManifest: () => ({ version: "0.2.6" }),
      onInstalled: { addListener: (fn: () => void) => { installed = fn; } },
      onMessage: { addListener: (fn: RuntimeListener) => { listener = fn; } }
    },
    tabs: { onRemoved: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() }, query: async () => [] },
    storage: { local: {
      setAccessLevel: vi.fn().mockResolvedValue(undefined),
      get: async (keys: string[]) => Object.fromEntries(keys.map((key) => [key, structuredClone(storage[key])])),
      set: async (values: Record<string, unknown>) => { Object.assign(storage, structuredClone(values)); },
      remove: async (keys: string | string[]) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; }
    } }
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    requests.push(path);
    let data: unknown;
    let status = 200;
    if (path === "/version") data = { extensionVersion: "0.2.6", collectionProtocolVersion: extensionCollectionProtocolVersion };
    else if (path.endsWith("/preview")) data = { task: { id: "task-1" }, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    else if (path.endsWith("/exchange")) data = { token: "test-credential", suggestedTask: { id: "task-1" } };
    else if (path === "/extension/context") { data = context; status = contextStatus; }
    else if (path === "/extension/heartbeat") {
      heartbeats.push(JSON.parse(String(init?.body)));
      status = heartbeatStatus;
      data = { receivedAt: new Date().toISOString() };
    } else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
  }));
  await boot();
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("worker pairing and recovery lifecycle", () => {
  it.each(["context", "heartbeat"])("keeps the exchanged credential through a failed %s and worker reload", async (failure) => {
    if (failure === "context") contextStatus = 503;
    else heartbeatStatus = 503;
    expect(await pair()).toMatchObject({ ok: false, paired: true });
    expect(storage[STORAGE.TOKEN]).toBe("test-credential");
    const before = await send(MESSAGE.GET_BRIDGE_STATUS);
    await boot();
    installed();
    contextStatus = 200;
    heartbeatStatus = 200;
    const recovered = await send(MESSAGE.SYNC_CURRENT_TASK);
    expect(recovered).toMatchObject({ ok: true, paired: true, boundTaskId: "task-1" });
    expect(recovered.connectionSessionId).not.toBe(before.connectionSessionId);
    expect(requests.filter((path) => path.endsWith("/exchange"))).toHaveLength(1);
    expect(heartbeats.at(-1)).toMatchObject({ connectionSessionId: recovered.connectionSessionId, pageType: "TASK_TABLE", collectable: false, bridgeProtocolVersion: extensionBridgeProtocolVersion });
    const publicResponse = sanitizeBridgeResponse({ requestId: "recovered", runtimeResult: recovered, extensionVersion: "0.2.6", buildFingerprint: "test-build" });
    expect(JSON.stringify(publicResponse)).not.toMatch(/test-credential|account-1|project-1/);
  });

  it("keeps status reads local and refuses to turn leftover config into pairing", async () => {
    storage[STORAGE.CONFIG] = { collectionTaskId: "task-1", accountProfileId: "account-1" };
    expect(await send(MESSAGE.GET_BRIDGE_STATUS)).toMatchObject({ ok: true, paired: false, boundTaskId: null });
    expect(await send(MESSAGE.SYNC_CURRENT_TASK)).toMatchObject({ ok: false, errorCode: "PAIRING_REQUIRED" });
    expect(requests).toEqual([]);
  });

  it("recovers same-account task binding without exchanging another code", async () => {
    await pair();
    storage[STORAGE.PAGE_ACTIVITY] = { currentUrl: "https://eos.douyin.com/dp/liveScreen", pageType: "LIVE_DATA_SCREEN", collectable: true };
    expect(await send(MESSAGE.SYNC_CURRENT_TASK, undefined, "https://www.pxxis.cn/tasks/task-2")).toMatchObject({ ok: true, boundTaskId: "task-2" });
    expect(storage[STORAGE.PAGE_ACTIVITY]).toBeUndefined();
    expect(await send(MESSAGE.SYNC_CURRENT_TASK, undefined, "https://www.pxxis.cn/tasks/other-account")).toMatchObject({ ok: false, errorCode: "TASK_ACCOUNT_MISMATCH", boundTaskId: "task-2" });
    expect(requests.filter((path) => path.endsWith("/exchange"))).toHaveLength(1);
  });

  it("keeps task-scoped state when selecting the already-bound task", async () => {
    await pair();
    storage[STORAGE.LATEST_SNAPSHOT] = { marker: "keep-snapshot" };
    storage[STORAGE.ROUTE_UPLOAD_STATE] = { task1: { fingerprint: "abc", lastUploadAt: 1, consecutiveFailures: 0 } };
    const requestsBefore = requests.length;
    const result = await sendPopup(MESSAGE.SELECT_TASK, { collectionTaskId: "task-1" });
    expect(result).toMatchObject({ ok: true, config: { collectionTaskId: "task-1" } });
    expect(storage[STORAGE.LATEST_SNAPSHOT]).toEqual({ marker: "keep-snapshot" });
    expect(storage[STORAGE.ROUTE_UPLOAD_STATE]).toEqual({ task1: { fingerprint: "abc", lastUploadAt: 1, consecutiveFailures: 0 } });
    expect(requests).toHaveLength(requestsBefore);
  });

  it("removes stale account and page state when unpairing", async () => {
    await pair();
    storage[STORAGE.LATEST_SNAPSHOT] = { marker: "old-snapshot" };
    storage[STORAGE.ROUTE_UPLOAD_STATE] = { task1: { fingerprint: "abc", lastUploadAt: 1, consecutiveFailures: 0 } };
    storage[STORAGE.PAGE_ACTIVITY] = { currentUrl: "https://eos.douyin.com/dp/liveScreen", pageType: "LIVE_DATA_SCREEN", collectable: true };
    storage[STORAGE.LOGS] = [{ action: "live_pulse.started", detail: {}, createdAt: new Date().toISOString() }];
    const result = await sendPopup(MESSAGE.CLEAR_PAIRING);
    expect(result).toMatchObject({ ok: true });
    expect(storage[STORAGE.TOKEN]).toBeUndefined();
    expect(storage[STORAGE.CONFIG]).toBeUndefined();
    expect(storage[STORAGE.CONTEXT]).toBeUndefined();
    expect(storage[STORAGE.LATEST_SNAPSHOT]).toBeUndefined();
    expect(storage[STORAGE.ROUTE_UPLOAD_STATE]).toBeUndefined();
    expect(storage[STORAGE.PAGE_ACTIVITY]).toBeUndefined();
    expect(storage[STORAGE.LOGS]).toEqual([expect.objectContaining({ action: "extension.unpaired" })]);
    expect(await send(MESSAGE.GET_BRIDGE_STATUS)).toMatchObject({ ok: true, paired: false, boundTaskId: null });
  });

  it("clears stale page activity and logs when exchanging a fresh pairing", async () => {
    await pair();
    storage[STORAGE.PAGE_ACTIVITY] = { currentUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2", pageType: "LOCAL_PROMOTION_DASHBOARD", collectable: true };
    storage[STORAGE.LOGS] = [{ action: "live_pulse.failure", detail: {}, createdAt: new Date().toISOString() }];
    storage[STORAGE.LIVE_PULSE_LAST_OUTCOME] = { stale: true };
    storage[STORAGE.LIVE_PULSE_ACTIVITY] = { stale: true };
    storage[STORAGE.LIVE_PULSE_STATE] = { stale: true };
    expect(await pair()).toMatchObject({ ok: true, paired: true, boundTaskId: "task-1" });
    expect(storage[STORAGE.PAGE_ACTIVITY]).toBeUndefined();
    expect(storage[STORAGE.LOGS]).toEqual([expect.objectContaining({ action: "extension.paired" })]);
    expect(storage[STORAGE.LIVE_PULSE_LAST_OUTCOME]).toBeUndefined();
    expect(storage[STORAGE.LIVE_PULSE_ACTIVITY]).toBeUndefined();
    expect(storage[STORAGE.LIVE_PULSE_STATE]).toBeUndefined();
  });

  it("does not reconnect revoked credentials or a page outside the exact task route", async () => {
    await pair();
    contextStatus = 401;
    const count = heartbeats.length;
    expect(await send(MESSAGE.SYNC_CURRENT_TASK)).toMatchObject({ ok: false, paired: true, errorCode: "PAIRING_REQUIRED" });
    expect(await send(MESSAGE.SYNC_CURRENT_TASK, undefined, "https://attacker.example/tasks/task-1")).toMatchObject({ ok: false, errorCode: "TASK_PAGE_REQUIRED" });
    expect(heartbeats).toHaveLength(count);
  });
});
