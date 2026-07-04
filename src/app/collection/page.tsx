import { AppShell } from "@/components/AppShell";
import { EvidenceSummaryCard } from "@/components/EvidenceSummary";
import {
  CollectionJobForm,
  CollectionJobList,
  CsvImportForm,
  EvidenceForm,
  OcrEvidenceForm,
  SnapshotForm
} from "@/components/forms";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const [accounts, activities, evidences, snapshots, jobs] = await Promise.all([
    prisma.accountProfile.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.activitySnapshot.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.rawEvidence.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { account: true }
    }),
    prisma.liveSnapshot.findMany({ orderBy: { capturedAt: "desc" }, take: 8 }),
    prisma.collectionJob.findMany({
      orderBy: { updatedAt: "desc" },
      include: { account: true }
    })
  ]);
  const collectionJobs = jobs.map((job) => ({
    id: job.id,
    type: job.type,
    targetName: job.targetName,
    targetUrl: job.targetUrl,
    schedule: job.schedule,
    status: job.status,
    lastRunAt: job.lastRunAt?.toISOString() || null,
    lastError: job.lastError,
    cursor: job.cursor,
    account: job.account
      ? {
          id: job.account.id,
          accountName: job.account.accountName,
          platform: job.account.platform
        }
      : null
  }));

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">数据采集</h1>
          <div className="page-kicker">自动任务、Scrapling 采集、CSV/OCR 兜底、校准入库</div>
        </div>
      </header>

      <section className="grid cols-2">
        <div className="panel">
          <div className="panel-title">
            <h2>自动采集任务</h2>
          </div>
          <CollectionJobForm accounts={accounts} />
        </div>
        <div className="panel">
          <CollectionJobList jobs={collectionJobs} />
        </div>
      </section>

      <section className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-title">
            <h2>写入原始证据</h2>
          </div>
          <EvidenceForm accounts={accounts} />
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>手工快照并诊断</h2>
          </div>
          <SnapshotForm accounts={accounts} activities={activities} />
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>CSV 导入</h2>
          </div>
          <CsvImportForm accounts={accounts} />
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>截图/OCR</h2>
          </div>
          <OcrEvidenceForm accounts={accounts} />
        </div>
      </section>

      <section className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-title">
            <h2>最近证据</h2>
          </div>
          {evidences.length === 0 ? (
            <div className="empty">暂无采集证据</div>
          ) : (
            <div className="grid">
              {evidences.map((evidence) => (
                <article className="evidence-row" key={evidence.id}>
                  <div className="panel-title compact">
                    <h3>{evidence.pageName || evidence.source}</h3>
                    <span className={evidence.status === "failed" ? "badge danger" : "badge"}>
                      {evidence.status}
                    </span>
                  </div>
                  <p className="muted">{evidence.account?.accountName || "无账号"}</p>
                  <EvidenceSummaryCard evidence={evidence} />
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <h2>最近快照</h2>
          </div>
          {snapshots.length === 0 ? (
            <div className="empty">暂无直播快照</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>直播间</th>
                  <th>主体</th>
                  <th>消耗</th>
                  <th>核销 ROI</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td>{snapshot.liveRoomName}</td>
                    <td>{snapshot.subjectType || "-"}</td>
                    <td>{snapshot.todaySpend ?? "-"}</td>
                    <td>{snapshot.verifyRoi ?? "缺失"}</td>
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
