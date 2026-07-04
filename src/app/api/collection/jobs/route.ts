import { NextResponse } from "next/server";
import { z } from "zod";
import {
  hasRunnableSubjectConfig,
  normalizeSubjectConfig,
  parseSelectorText,
  stringifyCollectionJobCursor
} from "@/lib/collection-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const jobSchema = z.object({
  accountId: z.string().optional().nullable(),
  type: z.string().optional().default("live_dashboard"),
  targetName: z.string().min(1),
  targetUrl: z.string().optional().nullable(),
  schedule: z.string().optional().default("15s"),
  selectorText: z.string().optional().nullable(),
  subjectType: z.string().optional().nullable(),
  accountIdentity: z.string().optional().nullable(),
  operatorType: z.string().optional().nullable(),
  cooperationType: z.string().optional().nullable(),
  controlLevel: z.string().optional().nullable(),
  subjectConfidence: z.unknown().optional()
});

export async function GET() {
  const jobs = await prisma.collectionJob.findMany({
    orderBy: { updatedAt: "desc" },
    include: { account: true }
  });
  return NextResponse.json(jobs);
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = jobSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "采集任务字段不完整" }, { status: 400 });
  }

  if (parsed.data.type === "live_dashboard" && !parsed.data.accountId) {
    return NextResponse.json({ error: "直播大屏自动采集必须绑定账号" }, { status: 400 });
  }
  const subjectConfig = normalizeSubjectConfig({
    subjectType: parsed.data.subjectType,
    accountIdentity: parsed.data.accountIdentity,
    operatorType: parsed.data.operatorType,
    cooperationType: parsed.data.cooperationType,
    controlLevel: parsed.data.controlLevel,
    subjectConfidence: parsed.data.subjectConfidence,
    subjectSource: "collection_job"
  });
  if (parsed.data.type === "live_dashboard" && !hasRunnableSubjectConfig({ selectors: [], subjectConfig })) {
    return NextResponse.json({ error: "直播大屏自动采集必须先选择直播主体分类" }, { status: 400 });
  }
  if (parsed.data.type !== "live_dashboard" && !parsed.data.targetUrl) {
    return NextResponse.json({ error: "公开页采集必须填写 URL" }, { status: 400 });
  }

  const selectors = parseSelectorText(parsed.data.selectorText);
  const job = await prisma.collectionJob.create({
    data: {
      accountId: parsed.data.accountId || null,
      type: parsed.data.type,
      targetName: parsed.data.targetName,
      targetUrl: parsed.data.targetUrl || null,
      schedule: parsed.data.schedule || null,
      status: "idle",
      cursor: stringifyCollectionJobCursor({
        selectors,
        subjectConfig,
        nextRunAt: new Date().toISOString()
      })
    }
  });

  return NextResponse.json(job);
}
