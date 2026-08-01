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
const collectionDashboardSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/collection-dashboard/page.tsx", import.meta.url)),
  "utf8"
);
const extensionTaskStatusSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/use-extension-task-status.ts", import.meta.url)),
  "utf8"
);
const projectPageSource = readFileSync(
  fileURLToPath(new URL("../app/projects/[id]/page.tsx", import.meta.url)),
  "utf8"
);

describe("task page acceptance guard", () => {
  it("shows a single asynchronous AI diagnosis with policy adjudication", () => {
    expect(taskPageSource).toContain("<DiagnosisComparison");
    expect(taskPageSource).toContain("onRunFormal={() => void runDecision()}");
    expect(diagnosisComparisonSource).toContain("DeepSeek + 业务 Skills");
    expect(diagnosisComparisonSource).toContain("候选动作与规则裁决");
    expect(diagnosisComparisonSource).toContain("待人工审批动作");
    expect(diagnosisComparisonSource).toContain("不展示模型隐藏思考");
    expect(diagnosisComparisonSource).not.toContain("专家参考分析");
    expect(diagnosisComparisonSource).toContain('proposal.status === "PENDING_APPROVAL"');
    expect(diagnosisComparisonSource).toContain('href={`/action-proposals/${proposal.id}`}');
    expect(taskPageSource).not.toContain("规则依据与核验入口");
    expect(taskPageSource).not.toContain("高级信息：原始快照");
  });

  it("keeps task data summarized and routes calibration through the dedicated dashboard", () => {
    expect(taskPageSource).toContain('href={`/tasks/${task.id}/collection-dashboard`}');
    expect(taskPageSource).toContain("进入校准大屏");
    expect(taskPageSource).not.toContain("查看完整指标明细");
    expect(taskPageSource).not.toContain("一键确认可信字段");
    expect(collectionDashboardSource).toContain("采集校准大屏");
    expect(collectionDashboardSource).toContain("指标类别");
    expect(collectionDashboardSource).toContain("metricCategoryFilter");
    expect(collectionDashboardSource).toContain("来源路线：");
    expect(collectionDashboardSource).toContain("formatRouteDetectionConfidence");
    expect(collectionDashboardSource).toContain("确认当前页单元格");
    expect(collectionDashboardSource).toContain("后台字段标签");
    expect(collectionDashboardSource).toContain("metric.fieldLabel");
    expect(collectionDashboardSource).toContain("formatOverviewMetricValue");
    expect(collectionDashboardSource).toContain("（比例）");
    expect(collectionDashboardSource).toContain("统计周期");
    expect(collectionDashboardSource).toContain("metricPeriodDrafts");
    expect(collectionDashboardSource).toContain("确认全部已校准指标");
    expect(collectionDashboardSource).not.toContain("确认表头与行列关系");
    expect(collectionDashboardSource).not.toContain("/table-bindings/confirm");
    expect(collectionDashboardSource).toContain("系统不会生成模拟趋势或虚构表格");
    expect(collectionDashboardSource).toContain("全任务核心指标");
    expect(collectionDashboardSource).toContain("dashboard.summary.metrics.filter");
    expect(collectionDashboardSource).toContain("详细指标与原始表格");
    expect(collectionDashboardSource).toContain("确认可信数据并生成诊断");
    expect(collectionDashboardSource).toContain("table-cell-reviews/confirm-all");
    expect(collectionDashboardSource).toContain("/decision-preview");
    expect(collectionDashboardSource).toContain("?preview=1#diagnosis");
    expect(collectionDashboardSource).toContain("router.push(`/tasks/${params.id}#diagnosis`)");
    expect(collectionDashboardSource).not.toContain("overviewMetrics.slice(1, 8)");
    expect(taskPageSource).toContain('id="diagnosis"');
    expect(taskPageSource).toContain("当前展示保守诊断");
    expect(taskPageSource).toContain('searchParams.get("preview") !== "1"');
    expect(collectionDashboardSource).not.toContain("刷新指标");
    expect(collectionDashboardSource).not.toContain("review-metrics/initialize");
    expect(taskPageSource).toContain("该问题会阻断依赖相关字段的诊断");
    expect(diagnosisComparisonSource).toContain("AI 诊断尚未就绪");
  });

  it("opens the station dashboard only after this view observes a new completed capture", () => {
    expect(taskPageSource).toContain("onCaptureCompleted: openCollectionDashboardAfterCapture");
    expect(taskPageSource).toContain("router.push(`/tasks/${params.id}/collection-dashboard`)");
    expect(extensionTaskStatusSource).toContain("hasObservedCaptureStatus");
    expect(extensionTaskStatusSource).toContain("captureJustCompleted");
    expect(extensionTaskStatusSource).toContain("onCaptureCompleted?.()");
  });

  it("refreshes the bridge state after Popup pairing confirmation", () => {
    expect(extensionTaskStatusSource).toContain("const refreshBridgeStatus = useCallback");
    expect(extensionTaskStatusSource).toContain("window.setInterval(() => void refreshBridgeStatus(), 3_000)");
    expect(extensionTaskStatusSource).toContain("const refreshConnectionStatus = useCallback");
  });

  it("keeps recovery controls available when historical captures exist but the plugin is offline", () => {
    expect(taskPageSource).toContain("{!extensionConnected ? (");
    expect(taskPageSource).toContain("恢复采集插件连接");
    expect(taskPageSource).toContain("重新检测插件");
    expect(taskPageSource).not.toContain("{!extensionConnected && !hasCapture ? (");
  });

  it("uses server-verified task binding instead of page account identity", () => {
    expect(taskPageSource).toContain("任务绑定");
    expect(taskPageSource).toContain("服务端已验证");
    expect(taskPageSource).not.toContain("页面识别：");
    expect(taskPageSource).not.toContain("待确认账号");
    expect(taskPageSource).not.toContain("confirm-accounts");
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

  it("inherits route templates without requiring per-task URLs while preserving legacy links", () => {
    expect(projectPageSource).toContain("任务会自动继承全局采集路线");
    expect(projectPageSource).toContain('JSON.stringify({ projectId: project.id, pageTitle: form.get("pageTitle") })');
    expect(projectPageSource).not.toContain("routeSources })");
    expect(projectPageSource).not.toContain("页面地址（可选，可由插件识别当前页面）");
    expect(taskPageSource).not.toContain("编辑网址");
    expect(taskPageSource).not.toContain("saveRouteUrl");
    expect(taskPageSource).toContain("旧任务保存网址：{route.sourceUrl}");
    expect(taskPageSource).toContain("打开已保存页面");
  });
});
