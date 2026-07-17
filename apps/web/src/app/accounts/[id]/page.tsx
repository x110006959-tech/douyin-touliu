"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { accountIdentityStatusLabels, subjectTypeLabels, type AccountIdentityStatus, type SubjectType } from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";

type Account = { id: string; accountName: string; platformAccountId: string | null; merchantName: string | null; storeName: string | null; memo: string | null; identityStatus: AccountIdentityStatus; projects: Array<{ id: string; name: string; subjectType: SubjectType; status: string; updatedAt: string; _count: { tasks: number } }> };
type PairingCode = { code: string; expiresAt: string };
type ExtensionCredential = { id: string; label: string | null; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null; accountProfile: { id: string; accountName: string } };

export default function AccountPage() {
  const params = useParams<{ id: string }>();
  const { token, hydrated } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [message, setMessage] = useState("");
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [credentials, setCredentials] = useState<ExtensionCredential[]>([]);
  const [credentialToRevoke, setCredentialToRevoke] = useState<ExtensionCredential | null>(null);
  const [busy, setBusy] = useState("");
  const load = () => { if (token) void apiFetch<Account>(`/account-profiles/${params.id}`, token).then(setAccount).catch((e) => setMessage(e instanceof Error ? e.message : "读取账号失败")); };
  const loadCredentials = () => { if (token) void apiFetch<ExtensionCredential[]>("/extension/credentials", token).then((rows) => setCredentials(rows.filter((row) => row.accountProfile.id === params.id))).catch(() => setCredentials([])); };
  useEffect(() => { load(); loadCredentials(); }, [token, params.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token || !account) return;
    const form = new FormData(event.currentTarget); setMessage("");
    try {
      await apiFetch(`/account-profiles/${account.id}`, token, { method: "PATCH", body: JSON.stringify({ accountName: form.get("accountName"), platformAccountId: form.get("platformAccountId") || null, merchantName: form.get("merchantName") || null, storeName: form.get("storeName") || null, memo: form.get("memo") || null }) });
      setMessage("账号档案已保存"); load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "保存失败"); }
  }

  async function createPairingCode() {
    if (!token || !account || busy) return;
    setBusy("pairing"); setMessage("");
    try {
      const created = await apiFetch<PairingCode>("/extension/pairing-codes", token, { method: "POST", body: JSON.stringify({ accountProfileId: account.id }) });
      setPairingCode(created);
    } catch (e) { setMessage(e instanceof Error ? e.message : "生成配对码失败"); } finally { setBusy(""); }
  }

  async function revokeCredential() {
    if (!token || !credentialToRevoke || busy) return;
    setBusy("revoke");
    try {
      await apiFetch(`/extension/credentials/${credentialToRevoke.id}`, token, { method: "DELETE" });
      setCredentialToRevoke(null); loadCredentials(); setMessage("插件授权已撤销");
    } catch (e) { setMessage(e instanceof Error ? e.message : "撤销授权失败"); } finally { setBusy(""); }
  }

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState />;
  if (!account) return <main className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted">{message || "加载中..."}</main>;
  const latest = account.projects[0];
  return <main className="mx-auto max-w-5xl px-6 py-8">
    <Link className="text-sm text-primary" href="/dashboard">返回账号工作台</Link>
    <header className="my-4"><h1 className="text-3xl font-bold">{account.accountName}</h1><p className="text-sm text-muted">{accountIdentityStatusLabels[account.identityStatus]} · 该账号下的项目、采集和诊断永久独立存档</p></header>
    <section className="grid gap-4 md:grid-cols-[360px_1fr]">
      <Card><CardTitle>账号基础资料</CardTitle><form className="grid gap-3" onSubmit={save}><label className="grid gap-1 text-sm">账号名称<Input name="accountName" required defaultValue={account.accountName} /></label><label className="grid gap-1 text-sm">平台账号 ID<Input name="platformAccountId" defaultValue={account.platformAccountId || ""} /></label><label className="grid gap-1 text-sm">商家/品牌<Input name="merchantName" defaultValue={account.merchantName || ""} /></label><label className="grid gap-1 text-sm">门店/区域<Input name="storeName" defaultValue={account.storeName || ""} /></label><label className="grid gap-1 text-sm">账号备忘<Textarea name="memo" defaultValue={account.memo || ""} /></label><Button type="submit">保存账号资料</Button>{message ? <p className="text-sm text-muted">{message}</p> : null}</form></Card>
      <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><CardTitle className="mb-0">诊断项目存档</CardTitle><Link className="rounded-md bg-primary px-3 py-2 text-sm text-white" href={`/projects/new?accountId=${account.id}${latest ? `&sourceProjectId=${latest.id}` : ""}`}>{latest ? "复用配置新建项目" : "创建首个项目"}</Link></div><div className="grid gap-2">{account.projects.map((project) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3" key={project.id}><div><p className="font-medium">{project.name}</p><p className="text-sm text-muted">{subjectTypeLabels[project.subjectType]} · 任务 {project._count.tasks}</p></div><Link className="text-sm text-primary" href={`/projects/${project.id}`}>{project.id === latest?.id ? "继续上次项目" : "查看存档"}</Link></div>)}{account.projects.length === 0 ? <p className="text-sm text-muted">该账号还没有诊断项目。</p> : null}</div></Card>
    </section>
    <Card className="mt-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="mb-1">连接采集插件</CardTitle><p className="text-sm text-muted">配对码只绑定当前账号，有效期 5 分钟。插件不能审批建议或执行任何平台操作。</p></div><Button type="button" disabled={busy === "pairing"} onClick={createPairingCode}>{busy === "pairing" ? "正在生成..." : "生成 6 位配对码"}</Button></div>{pairingCode ? <div className="mt-4 rounded-md border border-primary bg-blue-50 p-4"><p className="text-sm text-muted">请在 Chrome 插件弹窗中输入</p><p className="my-2 font-mono text-4xl font-bold tracking-[0.3em] text-primary">{pairingCode.code}</p><p className="text-xs text-muted">{new Date(pairingCode.expiresAt).toLocaleString("zh-CN")} 前有效，仅可使用一次。</p></div> : null}<div className="mt-5 grid gap-2"><p className="text-sm font-medium">已授权插件</p>{credentials.map((credential) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3" key={credential.id}><div><p className="text-sm font-medium">{credential.label || "Chrome 采集插件"}</p><p className="text-xs text-muted">{credential.revokedAt ? "已撤销" : `有效至 ${new Date(credential.expiresAt).toLocaleDateString("zh-CN")}`} · {credential.lastUsedAt ? `最近使用 ${new Date(credential.lastUsedAt).toLocaleString("zh-CN")}` : "尚未使用"}</p></div>{!credential.revokedAt ? <button className="rounded-md border border-danger px-3 py-2 text-sm text-danger" type="button" onClick={() => setCredentialToRevoke(credential)}>撤销授权</button> : null}</div>)}{credentials.length === 0 ? <p className="text-sm text-muted">尚未配对任何插件。</p> : null}</div></Card>
    <ConfirmDialog open={Boolean(credentialToRevoke)} title="撤销插件授权" description="撤销后，该插件将无法继续上传当前账号的数据，需要重新配对才能使用。" confirmLabel="确认撤销" loadingLabel="正在撤销..." isLoading={busy === "revoke"} onCancel={() => setCredentialToRevoke(null)} onConfirm={revokeCredential} />
  </main>;
}
