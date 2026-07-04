import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const sessionSchema = z.object({
  label: z.string().optional().default("default"),
  payload: z.unknown(),
  containsPassword: z.boolean().optional().default(false)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await request.json();
  const parsed = sessionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "登录态字段不完整" }, { status: 400 });
  }

  const account = await prisma.accountProfile.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  }

  const encrypted = encryptJson(parsed.data.payload);
  const label = parsed.data.label || "default";
  const session = await prisma.sessionVault.upsert({
    where: {
      accountId_label: {
        accountId: id,
        label
      }
    },
    update: {
      encryptedPayload: encrypted.encryptedPayload,
      encryptionMeta: encrypted.encryptionMeta,
      containsPassword: parsed.data.containsPassword
    },
    create: {
      accountId: id,
      label,
      encryptedPayload: encrypted.encryptedPayload,
      encryptionMeta: encrypted.encryptionMeta,
      containsPassword: parsed.data.containsPassword
    }
  });

  await prisma.accountProfile.update({
    where: { id },
    data: {
      sessionStatus: "active",
      lastLoginAt: new Date()
    }
  });

  return NextResponse.json({
    id: session.id,
    accountId: session.accountId,
    label: session.label,
    containsPassword: session.containsPassword,
    createdAt: session.createdAt
  });
}
