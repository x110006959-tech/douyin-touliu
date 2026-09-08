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
const diagnosisBusinessSummarySource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/diagnosis-business-summary.tsx", import.meta.url)),
  "utf8"
);
const dashboardSource = readFileSync(
  fileURLToPath(new URL("../app/dashboard/page.tsx", import.meta.url)),
  "utf8"
);
const authPageStateSource = readFileSync(
  fileURLToPath(new URL("../components/auth-page-state.tsx", import.meta.url)),
  "utf8"
);
const collectionDashboardSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/collection-dashboard/page.tsx", import.meta.url)),
  "utf8"
);
const overviewPanelSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/collection-dashboard/overview-panel.tsx", import.meta.url)),
  "utf8"
);
const collectionRouteFlowSource = readFileSync(
  fileURLToPath(new URL("../app/tasks/[id]/collection-dashboard/collection-route-flow.tsx", import.meta.url)),
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
const actionProposalSource = readFileSync(
  fileURLToPath(new URL("../app/action-proposals/[id]/page.tsx", import.meta.url)),
  "utf8"
);

describe("task page acceptance guard", () => {
  it("shows a single asynchronous AI diagnosis with policy adjudication", () => {
    expect(taskPageSource).toContain("<DiagnosisComparison");
    expect(taskPageSource).toContain("onRunFormal={(scenario) => void runDecision(scenario)}");
    expect(diagnosisComparisonSource).toContain("目标是否达成");
    expect(diagnosisComparisonSource).toContain("趋势能否判断");
    expect(diagnosisComparisonSource).toContain("原因是否确认");
    expect(diagnosisComparisonSource).toContain("事实已确认，AI 建议未完成");
    expect(diagnosisComparisonSource).not.toContain("结论置信度");
    expect(diagnosisComparisonSource).toContain("DeepSeek + 业务 Skills");
    expect(diagnosisComparisonSource).toContain("本轮经营判断");
    expect(diagnosisComparisonSource).toContain("这组数据已经说明什么");
    expect(diagnosisComparisonSource).toContain("今天先做什么");
    expect(diagnosisComparisonSource).toContain("作决定前还缺什么");
    expect(diagnosisComparisonSource).toContain("summarizeDecisionBoundaries");
    expect(diagnosisComparisonSource).toContain('decisionRun?.promptVersion === "managed-live-growth-prompt-v16"');
    expect(diagnosisComparisonSource).toContain('decisionRun?.promptVersion === "managed-live-growth-prompt-v17"');
    expect(diagnosisComparisonSource).toContain('decisionRun?.promptVersion === "managed-live-growth-prompt-v18"');
    expect(diagnosisComparisonSource).toContain('decisionRun?.promptVersion === "managed-live-growth-prompt-v19"');
    expect(diagnosisComparisonSource).toContain('decisionRun?.promptVersion === "managed-live-growth-prompt-v20"');
    expect(diagnosisComparisonSource).toContain('decisionRun?.promptVersion === "managed-live-growth-prompt-v21"');
    expect(diagnosisComparisonSource).toContain("服务端证据复核已修正主结论");
    expect(diagnosisComparisonSource).toContain("所有候选动作已暂停");
    expect(diagnosisComparisonSource).toContain("当前唯一验证任务");
    expect(diagnosisComparisonSource).toContain("查看诊断依据与安全裁决");
    expect(diagnosisComparisonSource).toContain("只展示服务端规则允许推进的唯一下一步");
    expect(diagnosisComparisonSource).toContain("本轮为什么没有展示其他动作");
    expect(diagnosisComparisonSource).toContain("待记录结果");
    expect(diagnosisComparisonSource).toContain("不展示模型隐藏思考");
    expect(diagnosisComparisonSource).toContain("引用了本次合法证据清单之外的指标");
    expect(diagnosisComparisonSource).toContain("本次未生成任何建议");
    expect(diagnosisComparisonSource).not.toContain("问题假设与反证");
    expect(diagnosisComparisonSource).not.toContain("候选动作与规则裁决");
    expect(diagnosisComparisonSource).not.toContain("人工纳入案例库");
    expect(diagnosisComparisonSource).not.toContain("排除案例");
    expect(diagnosisComparisonSource).not.toContain("专家参考分析");
    expect(diagnosisComparisonSource).toContain('proposal.status === "PENDING_APPROVAL"');
    expect(diagnosisComparisonSource).toContain('href={`/action-proposals/${proposal.id}`}');
    expect(taskPageSource).not.toContain("规则依据与核验入口");
    expect(taskPageSource).not.toContain("高级信息：原始快照");
  });

  it("keeps task data summarized and routes calibration through the dedicated dashboard", () => {
    expect(taskPageSource).toContain('href={`/tasks/${task.id}/collection-dashboard`}');
    expect(taskPageSource).toContain("打开校准大屏");
    expect(taskPageSource).toContain("下一步：进入经营数据大屏");
    expect(taskPageSource).toContain("collectionDashboardPendingRouteLabels");
    expect(taskPageSource).toContain("请先完成：");
    expect(taskPageSource).toContain("两条路线均有完整实时指标或正式采集结果后，按钮将可用。");
    expect(taskPageSource).toContain('disabled type="button"');
    expect(taskPageSource).not.toContain("查看完整指标明细");
    expect(taskPageSource).not.toContain("一键确认可信字段");
    expect(collectionDashboardSource).toContain("经营数据大屏");
    expect(collectionDashboardSource).toContain("指标类别");
    expect(collectionDashboardSource).toContain("metricCategoryFilter");
    expect(collectionDashboardSource).toContain("来源路线：");
    expect(collectionDashboardSource).toContain("formatRouteDetectionConfidence");
    expect(collectionDashboardSource).toContain("确认当前页单元格");
    expect(collectionDashboardSource).toContain("后台字段标签");
    expect(collectionDashboardSource).toContain("metric.fieldLabel");
    expect(collectionDashboardSource).toContain("（比例）");
    expect(collectionDashboardSource).toContain("统计周期");
    expect(collectionDashboardSource).toContain("metricPeriodDrafts");
    expect(collectionDashboardSource).toContain("确认全部已校准指标");
    expect(collectionDashboardSource).not.toContain("确认表头与行列关系");
    expect(collectionDashboardSource).not.toContain("/table-bindings/confirm");
    expect(collectionDashboardSource).toContain("系统不会生成模拟趋势或虚构表格");
    expect(collectionDashboardSource).toContain("buildDashboardOverviewCards");
    expect(collectionDashboardSource).toContain("<OverviewPanel");
    expect(overviewPanelSource).toContain('data-testid="unified-overview-board"');
    expect(overviewPanelSource).toContain("经营数据总览");
    expect(overviewPanelSource).toContain('byKey.get("live_gmv")');
    expect(overviewPanelSource).toContain("查看来源详情");
    expect(overviewPanelSource).toContain("来源值不一致，系统未进行相加、平均或换算");
    expect(overviewPanelSource).toContain("投放经营 / 全域数据");
    expect(overviewPanelSource).toContain("同名指标已按统一口径合并");
    expect(overviewPanelSource).toContain("实时 API 约每 30 秒更新一次");
    expect(overviewPanelSource).toContain('hasFrame ? "约每 30 秒更新" : "已连接，等待采集"');
    expect(overviewPanelSource).not.toContain("directRouteCards");
    expect(overviewPanelSource).not.toContain("小时趋势");
    expect(collectionDashboardSource).not.toContain("hourlyRows=");
    expect(overviewPanelSource).toContain("暂无数据");
    expect(collectionDashboardSource).toContain("采集线路");
    expect(collectionRouteFlowSource).toContain("已退出当前采集");
    expect(collectionRouteFlowSource).toContain("不计入线路进度，也无需再次采集");
    expect(collectionDashboardSource).not.toContain("API 实时数据");
    expect(collectionDashboardSource).toContain("metrics.filter");
    expect(collectionDashboardSource).toContain("详细指标与原始表格");
    expect(collectionDashboardSource).toContain("确认可信数据并生成诊断");
    expect(collectionDashboardSource).toContain("table-cell-reviews/confirm-all");
    expect(collectionDashboardSource).toContain("/decision-preview");
    expect(collectionDashboardSource).toContain('id="diagnosis"');
    expect(collectionDashboardSource).toContain("scrollToDiagnosis");
    expect(collectionDashboardSource).toContain("scrollIntoView");
    expect(collectionDashboardSource).toContain("setDecisionRun(nextDecisionRun)");
    expect(collectionDashboardSource).toContain("const conservativePreview");
    expect(collectionDashboardSource).toContain("const displayedDecisionRun");
    expect(collectionDashboardSource).toContain("<DiagnosisComparison");
    expect(collectionDashboardSource).not.toContain("?preview=1#diagnosis");
    expect(collectionDashboardSource).not.toContain("router.push(`/tasks/${params.id}#diagnosis`)");
    expect(collectionDashboardSource).not.toContain("overviewMetrics.slice(1, 8)");
    expect(taskPageSource).toContain('id="diagnosis"');
    expect(diagnosisBusinessSummarySource).toContain("当前展示保守诊断");
    expect(taskPageSource).toContain('searchParams.get("preview") !== "1"');
    expect(collectionDashboardSource).not.toContain("刷新指标");
    expect(collectionDashboardSource).not.toContain("review-metrics/initialize");
    expect(taskPageSource).toContain("该问题会阻断依赖相关字段的诊断");
    expect(diagnosisComparisonSource).not.toContain("AI 诊断尚未就绪");
    expect(diagnosisComparisonSource).not.toContain("formalBlockingReasons");
  });

  it("keeps confirmation inside data summary instead of a separate manual-review step", () => {
    expect(taskPageSource).not.toContain("<CardTitle>人工核对</CardTitle>");
    expect(taskPageSource).not.toContain("第 5 步</p><CardTitle>诊断与建议");
    expect(taskPageSource).toContain("第 4 步</p><CardTitle>诊断与建议");
  });

  it("opens the station dashboard only after both primary routes become ready", () => {
    expect(taskPageSource).toContain("previousCollectionDashboardReady");
    expect(taskPageSource).toContain("previousReadiness === false && collectionDashboardReady");
    expect(taskPageSource).toContain("hasRequiredRealtimeMetricKeys");
    expect(taskPageSource).toContain("router.push(`/tasks/${task.id}/collection-dashboard`)");
    expect(extensionTaskStatusSource).toContain("hasObservedCaptureStatus");
    expect(extensionTaskStatusSource).toContain("captureJustCompleted");
    expect(extensionTaskStatusSource).toContain("onCaptureCompleted?.()");
  });

  it("refreshes the bridge state after Popup pairing confirmation", () => {
    expect(extensionTaskStatusSource).toContain("const refreshBridgeStatus = useCallback");
    expect(extensionTaskStatusSource).toContain("const refreshConnectionStatus = useCallback");
    expect(extensionTaskStatusSource).toContain("await refreshBridgeStatus({ syncCurrentTask, forceTaskSync });");
    expect(extensionTaskStatusSource).toContain("await refreshCaptureStatus();");
    expect(extensionTaskStatusSource).not.toContain("Promise.all([refreshBridgeStatus(), refreshCaptureStatus()])");
  });

  it("automatically opens the collection dashboard after web pairing completes", () => {
    expect(taskPageSource).toContain("await refreshConnectionStatus({ syncCurrentTask: false, forceTaskSync: false });");
    expect(taskPageSource).toContain("beginPairingAttempt();");
    expect(taskPageSource).toContain("acceptPairingResponse(paired);");
    expect(extensionTaskStatusSource).toContain("lastSyncFailure.current = null;");
    expect(extensionTaskStatusSource).toContain("synchronizedSession.current = response.connectionSessionId;");
    expect(extensionTaskStatusSource).toContain("connectionRefreshGeneration.current += 1;");
    expect(extensionTaskStatusSource).toContain("connectionRefreshGeneration.current !== refreshGeneration");
    expect(taskPageSource).toContain("插件已自动连接当前任务，正在打开采集看板。");
    expect(taskPageSource).toContain("router.push(`/tasks/${task.id}/collection-dashboard`)");
    expect(taskPageSource).not.toContain("请打开插件 Popup，核对目标服务器、账号和任务后点击");
  });

  it("redirects pairing recovery only after local binding and the current task heartbeat agree", () => {
    const readinessSource = taskPageSource.slice(
      taskPageSource.indexOf("const connectionReadyForTask"),
      taskPageSource.indexOf("useEffect(() =>", taskPageSource.indexOf("const connectionReadyForTask"))
    );
    expect(readinessSource).toContain("isCurrentExtensionConnected(params.id, webBridge, extensionStatus)");
    expect(taskPageSource).toContain("const extensionServerVerified = connectionReadyForTask");
    expect(taskPageSource).toContain("const extensionConnected = connectionReadyForTask");

    const pairingSource = taskPageSource.slice(
      taskPageSource.indexOf("async function createTaskPairingCode"),
      taskPageSource.indexOf("async function refreshExtensionConnection")
    );
    expect(pairingSource).toContain('err.code === "BACKGROUND_UNRESPONSIVE"');
    expect(pairingSource).toContain("pairingRecoveryPending.current = true");
  });

  it("recovers a paired plugin through the shared session policy and allows a forced retry", () => {
    expect(extensionTaskStatusSource).toContain("syncExtensionCurrentTask");
    expect(extensionTaskStatusSource).toContain("shouldRecoverExtensionTask");
    expect(extensionTaskStatusSource).toContain("if (response.ok) synchronizedSession.current = response.connectionSessionId");
    expect(extensionTaskStatusSource).toContain("forceTaskSync = true");
    expect(extensionTaskStatusSource).toContain("await synchronizeCurrentTask()");
    expect(extensionTaskStatusSource).toContain('"SERVICE_UPDATE_REQUIRED", "EXTENSION_UPDATE_REQUIRED"');
  });

  it("retries connection recovery every five seconds before reading scoped server status", () => {
    expect(extensionTaskStatusSource).toContain("void refresh(true)");
    expect(extensionTaskStatusSource).toContain("window.setInterval(() => void refresh(true), 5_000)");
    expect(extensionTaskStatusSource).toContain("?connectionSessionId=");
    expect(extensionTaskStatusSource).toContain("forceTaskSync: false");
  });

  it("keeps recovery controls and an explicit historical-data warning when the plugin is offline", () => {
    expect(taskPageSource).toContain("{extensionConnectionNeedsAttention ? (");
    expect(taskPageSource).toContain("恢复采集插件连接");
    expect(taskPageSource).toContain("重新检测插件");
    expect(extensionTaskStatusSource).toContain("EXTENSION_CONTEXT_INVALIDATED");
    expect(taskPageSource).toContain("bridgePageRefreshRequired");
    expect(taskPageSource).toContain("刷新当前页面");
    expect(taskPageSource).toContain("window.location.reload()");
    expect(taskPageSource).toContain("同账号任务不需要重新配对");
    expect(taskPageSource).toContain("当前插件未连接，历史数据仅供复核");
    expect(taskPageSource).toContain("connectionStatusLoading");
    expect(taskPageSource).toContain("needsPairingAction ? <Button");
    expect(taskPageSource).toContain("webBridgeSupportsPairing");
    expect(taskPageSource).toContain("pairingRetryErrorCodes");
    expect(taskPageSource).toContain('"PAIRING_CREDENTIAL_REJECTED"');
    expect(taskPageSource).toContain('"HEARTBEAT_FAILED"');
    expect(taskPageSource).toContain("!manualOnly && webBridgeSupportsPairing");
    expect(taskPageSource).toContain("ACTIVE_PULSE_STOP_REQUIRED");
    expect(taskPageSource).toContain("系统不会自动中断持续采集");
    expect(taskPageSource).toContain("bridgeNeedsReload");
    expect(taskPageSource).toContain("showPluginInstallInstructions");
  });

  it("does not generate another pairing code for transient context or heartbeat failures", () => {
    const retryCodes = taskPageSource.slice(
      taskPageSource.indexOf("const pairingRetryErrorCodes"),
      taskPageSource.indexOf("]);", taskPageSource.indexOf("const pairingRetryErrorCodes"))
    );
    expect(retryCodes).not.toContain("HEARTBEAT_FAILED");
    expect(retryCodes).not.toContain("HEARTBEAT_TIMEOUT");
    expect(retryCodes).not.toContain("CONTEXT_TIMEOUT");
    expect(retryCodes).not.toContain("CONTEXT_REFRESH_FAILED");
    expect(retryCodes).toContain("PAIRING_REQUIRED");
    expect(taskPageSource).toContain("重新检测插件");
  });

  it("returns an expired task session to the same task for pairing recovery", () => {
    expect(taskPageSource).toContain('<AuthRequiredState returnTo={`/tasks/${encodeURIComponent(params.id)}`} />');
  });

  it("offers a login return path when a collection task no longer exists", () => {
    expect(taskPageSource).toContain("采集任务不存在");
    expect(taskPageSource).toContain("返回登录");
    expect(taskPageSource).toContain('href="/login"');
  });

  it("offers an explicit manual button back to the parent project", () => {
    expect(taskPageSource).toContain('aria-label="返回上一级：项目详情"');
    expect(taskPageSource).toContain("← 返回上一级");
    expect(taskPageSource).toContain('href={`/projects/${task.project.id}`}');
    expect(taskPageSource).toContain("inline-flex h-10 items-center rounded-md border");
  });

  it("uses server-verified task binding instead of page account identity", () => {
    expect(taskPageSource).toContain("任务绑定");
    expect(taskPageSource).toContain("服务端已验证");
    expect(taskPageSource).toContain("extensionServerVerified");
    expect(taskPageSource).toContain("本机 API 已确认当前任务");
    expect(taskPageSource).toContain("当前插件本地凭证已验证");
    expect(taskPageSource).toContain("服务器有历史授权，当前插件未验证");
    expect(taskPageSource).toContain("pluginUpdateRequired");
    expect(taskPageSource).toContain("请先重新加载插件");
    expect(taskPageSource).toContain("当前插件协议不兼容");
    expect(taskPageSource).not.toContain("|| (webBridge.response?.paired && webBridge.response.boundTaskId === task.id)");
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
    expect(dashboardSource).toContain('err instanceof ApiError && err.code === "UNAUTHORIZED"');
    expect(dashboardSource).toContain('href={createLoginHref("/dashboard")}');
    expect(dashboardSource).toContain("window.location.replace(createLoginHref(\"/dashboard\"))");
    expect(dashboardSource).toContain("返回登录");
    expect(authPageStateSource).toContain("inline-flex h-10 items-center justify-center");
    expect(authPageStateSource).toContain("返回登录");
  });

  it("automatically saves a task target ROI in the dashboard before diagnosis", () => {
    expect(collectionDashboardSource).toContain("本次目标 ROI");
    expect(collectionDashboardSource).toContain("decision-targets");
    expect(collectionDashboardSource).toContain("window.setTimeout");
    expect(collectionDashboardSource).toContain("await flushTargetRoiSave()");
    expect(collectionDashboardSource).toContain("targetRoiRequestedRef");
    expect(collectionDashboardSource).toContain("if (targetRoiRequestedRef.current === draft)");
    expect(collectionDashboardSource).toContain("目标 ROI 未成功保存，请修改后重试。");
    expect(collectionDashboardSource).not.toContain('onClick={() => void saveTargetRoi()}');
    expect(collectionDashboardSource).toContain("用于对比全域支付 ROI");
    expect(collectionDashboardSource).toContain("bg-slate-950/20");
    expect(collectionDashboardSource).toContain("设定本次经营对标基准");
    expect(overviewPanelSource).toContain("targetEditor");
  });

  it("records outcomes with guided same-scope fields instead of raw JSON", () => {
    expect(actionProposalSource).toContain("同口径执行前后指标");
    expect(actionProposalSource).toContain("执行前数值已从本轮诊断快照带入");
    expect(actionProposalSource).toContain("outcomeMetricRows.map");
    expect(actionProposalSource).not.toContain("beforeMetricsJson");
    expect(actionProposalSource).not.toContain("afterMetricsJson");
    expect(actionProposalSource).not.toContain("JSON 数组");
  });

  it("inherits route templates without requiring per-task URLs while preserving legacy links", () => {
    expect(projectPageSource).toContain("任务默认只保留基础采集路线");
    expect(projectPageSource).toContain("defaultCollectionRouteTemplates.map");
    expect(projectPageSource).not.toContain("collectionRouteTemplates.map");
    expect(projectPageSource).not.toContain("直播大屏商品页");
    expect(projectPageSource).not.toContain("直播大屏流量页");
    expect(projectPageSource).not.toContain("页面路线 {captured}/");
    expect(projectPageSource).toContain("已有采集记录");
    expect(taskPageSource).toContain("任务或计划列表不再采集");
    expect(projectPageSource).toContain('JSON.stringify({ projectId: project.id, pageTitle: form.get("pageTitle") })');
    expect(projectPageSource).not.toContain("routeSources })");
    expect(projectPageSource).not.toContain("页面地址（可选，可由插件识别当前页面）");
    expect(taskPageSource).not.toContain("编辑网址");
    expect(taskPageSource).not.toContain("saveRouteUrl");
    expect(taskPageSource).toContain("旧任务保存网址：{route.sourceUrl}");
    expect(taskPageSource).toContain("打开已保存页面");
  });
});
