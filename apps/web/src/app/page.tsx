import Link from "next/link";
import { aiDisclaimer, extensionSafetyNotice } from "@douyin-local-life/shared";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto grid min-h-screen max-w-6xl content-center gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold text-primary">pxxis / 本地生活投流诊断</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
            本地生活投流数据采集与 AI 诊断辅助工具
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
            Chrome 插件采集当前页面可见 DOM、真实表格和白名单指标；Web SaaS 工作台负责项目管理、采集任务、数据复核、AI
            诊断、动作建议、人工审批和审计留痕。
          </p>
          <div className="mt-6 grid gap-3 rounded-lg border border-border bg-white p-4 text-sm leading-6 text-muted">
            <p>{extensionSafetyNotice}</p>
            <p>{aiDisclaimer}</p>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white" href="/dashboard">
              进入工作台
            </Link>
            <Link className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium" href="/extension">
              查看插件说明
            </Link>
            <Link className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium" href="/login">
              登录
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Web SaaS 工作台</p>
              <p className="mt-1 text-xs text-muted">采集器连接后，在 Web 完成诊断闭环</p>
            </div>
            <span className="rounded-md bg-background px-2 py-1 text-xs text-muted">Manual only</span>
          </div>
          <div className="mt-5 grid gap-3">
            {["创建诊断项目", "打开目标后台并授权采集", "复核数据质量", "生成 AI 诊断和动作建议", "人工审批并记录执行留痕"].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-sm font-semibold text-primary">{index + 1}</span>
                <span className="text-sm text-foreground">{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-md border border-border bg-white p-3 text-sm leading-6 text-muted">
            第一版不会自动点击、修改预算、暂停任务、创建计划或提交任何平台操作。所有投放动作都需要由用户人工确认并执行。
          </p>
        </div>
      </section>
    </main>
  );
}
