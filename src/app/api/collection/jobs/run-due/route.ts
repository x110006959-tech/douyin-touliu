import { NextResponse } from "next/server";
import { z } from "zod";
import { isCollectionJobDue } from "@/lib/collection-config";
import { runCollectionJob } from "@/lib/collection-runner";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const runDueSchema = z.object({
  limit: z.number().int().min(1).max(10).optional().default(3)
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => ({}));
  const parsed = runDueSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "运行参数不正确" }, { status: 400 });
  }

  const jobs = await prisma.collectionJob.findMany({
    where: { status: { not: "running" } },
    orderBy: { updatedAt: "asc" }
  });
  const dueJobs = jobs.filter((job) => isCollectionJobDue(job)).slice(0, parsed.data.limit);
  const results = [];
  for (const job of dueJobs) {
    results.push(await runCollectionJob(job.id));
  }

  return NextResponse.json({
    ran: results.length,
    results
  });
}
