import Link from "next/link";
import { extensionSafetyNotice } from "@douyin-local-life/shared";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <Link className="text-sm font-medium text-primary" href="/">
          返回首页
        </Link>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">服务条款</h1>
        <p className="mt-3 text-sm text-muted">最后更新：2026 年 7 月 7 日</p>
      </header>

      <div className="grid gap-5 text-sm leading-7 text-muted">
        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">服务定位</h2>
          <p className="mt-2">
            pxxis 提供数据采集、诊断辅助和人工决策支持服务，帮助用户管理本地生活投流项目、采集任务、诊断建议、人工审批和执行留痕。
          </p>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">账号使用</h2>
          <p className="mt-2">
            用户应妥善保管账号、密码和访问令牌，并确保账号下的操作经过授权。因用户未妥善管理账号或授权范围导致的问题，由用户自行承担相应责任。
          </p>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">数据授权</h2>
          <p className="mt-2">
            用户使用采集和诊断功能，即表示其确认有权查看、处理并上传相关后台数据。用户需遵守平台规则、账号规范和适用法律要求。
          </p>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">服务限制</h2>
          <p className="mt-2">
            系统第一版不会自动执行平台操作。所有投放动作由用户人工确认并执行，平台账户、预算、任务、计划和表单提交仍由用户自行管理。
          </p>
          <p className="mt-2">{extensionSafetyNotice}</p>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">免责声明</h2>
          <p className="mt-2">
            AI 诊断和动作建议仅供投流决策参考，不构成对投放效果、平台审核结果或经营收益的保证。用户应结合业务目标、预算和平台规则进行人工判断。
          </p>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">变更与联系</h2>
          <p className="mt-2">我们可能根据产品迭代和合规要求更新本条款。重要变更会在合理范围内通过页面或站内方式提示。</p>
          <p className="mt-2">如需联系，请发送邮件至 support@pxxis.cn。</p>
        </section>
      </div>
    </main>
  );
}
