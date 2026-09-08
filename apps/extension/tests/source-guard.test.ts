import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";

const root = resolve(import.meta.dirname, "..");
const guardedFiles = [
  "src/content.ts",
  "src/service-worker.ts",
  "src/popup.ts",
  "src/sidepanel.ts",
  "src/web-bridge.ts",
  "release/local-unpacked-test-extension/content.js",
  "release/local-unpacked-test-extension/service-worker.js",
  "release/local-unpacked-test-extension/popup.js",
  "release/local-unpacked-test-extension/sidepanel.js",
  "release/local-unpacked-test-extension/web-bridge.js"
];

describe("extension source safety guard", () => {
  it("does not contain automatic platform operation calls", () => {
    const forbiddenPatterns = [
      /\.click\s*\(/,
      /\.submit\s*\(/,
      /requestSubmit\s*\(/,
      /chrome\.cookies/,
      /chrome\.history/,
      /chrome\.bookmarks/,
      /chrome\.downloads/,
      /chrome\.tabs\.(create|update|remove)/,
      /window\.location\s*=/,
      /\bprompt\s*\(/,
      /chrome\.storage\.session/
    ];

    for (const file of guardedFiles) {
      const source = readFileSync(resolve(root, file), "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(source, `${file} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps production permissions on exact trusted platform domains and local testing isolated", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8"));
    expect(manifest.permissions).toEqual(["activeTab", "storage", "sidePanel"]);
    expect(manifest.host_permissions).toEqual([
      "https://eos.douyin.com/*",
      "https://localads.chengzijianzhan.cn/*",
      "https://api.pxxis.cn/*",
      "https://www.pxxis.cn/*"
    ]);
    expect(manifest.content_scripts[0].matches).toEqual([
      "https://eos.douyin.com/*",
      "https://localads.chengzijianzhan.cn/*"
    ]);
    expect(manifest.host_permissions).not.toContain("http://127.0.0.1/*");
    expect(manifest.host_permissions).not.toContain("http://localhost/*");
    expect(manifest.host_permissions).not.toContain("https://*.chengzijianzhan.cn/*");
    expect(manifest.host_permissions.some((entry: string) => entry.includes("*.") || entry === "*://*/*")).toBe(false);
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    const content = readFileSync(resolve(root, "src/content.ts"), "utf8");
    expect(worker).not.toContain("START_PATROL");
    expect(worker).not.toContain("STOP_PATROL");
    expect(content).not.toContain("patrol.enabled");
    expect(content).not.toContain("chrome.storage.local");
    expect(worker).toContain('accessLevel: "TRUSTED_CONTEXTS"');
    expect(worker).not.toMatch(/chrome\.tabs\.(create|update)/);
  });

  it("keeps the popup focused on API continuous collection only", () => {
    const popup = readFileSync(resolve(root, "src/popup.ts"), "utf8");
    const content = readFileSync(resolve(root, "src/content.ts"), "utf8");
    const html = readFileSync(resolve(root, "popup.html"), "utf8");
    expect(popup).not.toContain("CAPTURE_AND_UPLOAD");
    expect(popup).not.toContain("采集并上传数据总览");
    expect(popup).not.toContain("renderRouteOverrideOptions");
    expect(popup).toContain("VERIFY_BOUND_CONTEXT");
    expect(popup).toContain("START_LIVE_PULSE");
    expect(popup).toContain("STOP_LIVE_PULSE");
    expect(popup).not.toContain('window.addEventListener("pagehide"');
    expect(content).toContain('document.addEventListener("visibilitychange"');
    expect(content).toContain('window.addEventListener("pagehide"');
    expect(popup).toContain("不创建快照");
    expect(popup).not.toContain("本轮路线已完成");
    expect(popup).not.toMatch(/\bprompt\s*\(/);
    expect(html).toContain("输入六位配对码");
    expect(html).not.toContain("采集并上传数据总览");
    expect(html).toContain("确认插件配对");
    expect(popup).toContain("CONFIRM_PAIRING");
    expect(html).not.toContain('id="routeOverride"');
    expect(html).toContain('id="livePulseBtn"');
    expect(html).toContain("开始 API 持续采集");
    expect(html).not.toContain("保存当前数据为正式快照");
    expect(html).not.toContain("30 秒");
    expect(html).not.toContain('id="routeChoices"');
    expect(html).not.toContain('id="routeMaterial"');
    expect(html).not.toContain('id="routeTrend"');
    expect(html).toContain("高级设置");
  });

  it("stops live pulses when the user leaves or closes the live-screen tab", () => {
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    const content = readFileSync(resolve(root, "src/content.ts"), "utf8");
    expect(worker).toContain("chrome.tabs.onRemoved");
    expect(worker).toContain("chrome.tabs.onUpdated");
    expect(worker).toContain("PAGE_NAVIGATED");
    expect(worker).toContain("state.uploadController?.abort()");
    expect(worker).not.toContain("function scheduleLivePulse");
    expect(content).toContain('window.addEventListener("pagehide"');
    expect(content).toContain("BEGIN_LIVE_PULSE_LOOP");
    expect(content).toContain("SUBMIT_LIVE_PULSE");
  });

  it("keeps formal snapshots and DOM pulses connected to the server feature state", () => {
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    const content = readFileSync(resolve(root, "src/content.ts"), "utf8");
    expect(worker).toContain("liveScreenInternalApiEnabled: refreshedContext.context.liveScreenInternalApi.enabled");
    expect(worker).toContain("MESSAGE.BEGIN_LIVE_PULSE_LOOP");
    expect(worker).not.toContain("服务端尚未开启直播大屏内部 API 采集。");
    expect(content).toContain("liveScreenCapturePlan");
  });

  it("allows only a trusted task-page bridge to exchange a pairing code directly", () => {
    const bridge = readFileSync(resolve(root, "src/web-bridge.ts"), "utf8");
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    expect(bridge).toContain("PAIR_TASK_FROM_WEB");
    expect(bridge).not.toContain("CONFIRM_PAIRING");
    expect(bridge).not.toContain("label");
    expect(worker).toContain("/extension/pairing-codes/preview");
    expect(worker).toContain("taskIdFromBridgePageUrl");
    expect(worker).toContain("const taskPageUrl = sender.tab?.url;");
    expect(worker).not.toContain("payload.taskPageUrl || sender.url");
    expect(worker).toContain("TASK_PAGE_MISMATCH");
    expect(worker).toContain("createTaskPageConnectionActivity(taskPageUrl)");
    expect(worker).toContain("HEARTBEAT_FAILED");
    expect(worker).toContain("isPopupSender");
    expect(worker).toContain("/extension/pairing-codes/exchange");
    expect(worker).toContain("任务切换只能在插件 Popup 中完成。");
    expect(worker).toContain("解除配对只能在插件 Popup 中完成。");
    expect(worker).toContain("采集确认只能在插件 Popup 中完成。");
    expect(worker).toContain("if (!isPopupSender(sender))");
    const directPairingSource = worker.slice(
      worker.indexOf("async function pairTaskFromWeb"),
      worker.indexOf("async function confirmPairing")
    );
    expect(directPairingSource).not.toContain("PENDING_PAIRING_CONFIRMATION");
    expect(directPairingSource).toContain('payload: { apiBaseUrl?: string; code?: string }');
    expect(directPairingSource).toContain('label: "网页任务一键配对"');
    expect(directPairingSource).toContain("const pulseConflict = await pairingPulseConflict(taskId)");
    expect(directPairingSource.indexOf("pairingPulseConflict(taskId)")).toBeLessThan(
      directPairingSource.indexOf("exchangePairingConfirmation(exchangeInput, taskId, taskPageUrl)")
    );
    expect(directPairingSource).toContain("exchangePairingConfirmation(exchangeInput, taskId, taskPageUrl)");
    expect(worker).toContain("reportExtensionHeartbeatForCredentials");
    const exchangeSource = worker.slice(
      worker.indexOf("async function exchangePairingConfirmation"),
      worker.indexOf("async function cancelPairingConfirmation")
    );
    const heartbeatIndex = exchangeSource.indexOf("const heartbeat = taskPageUrl");
    const rejectedHeartbeatIndex = exchangeSource.indexOf("if (!heartbeat.ok)");
    const credentialCommitIndex = exchangeSource.indexOf("[STORAGE.TOKEN]: token");
    const contextRequestIndex = exchangeSource.indexOf("const contextResponse = await fetchWithTimeout");
    const connectionSuccessIndex = exchangeSource.indexOf("return { ok: true, paired: true, config, context }");
    expect(heartbeatIndex).toBeGreaterThanOrEqual(0);
    expect(rejectedHeartbeatIndex).toBeGreaterThan(heartbeatIndex);
    expect(credentialCommitIndex).toBeGreaterThanOrEqual(0);
    expect(credentialCommitIndex).toBeLessThan(contextRequestIndex);
    expect(connectionSuccessIndex).toBeGreaterThan(rejectedHeartbeatIndex);
  });

  it("rejects auto-detected snapshot routes that are no longer enabled for the current task", () => {
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    const captureSource = worker.slice(
      worker.indexOf("async function captureAndUpload("),
      worker.indexOf("async function startLivePulse")
    );

    expect(captureSource).toContain("const allowedRoutes = await currentTaskRouteKeys()");
    expect(captureSource).toContain("if (!allowedRoutes.includes(snapshotRouteKey))");
    expect(captureSource).toContain("当前任务已取消");
  });

  it("rejects local-promotion DOM snapshots even if a stale popup sends the old message", () => {
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    const captureSource = worker.slice(
      worker.indexOf("async function captureAndUpload("),
      worker.indexOf("async function startLivePulse")
    );

    expect(captureSource).toContain("isExactLocalPromotionInternalApiPage");
    expect(captureSource).toContain("巨量本地推仅支持 API 持续采集，不再创建 DOM 快照");
  });

  it("uses authenticated JSON postMessage envelopes across page worlds", () => {
    const bridge = readFileSync(resolve(root, "src/web-bridge.ts"), "utf8");
    expect(bridge).toContain('window.addEventListener("message"');
    expect(bridge).toContain("parseBridgeWindowMessage");
    expect(bridge).toContain("serializeBridgeWindowMessage");
    expect(bridge).toContain("event.source !== window || event.origin !== window.location.origin");
    expect(bridge).toContain("window.postMessage");
    expect(bridge).not.toContain("new CustomEvent");
  });

  it("can still tell the task page to refresh after an extension reload invalidates runtime", () => {
    const bridge = readFileSync(resolve(root, "src/web-bridge.ts"), "utf8");
    expect(bridge).toContain("const extensionVersion = chrome.runtime.getManifest().version");
    expect(bridge).toContain("EXTENSION_CONTEXT_INVALIDATED");
    expect(bridge).toContain("isExtensionContextInvalidated(error)");
    expect(bridge).not.toContain("catch {\n    dispatchResponse(sanitizeBridgeResponse({\n      requestId: request.requestId,\n      extensionVersion: chrome.runtime.getManifest().version");
  });

  it("keeps one-shot manual route confirmation scoped to the current task", () => {
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    const popup = readFileSync(resolve(root, "src/popup.ts"), "utf8");
    expect(worker).toContain("currentTaskRouteKeys");
    expect(worker).not.toContain("[\"LIVE_DATA_SCREEN\", \"LIVE_PRODUCT_TAB\", \"LIVE_TRAFFIC_TAB\"]");
    expect(popup).toContain('routeKey === "LOCAL_PROMOTION_DASHBOARD"');
    expect(popup).not.toContain('"MATERIAL_LIBRARY"');
    expect(popup).not.toContain('"HOURLY_TREND"');
  });

  it("coalesces only matching user-confirmed capture requests", () => {
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    expect(worker).toContain("SingleFlight");
    expect(worker).toContain("captureSingleFlight.run");
    expect(worker).not.toContain("patrolSingleFlight.run");
    expect(worker).toContain("MESSAGE.GET_PAGE_CONTEXT");
    expect(worker).toContain("taskId");
    expect(worker).toContain("tabId");
    expect(worker).toContain("routeKey");
    expect(worker).toContain("collectionRunId");
  });

  it("keeps status polling local and synchronizes only exact trusted task pages", () => {
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    const recovery = readFileSync(resolve(root, "src/task-page-bridge-recovery.ts"), "utf8");
    const statusStart = worker.indexOf("async function getBridgeStatus");
    const syncStart = worker.indexOf("async function syncCurrentTaskFromBridge");
    const statusSource = worker.slice(statusStart, syncStart);
    expect(statusSource).not.toContain("fetchWithTimeout");
    expect(worker).toContain("taskIdFromBridgePageUrl(taskPageUrl)");
    expect(worker).toContain("resolveTaskPageBinding(context, taskId)");
    expect(worker).not.toContain('stopLivePulse("TASK_CHANGED")');
    expect(recovery).toContain("isProductionTaskPage");
    expect(recovery).toContain("isLocalTaskPage");
    expect(recovery).toContain("pageType: \"TASK_TABLE\"");
    expect(recovery).toContain("collectable: false");
    expect(worker).toContain("bridgeRecoveryRequestTimeoutMs");
    expect(worker).toContain("fetchWithTimeout");
  });

  it("removes all production network interception code", () => {
    expect(existsSync(resolve(root, "src/injected.ts"))).toBe(false);
    expect(existsSync(resolve(root, "dist/injected.js"))).toBe(false);
    expect(existsSync(resolve(root, "release/local-unpacked-test-extension/injected.js"))).toBe(false);
    const manifest = JSON.parse(readFileSync(resolve(root, "release/local-unpacked-test-extension/manifest.json"), "utf8"));
    expect(manifest.web_accessible_resources).toBeUndefined();
    for (const file of guardedFiles) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).not.toMatch(/window\.fetch\s*=/);
      expect(source).not.toContain("XMLHttpRequest");
      expect(source).not.toContain("PAGE_NETWORK_CAPTURED");
    }
  });

  it("keeps the tracked unpacked release on the current manifest version", () => {
    const rootPackage = JSON.parse(readFileSync(resolve(root, "../../package.json"), "utf8"));
    const releaseManifest = JSON.parse(readFileSync(resolve(root, "release/local-unpacked-test-extension/manifest.json"), "utf8"));
    const releaseMetadata = JSON.parse(readFileSync(resolve(root, "release/local-unpacked-test-extension/build-metadata.json"), "utf8"));
    expect(releaseManifest.version).toBe(rootPackage.version);
    expect(releaseMetadata.schemaVersion).toBe(rootPackage.pxxisMetadata.schemaVersion);
    expect(releaseManifest.name).toContain("本地测试");
    expect(releaseManifest.description).toContain("本地测试");
    expect(releaseManifest.host_permissions).toContain("http://localhost/*");
    expect(releaseManifest.host_permissions).toContain("http://127.0.0.1/*");
    for (const iconName of Object.values(releaseManifest.icons) as string[]) {
      const localTestIcon = readFileSync(resolve(root, "public/local-test-icons", iconName.replace("icons/", "")));
      expect(readFileSync(resolve(root, "release/local-unpacked-test-extension", iconName))).toEqual(localTestIcon);
      expect(localTestIcon).not.toEqual(readFileSync(resolve(root, "public", iconName)));
    }
  });

  it("fingerprints every authored extension and shared source module", () => {
    const buildScript = readFileSync(resolve(root, "scripts/build.mjs"), "utf8");
    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    expect(buildScript).toContain('sourceFiles("apps/extension/src")');
    expect(buildScript).toContain('sourceFiles("packages/shared/src")');
    expect(buildScript).toContain('"apps/extension/scripts/build.mjs"');
    expect(buildScript).toContain('name: "workspace-shared-source"');
    expect(buildScript).toContain('"@douyin-local-life/shared", "packages/shared/src/index.ts"');
    expect(packageJson.scripts.build).not.toContain("--dist-only");
    expect(packageJson.scripts["build:local"]).not.toContain("--dist-only");
  });

  it("bundles the current shared local-promotion adapter instead of stale dist output", () => {
    const sharedSource = readFileSync(resolve(root, "../../packages/shared/src/local-promotion-internal-api.ts"), "utf8");
    const adapterVersion = sharedSource.match(/localPromotionInternalApiAdapterVersion\s*=\s*"([^"]+)"/)?.[1];
    expect(adapterVersion).toBeTruthy();
    const releaseWorker = readFileSync(resolve(root, "release/local-unpacked-test-extension/service-worker.js"), "utf8");
    expect(releaseWorker).toContain(`localPromotionInternalApiAdapterVersion = "${adapterVersion}"`);
  });

  it("validates the current-version ZIP when that release artifact is present", () => {
    const rootPackage = JSON.parse(readFileSync(resolve(root, "../../package.json"), "utf8"));
    const archives = readdirSync(resolve(root, "release")).filter((name) => new RegExp(`^collector-v${rootPackage.version}-[a-f0-9]{7,12}\\.zip$`, "i").test(name));
    if (!archives.length) return;
    expect(archives).toHaveLength(1);
    expect(archives[0]).toMatch(new RegExp(`^collector-v${rootPackage.version}-[a-f0-9]{7,12}\\.zip$`));
    const files = unzipSync(readFileSync(resolve(root, "release", archives[0]!)));
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
    const metadata = JSON.parse(strFromU8(files["build-metadata.json"]!));
    expect(manifest.version).toBe(rootPackage.version);
    expect(manifest.permissions).toEqual(["activeTab", "storage", "sidePanel"]);
    expect(manifest.host_permissions).toEqual([
      "https://eos.douyin.com/*",
      "https://localads.chengzijianzhan.cn/*",
      "https://api.pxxis.cn/*",
      "https://www.pxxis.cn/*"
    ]);
    expect(metadata.buildTarget).toBe("production");
    expect(metadata.localTestOnly).toBe(false);
    expect(files["injected.js"]).toBeUndefined();
    expect(strFromU8(files["content.js"]!)).not.toMatch(/window\.fetch\s*=|XMLHttpRequest|PAGE_NETWORK_CAPTURED/);
    for (const content of Object.values(files)) {
      expect(strFromU8(content)).not.toMatch(/localhost|127\.0\.0\.1|本地测试/i);
    }
  });
});
