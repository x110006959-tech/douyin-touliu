"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  aiDisclaimer,
  controlLevelLabels,
  cooperationTypeLabels,
  operatorTypeLabels,
  subjectTypeLabels,
  type ControlLevel,
  type CooperationType,
  type OperatorType,
  type SubjectType
} from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

type ProjectDetail = {
  id: string;
  name: string;
  businessType: string;
  subjectType: SubjectType;
  operatorType: OperatorType;
  cooperationType: CooperationType;
  controlLevel: ControlLevel;
  subjectConfidence: number;
  serviceProviderName: string | null;
  serviceMode: string | null;
  serviceFee: number | null;
  status: string;
  tasks: Array<{ id: string; status: string; pageTitle: string | null; sourceUrl: string | null; createdAt: string }>;
  latestRecommendation?: { summary: string; riskLevel: string; confidence: number } | null;
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");

  function load() {
    if (!token) return;
    apiFetch<ProjectDetail>(`/projects/${params.id}`, token)
      .then(setProject)
      .catch((err) => setError(err instanceof Error ? err.message : "读取项目失败"));
  }

  useEffect(load, [token, params.id]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !project) return;
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/collection-tasks", token, {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          sourceUrl: form.get("sourceUrl") || undefined,
          pageTitle: form.get("pageTitle") || undefined
        })
      });
      event.currentTarget.reset();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建任务失败");
    }
  }

  if (!project) {
    return <main className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted">{error || "加载中..."}</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Link className="text-sm text-primary" href="/dashboard">
        返回工作台
      </Link>
      <header className="mb-6 mt-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-sm text-muted">业务：抖音生活服务 / 巨量本地推</p>
          </div>
          <Link className="rounded-md border border-border px-4 py-2 text-sm font-medium" href={`/decision-center`}>
            查看动作建议
          </Link>
        </div>
      </header>

      <div className="mb-4 rounded-lg border border-border bg-white p-3 text-sm text-muted">{aiDisclaimer}</div>

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <Card>
          <CardTitle>主体类型</CardTitle>
          <p className="text-sm">{subjectTypeLabels[project.subjectType]}</p>
        </Card>
        <Card>
          <CardTitle>操盘主体</CardTitle>
          <p className="text-sm">{operatorTypeLabels[project.operatorType]}</p>
        </Card>
        <Card>
          <CardTitle>合作关系</CardTitle>
          <p className="text-sm">{cooperationTypeLabels[project.cooperationType]}</p>
        </Card>
        <Card>
          <CardTitle>当前算法</CardTitle>
          <p className="text-sm">{project.subjectType === "SERVICE_PROVIDER" ? "服务商算法" : "主体框架算法"}</p>
        </Card>
      </section>

      {project.latestRecommendation ? (
        <Card className="mb-4">
          <CardTitle>最近一次诊断</CardTitle>
          <p>{project.latestRecommendation.summary}</p>
          <p className="mt-2 text-sm text-muted">
            风险：{project.latestRecommendation.riskLevel} / 置信度：{project.latestRecommendation.confidence}
          </p>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-[360px_1fr]">
        <Card>
          <CardTitle>新建采集任务</CardTitle>
          <form className="grid gap-3" onSubmit={createTask}>
            <Input name="pageTitle" placeholder="页面标题，可由插件上传时补齐" />
            <Input name="sourceUrl" type="url" placeholder="页面 URL，可由插件上传时补齐" />
            {error ? <div className="rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}
            <Button type="submit">新建任务</Button>
          </form>
        </Card>

        <Card>
          <CardTitle>采集任务列表</CardTitle>
          <div className="grid gap-2">
            {project.tasks.map((task) => (
              <Link className="rounded-md border border-border p-3 hover:border-primary" href={`/tasks/${task.id}`} key={task.id}>
                <div className="font-medium">{task.pageTitle || task.sourceUrl || task.id}</div>
                <div className="text-sm text-muted">{task.status}</div>
              </Link>
            ))}
            {project.tasks.length === 0 ? <div className="text-sm text-muted">暂无任务。先新建任务，再用插件上传大屏或后台快照。</div> : null}
          </div>
        </Card>
      </section>
    </main>
  );
}
