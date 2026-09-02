"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { RiskLevel } from "@douyin-local-life/shared";
import { apiFetch } from "@/lib/api";
import { humanizeBusinessText, humanizeDiagnosisFailure, summarizeDecisionBoundaries } from "@/lib/diagnosis-presentation";
import { Button } from "@/components/ui/button";
import type { DecisionRun } from "./task-types";

type DiagnosisComparisonProps = {
  busy: string;
  decisionRun: DecisionRun | null;
  evidenceAdvisory: string | null;
  formalContent: ReactNode;
  formalReady: boolean;
  onRunFormal: () => void;
  token?: string | null;
  onRefresh?: () => void;
};

export function DiagnosisComparison({
  busy,
  decisionRun,
  evidenceAdvisory,
  formalContent,
  formalReady,
  onRunFormal,
  token,
  onRefresh
}: DiagnosisComparisonProps) {
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [mainProblemCorrect, setMainProblemCorrect] = useState(true);
  const [usefulnessScore, setUsefulnessScore] = useState(4);
  const [correctionNote, setCorrectionNote] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const pending = decisionRun?.status === "PENDING" || decisionRun?.status === "RUNNING";
  const result = decisionRun?.finalResult || null;
  const deterministicReview = decisionRun?.deterministicReview || null;
  const decisionView = decisionRun?.decisionView || null;
  const failedSkillExecution = decisionRun?.skillExecutions.find((execution) => execution.status === "FAILED") || null;
  const pendingProposals = deterministicReview
    ? []
    : decisionRun?.actionProposals.filter((proposal) => proposal.status === "PENDING_APPROVAL") || [];
  const visibleFacts = decisionView?.facts.slice(0, 5) || result?.factSnapshot.slice(0, 5) || [];
  const visibleExperiments = decisionView
    ? decisionView.primaryExperiment ? [decisionView.primaryExperiment] : []
    : !deterministicReview && (decisionRun?.promptVersion === "managed-live-growth-prompt-v16"
    || decisionRun?.promptVersion === "managed-live-growth-prompt-v17"
    || decisionRun?.promptVersion === "managed-live-growth-prompt-v18"
    || decisionRun?.promptVersion === "managed-live-growth-prompt-v19"
    || decisionRun?.promptVersion === "managed-live-growth-prompt-v20"
    || decisionRun?.promptVersion === "managed-live-growth-prompt-v21")
      ? result?.experiments.slice(0, 3) || []
      : [];
  const decisionBoundaries = decisionView?.openQuestions || summarizeDecisionBoundaries([
    ...(result?.missingEvidence || []),
    ...(result?.hypotheses.flatMap((item) => item.missingEvidence) || [])
  ]);

  async function submitFeedback() {
    if (!decisionRun || !token) return;
    setFeedbackBusy(true);
    setFeedbackMessage("");
    try {
      await apiFetch(`/decision-runs/${decisionRun.id}/feedback`, token, {
        method: "POST",
        body: JSON.stringify({ mainProblemCorrect, usefulnessScore, adoptedActionTypes: [], correctionNote: correctionNote || null })
      });
      setFeedbackMessage("评价已保存，将用于离线质量评测，不会自动修改诊断规则。");
      onRefresh?.();
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "评价保存失败");
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <article className="min-w-0 rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">AI 诊断</h3>
            {decisionRun?.mode === "LEGACY_RULE" ? (
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">旧版规则诊断</span>
            ) : (
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">DeepSeek + 业务 Skills</span>
            )}
          </div>
          <p className="text-sm text-muted">AI 负责综合诊断与候选动作，服务端规则负责安全裁决；所有通过动作仍需人工审批和执行。</p>
        </div>
        <Button
          className="shrink-0"
          disabled={!formalReady || Boolean(busy) || pending}
          onClick={onRunFormal}
          title={formalReady ? "创建异步 AI 诊断" : "请先完成基础路线采集和人工复核"}
          type="button"
        >
          {pending ? "AI 诊断运行中..." : decisionRun?.mode === "AI_SKILL_ORCHESTRATED" ? "重新运行 AI 诊断" : "运行 AI 诊断"}
        </Button>
      </div>

      {evidenceAdvisory ? <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"><strong>规则裁决提示：</strong>{evidenceAdvisory}</div> : null}

      {!decisionRun ? formalContent : null}
      {decisionRun?.mode === "LEGACY_RULE" ? formalContent : null}

      {pending ? (
        <section className="rounded-lg border border-blue-100 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div><h4 className="font-semibold">正在执行</h4><p className="mt-1 text-sm text-muted">{stageLabel(decisionRun.currentStage)}</p></div>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">{decisionRun.status}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {decisionRun.skillExecutions.map((execution) => (
              <div className="rounded-md border border-border p-3" key={execution.id}>
                <strong className="text-sm">{skillLabel(execution.skillId)}</strong>
                <p className="mt-1 text-xs text-muted">v{execution.skillVersion} · {skillStatusLabel(execution.status)}</p>
              </div>
            ))}
            {!decisionRun.skillExecutions.length ? <p className="text-sm text-muted">等待 Worker 领取任务并复核证据…</p> : null}
          </div>
          <p className="mt-3 text-xs text-muted">页面只展示阶段与 Skill 状态，不展示模型隐藏思考。</p>
        </section>
      ) : null}

      {decisionRun?.status === "FAILED" ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h4 className="font-semibold text-danger">AI 诊断失败</h4>
          <p className="mt-2 text-sm">{humanizeDiagnosisFailure(decisionRun.errorCode, decisionRun.errorMessage)}</p>
          {failedSkillExecution ? <p className="mt-2 text-sm"><strong>具体原因：</strong>{skillFailureMessage(failedSkillExecution)}</p> : null}
          <p className="mt-1 text-xs text-muted">失败阶段：{stageLabel(decisionRun.currentStage)} · 错误码：{decisionRun.errorCode || "AI_DIAGNOSIS_FAILED"}</p>
          <p className="mt-3 text-xs text-muted">本次不会用规则模板冒充 AI 诊断成功，也不会创建动作建议。</p>
        </section>
      ) : null}

      {decisionRun?.status === "SUCCEEDED" && result ? (
        <div className="grid gap-4">
          {deterministicReview ? (
            <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <h4 className="font-semibold text-amber-900">服务端证据复核已修正主结论</h4>
              <p className="mt-2 text-sm text-amber-950">AI 综合结果与已保存目标冲突，下面主卡按服务端确定性证据展示；本轮候选动作不进入审批。</p>
            </section>
          ) : null}
          <section className="rounded-lg border border-blue-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-4xl">
                <p className="text-xs font-semibold text-primary">本轮经营判断</p>
                <h4 className="mt-1 text-lg font-semibold">{decisionView?.headline || problemLabel(deterministicReview?.expectedMainProblemTag || result.mainProblemTag)}</h4>
                <p className="mt-2 leading-7">{humanizeBusinessText(decisionView?.conclusion || deterministicReview?.conclusion || result.coreConclusion)}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2 text-xs">
                <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700">结论置信度 {Math.round((decisionView?.conclusionConfidence ?? result.confidence) * 100)}%</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">问题影响待结合趋势评估</span>
                {decisionView?.actionRisk ? <span className={`rounded-full px-3 py-1 font-semibold ${riskTone(decisionView.actionRisk)}`}>下一步动作风险 {riskLabel(decisionView.actionRisk)}</span> : null}
              </div>
            </div>
            {decisionView?.targetComparison ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <MetricFact label="实际全域支付 ROI" value={formatNumber(decisionView.targetComparison.actual)} />
                <MetricFact label="本次目标 ROI" value={formatNumber(decisionView.targetComparison.target)} />
                <MetricFact label="距离目标" value={formatNumber(decisionView.targetComparison.absoluteGap)} />
                <MetricFact label="目标达成率" value={`${Math.round(decisionView.targetComparison.achievementRate * 1000) / 10}%`} />
              </div>
            ) : null}
            <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-xs text-muted">
              判断顺序：先确认数据口径，再确认目标差距，随后区分已知事实与原因假设，最后只展示服务端规则允许推进的下一步。没有目标、同口径历史或对照时，不把当前数字硬判为好或差。
            </p>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-semibold">这组数据已经说明什么</h4>
            <p className="mt-1 text-xs text-muted">这里只列本轮采集能直接确认的经营事实，不展示内部证据编号。</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {visibleFacts.map((fact, index) => (
                <div className="rounded-md bg-slate-50 p-3 text-sm" key={`${fact.statement}-${index}`}>
                  {humanizeBusinessText(fact.statement)}
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-emerald-200 bg-white p-4">
              <h4 className="font-semibold">今天先做什么</h4>
              <p className="mt-1 text-xs text-muted">只展示服务端规则允许推进的唯一下一步，并保留审批、人工执行和复盘状态。</p>
              {decisionView ? (
                decisionView.nextStep.proposalId ? (
                  <Link className="mt-3 block rounded-md border border-emerald-200 bg-emerald-50 p-3 transition hover:border-primary" href={`/action-proposals/${decisionView.nextStep.proposalId}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">{nextStepLabel(decisionView.nextStep.kind)}</span>
                      <strong className="text-sm">{humanizeBusinessText(decisionView.nextStep.title)}</strong>
                    </div>
                    <p className="mt-2 text-sm text-muted">{humanizeBusinessText(decisionView.nextStep.reason)}</p>
                    <p className="mt-2 text-xs font-semibold text-primary">{nextStepCta(decisionView.nextStep.kind)} →</p>
                  </Link>
                ) : (
                  <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
                    <strong>{humanizeBusinessText(decisionView.nextStep.title)}</strong>
                    <p className="mt-1 text-muted">{humanizeBusinessText(decisionView.nextStep.reason)}</p>
                  </div>
                )
              ) : pendingProposals.length ? (
                <div className="mt-3 grid gap-2">
                  {pendingProposals.map((proposal, index) => (
                    <Link className="rounded-md border border-emerald-200 bg-emerald-50 p-3 transition hover:border-primary" href={`/action-proposals/${proposal.id}`} key={proposal.id}>
                      <div className="flex items-center gap-2"><span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">第 {index + 1} 项</span><strong className="text-sm">{humanizeBusinessText(proposal.title)}</strong></div>
                      <p className="mt-2 text-sm text-muted">{humanizeBusinessText(proposal.reason)}</p>
                      <p className="mt-2 text-xs font-semibold text-primary">打开后人工审批 →</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
                  {deterministicReview
                    ? "本轮 AI 核心结论与服务端证据冲突，所有候选动作已暂停，不进入人工审批。"
                    : "本轮没有新的待审批动作。先保持当前设置，补齐右侧判断条件后再诊断，不要仅凭一次快照改预算或停计划。"}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-amber-200 bg-white p-4">
              <h4 className="font-semibold">作决定前还缺什么</h4>
              <p className="mt-1 text-xs text-muted">缺少这些条件时，系统只给验证建议，不把示例数字当作行业标准。</p>
              {decisionBoundaries.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
                  {decisionBoundaries.map((item) => <li key={item}>{humanizeBusinessText(item)}</li>)}
                </ul>
              ) : <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm">本轮未发现会阻断判断的关键缺口。</p>}
            </section>
          </div>

          {decisionView?.blockedActions.length ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h4 className="font-semibold">本轮为什么没有展示其他动作</h4>
              <p className="mt-1 text-xs text-muted">以下候选动作已被证据门槛、频控或冷却规则拦截，不应按实验卡自行执行。</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {decisionView.blockedActions.map((item) => (
                  <div className="rounded-md bg-slate-50 p-3 text-sm" key={`${item.source}-${item.actionType}`}>
                    <strong>{humanizeBusinessText(item.title)}</strong>
                    <p className="mt-1 text-muted">{humanizeBusinessText(item.reason)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {visibleExperiments.length ? (
            <section className="rounded-lg border border-border bg-white p-4">
              <h4 className="font-semibold">当前唯一验证任务</h4>
              <p className="mt-1 text-xs text-muted">每轮只推进一个变量；人工调整仍必须先通过审批，并在平台页面手动执行。</p>
              <div className="mt-3 grid gap-3">{visibleExperiments.map((experiment, index) => (
                <div className="rounded-md border border-border p-3" key={experiment.id}>
                  <span className="text-xs font-semibold text-primary">验证 {index + 1}</span>
                  <strong className="mt-1 block text-sm">{humanizeBusinessText(experiment.title)}</strong>
                  {experiment.singleVariable ? <p className="mt-2 text-sm"><strong>唯一变量：</strong>{humanizeBusinessText(experiment.singleVariable)}</p> : <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">该历史运行未记录结构化单变量与基线；只可用于复盘，不应据此新增调整。</p>}
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{experiment.steps.slice(0, 3).map((step) => <li key={step}>{humanizeBusinessText(step)}</li>)}</ol>
                  <p className="mt-3 text-xs"><strong>重点观察：</strong>{experiment.verifyMetrics.map(humanizeMetricName).join("、")}</p>
                  {experiment.baselineMetrics ? <p className="mt-1 text-xs"><strong>执行前基线：</strong>{experiment.baselineMetrics.map(humanizeMetricName).join("、")}</p> : null}
                  {experiment.observationWindow ? <p className="mt-1 text-xs"><strong>观察窗口：</strong>{humanizeBusinessText(experiment.observationWindow)}</p> : null}
                  {experiment.completionCriteria ? <p className="mt-1 text-xs"><strong>完成标准：</strong>{experiment.completionCriteria.map(humanizeBusinessText).join("；")}</p> : null}
                  <p className="mt-1 text-xs text-muted"><strong>{experiment.abortCriteria ? "风险止损" : "原运行记录条件"}：</strong>{(experiment.abortCriteria || experiment.stopConditions).map(humanizeBusinessText).join("；")}</p>
                  {experiment.interferenceFactors?.length ? <p className="mt-1 text-xs text-muted"><strong>需记录的干扰因素：</strong>{experiment.interferenceFactors.map(humanizeBusinessText).join("、")}</p> : null}
                </div>
              ))}</div>
            </section>
          ) : null}

          <details className="rounded-lg border border-border bg-white p-4">
            <summary className="cursor-pointer font-semibold">查看诊断依据与安全裁决</summary>
            <p className="mt-2 text-xs text-muted">以下内容用于复核系统是否引用了合法数据，不是经营人员日常操作清单。</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <strong>运行信息</strong>
                <p className="mt-2 text-muted">模型：{decisionRun.provider}/{decisionRun.model}</p>
                <p className="mt-1 text-muted">置信度：{Math.round(result.confidence * 100)}%</p>
                <p className="mt-1 text-muted">服务端裁决：通过 {result.ruleAdjudication?.accepted.length || 0} 项，拒绝 {result.ruleAdjudication?.rejected.length || 0} 项，冷却或频控 {result.ruleAdjudication?.lifecycleSuppressed?.length || 0} 项。</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <strong>业务 Skills</strong>
                <div className="mt-2 grid gap-1">
                  {decisionRun.skillExecutions.map((execution) => <p className="text-muted" key={execution.id}>{skillLabel(execution.skillId)}：{skillStatusLabel(execution.status)}</p>)}
                </div>
              </div>
            </div>
            <details className="mt-4 rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">查看技术证据目录（{result.evidenceCatalog?.length || 0} 项）</summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2">{result.evidenceCatalog?.map((evidence) => <div className="rounded-md bg-slate-50 p-3 text-sm" key={evidence.id}><strong>{humanizeBusinessText(evidence.label)}</strong><p className="mt-1 break-words text-xs text-muted">{String(evidence.value)} · {routeLabel(evidence.routeKey || evidence.kind)}</p><code className="mt-1 block break-all text-[11px] text-slate-500">{evidence.id}</code></div>)}</div>
            </details>
          </details>

          {!deterministicReview ? <details className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
            <summary className="cursor-pointer font-semibold">反馈这次诊断</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className="mb-1 block font-medium">主问题是否正确</span><select className="h-10 w-full rounded-md border border-border bg-white px-3" value={mainProblemCorrect ? "yes" : "no"} onChange={(event) => setMainProblemCorrect(event.target.value === "yes")}><option value="yes">正确</option><option value="no">不正确</option></select></label>
              <label className="text-sm"><span className="mb-1 block font-medium">有用度</span><select className="h-10 w-full rounded-md border border-border bg-white px-3" value={usefulnessScore} onChange={(event) => setUsefulnessScore(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((score) => <option value={score} key={score}>{score} 分</option>)}</select></label>
            </div>
            <label className="mt-3 block text-sm"><span className="mb-1 block font-medium">纠错说明（选填）</span><textarea className="min-h-24 w-full rounded-md border border-border bg-white p-3" maxLength={2000} value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} /></label>
            <div className="mt-3"><Button disabled={feedbackBusy || !token} onClick={() => void submitFeedback()} type="button">保存评价</Button></div>
            {feedbackMessage ? <p className="mt-3 text-sm text-muted">{feedbackMessage}</p> : null}
            <p className="mt-2 text-xs text-muted">第一阶段不启用案例检索；评价只用于离线质量检查，不会在线自动修改 Prompt、规则或 Skill。</p>
          </details> : null}
        </div>
      ) : null}
    </article>
  );
}

type NextStepKind = NonNullable<DecisionRun["decisionView"]>["nextStep"]["kind"];

function MetricFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-blue-50 p-3"><p className="text-xs text-muted">{label}</p><strong className="mt-1 block text-base">{value}</strong></div>;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function nextStepLabel(kind: NextStepKind) {
  return {
    APPROVAL: "待人工审批",
    MANUAL_EXECUTION: "待人工执行",
    OBSERVATION: "观察中",
    OUTCOME_REVIEW: "待记录结果",
    COMPLETED: "本轮已闭环",
    COLLECT_EVIDENCE: "待补证据",
    NONE: "无需动作"
  }[kind];
}

function nextStepCta(kind: NextStepKind) {
  return {
    APPROVAL: "打开后人工审批",
    MANUAL_EXECUTION: "打开并记录人工执行",
    OBSERVATION: "查看观察要求",
    OUTCOME_REVIEW: "记录同口径执行结果",
    COMPLETED: "查看本轮复盘",
    COLLECT_EVIDENCE: "查看补采要求",
    NONE: "查看详情"
  }[kind];
}

function humanizeMetricName(value: string) {
  const labels: Record<string, string> = {
    orders: "成交订单",
    gmv: "成交金额",
    gpm: "千次观看成交金额",
    spend: "投放消耗",
    pay_roi: "支付 ROI",
    full_domain_pay_roi: "全域支付 ROI",
    live_viewers: "累计观看人数",
    impressions: "曝光量",
    ctr: "点击率",
    clicks: "商品点击"
  };
  return labels[value] || humanizeBusinessText(value);
}

function routeLabel(value: string) {
  const labels: Record<string, string> = {
    LOCAL_PROMOTION_DASHBOARD: "本地推经营数据",
    LIVE_DATA_SCREEN: "直播经营数据",
    LIVE_PRODUCT_TAB: "直播商品明细",
    LIVE_TRAFFIC_TAB: "直播流量明细",
    TASK_TABLE: "投放任务明细",
    ROUTE: "采集路线",
    METRIC: "经营指标",
    POLICY: "诊断门禁",
    TABLE_ROW: "明细数据",
    CASE: "案例"
  };
  return labels[value] || value;
}

function riskLabel(riskLevel: RiskLevel) {
  return riskLevel === "HIGH" ? "高" : riskLevel === "MEDIUM" ? "中" : "低";
}

function riskTone(riskLevel: RiskLevel) {
  if (riskLevel === "HIGH") return "bg-red-100 text-red-700";
  if (riskLevel === "MEDIUM") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-700";
}

function stageLabel(stage: string | null) {
  if (!stage) return "等待开始";
  if (stage === "QUEUED") return "已进入诊断队列";
  if (stage === "VERIFYING_EVIDENCE") return "正在重新核对证据指纹与时效";
  if (stage === "ORCHESTRATING_SKILLS") return "正在编排业务诊断 Skills";
  if (stage === "APPLYING_POLICY") return "正在执行规则安全裁决";
  if (stage === "COMPLETED") return "诊断完成";
  if (stage === "FAILED") return "诊断失败";
  if (stage.startsWith("SKILL:")) return `正在执行 ${skillLabel(stage.split(":")[1] || "")}`;
  return stage;
}

function skillLabel(skillId: string) {
  const labels: Record<string, string> = {
    audit_data_readiness: "数据就绪审计",
    diagnose_traffic_acquisition: "流量获取诊断",
    diagnose_live_room_conversion: "直播间承接诊断",
    diagnose_product_structure: "商品结构诊断",
    diagnose_delivery_units: "投流单元诊断",
    diagnose_activity_and_compliance: "活动权益与合规诊断",
    retrieve_similar_cases: "相似案例检索"
  };
  return labels[skillId] || skillId;
}

function skillStatusLabel(status: string) {
  return { PENDING: "等待", RUNNING: "运行中", SUCCEEDED: "已完成", FAILED: "失败", SKIPPED: "已跳过" }[status] || status;
}

function skillFailureMessage(execution: DecisionRun["skillExecutions"][number]) {
  if (execution.errorCode === "DIAGNOSIS_EVIDENCE_INVALID") {
    return `${skillLabel(execution.skillId)}引用了本次合法证据清单之外的指标，服务端已安全拦截；本次未生成任何建议。`;
  }
  if (execution.errorCode === "DIAGNOSIS_OUTPUT_INVALID") {
    return `${skillLabel(execution.skillId)}的结构化结果在一次修复后仍不合法，服务端已安全拦截。`;
  }
  return execution.errorMessage || `${skillLabel(execution.skillId)}未能完成。`;
}

function problemLabel(tag: string) {
  return { HEALTHY: "当前未发现明确异常", DATA_READINESS: "判断条件不足", TRAFFIC: "优先检查流量进入", LIVE_ROOM: "优先检查直播承接", PRODUCT: "优先检查商品与优惠", DELIVERY_ROI: "优先检查投放产出", ACTIVITY_COMPLIANCE: "优先处理活动、履约或合规风险", MULTI_FACTOR: "需要分两步验证" }[tag] || tag;
}
