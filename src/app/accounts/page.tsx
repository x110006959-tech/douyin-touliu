import { KeyRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AccountForm, AccountLoginFlowForm, AccountMemoForm, SessionForm } from "@/components/forms";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await prisma.accountProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sessions: { orderBy: { updatedAt: "desc" }, take: 1 },
      memos: { orderBy: { updatedAt: "desc" }, take: 3 }
    }
  });

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">账号档案</h1>
          <div className="page-kicker">平台账号、登录态、账号备忘</div>
        </div>
        <span className="badge">
          <KeyRound size={14} aria-hidden />
          本机加密
        </span>
      </header>

      <section className="grid cols-2">
        <div className="panel">
          <div className="panel-title">
            <h2>新建账号</h2>
          </div>
          <AccountForm />
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>直播大屏登录确认</h2>
          </div>
          <AccountLoginFlowForm accounts={accounts} />
        </div>
      </section>

      <section className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-title">
            <h2>手工保存登录态</h2>
          </div>
          <SessionForm accounts={accounts} />
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>账号备忘</h2>
          </div>
          <AccountMemoForm accounts={accounts} />
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">
          <h2>账号列表</h2>
        </div>
        {accounts.length === 0 ? (
          <div className="empty">暂无账号</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>平台</th>
                <th>账号</th>
                <th>商家/门店</th>
                <th>登录态</th>
                <th>用途</th>
                <th>最近登录</th>
                <th>备忘</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.platform}</td>
                  <td>{account.accountName}</td>
                  <td>
                    {account.merchantName || "-"}
                    <br />
                    <span className="muted">{account.storeName || "-"}</span>
                  </td>
                  <td>
                    <span className={account.sessionStatus === "active" ? "badge success" : "badge warning"}>
                      {account.sessionStatus}
                    </span>
                  </td>
                  <td>{account.usage || "-"}</td>
                  <td>{account.lastLoginAt ? account.lastLoginAt.toLocaleString("zh-CN") : "-"}</td>
                  <td>
                    {account.memos.length === 0 ? (
                      account.memo || "-"
                    ) : (
                      <div className="memo-list">
                        {account.memos.map((memo) => (
                          <div key={memo.id}>
                            <strong>{memo.title}</strong>
                            <p className="muted">{memo.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
