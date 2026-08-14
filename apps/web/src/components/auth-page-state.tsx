import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { createLoginHref } from "@/lib/auth-redirect";

export function AuthLoadingState() {
  return <main className="flex min-h-screen items-center justify-center text-sm text-muted">正在确认登录状态...</main>;
}

export function AuthRequiredState({
  message = "当前登录状态已失效，为避免账号数据串档，请重新登录后继续。",
  returnTo
}: {
  message?: string;
  returnTo?: string;
}) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Card>
        <CardTitle>需要重新登录</CardTitle>
        <p className="mb-4 text-sm text-muted">{message}</p>
        <Link className="text-sm font-medium text-primary hover:underline" href={createLoginHref(returnTo)}>前往登录</Link>
      </Card>
    </main>
  );
}
