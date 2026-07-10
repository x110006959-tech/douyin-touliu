"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  actionProposalStatusLabels,
  actionOutcomeResultLabels,
  actionTypeLabels,
  aiDisclaimer,
  approvalDecisionLabels,
  executionModeLabels,
  executionStatusLabels,
  observationWindowLabels,
  type ActionOutcomeResult,
  type ActionProposalStatus,
  type ActionType,
  type ApprovalDecision,
  type ExecutionMode,
  type ExecutionStatus,
  type ObservationWindow,
  type RiskLevel
} from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { apiFetch, createIdempotencyKey } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

type ActionProposalDetail = {
  id: string;
  projectId: string;
  collectionTaskId: string;
  decisionRunId: string;
  actionType: ActionType;
  title: string;
  summary: string | null;
  reason: string;
  expectedImpact: string | null;
  riskLevel: RiskLevel;
  confidence: number;
  requiresApproval: boolean;
  blockedReason: string | null;
  status: ActionProposalStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  observedAt: string | null;
  manualExecutedAt: string | null;
  project: { id: string; name: string };
  collectionTask: { id: string; pageTitle: string | null; sourceUrl: string | null };
  decisionRun: { id: string; diagnosis: string; riskLevel: RiskLevel; confidence: number; strategyVersion: string; createdAt: string };
  approvalRecords: Array<{ id: string; decision: ApprovalDecision; comment: string | null; createdAt: string }>;
  executionLogs: Array<{ id: string; mode: ExecutionMode; status: ExecutionStatus; note: string | null; createdAt: string }>;
};

type ActionOutcomeDetail = {
  id: string;
  actionProposalId: string;
  observationWindow: ObservationWindow;
  customWindow: string | null;
  beforeMetrics?: unknown;
  afterMetrics?: unknown;
  result: ActionOutcomeResult;
  note: string | null;
  conclusion: string | null;
  createdAt: string;
};

export default function ActionProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [proposal, setProposal] = useState<ActionProposalDetail | null>(null);
  const [outcomes, setOutcomes] = useState<ActionOutcomeDetail[]>([]);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [outcomeWindow, setOutcomeWindow] = useState<ObservationWindow>("30m");
  const [customWindow, setCustomWindow] = useState("");
  const [outcomeResult, setOutcomeResult] = useState<ActionOutcomeResult>("UNCLEAR");
  const [beforeMetricsJson, setBeforeMetricsJson] = useState("");
  const [afterMetricsJson, setAfterMetricsJson] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [outcomeConclusion, setOutcomeConclusion] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function load() {
    if (!token) return;
    setError("");
    Promise.all([
      apiFetch<ActionProposalDetail>(`/action-proposals/${params.id}`, token),
      apiFetch<ActionOutcomeDetail[]>(`/action-proposals/${params.id}/outcomes`, token)
    ])
      .then(([detail, latestOutcomes]) => {
        setProposal(detail);
        setOutcomes(latestOutcomes);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "读取动作建议失败"));
  }

  useEffect(load, [token, params.id]);

  async function submitAction(path: "approve" | "reject" | "observe") {
    if (!token || !proposal) return;
    setBusy(path);
    setError("");
    try {
      const updated = await apiFetch<ActionProposalDetail>(`/action-proposals/${proposal.id}/${path}`, token, {
        method: "POST",
        body: JSON.stringify({ comment })
      });
      setProposal(updated);
      setComment("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "状态更新失败");
    } finally {
      setBusy("");
    }
  }

  async function markManualExecuted(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !proposal) return;
    setBusy("manual");
    setError("");
    try {
      const updated = await apiFetch<ActionProposalDetail>(`/action-proposals/${proposal.id}/mark-manual-executed`, token, {
        method: "POST",
        body: JSON.stringify({ note })
      });
      setProposal(updated);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "人工执行记录失败");
    } finally {
      setBusy("");
    }
  }

  async function submitOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !proposal) return;
    setBusy("outcome");
    setError("");
    try {
      const beforeMetrics = parseOptionalJson(beforeMetricsJson, "执行前指标");
      const afterMetrics = parseOptionalJson(afterMetricsJson, "执行后指标");
      const created = await apiFetch<ActionOutcomeDetail>(`/action-proposals/${proposal.id}/outcomes`, token, {
        method: "POST",
        headers: { "idempotency-key": createIdempotencyKey(`outcome:${proposal.id}`) },
        body: JSON.stringify({
          observationWindow: outcomeWindow,
          customWindow: outcomeWindow === "custom" ? customWindow : null,
          beforeMetrics,
          afterMetrics,
          result: outcomeResult,
          note: outcomeNote,
          conclusion: outcomeConclusion
        })
      });
      setOutcomes((current) => [created, ...current]);
      setOutcomeWindow("30m");
      setCustomWindow("");
      setOutcomeResult("UNCLEAR");
      setBeforeMetricsJson("");
      setAfterMetricsJson("");
      setOutcomeNote("");
      setOutcomeConclusion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "执行后复盘记录失败");
    } finally {
      setBusy("");
    }
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardTitle>请先登录</CardTitle>
          <Link className="text-primary" href="/login">
            前往登录页
          </Link>
        </Card>
      </main>
    );
  }

  if (!proposal) {
    return <main className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted">{error || "加载中..."}</main>;
  }

  const isPending = proposal.status === "PENDING_APPROVAL";
  const canMarkManualExecuted = proposal.status === "APPROVED";
  const canCreateOutcome = proposal.status === "MANUAL_EXECUTED";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm text-primary" href="/decision-center">
            返回决策中心
          </Link>
          <h1 className="mt-3 text-3xl font-bold">{proposal.title}</h1>
          <p className="text-sm text-muted">
            {proposal.project.name} / {proposal.collectionTask.pageTitle || proposal.collectionTask.sourceUrl || proposal.collectionTask.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border border-border px-2 py-1">{actionTypeLabels[proposal.actionType]}</span>
          <span className="rounded-md border border-border px-2 py-1">{actionProposalStatusLabels[proposal.status]}</span>
          <span className="rounded-md border border-border px-2 py-1">风险 {proposal.riskLevel}</span>
          <span className="rounded-md border border-border px-2 py-1">置信度 {proposal.confidence}</span>
        </div>
      </header>

      <div className="mb-4 rounded-lg border border-border bg-white p-3 text-sm text-muted">{aiDisclaimer}</div>
      {error ? <div className="mb-4 rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          <Card>
            <CardTitle>动作建议</CardTitle>
            <div className="grid gap-3 text-sm">
              <p>{proposal.reason}</p>
              {proposal.expectedImpact ? <p className="text-muted">{proposal.expectedImpact}</p> : null}
              {proposal.blockedReason ? <p className="text-danger">{proposal.blockedReason}</p> : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <Link className="rounded-md border border-border px-3 py-2 text-center text-sm hover:border-primary" href={`/projects/${proposal.projectId}`}>
                  查看项目
                </Link>
                <Link className="rounded-md border border-border px-3 py-2 text-center text-sm hover:border-primary" href={`/tasks/${proposal.collectionTaskId}`}>
                  查看采集任务
                </Link>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>决策运行</CardTitle>
            <div className="grid gap-2 text-sm">
              <p className="font-medium">{proposal.decisionRun.diagnosis}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Info label="风险" value={proposal.decisionRun.riskLevel} />
                <Info label="置信度" value={String(proposal.decisionRun.confidence)} />
                <Info label="策略版本" value={proposal.decisionRun.strategyVersion} />
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>审批记录</CardTitle>
            <div className="grid gap-2 text-sm">
              {proposal.approvalRecords.map((record) => (
                <div className="rounded-md border border-border px-3 py-2" key={record.id}>
                  <strong>{approvalDecisionLabels[record.decision]}</strong>
                  {record.comment ? <p className="text-muted">{record.comment}</p> : null}
                  <p className="text-xs text-muted">{new Date(record.createdAt).toLocaleString("zh-CN")}</p>
                </div>
              ))}
              {proposal.approvalRecords.length === 0 ? <p className="text-muted">暂无审批记录。</p> : null}
            </div>
          </Card>

          <Card>
            <CardTitle>人工执行记录</CardTitle>
            <div className="grid gap-2 text-sm">
              {proposal.executionLogs.map((log) => (
                <div className="rounded-md border border-border px-3 py-2" key={log.id}>
                  <strong>
                    {executionModeLabels[log.mode]} / {executionStatusLabels[log.status]}
                  </strong>
                  {log.note ? <p className="text-muted">{log.note}</p> : null}
                  <p className="text-xs text-muted">{new Date(log.createdAt).toLocaleString("zh-CN")}</p>
                </div>
              ))}
              {proposal.executionLogs.length === 0 ? <p className="text-muted">暂无人工执行记录。</p> : null}
            </div>
          </Card>

          <Card>
            <CardTitle>执行后复盘</CardTitle>
            <div className="grid gap-2 text-sm">
              {outcomes.map((outcome) => (
                <div className="rounded-md border border-border px-3 py-2" key={outcome.id}>
                  <div className="flex flex-wrap gap-2 text-xs text-muted">
                    <span>{observationWindowLabels[outcome.observationWindow]}</span>
                    {outcome.customWindow ? <span>{outcome.customWindow}</span> : null}
                    <span>{new Date(outcome.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                  <strong>{actionOutcomeResultLabels[outcome.result]}</strong>
                  {outcome.note ? <p className="text-muted">{outcome.note}</p> : null}
                  {outcome.conclusion ? <p>{outcome.conclusion}</p> : null}
                  {outcome.beforeMetrics || outcome.afterMetrics ? (
                    <details className="mt-2 rounded-md bg-muted/20 p-2">
                      <summary className="cursor-pointer text-xs text-muted">查看指标快照</summary>
                      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs">
                        {JSON.stringify({ before: outcome.beforeMetrics || null, after: outcome.afterMetrics || null }, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ))}
              {outcomes.length === 0 ? <p className="text-muted">暂无执行后复盘。</p> : null}
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          {isPending ? (
            <Card>
              <CardTitle>审批</CardTitle>
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitAction("approve");
                }}
              >
                <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="审批备注" />
                <div className="grid gap-2">
                  <Button type="submit" disabled={busy === "approve"}>
                    审批通过
                  </Button>
                  <Button
                    className="border border-border bg-white text-foreground"
                    type="button"
                    disabled={busy === "observe"}
                    onClick={() => void submitAction("observe")}
                  >
                    设为观察
                  </Button>
                  <Button
                    className="border border-danger bg-white text-danger"
                    type="button"
                    disabled={busy === "reject"}
                    onClick={() => void submitAction("reject")}
                  >
                    拒绝建议
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          {canMarkManualExecuted ? (
            <Card>
              <CardTitle>人工已执行</CardTitle>
              <form className="grid gap-3" onSubmit={markManualExecuted}>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="人工执行记录" />
                <Button type="submit" disabled={busy === "manual"}>
                  标记人工已执行
                </Button>
              </form>
            </Card>
          ) : null}

          {canCreateOutcome ? (
            <Card>
              <CardTitle>记录执行后复盘</CardTitle>
              <form className="grid gap-3 text-sm" onSubmit={submitOutcome}>
                <label className="grid gap-1">
                  观察窗口
                  <select
                    className="rounded-md border border-border bg-white px-3 py-2"
                    value={outcomeWindow}
                    onChange={(event) => setOutcomeWindow(event.target.value as ObservationWindow)}
                  >
                    <option value="30m">30 分钟</option>
                    <option value="2h">2 小时</option>
                    <option value="1d">1 天</option>
                    <option value="custom">自定义</option>
                  </select>
                </label>
                {outcomeWindow === "custom" ? (
                  <Textarea value={customWindow} onChange={(event) => setCustomWindow(event.target.value)} placeholder="自定义观察窗口" />
                ) : null}
                <label className="grid gap-1">
                  结果
                  <select
                    className="rounded-md border border-border bg-white px-3 py-2"
                    value={outcomeResult}
                    onChange={(event) => setOutcomeResult(event.target.value as ActionOutcomeResult)}
                  >
                    <option value="IMPROVED">改善</option>
                    <option value="WORSENED">变差</option>
                    <option value="NO_CHANGE">无明显变化</option>
                    <option value="UNCLEAR">不明确</option>
                  </select>
                </label>
                <Textarea value={beforeMetricsJson} onChange={(event) => setBeforeMetricsJson(event.target.value)} placeholder='执行前指标 JSON，例如 {"verify_roi":0.8}' />
                <Textarea value={afterMetricsJson} onChange={(event) => setAfterMetricsJson(event.target.value)} placeholder='执行后指标 JSON，例如 {"verify_roi":1.1}' />
                <Textarea value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} placeholder="复盘备注" />
                <Textarea value={outcomeConclusion} onChange={(event) => setOutcomeConclusion(event.target.value)} placeholder="复盘结论" />
                <Button type="submit" disabled={busy === "outcome"}>
                  保存复盘
                </Button>
              </form>
            </Card>
          ) : null}

          {!isPending && !canMarkManualExecuted && !canCreateOutcome ? (
            <Card>
              <CardTitle>当前状态</CardTitle>
              <p className="text-sm text-muted">该动作建议当前没有可执行的页面按钮。</p>
            </Card>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function parseOptionalJson(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`${label}必须是合法 JSON`);
  }
}
