import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const taskPageSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/page.tsx", import.meta.url)),
  "utf8"
);

describe("task page acceptance guard", () => {
  it("keeps only the complete diagnosis action and hides the deferred task-page regions", () => {
    expect(taskPageSource.match(/>运行完整诊断</g)).toHaveLength(1);
    expect(taskPageSource).not.toContain("生成保守诊断");
    expect(taskPageSource).not.toContain("生成 AI 辅助解读");
    expect(taskPageSource).not.toContain("需审批的投流动作");
    expect(taskPageSource).not.toContain("规则依据与核验入口");
    expect(taskPageSource).not.toContain("高级信息：原始快照");
  });

  it("keeps full step-three and step-four data in closed details elements", () => {
    const fullDataDetails = taskPageSource.match(/<details([^>]*)><summary[^>]*>查看完整数据/);
    const reviewDetails = taskPageSource.match(/<details([^>]*)><summary[^>]*>查看完整指标明细/);

    expect(fullDataDetails?.[1]).toBeDefined();
    expect(fullDataDetails?.[1]).not.toContain("open");
    expect(reviewDetails?.[1]).toBeDefined();
    expect(reviewDetails?.[1]).not.toContain("open");
    expect(taskPageSource).toContain("该问题会阻断依赖相关字段的诊断");
    expect(taskPageSource).toContain("正式决策尚未就绪");
  });

  it("keeps bulk and per-route account confirmation with one-time snapshot scope", () => {
    expect(taskPageSource).toContain("一键确认全部待确认账号（{unverifiedRoutes.length}）");
    expect(taskPageSource).toContain("核对并确认");
    expect(taskPageSource).toContain("任务绑定账号：{task.project.accountProfile.accountName}");
    expect(taskPageSource).toContain("页面识别：{route.detectedAccountId || route.detectedAccountName || \"未识别\"}");
    expect(taskPageSource).toContain("本轮快照数量：{captureSummary?.snapshotCount || 0}");
    expect(taskPageSource).toContain("不会自动确认以后新采集的数据");
  });
});
