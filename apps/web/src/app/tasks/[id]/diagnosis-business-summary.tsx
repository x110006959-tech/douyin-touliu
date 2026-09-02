"use client";

import type { DecisionBusinessAnalysis, DecisionEngineOutput, RiskLevel } from "@douyin-local-life/shared";

type DiagnosisSummaryOutput = Pick<DecisionEngineOutput, "businessAnalysis" | "confidence" | "diagnosis" | "riskLevel">;

type DiagnosisBusinessSummaryProps = {
  conservative?: boolean;
  managedLiveGrowthMode: boolean;
  output: DiagnosisSummaryOutput;
};

export function DiagnosisBusinessSummary({
  conservative = false,
  managedLiveGrowthMode,
  output,
}: DiagnosisBusinessSummaryProps) {
  const businessAnalysis = output.businessAnalysis;
  const displayedFindings = managedLiveGrowthMode
    ? businessAnalysis?.findings.filter((finding) => finding.dimension !== "PROFITABILITY")
    : businessAnalysis?.findings;
  const displayedRecommendations = managedLiveGrowthMode
    ? businessAnalysis?.recommendations.filter((recommendation) => recommendation.dimension !== "PROFITABILITY")
    : businessAnalysis?.recommendations;
  const displayedMetricExplanations = managedLiveGrowthMode
    ? businessAnalysis?.metricExplanations.filter((metric) => (
        !["服务商后毛利 ROI", "本次真实投入（服务费后）", "已核验平台补贴抵扣"].includes(metric.title)
      ))
    : businessAnalysis?.metricExplanations;

  return (
    <div className="grid gap-4">
      {conservative ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm lg:col-span-2">
          <strong>当前展示保守诊断：</strong>
          数据不满足正式决策时效或证据门槛，本次只展示事实、缺失项和补采建议，不创建动作建议。重新采集过期路线后可运行正式诊断。
        </div>
      ) : null}

      <div className="rounded-md border border-border p-4 lg:col-span-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold">本轮结论</h3>
            <p className="mt-2 text-base font-medium">{businessAnalysis?.headline || output.diagnosis}</p>
          </div>
          <div className="flex shrink-0 gap-2 text-xs">
            <span className={`rounded-full px-3 py-1 font-semibold ${riskTone(output.riskLevel)}`}>
              风险 {riskLabel(output.riskLevel)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">置信度 {Math.round(output.confidence * 100)}%</span>
          </div>
        </div>
        {businessAnalysis?.performanceSnapshot.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {businessAnalysis.performanceSnapshot.map((fact) => (
              <span className="rounded-md border border-border bg-slate-50 px-2 py-1 text-xs" key={fact}>{fact}</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-md border border-border p-4">
        <h3 className="mb-3 font-semibold">问题与风险在哪里</h3>
        {displayedFindings?.length ? (
          <div className="grid gap-3">
            {displayedFindings.map((finding) => (
              <div className="rounded-md border border-border p-3" key={`${finding.dimension}-${finding.title}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-primary">{dimensionLabel(finding.dimension)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${riskTone(finding.riskLevel)}`}>{riskLabel(finding.riskLevel)}</span>
                </div>
                <strong className="mt-1 block text-sm">{finding.title}</strong>
                <p className="mt-1 text-sm text-muted">{finding.conclusion}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                  {finding.evidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted">当前输出缺少结构化风险明细，请重新运行诊断。</p>}
      </div>

      <div className="rounded-md border border-border p-4">
        <h3 className="mb-3 font-semibold">怎么调整直播、商品和投流</h3>
        {displayedRecommendations?.length ? (
          <div className="grid gap-3">
            {displayedRecommendations.map((recommendation) => (
              <div className="rounded-md border border-border p-3" key={`${recommendation.priority}-${recommendation.title}`}>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${priorityTone(recommendation.priority)}`}>{recommendation.priority}</span>
                  <span className="text-xs text-muted">{dimensionLabel(recommendation.dimension)}</span>
                </div>
                <strong className="mt-2 block text-sm">{recommendation.title}</strong>
                <p className="mt-1 text-sm text-muted">{recommendation.reason}</p>
                {recommendation.evidence?.length ? (
                  <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs">
                    <strong>数据依据：</strong>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                      {recommendation.evidence.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                  {recommendation.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <p className="mt-2 text-xs"><strong>验证：</strong>{recommendation.verifyMetrics.join("、")}</p>
                <p className="mt-1 text-xs text-muted"><strong>规则边界：</strong>{recommendation.ruleBoundary}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted">当前数据没有形成可执行的证据驱动方案；请按上方缺失项补采或积累样本后重新诊断。</p>}
      </div>

      {displayedMetricExplanations?.length ? (
        <div className="rounded-md border border-border p-4 lg:col-span-2">
          <h3 className="mb-1 font-semibold">{managedLiveGrowthMode ? "这些直播增长指标有什么用" : "这些经营指标到底有什么用"}</h3>
          <p className="mb-3 text-xs text-muted">
            {managedLiveGrowthMode
              ? "用于定位流量、进房、商品点击和成交承接；平台代金券等权益作为真实转化助力单独核验。"
              : "财务口径用于守住盈利底线，不替代直播流量、商品和内容诊断。"}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {displayedMetricExplanations.map((metric) => (
              <div className="rounded-md bg-slate-50 p-3" key={metric.title}>
                <div className="flex items-baseline justify-between gap-2">
                  <strong>{metric.title}</strong>
                  <span className="text-lg font-semibold">{formatOptionalNumber(metric.value)}</span>
                </div>
                <p className="mt-2 text-sm">{metric.meaning}</p>
                <p className="mt-1 text-xs text-muted"><strong>用途：</strong>{metric.use}</p>
                <p className="mt-1 text-xs text-muted"><strong>注意：</strong>{metric.caveat}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatOptionalNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "数据缺失";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function riskLabel(riskLevel: RiskLevel) {
  return riskLevel === "HIGH" ? "高" : riskLevel === "MEDIUM" ? "中" : "低";
}

function riskTone(riskLevel: RiskLevel) {
  if (riskLevel === "HIGH") return "bg-red-100 text-red-700";
  if (riskLevel === "MEDIUM") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-700";
}

function priorityTone(priority: DecisionBusinessAnalysis["recommendations"][number]["priority"]) {
  if (priority === "P0") return "bg-red-100 text-red-700";
  if (priority === "P1") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-700";
}

function dimensionLabel(dimension: DecisionBusinessAnalysis["findings"][number]["dimension"]) {
  const labels: Record<typeof dimension, string> = {
    DATA_QUALITY: "数据可信度",
    PROFITABILITY: "真实盈利",
    TRAFFIC: "流量获取",
    LIVE_ROOM: "直播承接",
    PRODUCT: "商品结构",
    COMPLIANCE: "规则与履约",
  };
  return labels[dimension];
}
