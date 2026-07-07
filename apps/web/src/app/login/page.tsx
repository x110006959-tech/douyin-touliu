"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { extensionSafetyNotice } from "@douyin-local-life/shared";

type AuthPayload = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    workspaceId?: string;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const { setToken } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const payload = await apiFetch<AuthPayload>(mode === "login" ? "/auth/login" : "/auth/register", null, {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          name: form.get("name")
        })
      });
      setToken(payload.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-8 px-6 py-10 md:grid-cols-[1fr_420px]">
      <section>
        <p className="text-sm font-semibold text-primary">pxxis 投流诊断工作台</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight">登录本地生活投流数据采集与 AI 诊断辅助工具</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
          工作台用于管理项目、采集任务、数据复核、AI 诊断、动作建议、人工审批和审计留痕。插件只作为数据采集器，业务流程在 Web
          工作台完成。
        </p>
        <p className="mt-5 rounded-lg border border-border bg-white p-4 text-sm leading-6 text-muted">{extensionSafetyNotice}</p>
      </section>
      <Card>
        <CardTitle>{mode === "login" ? "登录" : "注册"}投流诊断工作台</CardTitle>
        <form className="grid gap-3" onSubmit={submit}>
          {mode === "register" ? <Input name="name" placeholder="姓名" /> : null}
          <Input name="email" type="email" placeholder="邮箱" required />
          <Input name="password" type="password" minLength={6} placeholder="密码" required />
          {error ? <div className="rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</div> : null}
          <Button type="submit">{mode === "login" ? "登录" : "注册并登录"}</Button>
          <button className="text-sm text-muted" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "没有账号，去注册" : "已有账号，去登录"}
          </button>
        </form>
      </Card>
    </main>
  );
}
