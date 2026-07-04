import { buildEvidenceSummary, type EvidenceSummaryInput } from "@/lib/evidence-summary";

export function EvidenceSummaryCard({ evidence }: { evidence: EvidenceSummaryInput }) {
  const summary = buildEvidenceSummary(evidence);
  if (!summary) return null;

  return (
    <div className="evidence-summary">
      <div className="panel-title compact">
        <h3>{summary.title}</h3>
        <div className="toolbar">
          {summary.badges.map((badge) => (
            <span className="badge" key={badge}>
              {badge}
            </span>
          ))}
        </div>
      </div>

      <div className="summary-stats">
        {summary.stats.map((stat) => (
          <div className="summary-stat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      {summary.tables.map((table) => (
        <div className="summary-table" key={table.title}>
          <h4>{table.title}</h4>
          <div className="table-scroll">
            <table className="table compact-table">
              <thead>
                <tr>
                  {table.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={`${table.title}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${table.title}-${rowIndex}-${cellIndex}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {summary.notes.length > 0 ? (
        <div className="summary-notes">
          {summary.notes.map((note) => (
            <p className="muted" key={note}>
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
