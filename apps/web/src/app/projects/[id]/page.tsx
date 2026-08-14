"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { aiDisclaimer, defaultCollectionRouteTemplates, collectionTaskStatusLabels, cooperationTypeLabels, isPrimaryCollectionRouteKey, operatorTypeLabels, subjectTypeLabels, type CollectionTaskStatus, type CooperationType, type OperatorType, type SubjectType } from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { apiFetch, createIdempotencyKey } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";

type RouteSource = { id: string; routeKey: string; label: string; sourceUrl: string | null; required: boolean; status: string; lastCapturedAt: string | null };
type CollectionTaskArchive = { id: string; status: CollectionTaskStatus; pageTitle: string | null; createdAt: string; routeSources: RouteSource[] };
type ProjectDetail = {
  id: string; name: string; subjectType: SubjectType; operatorType: OperatorType; cooperationType: CooperationType; subjectConfidence: number;
  serviceProviderName: string | null; serviceMode: string | null; serviceFee: number | null; status: string;
  accountProfile: { id: string; accountName: string };
  tasks: CollectionTaskArchive[];
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>(); const router = useRouter(); const { token, hydrated } = useAuth();
  const [project, setProject] = useState<ProjectDetail | null>(null); const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<CollectionTaskArchive | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const [deleteTaskError, setDeleteTaskError] = useState("");
  const taskIdempotencyKey = useRef<string | null>(null);
  function load() { if (!token) return; apiFetch<ProjectDetail>(`/projects/${params.id}`, token).then(setProject).catch((e) => setError(e instanceof Error ? e.message : "读取项目失败")); }
  useEffect(load, [token, params.id]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token || !project || submitting) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); setSubmitting(true); setError("");
    try {
      taskIdempotencyKey.current ||= createIdempotencyKey(`task:${project.id}`);
      const task = await apiFetch<{ id: string }>("/collection-tasks", token, { method: "POST", headers: { "idempotency-key": taskIdempotencyKey.current }, body: JSON.stringify({ projectId: project.id, pageTitle: form.get("pageTitle") }) });
      taskIdempotencyKey.current = null; formElement.reset(); router.push(`/tasks/${task.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "创建采集任务失败"); } finally { setSubmitting(false); }
  }

  async function deleteTask() {
    if (!token || !taskToDelete || deletingTask) return;
    setDeletingTask(true);
    setDeleteTaskError("");
    try {
      await apiFetch(`/collection-tasks/${taskToDelete.id}`, token, {
        method: "DELETE",
        body: JSON.stringify({ confirmTaskId: taskToDelete.id })
      });
      setProject((current) => current ? { ...current, tasks: current.tasks.filter((task) => task.id !== taskToDelete.id) } : current);
      setTaskToDelete(null);
    } catch (cause) {
      setDeleteTaskError(cause instanceof Error ? cause.message : "删除采集任务失败，请稍后重试");
    } finally {
      setDeletingTask(false);
    }
  }

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState />;
  if (!project) return <main className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted">{error || "加载中..."}</main>;
  return <><main className="mx-auto max-w-6xl px-6 py-8">
    <Link className="text-sm text-primary" href={`/accounts/${project.accountProfile.id}`}>返回账号档案</Link>
    <header className="mb-5 mt-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-primary">当前账号：{project.accountProfile.accountName}</p><h1 className="text-3xl font-bold">{project.name}</h1><p className="mt-1 text-sm text-muted">所有采集与诊断只归入当前账号</p></div><div className="flex gap-2"><Link className="rounded-md border border-border px-4 py-2 text-sm" href={`/projects/new?accountId=${project.accountProfile.id}&sourceProjectId=${project.id}`}>复用配置新建项目</Link><Link className="rounded-md border border-border px-4 py-2 text-sm" href="/decision-center">查看动作建议</Link></div></header>
    <div className="mb-4 rounded-lg border border-border bg-white p-3 text-sm text-muted">{aiDisclaimer}</div>
    <details className="group mb-4 rounded-md border border-border bg-white px-4 py-3 shadow-sm">
      <summary className="cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">项目配置</span>
            <span className="text-muted">{subjectTypeLabels[project.subjectType]}</span>
            <span className="text-border">·</span>
            <span className="text-muted">{operatorTypeLabels[project.operatorType]}</span>
            <span className="text-border">·</span>
            <span className="text-muted">{cooperationTypeLabels[project.cooperationType]}</span>
            <span className="text-border">·</span>
            <span className="text-muted">{project.subjectType === "SERVICE_PROVIDER" ? "服务商算法" : "主体框架算法"}</span>
          </div>
          <span className="shrink-0 text-xs text-primary group-open:hidden">查看存档</span>
          <span className="hidden shrink-0 text-xs text-primary group-open:inline">收起存档</span>
        </div>
      </summary>
      <div className="mt-3 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
        <div><span className="text-xs text-muted">直播主体</span><p>{subjectTypeLabels[project.subjectType]}</p></div>
        <div><span className="text-xs text-muted">实际操盘</span><p>{operatorTypeLabels[project.operatorType]}</p></div>
        <div><span className="text-xs text-muted">合作关系</span><p>{cooperationTypeLabels[project.cooperationType]}</p></div>
        <div><span className="text-xs text-muted">当前算法</span><p>{project.subjectType === "SERVICE_PROVIDER" ? "服务商算法" : "主体框架算法"}</p></div>
        <div><span className="text-xs text-muted">服务商</span><p>{project.serviceProviderName || "未填写"}</p></div>
        <div><span className="text-xs text-muted">服务方式</span><p>{project.serviceMode || operatorTypeLabels[project.operatorType]}</p></div>
        <div className="sm:col-span-2"><span className="text-xs text-muted">本次分摊服务成本</span><p>{project.serviceFee == null ? "未填写，不计算服务商后毛利 ROI" : `¥${project.serviceFee}`}</p></div>
      </div>
    </details>
    <Card className="mb-4"><CardTitle>第一次使用按这 5 步操作</CardTitle><ol className="grid gap-2 text-sm md:grid-cols-5"><li><strong>1. 确认账号</strong><p className="text-muted">检查页面顶部账号与平台一致</p></li><li><strong>2. 新建任务</strong><p className="text-muted">一个直播场次或诊断周期一个任务</p></li><li><strong>3. 打开页面</strong><p className="text-muted">打开本地推数据页或直播数据大屏</p></li><li><strong>4. 插件采集</strong><p className="text-muted">本地推采集一次，直播页开启 API 持续采集</p></li><li><strong>5. 复核诊断</strong><p className="text-muted">确认缺失指标后生成建议</p></li></ol></Card>
    <section className="grid gap-4 lg:grid-cols-[460px_1fr]">
      <Card><CardTitle>新建本次采集任务</CardTitle><form className="grid gap-4" onSubmit={createTask}><label className="grid gap-1 text-sm"><span>任务名称 <strong className="text-danger">必填</strong></span><Input name="pageTitle" required placeholder="例如：7月14日晚场直播" /></label><div className="grid gap-3">{defaultCollectionRouteTemplates.map((route) => <div className="grid gap-1 rounded-md border border-border p-3 text-sm" key={route.routeKey}><span className="font-medium">{route.label} <span className="text-danger">基础路线</span></span><span className="text-xs text-muted">{route.website}：{route.purpose}</span><span className="text-xs text-muted">{route.urlHint}</span></div>)}</div><div className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-muted">任务默认只保留基础采集路线；直播 API 持续采集的数据请在网页端实时数据栏查看。系统不会代替你登录或自动打开、点击平台页面。</div>{error ? <div className="rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}<Button disabled={submitting} type="submit">{submitting ? "正在创建..." : "创建任务并查看采集清单"}</Button></form></Card>
      <Card>
        <CardTitle>采集任务存档</CardTitle>
        <div className="grid gap-3">
          {project.tasks.map((task) => {
            const hasCaptured = task.routeSources.some((route) => isPrimaryCollectionRouteKey(route.routeKey) && route.status === "CAPTURED");
            return (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 transition hover:border-primary" key={task.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{task.pageTitle || "未命名任务"}</p>
                  <p className="text-sm text-muted">{collectionTaskStatusLabels[task.status]} · {hasCaptured ? "已有采集记录" : "尚未采集"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link className="rounded-md border border-border px-3 py-2 text-sm text-primary hover:bg-blue-50" href={`/tasks/${task.id}`}>进入任务</Link>
                  <Button
                    aria-label={`删除采集任务${task.pageTitle || "未命名任务"}`}
                    className="border border-danger bg-white px-3 text-danger hover:bg-red-50"
                    onClick={() => { setDeleteTaskError(""); setTaskToDelete(task); }}
                    type="button"
                  >
                    删除
                  </Button>
                </div>
              </div>
            );
          })}
          {project.tasks.length === 0 ? <div className="text-sm text-muted">还没有任务。先在左侧创建，系统会列出直播大屏和巨量本地推所需页面。</div> : null}
        </div>
      </Card>
    </section>
  </main>
  <ConfirmDialog
    confirmLabel="永久删除任务"
    description={`确认永久删除采集任务“${taskToDelete?.pageTitle || "未命名任务"}”吗？`}
    error={deleteTaskError}
    isLoading={deletingTask}
    loadingLabel="正在删除..."
    onCancel={() => { if (!deletingTask) { setTaskToDelete(null); setDeleteTaskError(""); } }}
    onConfirm={() => void deleteTask()}
    open={Boolean(taskToDelete)}
    title="删除采集任务"
  >
    <div className="mt-4 rounded-md border border-danger bg-red-50 px-4 py-3 text-sm leading-6 text-foreground">
      <p>将同时删除该任务的页面路线、采集快照、复核指标、诊断、动作建议、审批、执行和复盘记录。</p>
      <p className="mt-2 font-semibold text-danger">此操作不可撤销，仅用于清理错误或重复任务。</p>
    </div>
  </ConfirmDialog>
  </>;
}
