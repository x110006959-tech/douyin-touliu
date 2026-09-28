"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth, type AuthUser } from "@/lib/AuthContext";

type RegisterPayload = { csrfToken: string; user: AuthUser };

export default function RegisterPage() {
  const router = useRouter();
  const { token, hydrated, setToken } = useAuth();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (hydrated && token) router.replace("/dashboard"); }, [hydrated, router, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirmPassword") || "")) {
      setFieldErrors({ confirmPassword: "两次输入的密码不一致" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = await apiFetch<RegisterPayload>("/auth/register", null, {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), phone: form.get("phone"), password })
      });
      setToken(payload.csrfToken, payload.user);
      router.push("/dashboard");
    } catch (cause) {
      if (cause instanceof ApiError) setFieldErrors(cause.fieldErrors);
      setError(cause instanceof Error ? cause.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated || token) return <main className="flex min-h-screen items-center justify-center bg-[#f3f6fa] text-sm text-muted">正在确认登录状态...</main>;

  return (
    <main className="min-h-screen bg-[#f3f6fa] px-5 py-10 sm:py-14">
      <Card className="mx-auto max-w-md border-[#d7dee7] p-6 shadow-[0_18px_50px_rgba(20,33,61,0.08)] sm:p-7">
        <p className="text-xs font-semibold text-primary">新用户赠送 5 积分</p>
        <CardTitle className="mb-2 mt-2 text-xl">创建账号</CardTitle>
        <p className="mb-5 text-sm leading-6 text-muted">邮箱和手机号至少填写一个。当前仅作为登录标识，不用于密码找回。</p>
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-1 text-sm">邮箱（选填）<Input autoComplete="email" maxLength={128} name="email" type="email" placeholder="name@example.com" />{fieldErrors.email ? <span className="text-xs text-danger">{fieldErrors.email}</span> : null}</label>
          <label className="grid gap-1 text-sm">手机号（选填）<Input autoComplete="tel" maxLength={32} name="phone" type="tel" placeholder="13800000000" />{fieldErrors.phone ? <span className="text-xs text-danger">{fieldErrors.phone}</span> : null}</label>
          <p className="text-xs text-muted">邮箱和手机号至少填写一个</p>
          <label className="grid gap-1 text-sm">密码<Input autoComplete="new-password" minLength={8} maxLength={128} name="password" type="password" placeholder="至少 8 位" required />{fieldErrors.password ? <span className="text-xs text-danger">{fieldErrors.password}</span> : null}</label>
          <label className="grid gap-1 text-sm">确认密码<Input autoComplete="new-password" minLength={8} maxLength={128} name="confirmPassword" type="password" placeholder="再次输入密码" required />{fieldErrors.confirmPassword ? <span className="text-xs text-danger">{fieldErrors.confirmPassword}</span> : null}</label>
          {error ? <div className="rounded-md border border-danger bg-[#fff7f7] px-3 py-2 text-sm text-danger">{error}</div> : null}
          <Button className="mt-1 h-11" disabled={submitting} type="submit">{submitting ? "正在创建..." : "注册并进入工作台"}</Button>
        </form>
        <p className="mt-5 border-t border-border pt-4 text-center text-sm text-muted">已有账号？ <button className="font-semibold text-primary hover:underline" type="button" onClick={() => router.push("/login")}>返回登录</button></p>
      </Card>
    </main>
  );
}
