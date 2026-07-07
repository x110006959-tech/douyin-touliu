"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  actionProposalStatusLabels,
  actionTypeLabels,
  aiDisclaimer,
  controlLevelLabels,
  cooperationTypeLabels,
  operatorTypeLabels,
  subjectTypeLabels,
  type ActionProposalStatus,
  type ActionType,
  type ControlLevel,
  type CooperationType,
  type OperatorType,
  type RiskLevel,
  type SubjectType
} from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

type TaskDetail = {
  id: string;
  status: string;
  sourceUrl: string | null;
  pageTitle: string | null;
  project: {
    id: string;
    name: string;
    subjectType: SubjectType;
    operatorType: OperatorType;
    cooperationType: CooperationType;
    controlLevel: ControlLevel;
    subjectConfidence: number;
    serviceProviderName: string | null;
    serviceMode: string | null;
    serviceFee: number | null;
  };
  snapshots: Array<{
    id: string;
    pageType: string | null;
    rawDomText: string | null;
    visibleMetricsJson: unknown;
    normalizedMetrics: Array<{ metricKey: string; metricName: string; metricValue: string; metricUnit: string | null }>;
  }>;
  analyses: Array<{
    id: string;
    status: string;
    provider: string;
    model: string;
    recommendations: Array<{
      id: string;
      summary: string;
      riskLevel: string;
      problemsJson: unknown;
      suggestionsJson: unknown;
      manualCheckItemsJson: unknown;
      confidence: number;
    }>;
  }>;
  auditLogs: Array<{ id: string; action: string; createdAt: string }>;
};

type DecisionRun = {
  id: string;
  diagnosis: string;
  riskLevel: RiskLevel;
  confidence: number;
  strategyVersion: string;
  createdAt: string;
  actionProposals: Array<{
    id: string;
    actionType: ActionType;
    title: string;
    reason: string;
    riskLevel: RiskLevel;
    confidence: number;
    status: ActionProposalStatus;
    requiresApproval: boolean;
    manualExecutedAt: string | null;
  }>;
};

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [decisionRun, setDecisionRun] = useState<DecisionRun | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function load() {
    if (!token) return;
    Promise.all([
      apiFetch<TaskDetail>(`/collection-tasks/${params.id}`, token),
      apiFetch<DecisionRun | null>(`/collection-tasks/${params.id}/decision-runs/latest`, token)
    ])
      .then(([nextTask, nextDecisionRun]) => {
        setTask(nextTask);
        setDecisionRun(nextDecisionRun);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "读取任务失败"));
  }

  useEffect(load, [token, params.id]);

  async function analyze() {
    if (!token) return;
    setBusy("analyze");
    setError("");
    try {
      await apiFetch(`/collection-tasks/${params.id}/analyze`, token, { method: "POST", body: "{}" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setBusy("");
    }
  }

  async function runDecision() {
    if (!token) return;
    setBusy("decision");
    setError("");
    try {
      const nextDecisionRun = await apiFetch<DecisionRun>(`/collection-tasks/${params.id}/decision-runs`, token, { method: "POST", body: "{}" });
      setDecisionRun(nextDecisionRun);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "决策运行失败");
    } finally {
      setBusy("");
    }
  }

  if (!task) {
    return <main className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted">{error || "加载中..."}</main>;
  }

  const latestSnapshot = task.snapshots[0];
  const latestAnalysis = task.analyses[0] || null;
  const recommendation = latestAnalysis?.recommendations[0] || null;
  const suggestions = asArray(recommendation?.suggestionsJson);
  const problems = asArray(recommendation?.problemsJson);
  const manualChecks = asArray(recommendation?.manualCheckItemsJson);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">采集任务</p>
          <h1 className="text-3xl font-bold">{task.pageTitle || task.sourceUrl || task.id}</h1>
          <p className="text-sm text-muted">状态：{task.status}</p>
        </div>
        <div className="flex gap-2">
          <Button className="border border-border bg-white text-foreground" type="button" onClick={analyze} disabled={!latestSnapshot || busy === "analyze"}>
            运行诊断
          </Button>
          <Button type="button" onClick={runDecision} disabled={!latestSnapshot || busy === "decision"}>
            运行决策
          </Button>
        </div>
      </header>

      <div className="mb-4 rounded-lg border border-border bg-white p-3 text-sm text-muted">{aiDisclaimer}</div>
      {error ? <div className="mb-4 rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}

      <section className="mb-4 grid gap-3 md:grid-cols-5">
        <Card>
          <CardTitle>主体类型</CardTitle>
          <p className="text-sm">{subjectTypeLabels[task.project.subjectType]}</p>
        </Card>
        <Card>
          <CardTitle>操盘主体</CardTitle>
          <p className="text-sm">{operatorTypeLabels[task.project.operatorType]}</p>
        </Card>
        <Card>
          <CardTitle>合作关系</CardTitle>
          <p className="text-sm">{cooperationTypeLabels[task.project.cooperationType]}</p>
        </Card>
        <Card>
          <CardTitle>可控程度</CardTitle>
          <p className="text-sm">{controlLevelLabels[task.project.controlLevel]}</p>
        </Card>
        <Card>
          <CardTitle>当前算法</CardTitle>
          <p className="text-sm">{task.project.subjectType === "SERVICE_PROVIDER" ? "服务商算法" : "主体框架算法"}</p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>诊断状态</CardTitle>
          {latestAnalysis ? (
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between rounded-md border border-border px-3 py-2">
                <span>状态</span>
                <strong>{latestAnalysis.status}</strong>
              </div>
              <div className="flex justify-between rounded-md border border-border px-3 py-2">
                <span>Provider</span>
                <strong>{latestAnalysis.provider}</strong>
              </div>
              <div className="flex justify-between rounded-md border border-border px-3 py-2">
                <span>Model</span>
                <strong>{latestAnalysis.model}</strong>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">暂无诊断任务。</p>
          )}
        </Card>

        <Card>
          <CardTitle>决策运行</CardTitle>
          {decisionRun ? (
            <div className="grid gap-3 text-sm">
              <p className="font-medium">{decisionRun.diagnosis}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Info label="风险" value={decisionRun.riskLevel} />
                <Info label="置信度" value={String(decisionRun.confidence)} />
                <Info label="动作建议" value={String(decisionRun.actionProposals.length)} />
              </div>
              <p className="text-xs text-muted">
                {decisionRun.strategyVersion} / {new Date(decisionRun.createdAt).toLocaleString("zh-CN")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">暂无决策运行。</p>
          )}
        </Card>

        <Card>
          <CardTitle>原始快照</CardTitle>
          {latestSnapshot ? (
            <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(
                {
                  pageType: latestSnapshot.pageType,
                  rawDomText: latestSnapshot.rawDomText,
                  visibleMetricsJson: latestSnapshot.visibleMetricsJson
                },
                null,
                2
              )}
            </pre>
          ) : (
            <p className="text-sm text-muted">暂无快照，请在 Chrome 插件中上传。</p>
          )}
        </Card>

        <Card>
          <CardTitle>标准化指标</CardTitle>
          <div className="grid gap-2">
            {latestSnapshot?.normalizedMetrics.map((metric) => (
              <div className="flex justify-between rounded-md border border-border px-3 py-2 text-sm" key={`${metric.metricKey}-${metric.metricName}`}>
                <span>{metric.metricName}</span>
                <strong>
                  {metric.metricValue}
                  {metric.metricUnit || ""}
                </strong>
              </div>
            ))}
            {!latestSnapshot?.normalizedMetrics.length ? <p className="text-sm text-muted">暂无标准化指标。</p> : null}
          </div>
        </Card>

        <Card>
          <CardTitle>诊断建议</CardTitle>
          {recommendation ? (
            <div className="grid gap-3 text-sm">
              <p className="text-base font-semibold">{recommendation.summary}</p>
              <p className="text-muted">
                风险：{recommendation.riskLevel} / 置信度：{recommendation.confidence}
              </p>
              <div className="grid gap-2">
                {suggestions.map((item, index) => (
                  <div className="rounded-md border border-border px-3 py-2" key={index}>
                    <strong>{String(item.action || item.title || "操作指令")}</strong>
                    <p className="text-muted">{String(item.reason || item.expectedImpact || "")}</p>
                  </div>
                ))}
              </div>
              {manualChecks.length ? <p className="text-muted">待校准：{manualChecks.map((item) => String(item.title || "")).join("、")}</p> : null}
              {problems.length ? <p className="text-danger">风险项：{problems.map((item) => String(item.title || "")).join("、")}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-muted">暂无诊断结果。</p>
          )}
        </Card>

        <Card>
          <CardTitle>动作建议</CardTitle>
          {decisionRun?.actionProposals.length ? (
            <div className="grid gap-2 text-sm">
              {decisionRun.actionProposals.map((proposal) => (
                <Link className="rounded-md border border-border px-3 py-2 hover:border-primary" href={`/action-proposals/${proposal.id}`} key={proposal.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{proposal.title}</strong>
                    <span className="text-xs text-muted">{actionProposalStatusLabels[proposal.status]}</span>
                  </div>
                  <p className="mt-1 text-muted">{proposal.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                    <span>{actionTypeLabels[proposal.actionType]}</span>
                    <span>风险 {proposal.riskLevel}</span>
                    <span>置信度 {proposal.confidence}</span>
                    {proposal.manualExecutedAt ? <span>人工已执行 {new Date(proposal.manualExecutedAt).toLocaleString("zh-CN")}</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">暂无动作建议。</p>
          )}
        </Card>

        <Card>
          <CardTitle>审计日志</CardTitle>
          <div className="grid gap-2 text-sm">
            {task.auditLogs.map((log) => (
              <div className="rounded-md border border-border px-3 py-2" key={log.id}>
                <strong>{log.action}</strong>
                <p className="text-muted">{new Date(log.createdAt).toLocaleString("zh-CN")}</p>
              </div>
            ))}
            {task.auditLogs.length === 0 ? <p className="text-muted">暂无日志。</p> : null}
          </div>
        </Card>
      </section>
    </main>
  );
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <strong>{value}</strong>
    </div>
  );
}
