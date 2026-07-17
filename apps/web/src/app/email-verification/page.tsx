"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

type VerificationPayload = {
  csrfToken: string;
};

export default function EmailVerificationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken } = useAuth();
  const [error, setError] = useState("");
  const token = searchParams.get("token");
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (!token) {
      setError("验证链接无效或已过期，请返回登录页重新发送验证邮件。");
      return;
    }
    if (verificationStarted.current) return;
    verificationStarted.current = true;
    let active = true;
    void apiFetch<VerificationPayload>("/auth/email-verifications/confirm", null, {
      method: "POST",
      body: JSON.stringify({ token })
    }).then((payload) => {
      if (!active) return;
      setToken(payload.csrfToken);
      router.replace("/dashboard");
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof ApiError ? reason.message : "邮箱验证失败，请重新发送验证邮件。");
    });
    return () => { active = false; };
  }, [router, setToken, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f6fa] px-5">
      <Card className="w-full max-w-md p-6 text-center">
        <CardTitle>{error ? "验证未完成" : "正在验证邮箱..."}</CardTitle>
        <p className="mt-3 text-sm leading-6 text-muted">{error || "请稍候，验证成功后将自动进入工作台。"}</p>
      </Card>
    </main>
  );
}
