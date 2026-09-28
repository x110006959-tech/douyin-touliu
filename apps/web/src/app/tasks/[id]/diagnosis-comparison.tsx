"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { DiagnosisScenario, RiskLevel } from "@douyin-local-life/shared";
import type { DiagnosisTrustedFactsView } from "@douyin-local-life/shared/diagnosis";
import { apiFetch } from "@/lib/api";
import { diagnosisExperimentFailureReason, humanizeBusinessText, humanizeDiagnosisFailure, summarizeDecisionBoundaries } from "@/lib/diagnosis-presentation";
import { buildTrustedBusinessInterpretation } from "@/lib/diagnosis-insights";
import { Button } from "@/components/ui/button";
import type { DecisionRun } from "./task-types";

type DiagnosisComparisonProps = {
  busy: string;
  decisionRun: DecisionRun | null;
  evidenceAdvisory: string | null;
  formalContent: ReactNode;
  formalReady: boolean;
  onRunFormal: (scenario: DiagnosisScenario) => void;
  scenario?: DiagnosisScenario;
  onScenarioChange?: (scenario: DiagnosisScenario) => void;
  token?: string | null;
  onRefresh?: () => void;
  creditBalance?: number;
};

export function DiagnosisComparison({
  busy,
  decisionRun,
  evidenceAdvisory,
  formalContent,
  formalReady,
  onRunFormal,
  scenario: selectedScenario,
  onScenarioChange,
  token,
  onRefresh,
  creditBalance = 0
}: DiagnosisComparisonProps) {
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [mainProblemCorrect, setMainProblemCorrect] = useState(true);
  const [usefulnessScore, setUsefulnessScore] = useState(4);
  const [correctionNote, setCorrectionNote] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [localScenario, setLocalScenario] = useState<DiagnosisScenario>("UNSPECIFIED");
  const scenario = selectedScenario ?? localScenario;
  const setScenario = onScenarioChange ?? setLocalScenario;
  const pending = decisionRun?.status === "PENDING" || decisionRun?.status === "RUNNING";
  const result = decisionRun?.finalResult || null;
  const deterministicReview = decisionRun?.deterministicReview || null;
  const decisionView = deterministicReview ? null : decisionRun?.decisionView || null;
  const trustedFacts = decisionRun?.trustedFacts || null;
  const trustedInterpretation = trustedFacts ? buildTrustedBusinessInterpretation(trustedFacts) : null;
  const visibleAnalysis = deterministicReview ? [] : decisionView?.analysis || [];
  const failureRuleDetail = diagnosisFailureRuleDetail(decisionRun?.errorCode, decisionRun?.errorMessage);
  const failedSkillExecution = decisionRun?.skillExecutions.find((execution) => execution.status === "FAILED") || null;
  const pendingProposals = deterministicReview
    ? []
    : decisionRun?.actionProposals.filter((proposal) => proposal.status === "PENDING_APPROVAL") || [];
  const visibleFacts = trustedFacts?.facts.slice(0, 5) || decisionView?.facts.slice(0, 5) || result?.factSnapshot.slice(0, 5) || [];
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
  const decisionBoundaries = summarizeDecisionBoundaries(decisionView?.openQuestions || [
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
          <p className="text-sm text-muted">服务端先确认事实和判断边界，再由 AI 综合分析；所有通过动作仍需人工审批和执行。</p>
          <label className="mt-3 flex max-w-xl flex-col gap-1 text-xs text-muted sm:flex-row sm:items-center">
            <span className="shrink-0 font-medium text-foreground">本次使用场景</span>
            <select disabled={Boolean(busy) || pending} className="h-9 rounded-md border border-border bg-white px-2 text-sm text-foreground" onChange={(event) => { const value = event.target.value; if (value === "UNSPECIFIED" || value === "LIVE_MONITORING" || value === "POST_LIVE_REVIEW") setScenario(value); }} value={scenario}>
              <option value="UNSPECIFIED">未指定</option>
              <option value="LIVE_MONITORING">直播中</option>
              <option value="POST_LIVE_REVIEW">场后复盘</option>
            </select>
            <span>切换后用于下一次诊断，不改变已生成的结果，也不证明实际开播或下播。</span>
          </label>
          <p className="mt-2 max-w-2xl text-xs text-muted">{scenario === "LIVE_MONITORING"
            ? "直播中：先检查风险与当前承接，再比较近期产出，明确下一观察窗口的核对问题。"
            : scenario === "POST_LIVE_REVIEW"
              ? "场后复盘：先复核已采集范围内的投放结果，再分析商品与承接，聚焦下一场的一个验证问题。"
              : "未指定：按当前可用证据诊断，不预设直播阶段。"}</p>
        </div>
        <Button
          className="shrink-0"
          disabled={!formalReady || Boolean(busy) || pending || creditBalance <= 0}
          onClick={() => onRunFormal(scenario)}
          title={formalReady ? "创建异步 AI 诊断" : "请先完成基础路线采集和人工复核"}
          type="button"
        >
          {pending ? "AI 诊断运行中..." : decisionRun?.mode === "AI_SKILL_ORCHESTRATED" ? "重新运行 AI 诊断（1 积分）" : "运行 AI 诊断（1 积分）"}
        </Button>
      </div>

      {creditBalance <= 0 && !pending ? <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">积分不足，当前不能创建新的 AI 诊断。</div> : null}

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
          {failureRuleDetail ? <p className="mt-1 text-xs text-muted"><strong>规则检查：</strong>{failureRuleDetail}</p> : null}
          <p className="mt-3 text-xs text-muted">{trustedFacts ? "事实已确认，AI 建议未完成。" : "AI 建议未完成，旧记录没有可独立验证的事实输入。"}本次不会创建动作建议。</p>
        </section>
      ) : null}

      {trustedFacts && decisionRun?.status === "FAILED" ? <TrustedFactsPanel facts={trustedFacts} failed /> : null}
      {trustedFacts && decisionRun?.status === "SUCCEEDED" ? <details className="mb-4 rounded-lg border border-border bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">查看本次已确认事实与数据口径</summary>
        <div className="mt-3"><TrustedFactsPanel facts={trustedFacts} failed={false} /></div>
      </details> : null}

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
                <h4 className="mt-1 text-lg font-semibold">{deterministicReview ? problemLabel(deterministicReview.expectedMainProblemTag) : decisionView?.headline || problemLabel(result.mainProblemTag)}</h4>
                <p className="mt-2 leading-7">{humanizeBusinessText(deterministicReview?.conclusion || decisionView?.conclusion || result.coreConclusion)}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">目标、趋势和原因分别展示</span>
                {decisionView?.actionRisk ? <span className={`rounded-full px-3 py-1 font-semibold ${riskTone(decisionView.actionRisk)}`}>下一步动作风险 {riskLabel(decisionView.actionRisk)}</span> : null}
              </div>
            </div>
            {decisionView?.targetComparison && !trustedInterpretation?.insights.some((item) => item.key === "target") ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <MetricFact label="实际全域支付 ROI" value={formatNumber(decisionView.targetComparison.actual)} />
                <MetricFact label="本次目标 ROI" value={formatNumber(decisionView.targetComparison.target)} />
                <MetricFact label={decisionView.targetComparison.absoluteGap === 0 ? "等于目标" : decisionView.targetComparison.status === "MET" ? "高于目标" : "低于目标"} value={formatNumber(Math.abs(decisionView.targetComparison.absoluteGap))} />
                <MetricFact label="目标达成率" value={`${Math.round(decisionView.targetComparison.achievementRate * 1000) / 10}%`} />
              </div>
            ) : null}
          </section>

          {trustedInterpretation?.insights.length ? (
            <section className="border-t border-border py-4">
              <h4 className="font-semibold">这组数据能直接说明什么</h4>
              <p className="mt-1 text-xs text-muted">目标差距与近期变化分别核对，原因仍待验证。</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {trustedInterpretation.insights.map((insight) => (
                  <div className={`rounded-md p-4 ${insight.tone === "positive" ? "bg-emerald-50" : insight.tone === "warning" ? "bg-amber-50" : "bg-slate-50"}`} key={insight.key}>
                    <p className="text-xs font-semibold text-muted">{insight.title}</p>
                    <strong className="mt-1 block text-base">{insight.value}</strong>
                    <p className="mt-2 text-sm leading-6 text-muted">{insight.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <NextStepPanel decisionView={decisionView} pendingProposals={pendingProposals} reviewConflict={Boolean(deterministicReview)} />

          {!deterministicReview ? (
            <section className="border-t border-border py-4">
              <h4 className="font-semibold">{trustedFacts?.scenario === "POST_LIVE_REVIEW" ? "本次直播复盘分析" : trustedFacts?.scenario === "LIVE_MONITORING" ? "当前直播分析" : "本次经营分析"}</h4>
              <p className="mt-1 text-xs text-muted">原因假设，尚未验证；操作以“今天先做什么”的审批状态为准。</p>
              {visibleAnalysis.length ? <div className="mt-3 divide-y divide-border">
                {visibleAnalysis.map((item, index) => <div className="min-w-0 break-words py-4" key={`${item.title}-${index}`}>
                  <h5 className="font-semibold">{humanizeBusinessText(item.title)}</h5>
                  <p className="mt-2 text-sm leading-7">{humanizeBusinessText(item.conclusion)}</p>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-medium text-primary">证据与待核对项</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div><strong>数据依据</strong><ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{item.supportingFacts.map((fact, factIndex) => <li key={factIndex}>{humanizeBusinessText(fact)}</li>)}</ul></div>
                      <div><strong>还需核对</strong>{item.missingEvidence.length ? <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{item.missingEvidence.map((missing, missingIndex) => <li key={missingIndex}>{humanizeBusinessText(missing)}</li>)}</ul> : <p className="mt-1 text-muted">该解释尚未经过对照验证，不能据此认定因果或直接调整。</p>}</div>
                    </div>
                    {item.conflictingFacts.length ? <div className="mt-3"><strong>相反证据</strong><ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{item.conflictingFacts.map((fact, factIndex) => <li key={factIndex}>{humanizeBusinessText(fact)}</li>)}</ul></div> : null}
                  </details>
                </div>)}
              </div> : <p className="mt-3 text-sm text-muted">本次尚无可展示的有据原因分析。已确认的事实仍然有效，不能用这些数字代替原因判断。</p>}
            </section>
          ) : null}

          {decisionRun.historyContext ? <HistoryComparisonSummary context={decisionRun.historyContext} /> : null}

          {!trustedFacts ? <section className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-semibold">这组数据已经说明什么</h4>
            <p className="mt-1 text-xs text-muted">这里只列本轮采集能直接确认的经营事实，不展示内部证据编号。</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {visibleFacts.map((fact, index) => (
                <div className="rounded-md bg-slate-50 p-3 text-sm" key={`${fact.statement}-${index}`}>
                  {humanizeBusinessText(fact.statement)}
                </div>
              ))}
            </div>
          </section> : null}

            <section className="border-t border-border py-4">
              <h4 className="font-semibold">作决定前还缺什么</h4>
              <p className="mt-1 text-xs text-muted">缺少这些条件时，系统只给验证建议，不把示例数字当作行业标准。</p>
              {decisionBoundaries.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
                  {decisionBoundaries.map((item) => <li key={item}>{humanizeBusinessText(item)}</li>)}
                </ul>
              ) : <p className="mt-3 text-sm text-muted">本轮未记录关键缺口，不代表所有原因均已确认。</p>}
            </section>

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

function HistoryComparisonSummary({ context }: { context: NonNullable<DecisionRun["historyContext"]> }) {
  const comparisons = [context.archiveComparison, context.periodComparison];
  const hasComparableData = comparisons.some((comparison) => comparison.rows.some((row) =>
    row.conclusion !== "INSUFFICIENT" && row.baselineValue !== null && row.currentValue !== null
  ));
  if (!hasComparableData) {
    return <details className="border-t border-border py-3">
      <summary className="cursor-pointer text-sm text-muted">历史与周期对比：暂无可比数据</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        {[...new Set(comparisons.flatMap((comparison) => comparison.notices))].map((notice) => <li key={notice}>{humanizeBusinessText(notice)}</li>)}
      </ul>
    </details>;
  }
  return (
    <section className="rounded-lg border border-violet-200 bg-white p-4">
      <h4 className="font-semibold">历史与周期对比</h4>
      <p className="mt-1 text-xs text-muted">由服务端按同一项目、同一路线和同口径数据计算，不会额外调用 AI，也不会自动执行投放操作。</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <HistorySummaryCard comparison={context.archiveComparison} />
        <HistorySummaryCard comparison={context.periodComparison} />
      </div>
    </section>
  );
}

function NextStepPanel({ decisionView, pendingProposals, reviewConflict }: {
  decisionView: DecisionRun["decisionView"];
  pendingProposals: DecisionRun["actionProposals"];
  reviewConflict: boolean;
}) {
  return <section className="border-t border-border py-4">
    <h4 className="font-semibold">今天先做什么</h4>
    <p className="mt-1 text-xs text-muted">只展示服务端规则允许推进的唯一下一步，并保留审批、人工执行和复盘状态。</p>
    {reviewConflict ? (
      <p className="mt-3 text-sm">本轮 AI 核心结论与服务端证据冲突，所有候选动作已暂停，不进入人工审批。</p>
    ) : decisionView ? (
      decisionView.nextStep.proposalId ? (
        <Link className="mt-3 block break-words rounded-md border border-emerald-200 bg-emerald-50 p-3 transition hover:border-primary" href={`/action-proposals/${decisionView.nextStep.proposalId}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-emerald-800">{nextStepLabel(decisionView.nextStep.kind)}</span>
            <strong className="text-sm">{humanizeBusinessText(decisionView.nextStep.title)}</strong>
          </div>
          <p className="mt-2 text-sm text-muted">{humanizeBusinessText(decisionView.nextStep.reason)}</p>
          <p className="mt-2 text-xs font-semibold text-primary">{nextStepCta(decisionView.nextStep.kind)} →</p>
        </Link>
      ) : (
        <div className="mt-3 break-words text-sm">
          <strong>{humanizeBusinessText(decisionView.nextStep.title)}</strong>
          <p className="mt-1 text-muted">{humanizeBusinessText(decisionView.nextStep.reason)}</p>
        </div>
      )
    ) : pendingProposals.length ? (
      <div className="mt-3 grid gap-2">
        {pendingProposals.map((proposal, index) => (
          <Link className="break-words rounded-md border border-emerald-200 bg-emerald-50 p-3 transition hover:border-primary" href={`/action-proposals/${proposal.id}`} key={proposal.id}>
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-emerald-800">第 {index + 1} 项</span><strong className="text-sm">{humanizeBusinessText(proposal.title)}</strong></div>
            <p className="mt-2 text-sm text-muted">{humanizeBusinessText(proposal.reason)}</p>
            <p className="mt-2 text-xs font-semibold text-primary">打开后人工审批 →</p>
          </Link>
        ))}
      </div>
    ) : (
      <p className="mt-3 text-sm">本轮没有新的待审批动作。先保持当前设置，补齐判断条件后再诊断，不要仅凭一次快照改预算或停计划。</p>
    )}
  </section>;
}

function TrustedFactsPanel({ facts, failed }: { facts: DiagnosisTrustedFactsView; failed: boolean }) {
  return (
    <section className={`grid gap-4 rounded-lg border bg-white p-4 ${failed ? "border-amber-300" : "border-blue-200"}`}>
      <div>
        <h4 className="font-semibold">{failed ? "已确认的可信事实" : "服务端确认的事实与判断边界"}</h4>
        <p className="mt-1 text-xs text-muted">这部分由已复核的数据直接计算，即使 AI 未完成也会保留；不包含任何未通过校验的模型建议。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <TrustedFactStatus label="目标是否达成" summary={facts.target.message} tone={facts.target.status === "MET" ? "bg-emerald-50" : facts.target.status === "BELOW_TARGET" ? "bg-amber-50" : "bg-slate-50"} />
        <TrustedFactStatus label="趋势能否判断" summary={facts.trend.summary} tone={facts.trend.status === "AVAILABLE" ? "bg-blue-50" : "bg-slate-50"} />
        <TrustedFactStatus label="原因是否确认" summary={facts.cause.message} tone="bg-slate-50" />
      </div>
      {facts.trend.recentTrend?.status === "AVAILABLE" ? (
        <div className="rounded-md bg-violet-50 p-3 text-sm">
          <strong>最近两个完整 15 分钟窗口</strong>
          <p className="mt-2 text-xs text-muted">前窗：{formatComparableTime(facts.trend.recentTrend.baselineStartAt)} 至 {formatComparableTime(facts.trend.recentTrend.baselineEndAt)}</p>
          <p className="mt-1 text-xs text-muted">后窗：{formatComparableTime(facts.trend.recentTrend.currentStartAt)} 至 {formatComparableTime(facts.trend.recentTrend.currentEndAt)}</p>
          <p className="mt-1 text-xs text-muted">来源：{routeLabel(facts.trend.recentTrend.routeKey || "")}；{facts.trend.recentTrend.scope === "FULL_DOMAIN" ? "全域口径" : "普通支付口径"}。以下为窗口增量。</p>
          {facts.trend.recentTrend.metrics.map((metric) => (
            <p className="mt-2" key={metric.metricKey}>{metric.metricName}：{formatNumber(metric.baselineValue)} → {formatNumber(metric.currentValue)} {metric.unit || ""}</p>
          ))}
          {facts.trend.recentTrend.efficiency ? (
            <p className="mt-2">{facts.trend.recentTrend.efficiency.metricLabel}：{formatNumber(facts.trend.recentTrend.efficiency.baselineValue)} → {formatNumber(facts.trend.recentTrend.efficiency.currentValue)}</p>
          ) : <p className="mt-2">存在零消耗窗口，区间产出比未知。</p>}
        </div>
      ) : null}
      {facts.metricGroups.length ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {facts.metricGroups.map((group) => (
            <div className="rounded-md border border-border p-3" key={group.id}>
              <strong className="text-sm">{group.label}</strong>
              <p className="mt-1 text-xs text-muted">来源：{group.sourceLabel}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {group.metrics.map((metric) => (
                  <div key={`${group.id}-${metric.metricKey}`}>
                    <MetricFact label={metric.metricLabel} value={`${formatNumber(metric.value)}${metric.unit || ""}`} />
                    <p className="mt-1 text-xs text-muted">期间：{metric.observationPeriod || "未知"}；口径：{metric.semanticScope || "未单独标注"}；采集：{formatComparableTime(metric.capturedAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : <p className="rounded-md bg-slate-50 p-3 text-sm text-muted">本次没有可展示的同口径指标组；请先检查已复核的采集数据。</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md bg-slate-50 p-3 text-sm"><strong>数据新鲜度</strong><p className="mt-1 text-muted">{facts.dataFreshness.summary}</p></div>
        <div className="rounded-md bg-blue-50 p-3 text-sm"><strong>{facts.nextCheck.title}</strong><p className="mt-1 text-muted">{facts.nextCheck.detail}</p></div>
      </div>
    </section>
  );
}

function TrustedFactStatus({ label, summary, tone }: { label: string; summary: string; tone: string }) {
  return <div className={`rounded-md p-3 text-sm ${tone}`}><strong>{label}</strong><p className="mt-2 leading-6 text-muted">{humanizeBusinessText(summary)}</p></div>;
}

function HistorySummaryCard({ comparison }: { comparison: NonNullable<DecisionRun["historyContext"]>["archiveComparison"] }) {
  const statusLabel = {
    IMPROVED: "可比区间效率改善",
    WORSENED: "可比区间效率走弱",
    NO_CHANGE: "可比指标无明显变化",
    MIXED: "表现分化",
    INSUFFICIENT: "暂不能判断"
  }[comparison.status];
  const sortedRows = [...comparison.rows].sort((left, right) => historyMetricPriority(left.metricKey) - historyMetricPriority(right.metricKey));
  const preferredKeys = [["full_domain_pay_roi", "pay_roi"], ["full_domain_gmv", "gmv"], ["spend"], ["full_domain_orders", "orders"]];
  const preferredRows = preferredKeys.flatMap((keys) => {
    const row = sortedRows.find((item) => keys.includes(item.metricKey));
    return row ? [row] : [];
  });
  const rows = [...preferredRows, ...sortedRows.filter((row) => !preferredRows.includes(row))].slice(0, 4);
  return <div className="rounded-md bg-violet-50 p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{comparison.label}</strong><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-violet-700">{statusLabel}</span></div>
    <p className="mt-2 text-xs text-muted">{comparison.notices[0] || "暂无可比结论"}</p>
    <p className="mt-2 text-xs text-muted">比较时点：{comparison.baselineLabel}（{formatComparableTime(comparison.baselineAt)}）→ {comparison.currentLabel}（{formatComparableTime(comparison.currentAt)}）</p>
    {rows.map((row) => <div className="mt-2 rounded bg-white/70 p-2 text-xs" key={`${row.routeKey}-${row.metricKey}-${row.metricName}`}><div className="flex items-center justify-between gap-2"><span>{row.metricName}</span><span>{formatNumber(row.baselineValue)} → {formatNumber(row.currentValue)}</span></div><p className="mt-1 text-muted">{routeLabel(row.routeKey)}；{row.note}</p></div>)}
  </div>;
}

function historyMetricPriority(metricKey: string) {
  const keys = ["full_domain_pay_roi", "pay_roi", "full_domain_gmv", "gmv", "spend", "full_domain_orders", "orders"];
  const index = keys.indexOf(metricKey);
  return index === -1 ? keys.length : index;
}

function formatComparableTime(value: string | null) {
  if (!value) return "未知";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString("zh-CN", { hour12: false }) : "未知";
}

type NextStepKind = NonNullable<DecisionRun["decisionView"]>["nextStep"]["kind"];

function MetricFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-blue-50 p-3"><p className="text-xs text-muted">{label}</p><strong className="mt-1 block text-base">{value}</strong></div>;
}

function formatNumber(value: number | null) {
  if (value == null) return "—";
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
    full_domain_gmv: "全域成交金额",
    full_domain_orders: "全域成交订单数",
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

function stageLabel(stage: string | null): string {
  if (!stage) return "等待开始";
  if (stage === "QUEUED") return "已进入诊断队列";
  if (stage === "VERIFYING_EVIDENCE") return "正在重新核对证据指纹与时效";
  if (stage === "ORCHESTRATING_SKILLS") return "正在编排业务诊断 Skills";
  if (stage === "SYNTHESIZING_JUDGMENT") return "正在综合事实、趋势与判断边界";
  if (stage === "SYNTHESIZING_ACTION_PLAN") return "正在生成唯一行动方案并校验风险条件";
  if (stage === "APPLYING_POLICY") return "正在执行规则安全裁决";
  if (stage === "COMPLETED") return "诊断完成";
  if (stage === "FAILED") return "诊断失败";
  if (stage.startsWith("FAILED:")) return `在${stageLabel(stage.slice("FAILED:".length))}时失败`;
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
  const experimentFailure = diagnosisExperimentFailureReason(execution.errorMessage);
  if (experimentFailure) return `${skillLabel(execution.skillId)}：${experimentFailure}`;
  if (execution.errorCode === "DIAGNOSIS_EVIDENCE_INVALID") {
    return `${skillLabel(execution.skillId)}引用了本次合法证据清单之外的指标，服务端已安全拦截；本次未生成任何建议。`;
  }
  if (execution.errorCode === "DIAGNOSIS_OUTPUT_INVALID") {
    return `${skillLabel(execution.skillId)}的结构化结果在一次修复后仍不合法，服务端已安全拦截。`;
  }
  return `${skillLabel(execution.skillId)}：${diagnosisFailureRuleDetail(execution.errorCode, execution.errorMessage) || "未能完成本阶段。"}`;
}

function diagnosisFailureRuleDetail(errorCode?: string | null, errorMessage?: string | null) {
  const category = errorMessage?.includes("DIAGNOSIS_EXPERIMENT_INVALID") || errorCode === "DIAGNOSIS_EXPERIMENT_INVALID"
    ? "实验、动作关联或风险止损条件未通过服务端校验"
    : errorMessage?.includes("DIAGNOSIS_EVIDENCE_INVALID") || errorCode === "DIAGNOSIS_EVIDENCE_INVALID"
      ? "引用的证据不在本轮可信数据目录中"
      : errorMessage?.includes("DIAGNOSIS_DETERMINISTIC_CONFLICT")
        ? "AI 结论与服务端已确认的事实冲突"
        : errorMessage?.includes("DIAGNOSIS_BENCHMARK_UNSUPPORTED")
          ? "AI 使用了本轮证据无法支持的比较或阈值"
          : errorCode === "DIAGNOSIS_OUTPUT_INVALID"
            ? "AI 输出未通过一次结构修正后的服务端校验"
            : errorCode === "AI_DIAGNOSIS_FAILED"
              ? "模型请求或响应未能完成，未保存任何建议"
              : null;
  if (!category) return null;
  const paths = [...new Set(
    Array.from(errorMessage?.matchAll(/\b(?:experiments|candidateActions|factSnapshot|hypotheses|missingEvidence)(?:\.\d+(?:\.[A-Za-z]+|\.\d+)*)?/g) || [])
      .map((item) => item[0])
  )].slice(0, 3);
  return paths.length ? `${category}；校验位置：${paths.join("、")}` : category;
}

function problemLabel(tag: string) {
  return { HEALTHY: "当前未发现明确异常", DATA_READINESS: "判断条件不足", TRAFFIC: "优先检查流量进入", LIVE_ROOM: "优先检查直播承接", PRODUCT: "优先检查商品与优惠", DELIVERY_ROI: "优先检查投放产出", ACTIVITY_COMPLIANCE: "优先处理活动、履约或合规风险", MULTI_FACTOR: "需要分两步验证" }[tag] || tag;
}
