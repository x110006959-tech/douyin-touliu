"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { RiskLevel } from "@douyin-local-life/shared";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { DecisionRun } from "./task-types";

type DiagnosisComparisonProps = {
  busy: string;
  decisionRun: DecisionRun | null;
  evidenceAdvisory: string | null;
  formalContent: ReactNode;
  formalReady: boolean;
  formalBlockingReasons: string[];
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
  formalBlockingReasons,
  onRunFormal,
  token,
  onRefresh
}: DiagnosisComparisonProps) {
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [mainProblemCorrect, setMainProblemCorrect] = useState(true);
  const [usefulnessScore, setUsefulnessScore] = useState(4);
  const [correctionNote, setCorrectionNote] = useState("");
  const [adoptedActionTypes, setAdoptedActionTypes] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const pending = decisionRun?.status === "PENDING" || decisionRun?.status === "RUNNING";
  const result = decisionRun?.finalResult || null;
  const pendingProposals = decisionRun?.actionProposals.filter((proposal) => proposal.status === "PENDING_APPROVAL") || [];
  const adoptableActions = result?.ruleAdjudication?.accepted.filter(
    (candidate, index, items) => items.findIndex((item) => item.actionType === candidate.actionType) === index
  ) || [];

  async function submitFeedback() {
    if (!decisionRun || !token) return;
    setFeedbackBusy(true);
    setFeedbackMessage("");
    try {
      await apiFetch(`/decision-runs/${decisionRun.id}/feedback`, token, {
        method: "POST",
        body: JSON.stringify({ mainProblemCorrect, usefulnessScore, adoptedActionTypes, correctionNote: correctionNote || null })
      });
      setFeedbackMessage("评价已保存，将用于案例筛选和离线版本评测。");
      onRefresh?.();
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "评价保存失败");
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function updateCaseStatus(status: "ELIGIBLE" | "EXCLUDED") {
    if (!decisionRun?.diagnosisCase || !token) return;
    setFeedbackBusy(true);
    setFeedbackMessage("");
    try {
      await apiFetch(`/diagnosis-cases/${decisionRun.diagnosisCase.id}/status`, token, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      setFeedbackMessage(status === "ELIGIBLE" ? "案例已人工纳入学习库。" : "案例已排除，不会参与检索。");
      onRefresh?.();
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "案例状态更新失败");
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

      {!formalReady ? (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <strong>AI 诊断尚未就绪</strong>
          <ul className="mt-2 list-disc space-y-1 pl-5">{formalBlockingReasons.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      ) : null}
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
          <p className="mt-2 text-sm">{decisionRun.errorMessage || "诊断未完成，请重新运行。"}</p>
          <p className="mt-1 text-xs text-muted">失败阶段：{stageLabel(decisionRun.currentStage)} · 错误码：{decisionRun.errorCode || "AI_DIAGNOSIS_FAILED"}</p>
          <p className="mt-3 text-xs text-muted">本次不会用规则模板冒充 AI 诊断成功，也不会创建动作建议。</p>
        </section>
      ) : null}

      {decisionRun?.status === "SUCCEEDED" && result ? (
        <div className="grid gap-4">
          <section className="rounded-lg border border-border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h4 className="font-semibold">核心结论</h4><p className="mt-2 text-base font-medium">{result.coreConclusion}</p></div>
              <div className="flex gap-2 text-xs"><span className={`rounded-full px-3 py-1 ${riskTone(decisionRun.riskLevel || "MEDIUM")}`}>{riskLabel(decisionRun.riskLevel || "MEDIUM")}风险</span><span className="rounded-full bg-slate-100 px-3 py-1">置信度 {Math.round(result.confidence * 100)}%</span></div>
            </div>
            <p className="mt-3 text-xs text-muted">主问题：{problemLabel(result.mainProblemTag)} · {decisionRun.provider}/{decisionRun.model}</p>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-semibold">事实快照</h4>
            <div className="mt-3 grid gap-2">{result.factSnapshot.map((fact, index) => <EvidenceStatement key={`${fact.statement}-${index}`} statement={fact.statement} evidenceIds={fact.evidenceIds} />)}</div>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-semibold">问题假设与反证</h4>
            <div className="mt-3 grid gap-3">{result.hypotheses.map((hypothesis) => (
              <div className="rounded-md border border-border p-3" key={hypothesis.id}>
                <div className="flex items-center justify-between gap-2"><strong className="text-sm">{hypothesis.title}</strong><span className="text-xs text-muted">{Math.round(hypothesis.confidence * 100)}%</span></div>
                <p className="mt-2 text-sm">{hypothesis.conclusion}</p>
                <EvidenceLinks label="支持证据" ids={hypothesis.supportingEvidenceIds} />
                <EvidenceLinks label="冲突证据" ids={hypothesis.conflictingEvidenceIds} />
                {hypothesis.missingEvidence.length ? <p className="mt-2 text-xs text-muted"><strong>缺失证据：</strong>{hypothesis.missingEvidence.join("；")}</p> : null}
              </div>
            ))}</div>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-semibold">验证实验与停止条件</h4>
            <div className="mt-3 grid gap-3">{result.experiments.map((experiment) => (
              <div className="rounded-md border border-border p-3" key={experiment.id}>
                <strong className="text-sm">{experiment.title}</strong>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{experiment.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                <p className="mt-2 text-xs"><strong>观察指标：</strong>{experiment.verifyMetrics.join("、")}</p>
                <p className="mt-1 text-xs text-muted"><strong>停止：</strong>{experiment.stopConditions.join("；")}</p>
                <EvidenceLinks label="依据" ids={experiment.evidenceIds} />
              </div>
            ))}</div>
            <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs"><strong>全局停止条件：</strong>{result.stopConditions.join("；")}</p>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-semibold">候选动作与规则裁决</h4>
            <div className="mt-3 grid gap-2">
              {result.ruleAdjudication?.accepted.map((candidate) => (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3" key={`${candidate.actionType}-${candidate.title}`}><strong className="text-sm">已通过：{candidate.title}</strong><p className="mt-1 text-xs text-muted">{candidate.reason}</p><EvidenceLinks label="依据" ids={candidate.evidenceIds} /></div>
              ))}
              {result.ruleAdjudication?.rejected.map((item) => (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3" key={`${item.reasonCode}-${item.candidate.title}`}><strong className="text-sm">已拒绝：{item.candidate.title}</strong><p className="mt-1 text-xs text-muted">{item.reason}</p></div>
              ))}
              {result.ruleAdjudication?.lifecycleSuppressed?.map((item) => (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3" key={`${item.reason}-${item.actionType}`}><strong className="text-sm">生命周期暂缓：{item.actionType}</strong><p className="mt-1 text-xs text-muted">{item.reason === "COOLDOWN" ? "同类建议仍在冷却期或已有活动建议" : "项目本小时强动作额度已满"}</p></div>
              ))}
            </div>
            <div className="mt-4"><h5 className="text-sm font-semibold">待人工审批动作（{pendingProposals.length}）</h5>{pendingProposals.length ? <div className="mt-2 grid gap-2">{pendingProposals.map((proposal) => <Link className="rounded-md border border-border p-3 transition hover:border-primary hover:bg-blue-50" href={`/action-proposals/${proposal.id}`} key={proposal.id}><strong className="text-sm">{proposal.title}</strong><p className="mt-1 text-xs text-muted">{proposal.reason}</p></Link>)}</div> : <p className="mt-2 text-sm text-muted">本轮没有候选动作通过完整安全与生命周期裁决。</p>}</div>
          </section>

          <section className="rounded-lg border border-border bg-white p-4">
            <h4 className="font-semibold">证据目录</h4>
            <div className="mt-3 grid gap-2">{result.evidenceCatalog?.map((evidence) => <div className="scroll-mt-24 rounded-md bg-slate-50 p-3 text-sm" id={evidenceDomId(evidence.id)} key={evidence.id}><strong>{evidence.label}</strong><p className="mt-1 break-words text-xs text-muted">{String(evidence.value)} · {evidence.routeKey || evidence.kind}</p><code className="mt-1 block break-all text-[11px] text-slate-500">{evidence.id}</code></div>)}</div>
          </section>

          <section className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
            <h4 className="font-semibold">诊断评价与案例库</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className="mb-1 block font-medium">主问题是否正确</span><select className="h-10 w-full rounded-md border border-border bg-white px-3" value={mainProblemCorrect ? "yes" : "no"} onChange={(event) => setMainProblemCorrect(event.target.value === "yes")}><option value="yes">正确</option><option value="no">不正确</option></select></label>
              <label className="text-sm"><span className="mb-1 block font-medium">有用度</span><select className="h-10 w-full rounded-md border border-border bg-white px-3" value={usefulnessScore} onChange={(event) => setUsefulnessScore(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((score) => <option value={score} key={score}>{score} 分</option>)}</select></label>
            </div>
            {adoptableActions.length ? (
              <fieldset className="mt-3 rounded-md border border-violet-200 bg-white p-3">
                <legend className="px-1 text-sm font-medium">已采纳建议（可多选）</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {adoptableActions.map((candidate) => (
                    <label className="flex items-start gap-2 text-sm" key={candidate.actionType}>
                      <input
                        checked={adoptedActionTypes.includes(candidate.actionType)}
                        className="mt-0.5 h-4 w-4"
                        onChange={(event) => setAdoptedActionTypes((current) => event.target.checked
                          ? [...current, candidate.actionType]
                          : current.filter((item) => item !== candidate.actionType))}
                        type="checkbox"
                      />
                      <span>{candidate.title}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <label className="mt-3 block text-sm"><span className="mb-1 block font-medium">纠错说明（选填）</span><textarea className="min-h-24 w-full rounded-md border border-border bg-white p-3" maxLength={2000} value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} /></label>
            <div className="mt-3 flex flex-wrap gap-2"><Button disabled={feedbackBusy || !token} onClick={() => void submitFeedback()} type="button">保存评价</Button>{decisionRun.diagnosisCase ? <><Button className="border-border bg-white text-foreground" disabled={feedbackBusy || !token} onClick={() => void updateCaseStatus("ELIGIBLE")} type="button">人工纳入案例库</Button><Button className="border-border bg-white text-foreground" disabled={feedbackBusy || !token} onClick={() => void updateCaseStatus("EXCLUDED")} type="button">排除案例</Button></> : null}</div>
            {feedbackMessage ? <p className="mt-3 text-sm text-muted">{feedbackMessage}</p> : null}
            <p className="mt-2 text-xs text-muted">Outcome 和评价只进入案例与离线评测，不会在线自动修改 Prompt、规则或 Skill。</p>
          </section>
        </div>
      ) : null}
    </article>
  );
}

function EvidenceStatement({ statement, evidenceIds }: { statement: string; evidenceIds: string[] }) {
  return <div className="rounded-md bg-slate-50 p-3 text-sm"><p>{statement}</p><EvidenceLinks label="证据" ids={evidenceIds} /></div>;
}

function EvidenceLinks({ label, ids }: { label: string; ids: string[] }) {
  if (!ids.length) return null;
  return <p className="mt-2 text-xs"><strong>{label}：</strong>{ids.map((id, index) => <span key={id}>{index ? "、" : ""}<a className="text-primary underline" href={`#${evidenceDomId(id)}`}>{id}</a></span>)}</p>;
}

function evidenceDomId(value: string) {
  return `evidence-${value.replace(/[^A-Za-z0-9_-]/g, "-")}`;
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

function problemLabel(tag: string) {
  return { HEALTHY: "健康基线", DATA_READINESS: "数据就绪", TRAFFIC: "流量获取", LIVE_ROOM: "直播承接", PRODUCT: "商品结构", DELIVERY_ROI: "投流单元/ROI", ACTIVITY_COMPLIANCE: "活动权益/合规", MULTI_FACTOR: "多因素" }[tag] || tag;
}
