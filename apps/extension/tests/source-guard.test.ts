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
      /chrome\.downloads/
      ,/chrome\.tabs\.(create|update|remove)/
      ,/window\.location\s*=/
      ,/\bprompt\s*\(/
      ,/chrome\.storage\.session/
    ];

    for (const file of guardedFiles) {
      const source = readFileSync(resolve(root, file), "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(source, `${file} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps production permissions route-specific and local testing isolated", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8"));
    expect(manifest.permissions).toEqual(["activeTab", "storage", "sidePanel"]);
    expect(manifest.host_permissions).toContain("https://localads.chengzijianzhan.cn/lamp/pc/liveboard2*");
    expect(manifest.host_permissions).toContain("https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2*");
    expect(manifest.host_permissions).toContain("https://eos.douyin.com/dp/liveScreen*");
    expect(manifest.host_permissions).not.toContain("http://127.0.0.1/*");
    expect(manifest.host_permissions).not.toContain("http://localhost/*");
    expect(manifest.host_permissions).not.toContain("https://*.chengzijianzhan.cn/*");
    expect(manifest.host_permissions.some((entry: string) => entry.includes("*.") || entry === "*://*/*")).toBe(false);
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    const content = readFileSync(resolve(root, "src/content.ts"), "utf8");
    expect(worker).toContain("START_PATROL");
    expect(worker).toContain("STOP_PATROL");
    expect(content).toContain("patrol.enabled");
    expect(content).not.toContain("chrome.storage.local");
    expect(worker).toContain('accessLevel: "TRUSTED_CONTEXTS"');
    expect(worker).not.toMatch(/chrome\.tabs\.(create|update)/);
  });

  it("keeps the ordinary popup focused on task pairing and one-click manual capture", () => {
    const popup = readFileSync(resolve(root, "src/popup.ts"), "utf8");
    const html = readFileSync(resolve(root, "popup.html"), "utf8");
    expect(popup).toContain("CAPTURE_AND_UPLOAD");
    expect(popup).toContain("采集并上传当前路线");
    expect(popup).toContain("renderRouteOverrideOptions");
    expect(popup).not.toMatch(/\bprompt\s*\(/);
    expect(html).toContain("输入六位配对码");
    expect(html).toContain("确认本次采集路线");
    expect(html).toContain("确认插件配对");
    expect(popup).toContain("CONFIRM_PAIRING");
    expect(html).toContain("高级设置");
  });

  it("requires Popup confirmation before a web bridge can exchange a pairing code", () => {
    const bridge = readFileSync(resolve(root, "src/web-bridge.ts"), "utf8");
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    expect(bridge).toContain("REQUEST_PAIRING_CONFIRMATION");
    expect(bridge).not.toContain("CONFIRM_PAIRING");
    expect(worker).toContain("/extension/pairing-codes/preview");
    expect(worker).toContain("isPopupSender");
    expect(worker).toContain("/extension/pairing-codes/exchange");
  });

  it("keeps one-shot manual route confirmation scoped to the current task", () => {
    const worker = readFileSync(resolve(root, "src/service-worker.ts"), "utf8");
    expect(worker).toContain("currentTaskRouteKeys");
    expect(worker).toContain("本次人工路线选择无效");
    expect(worker).not.toContain("[\"LIVE_DATA_SCREEN\", \"LIVE_PRODUCT_TAB\", \"LIVE_TRAFFIC_TAB\"]");
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
    expect(releaseManifest.version).toBe(rootPackage.version);
  });

  it("validates the current-version ZIP when that release artifact is present", () => {
    const rootPackage = JSON.parse(readFileSync(resolve(root, "../../package.json"), "utf8"));
    const archives = readdirSync(resolve(root, "release")).filter((name) => new RegExp(`^collector-v${rootPackage.version}-[a-f0-9]{7,12}\\.zip$`, "i").test(name));
    if (!archives.length) return;
    expect(archives).toHaveLength(1);
    expect(archives[0]).toMatch(new RegExp(`^collector-v${rootPackage.version}-[a-f0-9]{7,12}\\.zip$`));
    const files = unzipSync(readFileSync(resolve(root, "release", archives[0]!)));
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
    expect(manifest.version).toBe(rootPackage.version);
    expect(files["injected.js"]).toBeUndefined();
    expect(strFromU8(files["content.js"]!)).not.toMatch(/window\.fetch\s*=|XMLHttpRequest|PAGE_NETWORK_CAPTURED/);
  });
});
