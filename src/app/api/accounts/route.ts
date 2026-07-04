import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const accountSchema = z.object({
  platform: z.string().min(1),
  accountName: z.string().min(1),
  merchantName: z.string().optional().nullable(),
  storeName: z.string().optional().nullable(),
  usage: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
  loginEntryUrl: z.string().optional().nullable(),
  phoneHint: z.string().optional().nullable()
});

export async function GET() {
  const accounts = await prisma.accountProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sessions: { take: 1, orderBy: { updatedAt: "desc" } },
      memos: { take: 3, orderBy: { updatedAt: "desc" } }
    }
  });
  return NextResponse.json(accounts);
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = accountSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "账号字段不完整" }, { status: 400 });
  }

  const account = await prisma.accountProfile.upsert({
    where: {
      platform_accountName: {
        platform: parsed.data.platform,
        accountName: parsed.data.accountName
      }
    },
    update: {
      merchantName: parsed.data.merchantName || null,
      storeName: parsed.data.storeName || null,
      usage: parsed.data.usage || null,
      memo: parsed.data.memo || null,
      loginEntryUrl: parsed.data.loginEntryUrl || null,
      phoneHint: parsed.data.phoneHint || null
    },
    create: parsed.data
  });

  if (parsed.data.memo?.trim()) {
    await prisma.accountMemo.create({
      data: {
        accountId: account.id,
        title: "账号备忘",
        body: parsed.data.memo.trim()
      }
    });
  }

  return NextResponse.json(account);
}
