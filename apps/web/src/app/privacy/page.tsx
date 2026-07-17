import Link from "next/link";
import { extensionSafetyNotice } from "@douyin-local-life/shared";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <Link className="text-sm font-medium text-primary" href="/">
          返回首页
        </Link>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">隐私政策</h1>
        <p className="mt-3 text-sm text-muted">最后更新：2026 年 7 月 13 日</p>
      </header>

      <div className="grid gap-5 text-sm leading-7 text-muted">
        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">数据采集范围</h2>
          <p className="mt-2">
            在用户授权并打开目标后台页面时，系统会采集可见 DOM、真实表格和白名单指标。截图/OCR、CSV 和人工校准数据仅在用户主动提供时处理，生产插件不读取平台网络响应正文。
          </p>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">敏感字段处理</h2>
          <p className="mt-2">
            系统会对 password、cookie、token、authorization、secret、access_token、refresh_token、session、credential
            等敏感字段进行过滤或脱敏处理。
          </p>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">数据用途</h2>
          <p className="mt-2">数据仅用于投流诊断、人工复核、动作建议和审计留痕。我们不会出售用户数据。</p>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">平台操作边界</h2>
          <p className="mt-2">{extensionSafetyNotice}</p>
          <p className="mt-2">系统不会自动修改平台投放设置，所有投放动作应由用户人工确认并执行。</p>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">用户责任与联系</h2>
          <p className="mt-2">用户应确保自己有权限查看和处理相关后台数据，并遵守适用的平台规则、账号规范和法律要求。</p>
          <p className="mt-2">如需咨询隐私相关问题，请联系 support@pxxis.cn。</p>
        </section>
      </div>
    </main>
  );
}
