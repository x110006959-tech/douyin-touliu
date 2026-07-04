import { AlertTriangle, CheckCircle2, Database, RadioTower } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EvidenceSummaryCard } from "@/components/EvidenceSummary";
import { parseJsonArray, parseJsonRecord } from "@/lib/coerce";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function textField(fields: Record<string, unknown>, key: string, fallback = "-") {
  const value = fields[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export default async function DashboardPage() {
  const [latestDiagnoses, snapshotCount, pendingEvidence, activeAccounts, activities, productEvidence, trafficEvidence] =
    await Promise.all([
      prisma.diagnosisResult.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { snapshot: true }
      }),
      prisma.liveSnapshot.count(),
      prisma.rawEvidence.count({
        where: {
          OR: [{ status: "failed" }, { needsCalibration: true }, { status: "pending_verification" }]
        }
      }),
      prisma.accountProfile.count({ where: { sessionStatus: "active" } }),
      prisma.activitySnapshot.count(),
      prisma.rawEvidence.findFirst({
        where: {
          OR: [{ pageName: { contains: "商品" } }, { parsedFields: { contains: "\"pageType\":\"live_product\"" } }]
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.rawEvidence.findFirst({
        where: {
          OR: [{ pageName: { contains: "流量" } }, { parsedFields: { contains: "\"pageType\":\"live_traffic\"" } }]
        },
        orderBy: { createdAt: "desc" }
      })
    ]);
  const latestDiagnosis = latestDiagnoses[0];
  const latestFields = latestDiagnosis ? parseJsonRecord(latestDiagnosis.evidenceFields) : {};
  const latestMissing = latestDiagnosis ? parseJsonArray(latestDiagnosis.missingFields).slice(0, 2).join("、") : "";

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">实时监控大屏</h1>
          <div className="page-kicker">直播快照、活动核验、口碑履约、商品承接、流量溢出</div>
        </div>
        <span className="badge success">
          <RadioTower size={14} aria-hidden />
          规则引擎在线
        </span>
      </header>

      <section className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="panel metric">
          <span className="metric-label">主体类型</span>
          <span className="metric-value">{textField(latestFields, "subjectType", "暂无诊断")}</span>
        </div>
        <div className="panel metric">
          <span className="metric-label">操盘主体</span>
          <span className="metric-value">{textField(latestFields, "operatorType", "待校准")}</span>
        </div>
        <div className="panel metric">
          <span className="metric-label">关键缺失项</span>
          <span className="metric-value">{latestMissing || "无"}</span>
        </div>
        <div className="panel metric">
          <span className="metric-label">当前算法</span>
          <span className="metric-value">{textField(latestFields, "algorithm", "保守校准算法")}</span>
        </div>
      </section>

      <section className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="panel metric">
          <span className="metric-label">直播快照</span>
          <span className="metric-value">{snapshotCount}</span>
        </div>
        <div className="panel metric">
          <span className="metric-label">待校准证据</span>
          <span className="metric-value">{pendingEvidence}</span>
        </div>
        <div className="panel metric">
          <span className="metric-label">活动库</span>
          <span className="metric-value">{activities}</span>
        </div>
      </section>

      <section className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-title">
            <h2>最新商品证据</h2>
            <span className="badge warning">证据待校准</span>
          </div>
          {productEvidence ? <EvidenceSummaryCard evidence={productEvidence} /> : <div className="empty">暂无商品页证据</div>}
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>最新流量证据</h2>
            <span className="badge">流量拆分</span>
          </div>
          {trafficEvidence ? <EvidenceSummaryCard evidence={trafficEvidence} /> : <div className="empty">暂无流量页证据</div>}
        </div>
      </section>

      <section className="grid cols-2">
        <div className="panel">
          <div className="panel-title">
            <h2>最新诊断</h2>
            <span className="badge">{activeAccounts} 个登录态活跃</span>
          </div>
          {latestDiagnoses.length === 0 ? (
            <div className="empty">暂无诊断结果</div>
          ) : (
            <div className="grid">
              {latestDiagnoses.map((diagnosis) => {
                const actions = parseJsonArray(diagnosis.actions);
                const fields = parseJsonRecord(diagnosis.evidenceFields);
                const risky = actions.includes("暂停跑量") || actions.includes("修复口碑");
                return (
                  <article className="panel" key={diagnosis.id}>
                    <div className="panel-title">
                      <h2>{diagnosis.snapshot.liveRoomName}</h2>
                      <span className={risky ? "badge danger" : "badge success"}>
                        {risky ? <AlertTriangle size={14} aria-hidden /> : <CheckCircle2 size={14} aria-hidden />}
                        {diagnosis.confidence}
                      </span>
                    </div>
                    <div className="toolbar" style={{ marginBottom: 10 }}>
                      <span className="badge">{textField(fields, "subjectType", "主体待校准")}</span>
                      <span className="badge">{textField(fields, "operatorType", "操盘待校准")}</span>
                      <span className="badge">{textField(fields, "algorithm", "保守校准算法")}</span>
                    </div>
                    <div className="diagnosis">{diagnosis.output}</div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <h2>动作看板</h2>
            <span className="badge">
              <Database size={14} aria-hidden />
              SQLite
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>直播间</th>
                <th>动作</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {latestDiagnoses.map((diagnosis) => (
                <tr key={diagnosis.id}>
                  <td>{diagnosis.snapshot.liveRoomName}</td>
                  <td>{parseJsonArray(diagnosis.actions).join("、")}</td>
                  <td>{diagnosis.createdAt.toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
