"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  actionProposalStatusLabels,
  actionTypeLabels,
  aiDisclaimer,
  subjectTypeLabels,
  type ActionProposalStatus,
  type ActionType,
  type RiskLevel,
  type SubjectType
} from "@douyin-local-life/shared";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

type Project = {
  id: string;
  name: string;
  subjectType: SubjectType;
};

type ActionProposal = {
  id: string;
  projectId: string;
  collectionTaskId: string;
  actionType: ActionType;
  title: string;
  reason: string;
  riskLevel: RiskLevel;
  confidence: number;
  status: ActionProposalStatus;
  requiresApproval: boolean;
  createdAt: string;
  expiresAt: string | null;
  projectName?: string;
  projectSubjectType?: SubjectType;
};

const statuses: Array<ActionProposalStatus | "ALL"> = ["ALL", "PENDING_APPROVAL", "APPROVED", "OBSERVING", "REJECTED", "MANUAL_EXECUTED", "EXPIRED", "SUPERSEDED"];

export default function DecisionCenterPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [status, setStatus] = useState<ActionProposalStatus | "ALL">("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    void load();
  }, [token]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const nextProjects = await apiFetch<Project[]>("/projects", token);
      const proposalGroups = await Promise.all(
        nextProjects.map(async (project) => {
          const rows = await apiFetch<ActionProposal[]>(`/projects/${project.id}/action-proposals`, token);
          return rows.map((proposal) => ({
            ...proposal,
            projectName: project.name,
            projectSubjectType: project.subjectType
          }));
        })
      );
      setProjects(nextProjects);
      setProposals(proposalGroups.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取决策中心失败");
    } finally {
      setLoading(false);
    }
  }

  const visibleProposals = useMemo(() => {
    return status === "ALL" ? proposals : proposals.filter((proposal) => proposal.status === status);
  }, [proposals, status]);

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

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm text-primary" href="/dashboard">
            返回工作台
          </Link>
          <h1 className="mt-3 text-3xl font-bold">决策中心</h1>
          <p className="text-sm text-muted">项目 {projects.length} / 动作建议 {proposals.length}</p>
        </div>
        <label className="grid gap-1 text-sm">
          状态
          <Select value={status} onChange={(event) => setStatus(event.target.value as ActionProposalStatus | "ALL")}>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "全部" : actionProposalStatusLabels[item]}
              </option>
            ))}
          </Select>
        </label>
      </header>

      <div className="mb-4 rounded-lg border border-border bg-white p-3 text-sm text-muted">{aiDisclaimer}</div>
      {error ? <div className="mb-4 rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}

      <section className="grid gap-3">
        {visibleProposals.map((proposal) => (
          <Link href={`/action-proposals/${proposal.id}`} key={proposal.id}>
            <Card className="transition hover:border-primary">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{proposal.projectName || proposal.projectId}</span>
                    <span>{proposal.projectSubjectType ? subjectTypeLabels[proposal.projectSubjectType] : "主体待校准"}</span>
                    <span>{new Date(proposal.createdAt).toLocaleString("zh-CN")}</span>
                    {proposal.expiresAt ? <span>有效至 {new Date(proposal.expiresAt).toLocaleString("zh-CN")}</span> : null}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold">{proposal.title}</h2>
                  <p className="mt-1 text-sm text-muted">{proposal.reason}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 text-xs">
                  <span className="rounded-md border border-border px-2 py-1">{actionTypeLabels[proposal.actionType]}</span>
                  <span className="rounded-md border border-border px-2 py-1">{actionProposalStatusLabels[proposal.status]}</span>
                  <span className="rounded-md border border-border px-2 py-1">风险 {proposal.riskLevel}</span>
                  <span className="rounded-md border border-border px-2 py-1">置信度 {proposal.confidence}</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {loading ? <Card className="text-sm text-muted">加载中...</Card> : null}
        {!loading && visibleProposals.length === 0 ? <Card className="text-sm text-muted">暂无动作建议。</Card> : null}
      </section>
    </main>
  );
}
