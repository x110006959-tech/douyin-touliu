"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ProjectHistoryComparison, ProjectHistoryOverviewDTO } from "@douyin-local-life/shared";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

type ComparisonMode = "archives" | "analysis-window" | "session" | "period";

export default function ProjectHistoryPage() {
  const params = useParams<{ id: string }>();
  const { token, hydrated } = useAuth();
  const [overview, setOverview] = useState<ProjectHistoryOverviewDTO | null>(null);
  const [comparison, setComparison] = useState<ProjectHistoryComparison | null>(null);
  const [mode, setMode] = useState<ComparisonMode>("archives");
  const [days, setDays] = useState<7 | 30>(7);
  const [minutes, setMinutes] = useState<30 | 60>(30);
  const [baselineArchiveId, setBaselineArchiveId] = useState("");
  const [currentArchiveId, setCurrentArchiveId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<ProjectHistoryOverviewDTO>(`/projects/${params.id}/history`, token)
      .then((value) => {
        setOverview(value);
        setBaselineArchiveId(value.archives[1]?.id || "");
        setCurrentArchiveId(value.archives[0]?.id || "");
        setComparison(value.defaultArchiveComparison);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "读取历史对比失败"));
  }, [params.id, token]);

  const query = useMemo(() => {
    const search = new URLSearchParams({ mode });
    if (mode === "period") search.set("days", String(days));
    if (mode === "analysis-window") search.set("minutes", String(minutes));
    if (mode === "archives") {
      if (baselineArchiveId) search.set("baselineArchiveId", baselineArchiveId);
      if (currentArchiveId) search.set("currentArchiveId", currentArchiveId);
    }
    return search.toString();
  }, [baselineArchiveId, currentArchiveId, days, minutes, mode]);

  async function loadComparison(nextMode = mode) {
    if (!token) return;
    setError("");
    try {
      const value = await apiFetch<ProjectHistoryComparison>(`/projects/${params.id}/history/comparison?${nextMode === mode ? query : new URLSearchParams({ mode: nextMode }).toString()}`, token);
      setComparison(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取对比结果失败");
    }
  }

  function switchMode(next: ComparisonMode) {
    setMode(next);
    void loadComparison(next);
  }

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState />;
  return <main className="mx-auto max-w-6xl px-6 py-8">
    <Link className="text-sm text-primary" href={`/projects/${params.id}`}>返回项目</Link>
    <header className="mb-6 mt-3"><p className="text-sm font-semibold text-primary">账号 → 项目 → 历史对比</p><h1 className="mt-1 text-3xl font-bold">历史对比</h1><p className="mt-2 text-sm text-muted">系统在后台保存已校验采集趋势并计算对比；本页只展示结果，不会自动运行 AI 或修改平台投放。</p></header>

    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <ModeButton active={mode === "archives"} onClick={() => switchMode("archives")}>两次分析</ModeButton>
        <ModeButton active={mode === "analysis-window"} onClick={() => switchMode("analysis-window")}>同场前后</ModeButton>
        <ModeButton active={mode === "session"} onClick={() => switchMode("session")}>两轮采集</ModeButton>
        <ModeButton active={mode === "period"} onClick={() => switchMode("period")}>周期对比</ModeButton>
      </div>
      {mode === "archives" ? <div className="mt-4 grid gap-3 md:grid-cols-3"><Select aria-label="基准分析" value={baselineArchiveId} onChange={(event) => setBaselineArchiveId(event.target.value)}>{overview?.archives.map((archive) => <option key={archive.id} value={archive.id}>{formatTime(archive.createdAt)} · {archive.status === "REUSED" ? "沿用已有结果" : "新建分析"}</option>)}</Select><Select aria-label="当前分析" value={currentArchiveId} onChange={(event) => setCurrentArchiveId(event.target.value)}>{overview?.archives.map((archive) => <option key={archive.id} value={archive.id}>{formatTime(archive.createdAt)} · {archive.status === "REUSED" ? "沿用已有结果" : "新建分析"}</option>)}</Select><Button type="button" onClick={() => void loadComparison()}>开始对比</Button></div> : null}
      {mode === "analysis-window" ? <div className="mt-4 flex flex-wrap gap-2"><ModeButton active={minutes === 30} onClick={() => { setMinutes(30); }}>分析前后 30 分钟</ModeButton><ModeButton active={minutes === 60} onClick={() => { setMinutes(60); }}>分析前后 60 分钟</ModeButton><Button type="button" onClick={() => void loadComparison()}>开始对比</Button></div> : null}
      {mode === "period" ? <div className="mt-4 flex flex-wrap gap-2"><ModeButton active={days === 7} onClick={() => setDays(7)}>最近 7 天与前 7 天</ModeButton><ModeButton active={days === 30} onClick={() => setDays(30)}>最近 30 天与前 30 天</ModeButton><Button type="button" onClick={() => void loadComparison()}>开始对比</Button></div> : null}
      {mode === "session" ? <div className="mt-4"><Button type="button" onClick={() => void loadComparison()}>对比最近两轮</Button></div> : null}
    </section>

    {error ? <p className="mt-4 rounded-md border border-danger bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
    {comparison ? <ComparisonCard comparison={comparison} /> : <p className="mt-4 text-sm text-muted">正在读取历史记录…</p>}

    <section className="mt-5 rounded-xl border border-border bg-white p-4 shadow-sm"><h2 className="font-semibold">采集轮次</h2><p className="mt-1 text-xs text-muted">每次有效采集或新分析都会延续当前轮次；连续 3 小时没有有效活动时，系统按最后活动时间归档，不会把它标记为直播完整结束。</p><div className="mt-3 grid gap-2">{overview?.sessions.map((session) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 p-3 text-sm" key={session.id}><span>{formatTime(session.startedAt)} 开始</span><span>{session.status === "ACTIVE" ? "进行中" : "因无活动归档"}</span><span>{session.pointCount} 条趋势记录 · {session.archiveCount} 次分析</span></div>)}{overview?.sessions.length === 0 ? <p className="text-sm text-muted">尚无可用于历史对比的有效采集记录。</p> : null}</div></section>
  </main>;
}

function ModeButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={`rounded-md border px-3 py-2 text-sm ${active ? "border-primary bg-blue-50 text-primary" : "border-border bg-white"}`} onClick={onClick} type="button">{children}</button>;
}

function ComparisonCard({ comparison }: { comparison: ProjectHistoryComparison }) {
  const status = { IMPROVED: "整体效率改善", WORSENED: "整体效率走弱", NO_CHANGE: "整体无明显变化", MIXED: "表现分化", INSUFFICIENT: "暂不能判断" }[comparison.status];
  return <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50/40 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-primary">对比结果</p><h2 className="mt-1 text-xl font-semibold">{comparison.label}</h2><p className="mt-2 text-sm text-muted">{comparison.baselineLabel} → {comparison.currentLabel}</p></div><span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-violet-700">{status}</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-violet-200 text-xs text-muted"><tr><th className="pb-2">路线</th><th className="pb-2">指标</th><th className="pb-2">基准</th><th className="pb-2">当前</th><th className="pb-2">说明</th></tr></thead><tbody>{comparison.rows.map((row) => <tr className="border-b border-violet-100" key={`${row.routeKey}-${row.metricKey}-${row.metricName}`}><td className="py-3">{routeLabel(row.routeKey)}</td><td className="py-3">{row.metricName}</td><td className="py-3">{formatNumber(row.baselineValue)}</td><td className="py-3">{formatNumber(row.currentValue)}</td><td className="py-3 text-xs text-muted">{row.note}</td></tr>)}{comparison.rows.length === 0 ? <tr><td className="py-5 text-sm text-muted" colSpan={5}>{comparison.notices[0] || "尚无可比数据"}</td></tr> : null}</tbody></table></div><ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">{comparison.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul></section>;
}

function routeLabel(value: string) { return value === "LOCAL_PROMOTION_DASHBOARD" ? "巨量本地推" : value === "LIVE_DATA_SCREEN" ? "直播数据大屏" : value; }
function formatNumber(value: number | null) { return value == null ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value); }
function formatTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(value)); }
