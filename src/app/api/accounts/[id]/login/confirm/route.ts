import { NextResponse } from "next/server";
import { confirmAccountLoginFlow } from "@/lib/account-login-flow";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await prisma.accountProfile.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  }

  try {
    const result = await confirmAccountLoginFlow(account);
    return NextResponse.json(result, { status: result.status === "active" ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "确认登录态失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
