"use client";

import { Card } from "@/components/ui/card";

const tutorialSteps = [
  {
    title: "检测插件",
    points: [
      "任务页第 1 步显示“插件已连接”才算检测到。",
      "未检测到时，前往 chrome://extensions 重载本地扩展，然后刷新任务页。"
    ]
  },
  {
    title: "连接插件",
    points: [
      "未配对时点击“连接采集插件”。",
      "或生成手动配对码，在插件弹窗中完成配对。"
    ]
  },
  {
    title: "打开目标页面",
    points: [
      "直播 API：打开直播数据大屏概览页。",
      "巨量本地推 API：打开本地推数据总览页。",
      "不能停留在任务列表或计划列表。"
    ]
  },
  {
    title: "点击采集",
    points: [
      "在插件弹窗中点击一次“开始 API 持续采集”。",
      "该操作由用户手动点击，系统不会自动启动。"
    ]
  },
  {
    title: "查看状态",
    points: [
      "按钮应变为“停止 API 持续采集”。",
      "提示从“API 已就绪”变为“API 已启动，正在发起首轮请求”。",
      "后续显示“采集中”和指标数量。"
    ]
  }
];

const routeTargets = [
  { label: "直播 API", value: "直播数据大屏概览页" },
  { label: "巨量本地推 API", value: "本地推数据总览页" }
];

export function CollectionTutorial() {
  return (
    <Card className="mb-4">
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">采集教程</span>
            <span className="text-xs text-primary group-open:hidden">展开教程</span>
            <span className="hidden text-xs text-primary group-open:inline">收起教程</span>
          </div>
        </summary>

        <div className="mt-4 border-t border-border pt-4">
          <div aria-label="采集流程示意" className="mb-4 grid gap-2 text-center sm:grid-cols-5">
            {tutorialSteps.map((step, index) => (
              <div className="rounded-md border border-border bg-slate-50 p-3" key={step.title}>
                <p className="text-xs text-muted">第 {index + 1} 步</p>
                <strong className="mt-1 block text-sm">{step.title}</strong>
              </div>
            ))}
          </div>

          <ol className="grid gap-3">
            {tutorialSteps.map((step, index) => (
              <li className="rounded-md border border-border p-3" key={step.title}>
                <p className="font-semibold">{index + 1}. {step.title}</p>
                <ul className="mt-2 grid gap-1 text-sm leading-6 text-muted">
                  {step.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </li>
            ))}
          </ol>

          <div className="mt-4 rounded-md border border-primary/30 bg-blue-50 p-3">
            <p className="text-sm font-semibold">当前支持的采集路线</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {routeTargets.map((route) => (
                <div className="rounded-md border border-border bg-white p-3" key={route.label}>
                  <p className="text-xs text-muted">{route.label}</p>
                  <strong>{route.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-muted">
            安全边界：本教程只指导人工操作，不自动打开页面、点击按钮、启动采集或提交平台操作。
          </p>
        </div>
      </details>
    </Card>
  );
}
