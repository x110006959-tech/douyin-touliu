"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { accountIdentityStatusLabels, aiDisclaimer, extensionSafetyNotice, subjectTypeLabels, type AccountIdentityStatus, type BuildMetadata, type SubjectType } from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

type AccountProject = {
  id: string;
  name: string;
  subjectType: SubjectType;
  updatedAt: string;
  _count: { tasks: number };
  tasks: Array<{ snapshots: Array<{ createdAt: string; accountMatchStatus: string }>; decisionRuns: Array<{ createdAt: string }> }>;
};

type AccountProfile = {
  id: string;
  accountName: string;
  platformAccountId: string | null;
  merchantName: string | null;
  storeName: string | null;
  identityStatus: AccountIdentityStatus;
  projects: AccountProject[];
};

type SystemHealth = {
  status: "HEALTHY" | "DEGRADED";
  database: string;
  collection: {
    activeRuns: number;
    degradedRuns: number;
    routeStatusCounts: Record<string, number>;
    routeIssueCounts: Record<string, number>;
  };
  ai: { status: "CLOSED" | "OPEN" | "HALF_OPEN" };
};

export default function DashboardPage() {
  const { token, hydrated, setToken } = useAuth();
  const [accounts, setAccounts] = useState<AccountProfile[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [buildMetadata, setBuildMetadata] = useState<BuildMetadata | null>(null);
  const [error, setError] = useState("");
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [accountPendingDeletion, setAccountPendingDeletion] = useState<AccountProfile | null>(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiFetch<AccountProfile[]>("/account-profiles", token),
      apiFetch<SystemHealth>("/system-health", token),
      apiFetch<BuildMetadata>("/version", token)
    ]).then(([nextAccounts, nextHealth, nextBuild]) => {
      setAccounts(nextAccounts);
      setSystemHealth(nextHealth);
      setBuildMetadata(nextBuild);
    }).catch((err) => setError(err instanceof Error ? err.message : "读取账号档案失败"));
  }, [token]);

  if (!hydrated) return <main className="flex min-h-screen items-center justify-center bg-[#f3f6fa] text-sm text-muted">正在确认登录状态...</main>;

  if (!token) {
    return (
      <main className="min-h-screen bg-[#f3f6fa]">
        <header className="border-b border-[#dde3ea] bg-white">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
            <Link className="flex items-center gap-3" href="/">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#14213d] text-sm font-bold text-white">P</span>
              <span>
                <span className="block text-sm font-bold text-[#14213d]">pxxis</span>
                <span className="block text-xs text-muted">本地生活决策助手</span>
              </span>
            </Link>
            <Link className="text-sm font-semibold text-primary hover:underline" href="/login">登录工作台</Link>
          </div>
        </header>

        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_380px] lg:content-center lg:gap-x-16 lg:gap-y-8 lg:py-20">
          <div>
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-[#18794e]">
              <span className="h-2 w-2 rounded-full bg-[#27a36a]" />
              服务商投流诊断工作台
            </div>
            <h1 className="max-w-2xl text-3xl font-bold leading-tight text-[#14213d] sm:text-4xl">
              先确认账号和直播主体，<br className="hidden sm:block" />再给出投流建议
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted">
              将直播大屏与巨量本地推数据归入同一账号档案，经过复核后生成诊断建议。账号之间严格隔离，历史项目可以继续使用。
            </p>
          </div>

          <aside className="rounded-lg border border-[#d7dee7] bg-white p-6 shadow-[0_18px_50px_rgba(20,33,61,0.08)] sm:p-7 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <p className="text-xs font-semibold text-primary">工作台入口</p>
            <h2 className="mt-3 text-xl font-bold text-[#14213d]">进入账号诊断工作台</h2>
            <Link className="mt-5 flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]" href="/login">
              登录
            </Link>
            <p className="mt-4 text-sm leading-6 text-muted">登录后可继续上次项目、查看采集状态与处理待审批建议。</p>
            <div className="mt-5 border-t border-border pt-5">
              <p className="text-xs leading-5 text-muted">{aiDisclaimer}</p>
            </div>
          </aside>

          <ol className="grid max-w-2xl gap-5 border-t border-[#d7dee7] pt-6 sm:grid-cols-3 lg:col-start-1">
            {[
              ["01", "选择账号", "进入已有档案或新建账号"],
              ["02", "采集复核", "确认页面数据与账号归属"],
              ["03", "人工决策", "审批建议并记录执行结果"]
            ].map(([number, title, description]) => (
              <li className="flex gap-3 sm:block" key={number}>
                <span className="font-mono text-xs font-bold text-primary">{number}</span>
                <div className="sm:mt-2">
                  <p className="text-sm font-semibold text-[#14213d]">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    );
  }

  async function deleteAccount(account: AccountProfile) {
    setDeletingAccountId(account.id);
    setDeleteError("");
    setError("");
    try {
      await apiFetch(`/account-profiles/${account.id}`, token, {
        method: "DELETE",
        body: JSON.stringify({ accountName: account.accountName })
      });
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setAccountPendingDeletion(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "删除账号档案失败");
    } finally {
      setDeletingAccountId(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">先选账号，再开始诊断</p>
          <h1 className="text-3xl font-bold">账号诊断工作台</h1>
          <p className="mt-2 text-sm leading-6 text-muted">一个平台账号一个长期档案。再次使用时可继续原项目，或复用基础配置建立新项目。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border border-border px-4 py-2 text-sm font-medium" href="/extension">插件说明</Link>
          <Link className="rounded-md border border-border px-4 py-2 text-sm font-medium" href="/decision-center">决策中心</Link>
          <Link className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white" href="/accounts/new">新建其他账号</Link>
          <Button className="border border-border bg-white text-foreground" type="button" onClick={() => setToken(null)}>退出</Button>
        </div>
      </header>

      <div className="mb-5 grid gap-1 rounded-lg border border-border bg-white p-4 text-sm leading-6 text-muted">
        <p>{extensionSafetyNotice}</p><p>{aiDisclaimer}</p>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-5">
        <Card><CardTitle>数据库</CardTitle><p className="text-sm font-semibold">{systemHealth?.database || "检查中"}</p></Card>
        <Card><CardTitle>巡检状态</CardTitle><p className="text-sm">运行 {systemHealth?.collection.activeRuns ?? "-"} / 降级 {systemHealth?.collection.degradedRuns ?? "-"}</p></Card>
        <Card>
          <CardTitle>采集健康</CardTitle>
          <p className="text-xs leading-5 text-muted">
            健康 {systemHealth?.collection.routeStatusCounts?.UPLOADED ?? "-"}
            {" · "}老化 {systemHealth?.collection.routeStatusCounts?.AGING ?? "-"}
            {" · "}部分 {systemHealth?.collection.routeStatusCounts?.PARTIAL ?? "-"}
          </p>
          <p className="text-xs leading-5 text-muted">
            过期 {systemHealth?.collection.routeStatusCounts?.STALE ?? "-"}
            {" · "}卡死 {systemHealth?.collection.routeIssueCounts?.COLLECTOR_STALLED ?? "-"}
            {" · "}失败 {systemHealth?.collection.routeStatusCounts?.FAILED ?? "-"}
            {" · "}未验证 {systemHealth?.collection.routeStatusCounts?.UNVERIFIED ?? "-"}
          </p>
        </Card>
        <Card><CardTitle>AI 解释</CardTitle><p className="text-sm">{systemHealth?.ai.status || "检查中"}</p></Card>
        <Card><CardTitle>版本</CardTitle><p className="text-sm">{buildMetadata ? `${buildMetadata.productVersion} / ${buildMetadata.gitSha.slice(0, 8)}` : "-"}</p></Card>
      </section>

      {error ? <div className="mb-4 rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}
      <section className="grid gap-4">
        {accounts.map((account) => {
          const latest = account.projects[0];
          return (
            <Card key={account.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{account.accountName}</h2><span className="rounded border border-border px-2 py-0.5 text-xs text-muted">{accountIdentityStatusLabels[account.identityStatus]}</span></div>
                  <p className="mt-1 text-sm text-muted">{account.platformAccountId ? `账号 ID：${account.platformAccountId}` : "尚未填写平台账号 ID"}{account.storeName ? ` / ${account.storeName}` : ""}</p>
                  <p className="mt-2 text-sm">{latest ? `最近项目：${latest.name} · ${subjectTypeLabels[latest.subjectType]} · 任务 ${latest._count.tasks}` : "尚未创建诊断项目"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="rounded-md border border-border px-3 py-2 text-sm" href={`/accounts/${account.id}`}>查看账号档案</Link>
                  {latest ? <Link className="rounded-md bg-primary px-3 py-2 text-sm text-white" href={`/projects/${latest.id}`}>继续上次项目</Link> : null}
                  <Link className="rounded-md border border-primary px-3 py-2 text-sm text-primary" href={`/projects/new?accountId=${account.id}${latest ? `&sourceProjectId=${latest.id}` : ""}`}>{latest ? "复用配置新建项目" : "创建首个项目"}</Link>
                  <button className="rounded-md border border-danger px-3 py-2 text-sm text-danger disabled:cursor-not-allowed disabled:opacity-50" disabled={deletingAccountId === account.id} title="删除错误或重复账号档案" type="button" onClick={() => { setDeleteError(""); setAccountPendingDeletion(account); }}>删除</button>
                </div>
              </div>
            </Card>
          );
        })}
        {accounts.length === 0 ? <Card><CardTitle>第一次使用</CardTitle><p className="mb-4 text-sm text-muted">先建立一个平台账号档案。以后再次使用时直接从这里继续，不需要重复填写基础信息。</p><Link className="inline-block rounded-md bg-primary px-4 py-2 text-sm text-white" href="/accounts/new">创建第一个账号档案</Link></Card> : null}
      </section>

      <ConfirmDialog
        confirmLabel="确认永久删除"
        description={accountPendingDeletion ? `即将删除账号档案“${accountPendingDeletion.accountName}”。请仅在确认这是错误或重复档案时继续。` : ""}
        error={deleteError}
        isLoading={Boolean(accountPendingDeletion && deletingAccountId === accountPendingDeletion.id)}
        loadingLabel="正在删除..."
        open={Boolean(accountPendingDeletion)}
        title="永久删除账号档案"
        onCancel={() => { setDeleteError(""); setAccountPendingDeletion(null); }}
        onConfirm={() => { if (accountPendingDeletion) void deleteAccount(accountPendingDeletion); }}
      >
        {accountPendingDeletion ? (
          <div className="mt-5">
            <div className="grid grid-cols-2 border-y border-border py-4">
              <div className="border-r border-border pr-4">
                <p className="text-xs text-muted">项目数量</p>
                <p className="mt-1 text-lg font-bold text-foreground">{accountPendingDeletion.projects.length}</p>
              </div>
              <div className="pl-4">
                <p className="text-xs text-muted">采集任务</p>
                <p className="mt-1 text-lg font-bold text-foreground">{accountPendingDeletion.projects.reduce((total, project) => total + project._count.tasks, 0)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">将同步删除全部项目、任务、快照、指标、诊断、建议、审批、执行和复盘记录。此操作无法撤销。</p>
          </div>
        ) : null}
      </ConfirmDialog>
    </main>
  );
}
