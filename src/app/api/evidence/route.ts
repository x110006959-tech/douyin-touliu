import { NextResponse } from "next/server";
import { z } from "zod";
import { createEvidenceWithCalibration } from "@/lib/evidence-store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const evidenceSchema = z.object({
  accountId: z.string().optional().nullable(),
  source: z.string().min(1),
  pageName: z.string().optional().nullable(),
  targetUrl: z.string().optional().nullable(),
  status: z.string().optional().default("pending_verification"),
  confidence: z.unknown().optional(),
  rawText: z.string().optional().nullable(),
  rawPayload: z.unknown().optional(),
  parsedFields: z.unknown().optional(),
  failureReason: z.string().optional().nullable(),
  screenshotPath: z.string().optional().nullable()
});

export async function GET() {
  const evidences = await prisma.rawEvidence.findMany({
    orderBy: { createdAt: "desc" },
    include: { account: true, calibrationItems: true }
  });
  return NextResponse.json(evidences);
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = evidenceSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "证据字段不完整" }, { status: 400 });
  }

  const evidence = await createEvidenceWithCalibration(parsed.data);

  return NextResponse.json(evidence);
}
