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
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";

type Account = { id: string; accountName: string; projects: Array<{ id: string }> };
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
  project: Project & { accountProfile: { id: string; accountName: string } };
};

const statuses: Array<ActionProposalStatus | "ALL"> = ["ALL", "PENDING_APPROVAL", "APPROVED", "OBSERVING", "REJECTED", "MANUAL_EXECUTED", "EXPIRED", "SUPERSEDED"];

export default function DecisionCenterPage() {
  const { token, hydrated } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [status, setStatus] = useState<ActionProposalStatus | "ALL">("ALL");
  const [accountId, setAccountId] = useState("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    void load();
  }, [token, status, accountId]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (status !== "ALL") query.set("status", status);
      if (accountId !== "ALL") query.set("accountProfileId", accountId);
      const [nextAccounts, nextProposals] = await Promise.all([
        apiFetch<Account[]>("/account-profiles", token),
        apiFetch<ActionProposal[]>(`/action-proposals${query.size ? `?${query.toString()}` : ""}`, token)
      ]);
      setAccounts(nextAccounts);
      setProposals(nextProposals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取决策中心失败");
    } finally {
      setLoading(false);
    }
  }

  const groupedProposals = useMemo(() => Object.entries(proposals.reduce<Record<string, ActionProposal[]>>((groups, proposal) => {
    (groups[proposal.project.accountProfile.id] ||= []).push(proposal);
    return groups;
  }, {})), [proposals]);

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState />;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm text-primary" href="/dashboard">
            返回工作台
          </Link>
          <h1 className="mt-3 text-3xl font-bold">决策中心</h1>
          <p className="text-sm text-muted">账号 {accounts.length} / 动作建议 {proposals.length}</p>
        </div>
        <div className="flex flex-wrap gap-3"><label className="grid gap-1 text-sm">账号<Select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="ALL">全部账号</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.accountName}</option>)}</Select></label><label className="grid gap-1 text-sm">
          状态
          <Select value={status} onChange={(event) => setStatus(event.target.value as ActionProposalStatus | "ALL")}>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "全部" : actionProposalStatusLabels[item]}
              </option>
            ))}
          </Select>
        </label></div>
      </header>

      <div className="mb-4 rounded-lg border border-border bg-white p-3 text-sm text-muted">{aiDisclaimer}</div>
      {error ? <div className="mb-4 rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}

      <section className="grid gap-5">
        {groupedProposals.map(([groupAccountId, group]) => group?.length ? <div className="grid gap-3" key={groupAccountId}><h2 className="text-lg font-semibold">账号：{group[0]!.project.accountProfile.accountName}</h2>{group.map((proposal) => (
          <Link href={`/action-proposals/${proposal.id}`} key={proposal.id}>
            <Card className="transition hover:border-primary">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{proposal.project.name}</span>
                    <span>{subjectTypeLabels[proposal.project.subjectType]}</span>
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
        ))}</div> : null)}
        {loading ? <Card className="text-sm text-muted">加载中...</Card> : null}
        {!loading && proposals.length === 0 ? <Card className="text-sm text-muted">暂无动作建议。</Card> : null}
      </section>
    </main>
  );
}
