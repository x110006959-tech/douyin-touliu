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
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <main className="flex-1">{children}</main>
            <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
              <p>
                <a
                  className="transition-colors hover:text-slate-700"
                  href="https://beian.miit.gov.cn/"
                  rel="noreferrer"
                  target="_blank"
                >
                  辽ICP备2026002223号
                </a>
              </p>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
