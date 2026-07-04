import { NextResponse } from "next/server";
import { z } from "zod";
import { createEvidenceWithCalibration } from "@/lib/evidence-store";

export const dynamic = "force-dynamic";

const ocrSchema = z.object({
  accountId: z.string().optional().nullable(),
  pageName: z.string().optional().default("截图 OCR"),
  screenshotPath: z.string().min(1),
  ocrEndpoint: z.string().optional().nullable()
});

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = ocrSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "截图路径不能为空" }, { status: 400 });
  }

  const endpoint = parsed.data.ocrEndpoint || process.env.LOCAL_OCR_ENDPOINT;
  if (!endpoint) {
    const evidence = await createEvidenceWithCalibration({
      accountId: parsed.data.accountId,
      source: "ocr",
      pageName: parsed.data.pageName,
      status: "failed",
      confidence: 0,
      screenshotPath: parsed.data.screenshotPath,
      parsedFields: {},
      failureReason: "本地 OCR 接口未配置，数据缺失/待校准"
    });
    return NextResponse.json(evidence, { status: 202 });
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screenshotPath: parsed.data.screenshotPath })
    });
    if (!response.ok) throw new Error(`OCR 接口返回 ${response.status}`);
    const result = await response.json();
    const evidence = await createEvidenceWithCalibration({
      accountId: parsed.data.accountId,
      source: "ocr",
      pageName: parsed.data.pageName,
      status: "pending_verification",
      confidence: result.confidence ?? 0.7,
      rawText: result.text || null,
      rawPayload: result,
      parsedFields: result.parsedFields || {},
      screenshotPath: parsed.data.screenshotPath
    });
    return NextResponse.json(evidence);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "OCR 调用失败";
    const evidence = await createEvidenceWithCalibration({
      accountId: parsed.data.accountId,
      source: "ocr",
      pageName: parsed.data.pageName,
      status: "failed",
      confidence: 0,
      screenshotPath: parsed.data.screenshotPath,
      parsedFields: {},
      failureReason: reason
    });
    return NextResponse.json(evidence);
  }
}
