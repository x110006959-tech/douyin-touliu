"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { DecisionBusinessAnalysis, RiskLevel } from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import type { DecisionRun, ExpertAnalysis } from "./task-types";

type DiagnosisComparisonProps = {
  busy: string;
  decisionRun: DecisionRun | null;
  expertAnalysis: ExpertAnalysis | null;
  evidenceAdvisory: string | null;
  formalContent: ReactNode;
  formalReady: boolean;
  formalBlockingReasons: string[];
  onRunExpert: () => void;
  onRunFormal: () => void;
};

export function DiagnosisComparison({
  busy,
  decisionRun,
  expertAnalysis,
  evidenceAdvisory,
  formalContent,
  formalReady,
  formalBlockingReasons,
  onRunExpert,
  onRunFormal
}: DiagnosisComparisonProps) {
  const pendingProposals = decisionRun?.actionProposals.filter((proposal) => proposal.status === "PENDING_APPROVAL") || [];
  const expertPayload = expertAnalysis?.responsePayload;
  const reference = expertPayload?.decisionReference;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <article className="min-w-0 rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">正式诊断</h3>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">正式依据</span>
            </div>
            <p className="text-sm text-muted">系统结论、经营方案和需人工审批的动作，以确定性决策引擎输出为准。</p>
          </div>
          <Button
            className="shrink-0"
            disabled={!formalReady || Boolean(busy)}
            onClick={onRunFormal}
            title={formalReady ? "生成正式诊断和待审批动作" : "请先完成账号确认、基础路线采集和指标复核"}
            type="button"
          >
            {busy === "decision" ? "正在诊断..." : decisionRun ? "重新运行正式诊断" : "运行正式诊断"}
          </Button>
        </div>

        {!formalReady ? (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            <strong>正式决策尚未就绪</strong>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {formalBlockingReasons.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="mt-2 text-muted">缺少单项指标只限制依赖该指标的动作，不会绕过证据门槛。</p>
          </div>
        ) : null}

        {evidenceAdvisory ? (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            <strong>动作将按证据降级：</strong>{evidenceAdvisory}
          </div>
        ) : null}

        {formalContent}

        {decisionRun ? (
          <section className="mt-4 rounded-lg border border-border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold">待审批动作</h4>
                <p className="mt-1 text-xs text-muted">这里只展示建议，必须进入审批后由用户人工执行。</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{pendingProposals.length} 项</span>
            </div>
            {pendingProposals.length ? (
              <div className="mt-3 grid gap-2">
                {pendingProposals.map((proposal) => (
                  <Link className="rounded-md border border-border p-3 transition hover:border-primary hover:bg-blue-50" href={`/action-proposals/${proposal.id}`} key={proposal.id}>
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm">{proposal.title}</strong>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${riskTone(proposal.riskLevel)}`}>{riskLabel(proposal.riskLevel)}风险</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{proposal.reason}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-muted">本轮没有生成待审批动作；这不影响查看经营诊断和验证方案。</p>
            )}
          </section>
        ) : null}
      </article>

      <article className="min-w-0 rounded-xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">专家参考分析</h3>
              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">Agency 方法论 · 仅供参考</span>
            </div>
            <p className="text-sm text-muted">补充证据、人工验证步骤和停止条件，不创建正式动作，也不覆盖正式诊断。</p>
          </div>
          <Button
            className="shrink-0 bg-violet-700 hover:bg-violet-800"
            disabled={Boolean(busy)}
            onClick={onRunExpert}
            type="button"
          >
            {busy === "expert-analysis" ? "正在分析..." : expertAnalysis ? "重新生成专家参考" : "生成专家参考"}
          </Button>
        </div>

        {expertPayload ? (
          <div className="grid gap-4">
            <section className="rounded-lg border border-violet-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold">参考结论</h4>
                {typeof expertPayload.confidence === "number" ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">参考置信度 {Math.round(expertPayload.confidence * 100)}%</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm">{expertPayload.summary || "当前没有可展示的参考结论。"}</p>
              {reference?.notice ? <p className="mt-3 rounded-md bg-violet-50 p-3 text-xs text-muted">{reference.notice}</p> : null}
            </section>

            {reference?.insights.length ? (
              <section className="grid gap-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h4 className="font-semibold">方法论视角</h4>
                    <p className="mt-1 text-xs text-muted">按真实证据逐项核对，不使用未经验证的通用阈值。</p>
                  </div>
                  <span className="text-xs text-muted">{reference.sources.length} 个经筛选来源</span>
                </div>
                {reference.insights.map((insight) => (
                  <div className="rounded-lg border border-violet-100 bg-white p-4" key={insight.id}>
                    <span className="text-xs font-semibold text-violet-700">{dimensionLabel(insight.dimension)}</span>
                    <strong className="mt-1 block text-sm">{insight.title}</strong>
                    <ReferenceList items={insight.evidence} label="当前证据" />
                    <ReferenceList items={insight.requiredEvidence} label="待补证据" />
                    <ReferenceList items={insight.manualSteps} label="人工验证" ordered />
                    <p className="mt-3 text-xs"><strong>观察指标：</strong>{insight.verifyMetrics.join("、")}</p>
                    <ReferenceList items={insight.stopConditions} label="停止条件" />
                    <p className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-muted"><strong>安全边界：</strong>{insight.safetyBoundary}</p>
                  </div>
                ))}
              </section>
            ) : null}

            {expertPayload.suggestions?.length ? (
              <section className="rounded-lg border border-violet-100 bg-white p-4">
                <h4 className="font-semibold">补充验证建议</h4>
                <div className="mt-3 grid gap-2">
                  {expertPayload.suggestions.map((suggestion) => (
                    <div className="rounded-md bg-slate-50 p-3" key={`${suggestion.title}-${suggestion.reason}`}>
                      <strong className="text-sm">{suggestion.title}</strong>
                      <p className="mt-1 text-xs text-muted">{suggestion.reason}</p>
                      <p className="mt-2 text-xs"><strong>预期观察：</strong>{suggestion.expectedImpact}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {expertPayload.manualCheckItems?.length ? (
              <section className="rounded-lg border border-violet-100 bg-white p-4">
                <h4 className="font-semibold">需要人工确认</h4>
                <div className="mt-3 grid gap-2">
                  {expertPayload.manualCheckItems.map((item) => (
                    <div className="rounded-md bg-amber-50 p-3 text-sm" key={`${item.title}-${item.reason}`}>
                      <strong>{item.title}</strong>
                      <p className="mt-1 text-xs text-muted">{item.reason}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : expertAnalysis?.status === "FAILED" ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-danger">{expertAnalysis.errorMessage || "专家参考分析失败，请稍后重试。"}</p>
        ) : (
          <p className="rounded-md border border-violet-100 bg-white p-4 text-sm text-muted">尚未生成专家参考。点击上方按钮后，系统会使用当前采集证据给出补证、人工验证和停止条件。</p>
        )}
      </article>
    </div>
  );
}

function ReferenceList({ items, label, ordered = false }: { items: string[]; label: string; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <div className="mt-3 text-xs">
      <strong>{label}：</strong>
      <List className={`${ordered ? "list-decimal" : "list-disc"} mt-1 space-y-1 pl-5 text-muted`}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </List>
    </div>
  );
}

function riskLabel(riskLevel: RiskLevel) {
  return riskLevel === "HIGH" ? "高" : riskLevel === "MEDIUM" ? "中" : "低";
}

function riskTone(riskLevel: RiskLevel) {
  if (riskLevel === "HIGH") return "bg-red-100 text-red-700";
  if (riskLevel === "MEDIUM") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-700";
}

function dimensionLabel(dimension: DecisionBusinessAnalysis["findings"][number]["dimension"]) {
  const labels: Record<typeof dimension, string> = {
    DATA_QUALITY: "数据可信度",
    PROFITABILITY: "真实盈利",
    TRAFFIC: "流量获取",
    LIVE_ROOM: "直播承接",
    PRODUCT: "商品结构",
    COMPLIANCE: "规则与履约"
  };
  return labels[dimension];
}
