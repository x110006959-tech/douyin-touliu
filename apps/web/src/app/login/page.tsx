"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { extensionSafetyNotice } from "@douyin-local-life/shared";

type AuthPayload = {
  csrfToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    workspaceId?: string;
  };
};

type RegistrationPayload = {
  email: string;
  verificationRequired: true;
};

export default function LoginPage() {
  const router = useRouter();
  const { token, hydrated, setToken } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  useEffect(() => { if (hydrated && token) router.replace("/dashboard"); }, [hydrated, token, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(""); setFieldErrors({}); setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const body = {
        email: form.get("email"),
        password: form.get("password"),
        name: form.get("name")
      };
      if (mode === "register") {
        const payload = await apiFetch<RegistrationPayload>("/auth/register", null, { method: "POST", body: JSON.stringify(body) });
        setPendingEmail(payload.email);
        return;
      }
      const payload = await apiFetch<AuthPayload>("/auth/login", null, {
        method: "POST",
        body: JSON.stringify(body)
      });
      setToken(payload.csrfToken);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      setError(err instanceof Error ? err.message : "登录失败");
    } finally { setSubmitting(false); }
  }

  if (!hydrated || token) return <main className="flex min-h-screen items-center justify-center bg-[#f3f6fa] text-sm text-muted">正在确认登录状态...</main>;

  async function resendVerification() {
    if (!pendingEmail || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await apiFetch<RegistrationPayload>("/auth/email-verifications/resend", null, {
        method: "POST",
        body: JSON.stringify({ email: pendingEmail })
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证邮件发送失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f6fa]">
      <header className="border-b border-[#dde3ea] bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-6">
          <button className="flex items-center gap-3 text-left" type="button" onClick={() => router.push("/dashboard")}>
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#14213d] text-sm font-bold text-white">P</span>
            <span>
              <span className="block text-sm font-bold text-[#14213d]">pxxis</span>
              <span className="block text-xs text-muted">本地生活决策助手</span>
            </span>
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-16 lg:py-20">
        <section>
          <p className="text-sm font-semibold text-[#18794e]">主体识别优先 · 服务商诊断</p>
          <h1 className="mt-4 max-w-2xl text-3xl font-bold leading-tight text-[#14213d] sm:text-4xl">登录后继续你的账号档案与诊断项目</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted">
            一个平台账号对应一个独立档案。系统只提供诊断与建议，所有审批和平台操作仍由你人工完成。
          </p>
          <div className="mt-8 max-w-xl border-l-2 border-[#27a36a] pl-4">
            <p className="text-sm leading-6 text-muted">{extensionSafetyNotice}</p>
          </div>
        </section>

        <Card className="border-[#d7dee7] p-6 shadow-[0_18px_50px_rgba(20,33,61,0.08)] sm:p-7">
          {pendingEmail ? (
            <div className="grid gap-4">
              <p className="text-xs font-semibold text-primary">还差一步</p>
              <CardTitle>请验证你的邮箱</CardTitle>
              <p className="text-sm leading-6 text-muted">验证邮件已发送至 {pendingEmail}。请在 30 分钟内打开邮件中的链接；完成后将自动登录。</p>
              {error ? <div className="rounded-md border border-danger bg-[#fff7f7] px-3 py-2 text-sm text-danger">{error}</div> : null}
              <Button className="h-11" disabled={submitting} type="button" onClick={() => void resendVerification()}>{submitting ? "正在发送..." : "重新发送验证邮件"}</Button>
              <button className="py-1 text-sm font-medium text-primary hover:underline" disabled={submitting} type="button" onClick={() => { setPendingEmail(""); setError(""); setMode("login"); }}>返回登录</button>
            </div>
          ) : <>
          <p className="text-xs font-semibold text-primary">{mode === "login" ? "欢迎回来" : "首次使用"}</p>
          <CardTitle className="mb-5 mt-2 text-xl">{mode === "login" ? "登录工作台" : "注册工作台账号"}</CardTitle>
          <form className="grid gap-4" onSubmit={submit}>
            {mode === "register" ? <label className="grid gap-1 text-sm">姓名（选填）<Input autoComplete="name" maxLength={100} name="name" placeholder="例如：张三" />{fieldErrors.name ? <span className="text-xs text-danger">{fieldErrors.name}</span> : null}</label> : null}
            <label className="grid gap-1 text-sm">邮箱<Input autoComplete="email" maxLength={128} name="email" type="email" placeholder="name@example.com" required />{fieldErrors.email ? <span className="text-xs text-danger">{fieldErrors.email}</span> : null}</label>
            <label className="grid gap-1 text-sm">密码<Input autoComplete={mode === "login" ? "current-password" : "new-password"} name="password" type="password" minLength={6} maxLength={128} placeholder="至少 6 位" required />{fieldErrors.password ? <span className="text-xs text-danger">{fieldErrors.password}</span> : null}</label>
            {error ? <div className="rounded-md border border-danger bg-[#fff7f7] px-3 py-2 text-sm text-danger">{error}</div> : null}
            <Button className="mt-1 h-11" disabled={submitting} type="submit">{submitting ? "正在提交..." : mode === "login" ? "登录并进入工作台" : "注册并进入工作台"}</Button>
            <button className="py-1 text-sm font-medium text-primary hover:underline" disabled={submitting} type="button" onClick={() => { setError(""); setFieldErrors({}); setMode(mode === "login" ? "register" : "login"); }}>
              {mode === "login" ? "第一次使用？创建账号" : "已有账号？返回登录"}
            </button>
          </form>
          </>}
        </Card>
      </div>
    </main>
  );
}
