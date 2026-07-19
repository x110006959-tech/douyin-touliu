import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const taskPageSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/page.tsx", import.meta.url)),
  "utf8"
);
const diagnosisComparisonSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/diagnosis-comparison.tsx", import.meta.url)),
  "utf8"
);
const dashboardSource = readFileSync(
  fileURLToPath(new URL("../app/dashboard/page.tsx", import.meta.url)),
  "utf8"
);

describe("task page acceptance guard", () => {
  it("shows formal diagnosis and advisory expert analysis side by side", () => {
    expect(taskPageSource).toContain("<DiagnosisComparison");
    expect(taskPageSource).toContain("onRunExpert={() => void runExpertAnalysis()}");
    expect(taskPageSource).toContain("onRunFormal={() => void runDecision()}");
    expect(diagnosisComparisonSource).toContain("lg:grid-cols-2");
    expect(diagnosisComparisonSource).toContain("正式诊断");
    expect(diagnosisComparisonSource).toContain("专家参考分析");
    expect(diagnosisComparisonSource).toContain("待审批动作");
    expect(diagnosisComparisonSource).toContain("不创建正式动作，也不覆盖正式诊断");
    expect(diagnosisComparisonSource).toContain('proposal.status === "PENDING_APPROVAL"');
    expect(diagnosisComparisonSource).toContain('href={`/action-proposals/${proposal.id}`}');
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
    expect(diagnosisComparisonSource).toContain("正式决策尚未就绪");
  });

  it("keeps bulk and per-route account confirmation with one-time snapshot scope", () => {
    expect(taskPageSource).toContain("一键确认全部待确认账号（{unverifiedRoutes.length}）");
    expect(taskPageSource).toContain("核对并确认");
    expect(taskPageSource).toContain("任务绑定账号：{task.project.accountProfile.accountName}");
    expect(taskPageSource).toContain("页面识别：{route.detectedAccountId || route.detectedAccountName || \"未识别\"}");
    expect(taskPageSource).toContain("本轮快照数量：{captureSummary?.snapshotCount || 0}");
    expect(taskPageSource).toContain("不会自动确认以后新采集的数据");
  });

  it("shows safe collection diagnostics without automatic recovery controls", () => {
    expect(taskPageSource).toContain("查看采集诊断");
    expect(taskPageSource).toContain("连续失败");
    expect(taskPageSource).toContain("缺失字段");
    expect(taskPageSource).toContain("人工处理：{issue.recoveryAction}");
    expect(taskPageSource).not.toContain("自动修复采集");
    expect(dashboardSource).toContain("采集健康");
    expect(dashboardSource).toContain("COLLECTOR_STALLED");
    expect(dashboardSource).toContain("未验证");
  });
});
