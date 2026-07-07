"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { aiDisclaimer, extensionSafetyNotice, subjectTypeLabels, type SubjectType } from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

type Project = {
  id: string;
  name: string;
  businessType: string;
  subjectType: SubjectType;
  operatorType: string;
  status: string;
  subjectConfidence: number;
  tasks: Array<{ id: string; status: string; pageTitle: string | null }>;
};

export default function DashboardPage() {
  const { token, setToken } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<Project[]>("/projects", token)
      .then(setProjects)
      .catch((err) => setError(err instanceof Error ? err.message : "读取项目失败"));
  }, [token]);

  if (!token) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardTitle>请先登录</CardTitle>
          <p className="mb-4 text-sm leading-6 text-muted">登录后可进入 pxxis 投流诊断工作台，管理项目、采集任务和诊断建议。</p>
          <Link className="text-primary" href="/login">
            前往登录页
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">主体识别优先</p>
          <h1 className="text-3xl font-bold">pxxis 投流诊断工作台</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">用于管理项目、采集任务、AI 诊断、动作建议、人工审批和执行留痕。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border border-border px-4 py-2 text-sm font-medium" href="/extension">
            插件说明
          </Link>
          <Link className="rounded-md border border-border px-4 py-2 text-sm font-medium" href="/decision-center">
            决策中心
          </Link>
          <Link className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white" href="/projects/new">
            新建诊断项目
          </Link>
          <Button className="border border-border bg-white text-foreground" type="button" onClick={() => setToken(null)}>
            退出
          </Button>
        </div>
      </header>

      <div className="mb-4 grid gap-2 rounded-lg border border-border bg-white p-4 text-sm leading-6 text-muted">
        <p>{extensionSafetyNotice}</p>
        <p>{aiDisclaimer}</p>
        <p>第一版只提供诊断建议和人工留痕，不自动修改平台投放设置。</p>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-3">
        <Card>
          <CardTitle>当前主攻</CardTitle>
          <p className="text-sm text-muted">服务商代播/代运营：真实成本、服务费后毛利 ROI、SOP 执行。</p>
        </Card>
        <Card>
          <CardTitle>主体框架</CardTitle>
          <p className="text-sm text-muted">官方自播、职人、达人、矩阵、活动、品牌区域先保留框架。</p>
        </Card>
        <Card>
          <CardTitle>缺失处理</CardTitle>
          <p className="text-sm text-muted">主体不清、核销 ROI 缺失、活动未核验时只输出保守动作。</p>
        </Card>
      </section>

      {error ? <div className="mb-4 rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}
      <section className="grid gap-3">
        {projects.map((project) => (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <Card className="transition hover:border-primary">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{project.name}</h2>
                  <p className="text-sm text-muted">
                    {subjectTypeLabels[project.subjectType]} / {project.operatorType} / 置信度 {project.subjectConfidence}
                  </p>
                </div>
                <span className="rounded-md border border-border px-2 py-1 text-xs text-muted">任务 {project.tasks.length}</span>
              </div>
            </Card>
          </Link>
        ))}
        {projects.length === 0 ? <Card className="text-sm text-muted">暂无项目，请先新建一个主体诊断项目。</Card> : null}
      </section>
    </main>
  );
}
