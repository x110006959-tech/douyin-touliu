"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { AuthLoadingState, AuthRequiredState } from "@/components/auth-page-state";

export default function NewAccountPage() {
  const router = useRouter();
  const { token, hydrated, setToken } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const account = await apiFetch<{ id: string }>("/account-profiles", token, {
        method: "POST",
        body: JSON.stringify({
          accountName: form.get("accountName"),
          merchantName: form.get("merchantName") || undefined,
          storeName: form.get("storeName") || undefined,
          memo: form.get("memo") || undefined
        })
      });
      router.push(`/projects/new?accountId=${account.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "UNAUTHORIZED") {
        setToken(null);
        setError("登录状态已失效，请重新登录后再保存。账号备忘是选填项，无需填写任何登录凭证。");
      } else {
        setError(err instanceof Error ? err.message : "创建账号档案失败");
      }
    }
    finally { setSubmitting(false); }
  }

  if (!hydrated) return <AuthLoadingState />;
  if (!token) return <AuthRequiredState />;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link className="text-sm text-primary" href="/dashboard">返回账号工作台</Link>
      <Card className="mt-4">
        <CardTitle>创建平台账号档案</CardTitle>
        <p className="mb-5 text-sm leading-6 text-muted">一个抖音/巨量本地推账号只建立一次。插件凭证和任务归属由服务端校验，无需填写页面账号 ID。</p>
        <form className="grid gap-4" onSubmit={submit}>
          {error ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger bg-red-50 px-3 py-2 text-sm text-danger" role="alert"><span>{error}</span>{!token ? <Link className="font-semibold underline" href="/login">重新登录</Link> : null}</div> : null}
          <label className="grid gap-1 text-sm"><span>平台账号名称 <strong className="text-danger">必填</strong></span><Input name="accountName" required placeholder="例如：好想来零食乐园-广东区域号" /><span className="text-xs text-muted">填写平台右上角或账号切换处显示的完整名称。</span></label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm"><span>商家或品牌名称 <span className="text-muted">选填</span></span><Input name="merchantName" /></label>
            <label className="grid gap-1 text-sm"><span>门店或区域 <span className="text-muted">选填</span></span><Input name="storeName" /></label>
          </div>
          <label className="grid gap-1 text-sm"><span>账号备忘 <span className="text-muted">选填</span></span><Textarea name="memo" placeholder="例如：广东区域直播账号，绑定手机尾号 1234。仅记录用途和注意事项，不填写任何登录凭证。" /></label>
          <Button disabled={!token || submitting} type="submit">{submitting ? "正在创建..." : "保存账号并创建项目"}</Button>
        </form>
      </Card>
    </main>
  );
}
