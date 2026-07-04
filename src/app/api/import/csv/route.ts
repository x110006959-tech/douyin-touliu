import { NextResponse } from "next/server";
import { z } from "zod";
import { createEvidenceWithCalibration } from "@/lib/evidence-store";

export const dynamic = "force-dynamic";

const csvSchema = z.object({
  accountId: z.string().optional().nullable(),
  pageName: z.string().optional().default("CSV 导入"),
  rawCsv: z.string().min(1)
});

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(rawCsv: string) {
  const lines = rawCsv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV 至少需要表头和一行数据");
  const columns = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ""]));
  });
  return { columns, rows };
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = csvSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "CSV 内容不能为空" }, { status: 400 });
  }

  try {
    const csv = parseCsv(parsed.data.rawCsv);
    const evidence = await createEvidenceWithCalibration({
      accountId: parsed.data.accountId,
      source: "csv",
      pageName: parsed.data.pageName,
      status: "pending_verification",
      confidence: 0.95,
      rawText: parsed.data.rawCsv,
      rawPayload: { rowCount: csv.rows.length, columns: csv.columns },
      parsedFields: {
        pageType: "csv_import",
        rowCount: csv.rows.length,
        columns: csv.columns,
        rows: csv.rows
      }
    });
    return NextResponse.json(evidence);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "CSV 解析失败";
    const evidence = await createEvidenceWithCalibration({
      accountId: parsed.data.accountId,
      source: "csv",
      pageName: parsed.data.pageName,
      status: "failed",
      confidence: 0,
      rawText: parsed.data.rawCsv,
      parsedFields: {},
      failureReason: reason
    });
    return NextResponse.json(evidence);
  }
}
