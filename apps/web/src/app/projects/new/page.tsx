"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cooperationTypeLabels, cooperationTypes, operatorTypeLabels, operatorTypes, subjectTypeLabels, subjectTypes, type CooperationType, type OperatorType, type SubjectType } from "@douyin-local-life/shared";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";

type Account = { id: string; accountName: string };
type SourceProject = { id: string; accountProfileId: string; name: string; subjectType: SubjectType; operatorType: OperatorType; cooperationType: CooperationType; serviceProviderName: string | null; serviceFee: number | null };

export default function NewProjectPage() { return <Suspense fallback={<main className="p-8 text-sm text-muted">加载中...</main>}><NewProjectForm /></Suspense>; }

function NewProjectForm() {
  const router = useRouter(); const search = useSearchParams(); const { token, hydrated } = useAuth();
  const accountId = search.get("accountId") || ""; const sourceProjectId = search.get("sourceProjectId") || "";
  const [account, setAccount] = useState<Account | null>(null); const [source, setSource] = useState<SourceProject | null>(null);
  const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false); const [advanced, setAdvanced] = useState(false);
  const [selectedSubjectType, setSelectedSubjectType] = useState<SubjectType>("SERVICE_PROVIDER");
  const [selectedOperatorType, setSelectedOperatorType] = useState<OperatorType>("SERVICE_PROVIDER_LIVE");
  const [selectedCooperationType, setSelectedCooperationType] = useState<CooperationType>("SERVICE_PROVIDER_CONTRACT");
  const [serviceFee, setServiceFee] = useState("");
  useEffect(() => { if (!token || !accountId) return; apiFetch<Account>(`/account-profiles/${accountId}`, token).then(setAccount).catch((e) => setError(e instanceof Error ? e.message : "读取账号失败")); }, [token, accountId]);
  useEffect(() => { if (!token || !sourceProjectId || !accountId) return; apiFetch<SourceProject>(`/projects/${sourceProjectId}`, token).then((value) => { if (value.accountProfileId !== accountId) { setSource(null); setError("源项目与当前账号不一致，不能跨账号复制配置。"); return; } setSource(value); setSelectedSubjectType(value.subjectType); setSelectedOperatorType(value.operatorType); setSelectedCooperationType(value.cooperationType); setServiceFee(value.serviceFee == null ? "" : String(value.serviceFee)); setAdvanced(value.serviceFee != null); }).catch((e) => setError(e instanceof Error ? e.message : "读取上次配置失败")); }, [token, sourceProjectId, accountId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token || !account || submitting) return; setSubmitting(true); setError("");
    const form = new FormData(event.currentTarget); const serviceProviderName = String(form.get("serviceProviderName") || "").trim();
    try {
      const project = source
        ? await apiFetch<{ id: string }>(`/projects/${source.id}/clone`, token, {
            method: "POST",
            body: JSON.stringify({
              name: form.get("name"), accountProfileId: account.id,
              subjectType: form.get("subjectType"), operatorType: form.get("operatorType"), cooperationType: form.get("cooperationType"),
              serviceProviderName: serviceProviderName || null, serviceFee: serviceFee.trim() ? Number(serviceFee) : null
            })
          })
        : await apiFetch<{ id: string }>("/projects", token, { method: "POST", body: JSON.stringify({
            accountProfileId: account.id, name: form.get("name"), businessType: "DOUYIN_LOCAL_LIFE",
            subjectType: form.get("subjectType"), operatorType: form.get("operatorType"), cooperationType: form.get("cooperationType"),
            subjectConfidence: 1, serviceProviderName: serviceProviderName || undefined, serviceFee: serviceFee.trim() ? Number(serviceFee) : undefined
          }) });
      router.push(`/projects/${project.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "创建项目失败"); } finally { setSubmitting(false); }
  }

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState />;
  if (!accountId) return <main className="mx-auto max-w-3xl px-6 py-8"><Card><CardTitle>请先选择账号</CardTitle><p className="mb-3 text-sm text-muted">项目必须归属于一个明确的平台账号，不能脱离账号单独创建。</p><Link className="text-primary" href="/dashboard">返回账号工作台</Link></Card></main>;
  if (!account) return <main className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted">{error || "正在读取账号档案..."}</main>;
  if (sourceProjectId && !source && !error) return <main className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted">正在读取上次配置...</main>;
  if (sourceProjectId && error && !source) return <main className="mx-auto max-w-3xl px-6 py-8"><Card><CardTitle>无法复用项目配置</CardTitle><p className="mb-3 text-sm text-danger">{error}</p><Link className="text-primary" href={`/accounts/${account.id}`}>返回账号档案</Link></Card></main>;
  const defaults = source || { name: "", subjectType: "SERVICE_PROVIDER" as SubjectType, operatorType: "SERVICE_PROVIDER_LIVE" as OperatorType, cooperationType: "SERVICE_PROVIDER_CONTRACT" as CooperationType, serviceProviderName: "", serviceFee: null };
  const requiresServiceProviderName = selectedSubjectType === "SERVICE_PROVIDER" || selectedOperatorType === "SERVICE_PROVIDER_LIVE" || selectedOperatorType === "SERVICE_PROVIDER_OPERATION";
  return <main className="mx-auto max-w-3xl px-6 py-8"><Link className="text-sm text-primary" href={`/accounts/${account.id}`}>返回账号档案</Link><Card className="mt-4"><CardTitle>{source ? "复用上次基础信息创建新项目" : "创建账号诊断项目"}</CardTitle><div className="mb-5 rounded-md border border-border bg-slate-50 p-3 text-sm"><strong>当前账号：{account.accountName}</strong><p className="mt-1 text-muted">采集权限由插件配对凭证和任务归属在服务端校验。</p>{source ? <p className="mt-2 text-muted">已从“{source.name}”预填基础配置，你可以按本次活动调整。提交后只创建新项目，不修改源项目，也不复制快照、诊断和动作记录。</p> : null}</div><form className="grid gap-4" key={sourceProjectId || account.id} onSubmit={submit}>
    <label className="grid gap-1 text-sm"><span>项目名称 <strong className="text-danger">必填</strong></span><Input name="name" required defaultValue={source ? `${source.name} - 新周期` : ""} placeholder="例如：7 月第二场直播诊断" /><span className="text-xs text-muted">项目代表一次活动或经营阶段，历史记录按项目独立保存。</span></label>
    <fieldset className={source ? "grid gap-4 rounded-md border border-blue-200 bg-blue-50/40 p-3" : "grid gap-4"}><legend className="px-1 text-sm font-medium">{source ? "已预填，可按本次活动修改" : "主体与服务商配置"}</legend><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm"><span>直播主体 <strong className="text-danger">必填</strong></span><Select name="subjectType" value={selectedSubjectType} onChange={(event) => setSelectedSubjectType(event.target.value as SubjectType)}>{subjectTypes.filter((v) => v !== "SUBJECT_PENDING").map((type) => <option key={type} value={type}>{subjectTypeLabels[type]}</option>)}</Select><span className="text-xs text-muted">直播间以哪类账号或身份开播。</span></label><label className="grid gap-1 text-sm"><span>实际操盘 <strong className="text-danger">必填</strong></span><Select name="operatorType" value={selectedOperatorType} onChange={(event) => setSelectedOperatorType(event.target.value as OperatorType)}>{operatorTypes.filter((v) => v !== "OPERATOR_PENDING").map((type) => <option key={type} value={type}>{operatorTypeLabels[type]}</option>)}</Select><span className="text-xs text-muted">谁负责直播、投放和日常运营。</span></label><label className="grid gap-1 text-sm"><span>合作关系 <strong className="text-danger">必填</strong></span><Select name="cooperationType" value={selectedCooperationType} onChange={(event) => setSelectedCooperationType(event.target.value as CooperationType)}>{cooperationTypes.filter((v) => v !== "COOPERATION_PENDING").map((type) => <option key={type} value={type}>{cooperationTypeLabels[type]}</option>)}</Select><span className="text-xs text-muted">账号方与实际操盘方之间的业务关系。</span></label><label className="grid gap-1 text-sm"><span>服务商名称 {requiresServiceProviderName ? <strong className="text-danger">必填</strong> : <span className="text-muted">选填</span>}</span><Input name="serviceProviderName" required={requiresServiceProviderName} defaultValue={defaults.serviceProviderName || ""} placeholder="服务商代播/代运营时填写" /></label></div>
    <div className="border-t border-border pt-4"><button className="text-sm font-medium text-primary" type="button" onClick={() => setAdvanced((v) => !v)}>{advanced ? "收起高级成本项" : "展开高级成本项（选填）"}</button>{advanced ? <label className="mt-3 grid gap-1 text-sm"><span>本次诊断分摊服务成本 <span className="text-muted">选填</span></span><Input name="serviceFee" type="number" min="0" step="0.01" value={serviceFee} onChange={(event) => setServiceFee(event.target.value)} placeholder="不填写时不计算服务商后毛利 ROI" /><span className="text-xs text-muted">只填写应分摊到本次诊断窗口的成本，不是合同总金额。</span></label> : null}</div></fieldset>
    {error ? <div className="rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}<Button disabled={submitting} type="submit">{submitting ? "正在创建..." : "创建诊断项目"}</Button>
  </form></Card></main>;
}
