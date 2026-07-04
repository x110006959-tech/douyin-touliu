"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ClipboardCheck, DatabaseZap, Gauge, Radio, UserRoundCog } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "实时监控", icon: Gauge },
  { href: "/accounts", label: "账号档案", icon: UserRoundCog },
  { href: "/collection", label: "数据采集", icon: DatabaseZap },
  { href: "/calibration", label: "待校准", icon: ClipboardCheck },
  { href: "/activities", label: "活动库", icon: Activity }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">全域诊断系统</div>
          <div className="brand-subtitle">本地生活 / 巨量本地推</div>
        </div>
        <nav className="nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link className={active ? "active" : ""} href={item.href} key={item.href}>
                <Icon size={18} aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="badge">
          <Radio size={14} aria-hidden />
          本地运行
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
