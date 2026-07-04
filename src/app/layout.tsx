import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "抖音生活服务全域诊断",
  description: "本地推监控、采集校准、活动核验与诊断规则系统"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
