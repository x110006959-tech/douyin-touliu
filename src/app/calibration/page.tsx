import { AlertCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EvidenceSummaryCard } from "@/components/EvidenceSummary";
import { CalibrationForm } from "@/components/forms";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CalibrationPage() {
  const evidences = await prisma.rawEvidence.findMany({
    where: {
      OR: [{ status: "failed" }, { needsCalibration: true }, { status: "pending_verification" }]
    },
    orderBy: { createdAt: "desc" },
    include: { account: true, calibrationItems: true }
  });

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">待校准队列</h1>
          <div className="page-kicker">采集失败、OCR 低置信、字段异常、人工编辑</div>
        </div>
        <span className="badge warning">
          <AlertCircle size={14} aria-hidden />
          {evidences.length} 条待处理
        </span>
      </header>

      <section className="grid">
        {evidences.length === 0 ? (
          <div className="empty">暂无待校准数据</div>
        ) : (
          evidences.map((evidence) => (
            <article className="panel" key={evidence.id}>
              <div className="panel-title">
                <h2>
                  {evidence.pageName || evidence.source} / {evidence.account?.accountName || "无账号"}
                </h2>
                <span className={evidence.status === "failed" ? "badge danger" : "badge warning"}>
                  {evidence.status}
                </span>
              </div>
              <div className="grid cols-2">
                <div className="grid">
                  <div>
                    <p className="muted">失败原因：{evidence.failureReason || "-"}</p>
                    <p className="muted">置信度：{evidence.confidence ?? "-"}</p>
                    <p className="muted">截图路径：{evidence.screenshotPath || "-"}</p>
                  </div>
                  <EvidenceSummaryCard evidence={evidence} />
                  <pre className="mono">{evidence.rawText || "无原始文本"}</pre>
                </div>
                <CalibrationForm evidenceId={evidence.id} parsedFields={evidence.parsedFields} />
              </div>
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}
