import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const memoSchema = z.object({
  title: z.string().optional().default("账号备忘"),
  body: z.string().min(1)
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memos = await prisma.accountMemo.findMany({
    where: { accountId: id },
    orderBy: { updatedAt: "desc" }
  });
  return NextResponse.json(memos);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await request.json();
  const parsed = memoSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "备忘内容不能为空" }, { status: 400 });
  }

  const account = await prisma.accountProfile.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  }

  const memo = await prisma.accountMemo.create({
    data: {
      accountId: id,
      title: parsed.data.title || "账号备忘",
      body: parsed.data.body.trim()
    }
  });

  await prisma.accountProfile.update({
    where: { id },
    data: { memo: parsed.data.body.trim() }
  });

  return NextResponse.json(memo);
}
