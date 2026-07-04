import { CalendarClock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ActivityForm } from "@/components/forms";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const activities = await prisma.activitySnapshot.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">活动库</h1>
          <div className="page-kicker">平台补贴、投放券、消返券、政府消费券、节点营销</div>
        </div>
        <span className="badge">
          <CalendarClock size={14} aria-hidden />
          热更新
        </span>
      </header>

      <section className="grid cols-2">
        <div className="panel">
          <div className="panel-title">
            <h2>新建活动</h2>
          </div>
          <ActivityForm />
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>活动列表</h2>
          </div>
          {activities.length === 0 ? (
            <div className="empty">暂无活动</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>活动</th>
                  <th>城市/类目</th>
                  <th>核验</th>
                  <th>补贴</th>
                  <th>窗口</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.id}>
                    <td>
                      {activity.name}
                      <br />
                      <span className="muted">{activity.type}</span>
                    </td>
                    <td>
                      {activity.city || "-"}
                      <br />
                      <span className="muted">{activity.category || "-"}</span>
                    </td>
                    <td>
                      <span className={activity.verifiedStatus === "verified" ? "badge success" : "badge warning"}>
                        {activity.verifiedStatus}
                      </span>
                    </td>
                    <td>
                      平台 {activity.platformSubsidyAmount ?? 0}
                      <br />
                      <span className="muted">投放券 {activity.adCouponAmount ?? 0}</span>
                      <br />
                      <span className="muted">消返券 {activity.rebateCouponAmount ?? 0}</span>
                      <br />
                      <span className="muted">商家 {activity.merchantSubsidyAmount ?? 0}</span>
                    </td>
                    <td>
                      {activity.startsAt ? activity.startsAt.toLocaleString("zh-CN") : "-"}
                      <br />
                      <span className="muted">{activity.endsAt ? activity.endsAt.toLocaleString("zh-CN") : "-"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </AppShell>
  );
}
