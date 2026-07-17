import Link from "next/link";
import { extensionSafetyNotice } from "@douyin-local-life/shared";
import { Card, CardTitle } from "@/components/ui/card";

const collectItems = ["当前页面可见 DOM", "真实表格数据", "白名单指标文本", "用户主动提供的截图/OCR、CSV 或人工校准数据"];
const filteredItems = ["password", "cookie", "token", "authorization", "secret", "access_token", "refresh_token", "session", "credential"];

export default function ExtensionPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Chrome 插件说明</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">本地生活投流数据采集器</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
            插件只负责在用户授权并打开目标后台页面时采集诊断所需数据，项目管理、数据复核、AI 诊断、动作建议和人工审批都在 Web
            工作台完成。
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-md border border-border bg-white px-4 py-2 text-sm font-medium" href="/">
            返回首页
          </Link>
          <Link className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white" href="/dashboard">
            进入工作台
          </Link>
        </div>
      </header>

      <section className="mb-6 rounded-lg border border-border bg-white p-4 text-sm leading-6 text-muted">{extensionSafetyNotice}</section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>插件用途</CardTitle>
          <p className="text-sm leading-6 text-muted">
            用于采集本地生活投流后台中的可见 DOM、真实表格和白名单指标，并上传到 Web 工作台，辅助生成诊断结论、动作建议和审计记录。生产版不读取平台网络响应正文。
          </p>
        </Card>
        <Card>
          <CardTitle>安装方式</CardTitle>
          <p className="text-sm leading-6 text-muted">
            当前版本处于开发测试阶段，可通过开发者模式加载扩展。正式上架后将提供 Chrome Web Store 安装入口。
          </p>
        </Card>
        <Card>
          <CardTitle>如何连接 Web 工作台</CardTitle>
          <p className="text-sm leading-6 text-muted">
            先登录 pxxis 工作台并进入具体采集任务，优先点击“一键连接采集插件”。若网页桥接暂不可用，再生成六位手动配对码并在插件弹窗输入；配对成功后会绑定当前账号与任务。
          </p>
        </Card>
        <Card>
          <CardTitle>如何开始采集</CardTitle>
          <p className="text-sm leading-6 text-muted">
            打开目标投流后台页面，确认页面属于允许采集的域名范围，然后点击“采集并上传当前路线”。直播大屏的概览、商品和流量分栏需要由用户手动切换并分别采集，插件不会自动点击平台标签。
          </p>
        </Card>
        <Card>
          <CardTitle>采集哪些数据</CardTitle>
          <ul className="grid gap-2 text-sm text-muted">
            {collectItems.map((item) => (
              <li key={item} className="rounded-md border border-border bg-background px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>不采集哪些数据</CardTitle>
          <p className="mb-3 text-sm leading-6 text-muted">系统会对下列敏感字段进行过滤或脱敏处理：</p>
          <div className="flex flex-wrap gap-2">
            {filteredItems.map((item) => (
              <span key={item} className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted">
                {item}
              </span>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-white p-5">
        <h2 className="text-lg font-semibold">安全边界</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          插件不会自动点击、修改预算、暂停任务、创建计划或提交任何平台操作。第一版产品只提供采集、诊断建议、人工审批和留痕能力，所有平台操作都由用户人工确认并执行。
        </p>
      </section>
    </main>
  );
}
