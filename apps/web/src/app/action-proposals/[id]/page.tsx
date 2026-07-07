"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  actionProposalStatusLabels,
  actionTypeLabels,
  aiDisclaimer,
  approvalDecisionLabels,
  executionModeLabels,
  executionStatusLabels,
  type ActionProposalStatus,
  type ActionType,
  type ApprovalDecision,
  type ExecutionMode,
  type ExecutionStatus,
  type RiskLevel
} from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
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

export default function ActionProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [proposal, setProposal] = useState<ActionProposalDetail | null>(null);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function load() {
    if (!token) return;
    setError("");
    apiFetch<ActionProposalDetail>(`/action-proposals/${params.id}`, token)
      .then(setProposal)
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

          {!isPending && !canMarkManualExecuted ? (
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
