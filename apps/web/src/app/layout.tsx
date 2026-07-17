import type { Metadata } from "next";
import { headers } from "next/headers";
import { AuthProvider } from "@/lib/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.pxxis.cn"),
  title: "pxxis 本地生活投流诊断",
  description: "本地生活投流数据采集与 AI 诊断辅助工具"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <html lang="zh-CN">
      <body nonce={nonce}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
