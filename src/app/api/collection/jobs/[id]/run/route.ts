import { NextResponse } from "next/server";
import { runCollectionJob } from "@/lib/collection-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await runCollectionJob(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "采集任务运行失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
