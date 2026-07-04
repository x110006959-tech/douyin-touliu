import { NextResponse } from "next/server";
import { z } from "zod";
import { booleanFrom, dateOrNull, numberOrNull } from "@/lib/coerce";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const activitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  city: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  accountTier: z.string().optional().nullable(),
  startsAt: z.unknown().optional(),
  endsAt: z.unknown().optional(),
  subsidyOwner: z.string().optional().nullable(),
  verifiedStatus: z.string().optional().default("unverified"),
  canCountInRoi: z.unknown().optional(),
  platformSubsidyAmount: z.unknown().optional(),
  adCouponAmount: z.unknown().optional(),
  rebateCouponAmount: z.unknown().optional(),
  merchantSubsidyAmount: z.unknown().optional(),
  notes: z.string().optional().nullable()
});

export async function GET() {
  const activities = await prisma.activitySnapshot.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(activities);
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = activitySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "活动字段不完整" }, { status: 400 });
  }

  const canCountInRoi = booleanFrom(parsed.data.canCountInRoi) && parsed.data.verifiedStatus === "verified";
  const activity = await prisma.activitySnapshot.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      city: parsed.data.city || null,
      category: parsed.data.category || null,
      accountTier: parsed.data.accountTier || null,
      startsAt: dateOrNull(parsed.data.startsAt),
      endsAt: dateOrNull(parsed.data.endsAt),
      subsidyOwner: parsed.data.subsidyOwner || null,
      verifiedStatus: parsed.data.verifiedStatus,
      canCountInRoi,
      platformSubsidyAmount: numberOrNull(parsed.data.platformSubsidyAmount),
      adCouponAmount: numberOrNull(parsed.data.adCouponAmount),
      rebateCouponAmount: numberOrNull(parsed.data.rebateCouponAmount),
      merchantSubsidyAmount: numberOrNull(parsed.data.merchantSubsidyAmount),
      notes: parsed.data.notes || null
    }
  });

  return NextResponse.json(activity);
}
