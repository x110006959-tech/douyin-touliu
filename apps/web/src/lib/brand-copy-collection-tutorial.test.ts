import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const accountNewPageSource = readFileSync(
  fileURLToPath(new URL("../app/accounts/new/page.tsx", import.meta.url)),
  "utf8"
);
const projectPageSource = readFileSync(
  fileURLToPath(new URL("../app/projects/[id]/page.tsx", import.meta.url)),
  "utf8"
);
const taskPageSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/page.tsx", import.meta.url)),
  "utf8"
);
const collectionTutorialSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/collection-tutorial.tsx", import.meta.url)),
  "utf8"
);

describe("brand copy and collection tutorial", () => {
  it("uses the requested account name example and brand explanation", () => {
    expect(accountNewPageSource).toContain("例如：某某品牌");
    expect(accountNewPageSource).toContain("填写品牌名称，例如：某某品牌；门店或区域可在下方选填。");
    expect(accountNewPageSource).toContain('name="accountName"');
    expect(accountNewPageSource).toContain("平台账号名称");
  });

  it("keeps task names free-form and shows the requested live broadcast example", () => {
    expect(projectPageSource).toContain("例如：9月18日第1场直播");
    expect(projectPageSource).toContain('name="pageTitle"');
    expect(projectPageSource).not.toContain("例如：7月14日晚场直播");
    expect(projectPageSource).not.toContain("new Date().toISOString()");
    expect(projectPageSource).not.toContain("9月18日第1场直播}`");
  });

  it("places the tutorial after plugin connection and before capture pages", () => {
    expect(taskPageSource).toContain('import { CollectionTutorial } from "./collection-tutorial";');
    expect(taskPageSource).toContain("<CollectionTutorial />");

    const connectionCardStart = taskPageSource.indexOf("连接采集插件");
    const tutorialStart = taskPageSource.indexOf("<CollectionTutorial />");
    const captureCardStart = taskPageSource.indexOf("<CardTitle>采集指定页面</CardTitle>");

    expect(connectionCardStart).toBeGreaterThan(-1);
    expect(tutorialStart).toBeGreaterThan(connectionCardStart);
    expect(captureCardStart).toBeGreaterThan(tutorialStart);
  });

  it("contains the fixed five-step tutorial and both supported routes", () => {
    const requiredText = [
      "检测插件",
      "连接插件",
      "打开目标页面",
      "开始 API 持续采集",
      "停止 API 持续采集",
      "API 已就绪",
      "API 已启动，正在发起首轮请求",
      "直播数据大屏概览页",
      "本地推数据总览页",
      "插件已连接",
      "chrome://extensions",
      "生成手动配对码",
      "采集中",
      "任务列表或计划列表"
    ];

    for (const text of requiredText) {
      expect(collectionTutorialSource).toContain(text);
    }
  });

  it("is a collapsed, keyboard-accessible manual guide with no collection side effects", () => {
    expect(collectionTutorialSource).toContain("<details");
    expect(collectionTutorialSource).toContain("<summary");
    expect(collectionTutorialSource).toContain("采集教程");
    expect(collectionTutorialSource).toContain("安全边界：本教程只指导人工操作");
    expect(collectionTutorialSource).not.toContain("apiFetch");
    expect(collectionTutorialSource).not.toContain("pairExtensionTask");
    expect(collectionTutorialSource).not.toContain("useEffect");
    expect(collectionTutorialSource).not.toContain("useTaskData");
    expect(collectionTutorialSource).not.toContain("window.open");
    expect(collectionTutorialSource).not.toContain("fetch(");
    expect(collectionTutorialSource).not.toContain("setInterval");
    expect(collectionTutorialSource).not.toContain("document.querySelector");
  });
});
