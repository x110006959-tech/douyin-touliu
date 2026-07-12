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
  type MetricReviewStatus,
  type MetricSource,
  type OperatorType,
  type ReviewedMetricDTO,
  type RiskLevel,
  type SubjectType
} from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, createIdempotencyKey } from "@/lib/api";
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
    responsePayload?: {
      summary?: string;
      manualCheckItems?: Array<{ title: string; reason: string }>;
      confidence?: number;
      finalActionsSource?: string;
    } | null;
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
  finalResultJson?: {
    calculatedMetrics?: {
      serviceProviderAfterCost?: number | null;
      serviceProviderGrossProfitRoi?: number | null;
      verifiedPlatformBenefits?: number | null;
      evidence?: string[];
    };
  };
};

type CollectionRun = {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "STOPPED" | "DEGRADED";
  startedAt: string;
  lastSnapshotAt: string | null;
  quality: {
    completeness: number;
    blocksStrongActions: boolean;
    missingRoutes: string[];
    staleRoutes: string[];
    routes: Array<{ routeKey: string; state: "FRESH" | "AGING" | "STALE" | "MISSING"; lastCollectedAt: string | null; ageMs: number | null }>;
  };
  routeHealth: Array<{ routeKey: string; consecutiveFailures: number; lastError: string | null }>;
};

type DecisionPreview = {
  preview: true;
  createsRecords: false;
  finalOutput: {
    diagnosis: string;
    confidence: number;
    dataQuality: { blocksStrongActions: boolean; blockingReasons?: string[] };
    actionProposals: Array<{ actionType: ActionType; title: string; reason: string }>;
  };
};

type MetricDriftEvent = {
  id: string;
  rawField: string;
  aliasNormalized: string;
  pageType: string;
  reason: string;
  candidateKeysJson: string[] | null;
  createdAt: string;
};

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [decisionRun, setDecisionRun] = useState<DecisionRun | null>(null);
  const [collectionRun, setCollectionRun] = useState<CollectionRun | null>(null);
  const [decisionPreview, setDecisionPreview] = useState<DecisionPreview | null>(null);
  const [reviewMetrics, setReviewMetrics] = useState<ReviewedMetricDTO[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [driftEvents, setDriftEvents] = useState<MetricDriftEvent[]>([]);
  const [error, setError] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [busy, setBusy] = useState("");

  function applyReviewMetrics(metrics: ReviewedMetricDTO[]) {
    setReviewMetrics(metrics);
    setReviewDrafts(Object.fromEntries(metrics.map((metric) => [metric.id, metric.reviewedValue ?? metric.originalValue ?? ""])));
  }

  function load() {
    if (!token) return;
    Promise.all([
      apiFetch<TaskDetail>(`/collection-tasks/${params.id}`, token),
      apiFetch<DecisionRun | null>(`/collection-tasks/${params.id}/decision-runs/latest`, token),
      apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics`, token),
      apiFetch<CollectionRun | null>(`/collection-tasks/${params.id}/collection-runs/latest`, token)
    ])
      .then(([nextTask, nextDecisionRun, nextReviewMetrics, nextCollectionRun]) => {
        setTask(nextTask);
        setDecisionRun(nextDecisionRun);
        applyReviewMetrics(nextReviewMetrics);
        setCollectionRun(nextCollectionRun);
        void apiFetch<MetricDriftEvent[]>(`/projects/${nextTask.project.id}/metric-drift-events?status=OPEN`, token).then(setDriftEvents).catch(() => setDriftEvents([]));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "读取任务失败"));
  }

  async function resolveMetricDrift(event: MetricDriftEvent, metricKey: string) {
    if (!token || !task) return;
    setBusy(`drift:${event.id}`);
    try {
      await apiFetch(`/projects/${task.project.id}/metric-aliases/${encodeURIComponent(event.aliasNormalized)}`, token, {
        method: "PUT",
        body: JSON.stringify({ metricKey, pageType: event.pageType })
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "字段映射失败");
    } finally {
      setBusy("");
    }
  }

  useEffect(load, [token, params.id]);

  async function explain() {
    if (!token) return;
    setBusy("explain");
    setError("");
    try {
      await apiFetch(`/collection-tasks/${params.id}/explain`, token, { method: "POST", body: "{}" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "解释生成失败");
    } finally {
      setBusy("");
    }
  }

  async function runDecision() {
    if (!token) return;
    setBusy("decision");
    setError("");
    try {
      const nextDecisionRun = await apiFetch<DecisionRun>(`/collection-tasks/${params.id}/decision-runs`, token, {
        method: "POST",
        headers: { "idempotency-key": createIdempotencyKey(`decision:${params.id}`) },
        body: "{}"
      });
      setDecisionRun(nextDecisionRun);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "决策运行失败");
    } finally {
      setBusy("");
    }
  }

  async function previewDecision() {
    if (!token) return;
    setBusy("decision-preview");
    setError("");
    try {
      const preview = await apiFetch<DecisionPreview>(`/collection-tasks/${params.id}/decision-preview`, token, { method: "POST", body: "{}" });
      setDecisionPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "决策预演失败");
    } finally {
      setBusy("");
    }
  }

  async function refreshReviewMetrics() {
    if (!token) return;
    setBusy("review-refresh");
    setReviewMessage("");
    try {
      const nextReviewMetrics = await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics`, token);
      applyReviewMetrics(nextReviewMetrics);
      setReviewMessage("复核指标已刷新");
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新复核指标失败");
    } finally {
      setBusy("");
    }
  }

  async function updateReviewMetric(metric: ReviewedMetricDTO, reviewStatus: Exclude<MetricReviewStatus, "PENDING">) {
    if (!token) return;
    setBusy(`review-${metric.id}`);
    setReviewMessage("");
    try {
      const reviewedValue = reviewStatus === "MODIFIED" ? reviewDrafts[metric.id] || "" : undefined;
      const updated = await apiFetch<ReviewedMetricDTO>(`/review-metrics/${metric.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ reviewStatus, reviewedValue })
      });
      applyReviewMetrics(reviewMetrics.map((item) => (item.id === updated.id ? updated : item)));
      setReviewMessage(reviewStatusLabel(reviewStatus));
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存复核指标失败");
    } finally {
      setBusy("");
    }
  }

  async function saveModifiedDrafts() {
    if (!token) return;
    const items = reviewMetrics
      .filter((metric) => (reviewDrafts[metric.id] || "") !== (metric.reviewedValue ?? metric.originalValue ?? ""))
      .map((metric) => ({ metricId: metric.id, reviewedValue: reviewDrafts[metric.id] || "", reviewStatus: "MODIFIED" as const }));
    if (!items.length) {
      setReviewMessage("没有需要保存的修改");
      return;
    }
    setBusy("review-save-all");
    setReviewMessage("");
    try {
      const updated = await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics/bulk`, token, {
        method: "POST",
        body: JSON.stringify({ items })
      });
      const byId = new Map(updated.map((metric) => [metric.id, metric]));
      applyReviewMetrics(reviewMetrics.map((metric) => byId.get(metric.id) || metric));
      setReviewMessage("修改已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量保存复核指标失败");
    } finally {
      setBusy("");
    }
  }

  async function confirmAllPending() {
    if (!token) return;
    setBusy("review-confirm-all");
    setReviewMessage("");
    try {
      const updated = await apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${params.id}/review-metrics/confirm-all`, token, {
        method: "POST",
        body: "{}"
      });
      applyReviewMetrics(updated);
      setReviewMessage("已确认全部待复核指标");
    } catch (err) {
      setError(err instanceof Error ? err.message : "一键确认失败");
    } finally {
      setBusy("");
    }
  }

  if (!task) {
    return <main className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted">{error || "加载中..."}</main>;
  }

  const latestSnapshot = task.snapshots[0];
  const latestAnalysis = task.analyses[0] || null;
  const reviewState = summarizeReviewState(reviewMetrics);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">采集任务</p>
          <h1 className="text-3xl font-bold">{task.pageTitle || task.sourceUrl || task.id}</h1>
          <p className="text-sm text-muted">状态：{task.status}</p>
        </div>
        <div className="flex gap-2">
          <Button className="border border-border bg-white text-foreground" type="button" onClick={explain} disabled={!latestSnapshot || busy === "explain"}>
            生成解释
          </Button>
          <Button type="button" onClick={runDecision} disabled={!latestSnapshot || busy === "decision"}>
            运行决策
          </Button>
          <Button className="border border-border bg-white text-foreground" type="button" onClick={previewDecision} disabled={!latestSnapshot || busy === "decision-preview"}>
            决策预演
          </Button>
        </div>
      </header>

      <div className="mb-4 rounded-lg border border-border bg-white p-3 text-sm">
        <strong className="mr-2">数据状态：</strong>
        <span className={reviewState.tone}>{reviewState.label}</span>
      </div>

      <section className="mb-4 grid gap-3 md:grid-cols-2">
        <Card>
          <CardTitle>固定页面巡检</CardTitle>
          {collectionRun ? (
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span>状态</span><strong>{collectionRun.status}</strong></div>
              <div className="flex justify-between"><span>完整度</span><strong>{Math.round(collectionRun.quality.completeness * 100)}%</strong></div>
              <div className="flex justify-between"><span>强建议门槛</span><strong>{collectionRun.quality.blocksStrongActions ? "已阻断" : "数据可用"}</strong></div>
              {collectionRun.quality.routes.map((route) => (
                <div className="flex justify-between rounded-md border border-border px-3 py-2" key={route.routeKey}>
                  <span>{route.routeKey}</span><span>{route.state}</span>
                </div>
              ))}
              {collectionRun.routeHealth.some((route) => route.consecutiveFailures > 0) ? (
                <p className="text-danger">存在采集失败路线，请检查已打开页面和插件日志。</p>
              ) : null}
            </div>
          ) : <p className="text-sm text-muted">尚未通过插件开启固定页面巡检。</p>}
        </Card>
        <Card>
          <CardTitle>决策预演</CardTitle>
          {decisionPreview ? (
            <div className="grid gap-2 text-sm">
              <p className="font-medium">{decisionPreview.finalOutput.diagnosis}</p>
              <p>本次预演不会创建正式决策或动作建议。</p>
              <p>候选建议：{decisionPreview.finalOutput.actionProposals.map((proposal) => proposal.title).join("、") || "无"}</p>
              {decisionPreview.finalOutput.dataQuality.blockingReasons?.length ? (
                <p className="text-danger">阻断原因：{decisionPreview.finalOutput.dataQuality.blockingReasons.join("；")}</p>
              ) : null}
            </div>
          ) : <p className="text-sm text-muted">点击“决策预演”可在不写入正式记录的情况下检查当前数据。</p>}
        </Card>
      </section>

      <section className="mb-4">
        <Card>
          <CardTitle>字段漂移待校准</CardTitle>
          {driftEvents.length ? (
            <div className="grid gap-2 text-sm">
              {driftEvents.map((event) => (
                <div className="grid gap-2 rounded-md border border-border p-3" key={event.id}>
                  <div className="flex flex-wrap justify-between gap-2"><strong>{event.rawField}</strong><span className="text-muted">{event.pageType} / {event.reason}</span></div>
                  {event.candidateKeysJson?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {event.candidateKeysJson.map((metricKey) => (
                        <Button className="border border-border bg-white text-foreground" disabled={busy === `drift:${event.id}`} key={metricKey} onClick={() => void resolveMetricDrift(event, metricKey)} type="button">
                          映射为 {metricKey}
                        </Button>
                      ))}
                    </div>
                  ) : <p className="text-muted">当前页面覆盖不完整，需要校准页面适配器或改用截图/CSV/人工录入。</p>}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted">当前没有待处理的字段漂移。</p>}
        </Card>
      </section>

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
          <CardTitle>解释层状态</CardTitle>
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
            <p className="text-sm text-muted">暂无解释记录。</p>
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
              {decisionRun.finalResultJson?.calculatedMetrics ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Info label="服务商后成本" value={formatOptionalNumber(decisionRun.finalResultJson.calculatedMetrics.serviceProviderAfterCost)} />
                  <Info
                    label="服务商后毛利 ROI"
                    value={formatOptionalNumber(decisionRun.finalResultJson.calculatedMetrics.serviceProviderGrossProfitRoi)}
                  />
                  <Info label="已核验平台权益" value={formatOptionalNumber(decisionRun.finalResultJson.calculatedMetrics.verifiedPlatformBenefits)} />
                </div>
              ) : null}
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

        <Card className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>数据复核表</CardTitle>
              <p className="mt-1 text-sm text-muted">采集指标先进入待复核状态，确认、修改或忽略后再用于决策建议。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="border border-border bg-white text-foreground" type="button" onClick={refreshReviewMetrics} disabled={busy === "review-refresh"}>
                刷新复核指标
              </Button>
              <Button className="border border-border bg-white text-foreground" type="button" onClick={saveModifiedDrafts} disabled={!reviewMetrics.length || busy === "review-save-all"}>
                保存修改
              </Button>
              <Button type="button" onClick={confirmAllPending} disabled={!reviewMetrics.some((metric) => metric.reviewStatus === "PENDING") || busy === "review-confirm-all"}>
                一键确认全部
              </Button>
            </div>
          </div>
          {!reviewMetrics.length ? (
            <p className="rounded-md border border-border bg-background px-3 py-3 text-sm text-muted">暂无可复核指标，请先上传采集快照。</p>
          ) : (
            <div className="grid gap-3">
              {reviewMetrics.some((metric) => metric.reviewStatus === "PENDING") ? (
                <p className="rounded-md border border-primary/30 bg-background px-3 py-2 text-sm text-primary">
                  建议先完成人工复核，再运行决策建议。
                </p>
              ) : null}
              {reviewMessage ? <p className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">{reviewMessage}</p> : null}
              <div className="overflow-x-auto">
                <table className="min-w-[1200px] text-left text-sm">
                  <thead className="border-b border-border text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">指标名称</th>
                      <th className="px-3 py-2">Key</th>
                      <th className="px-3 py-2">采集值</th>
                      <th className="px-3 py-2">用户确认值</th>
                      <th className="px-3 py-2">单位</th>
                      <th className="px-3 py-2">来源</th>
                      <th className="px-3 py-2">置信度</th>
                      <th className="px-3 py-2">页面类型</th>
                      <th className="px-3 py-2">口径</th>
                      <th className="px-3 py-2">时间范围</th>
                      <th className="px-3 py-2">原始证据</th>
                      <th className="px-3 py-2">复核状态</th>
                      <th className="px-3 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewMetrics.map((metric) => (
                      <tr className="border-b border-border align-top" key={metric.id}>
                        <td className="px-3 py-3 font-medium">{metric.metricName}</td>
                        <td className="px-3 py-3 text-muted">{metric.metricKey}</td>
                        <td className="px-3 py-3">{metric.originalValue || "数据缺失"}</td>
                        <td className="px-3 py-3">
                          <Input
                            className="w-36"
                            value={reviewDrafts[metric.id] ?? ""}
                            onChange={(event) => setReviewDrafts((drafts) => ({ ...drafts, [metric.id]: event.target.value }))}
                          />
                        </td>
                        <td className="px-3 py-3">{metric.metricUnit || "--"}</td>
                        <td className="px-3 py-3">{metricSourceLabel(metric.metricSource)}</td>
                        <td className="px-3 py-3">{Math.round(metric.confidence * 100)}%</td>
                        <td className="px-3 py-3">{metric.pageType || "UNKNOWN"}</td>
                        <td className="px-3 py-3">{metric.scope || "UNKNOWN"}</td>
                        <td className="px-3 py-3">{metric.timeRange || "UNKNOWN"}</td>
                        <td className="px-3 py-3">
                          {metric.rawEvidence ? (
                            <details>
                              <summary className="cursor-pointer text-primary">查看</summary>
                              <pre className="mt-2 max-h-40 w-72 overflow-auto rounded-md bg-slate-950 p-2 text-xs text-slate-100">
                                {JSON.stringify(metric.rawEvidence, null, 2)}
                              </pre>
                            </details>
                          ) : (
                            <span className="text-muted">暂无证据</span>
                          )}
                        </td>
                        <td className="px-3 py-3">{reviewStatusLabel(metric.reviewStatus)}</td>
                        <td className="px-3 py-3">
                          <div className="flex min-w-44 flex-wrap gap-2">
                            <Button
                              className="h-8 border border-border bg-white px-2 text-xs text-foreground"
                              type="button"
                              onClick={() => updateReviewMetric(metric, "CONFIRMED")}
                              disabled={busy === `review-${metric.id}`}
                            >
                              确认
                            </Button>
                            <Button
                              className="h-8 border border-border bg-white px-2 text-xs text-foreground"
                              type="button"
                              onClick={() => updateReviewMetric(metric, "MODIFIED")}
                              disabled={busy === `review-${metric.id}`}
                            >
                              修改
                            </Button>
                            <Button
                              className="h-8 border border-border bg-white px-2 text-xs text-foreground"
                              type="button"
                              onClick={() => updateReviewMetric(metric, "IGNORED")}
                              disabled={busy === `review-${metric.id}`}
                            >
                              忽略
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>解释摘要</CardTitle>
          {latestAnalysis?.responsePayload?.summary ? (
            <div className="grid gap-3 text-sm">
              <p className="text-base font-semibold">{latestAnalysis.responsePayload.summary}</p>
              <p className="text-muted">解释层不生成最终投流动作，正式结论以右侧 DecisionRun 和 ActionProposal 为准。</p>
              {latestAnalysis.responsePayload.manualCheckItems?.length ? (
                <p className="text-muted">待校准：{latestAnalysis.responsePayload.manualCheckItems.map((item) => item.title).join("、")}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">暂无解释摘要。</p>
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

function summarizeReviewState(metrics: ReviewedMetricDTO[]) {
  if (!metrics.length) {
    return { label: "无指标：不建议运行", tone: "text-danger" };
  }
  const pendingCount = metrics.filter((metric) => metric.reviewStatus === "PENDING").length;
  const reviewedCount = metrics.filter((metric) => metric.reviewStatus === "CONFIRMED" || metric.reviewStatus === "MODIFIED").length;
  if (pendingCount === 0 && reviewedCount > 0) {
    return { label: "已复核：可以正常运行", tone: "text-primary" };
  }
  return { label: "未完全复核：可以运行，但置信度可能降低", tone: "text-muted" };
}

function metricSourceLabel(source: MetricSource) {
  const labels: Record<MetricSource, string> = {
    XHR_JSON: "XHR JSON",
    TABLE: "表格",
    DOM_TEXT: "页面文本",
    SCREENSHOT: "截图",
    MANUAL_INPUT: "人工输入",
    UNKNOWN: "未知"
  };
  return labels[source] || source;
}

function reviewStatusLabel(status: MetricReviewStatus) {
  const labels: Record<MetricReviewStatus, string> = {
    PENDING: "待复核",
    CONFIRMED: "已确认",
    MODIFIED: "已修改",
    IGNORED: "已忽略"
  };
  return labels[status] || status;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function formatOptionalNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "数据缺失";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
