import { NextResponse } from "next/server";
import { z } from "zod";
import { booleanFrom, intOrNull, numberOrNull } from "@/lib/coerce";
import { isSubjectType } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const snapshotSchema = z.object({
  accountId: z.string().optional().nullable(),
  activityId: z.string().optional().nullable(),
  liveRoomName: z.string().min(1),
  merchantName: z.string().optional().nullable(),
  storeName: z.string().optional().nullable(),
  subjectType: z.string().optional().nullable(),
  accountIdentity: z.string().optional().nullable(),
  operatorType: z.string().optional().nullable(),
  cooperationType: z.string().optional().nullable(),
  controlLevel: z.string().optional().nullable(),
  subjectConfidence: z.unknown().optional(),
  subjectSource: z.string().optional().nullable(),
  serviceProviderName: z.string().optional().nullable(),
  serviceMode: z.string().optional().nullable(),
  serviceFee: z.unknown().optional(),
  serviceScheduleStatus: z.string().optional().nullable(),
  serviceScriptStatus: z.string().optional().nullable(),
  serviceFieldControlIssue: z.unknown().optional(),
  servicePricePromiseRisk: z.unknown().optional(),
  materialAssetStatus: z.string().optional().nullable(),
  fanAssetStatus: z.string().optional().nullable(),
  dailyBudget: z.unknown().optional(),
  remainingBudget: z.unknown().optional(),
  todaySpend: z.unknown().optional(),
  spendLast30m: z.unknown().optional(),
  currentBid: z.unknown().optional(),
  targetRoi: z.unknown().optional(),
  targetCpa: z.unknown().optional(),
  payRoi: z.unknown().optional(),
  verifyRoi: z.unknown().optional(),
  grossProfitRoi: z.unknown().optional(),
  attributedVerifyGmv: z.unknown().optional(),
  grossProfit: z.unknown().optional(),
  liveGmv: z.unknown().optional(),
  shelfGmv: z.unknown().optional(),
  searchGmv: z.unknown().optional(),
  poiVisits: z.unknown().optional(),
  storeSearches: z.unknown().optional(),
  searchAfterVerifyCount: z.unknown().optional(),
  detailCtr: z.unknown().optional(),
  complaintRate: z.unknown().optional(),
  badReviewRate: z.unknown().optional(),
  refundRate: z.unknown().optional(),
  scoreDrop: z.unknown().optional(),
  fulfillmentAbnormal: z.unknown().optional(),
  inventoryStatus: z.string().optional().nullable(),
  reservationStatus: z.string().optional().nullable(),
  hostScriptRisk: z.unknown().optional(),
  platformSubsidyAmount: z.unknown().optional(),
  adCouponAmount: z.unknown().optional(),
  rebateCouponAmount: z.unknown().optional(),
  merchantSubsidyAmount: z.unknown().optional(),
  sourceQuality: z.string().optional().default("manual")
});

export async function GET() {
  const snapshots = await prisma.liveSnapshot.findMany({
    orderBy: { capturedAt: "desc" },
    include: { activity: true, diagnoses: { orderBy: { createdAt: "desc" }, take: 1 } }
  });
  return NextResponse.json(snapshots);
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = snapshotSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "快照字段不完整" }, { status: 400 });
  }

  const data = parsed.data;
  if (!data.subjectType || !isSubjectType(data.subjectType) || data.subjectType === "主体待校准") {
    return NextResponse.json({ error: "手工快照必须选择明确的直播主体分类" }, { status: 400 });
  }
  const account = data.accountId ? await prisma.accountProfile.findUnique({ where: { id: data.accountId } }) : null;
  const snapshot = await prisma.liveSnapshot.create({
    data: {
      accountId: data.accountId || null,
      activityId: data.activityId || null,
      liveRoomName: data.liveRoomName,
      merchantName: data.merchantName || account?.merchantName || null,
      storeName: data.storeName || account?.storeName || null,
      subjectType: data.subjectType || null,
      accountIdentity: data.accountIdentity || null,
      operatorType: data.operatorType || null,
      cooperationType: data.cooperationType || null,
      controlLevel: data.controlLevel || null,
      subjectConfidence: numberOrNull(data.subjectConfidence),
      subjectSource: data.subjectSource || null,
      serviceProviderName: data.serviceProviderName || null,
      serviceMode: data.serviceMode || null,
      serviceFee: numberOrNull(data.serviceFee),
      serviceScheduleStatus: data.serviceScheduleStatus || null,
      serviceScriptStatus: data.serviceScriptStatus || null,
      serviceFieldControlIssue: booleanFrom(data.serviceFieldControlIssue),
      servicePricePromiseRisk: booleanFrom(data.servicePricePromiseRisk),
      materialAssetStatus: data.materialAssetStatus || null,
      fanAssetStatus: data.fanAssetStatus || null,
      dailyBudget: numberOrNull(data.dailyBudget),
      remainingBudget: numberOrNull(data.remainingBudget),
      todaySpend: numberOrNull(data.todaySpend),
      spendLast30m: numberOrNull(data.spendLast30m),
      currentBid: numberOrNull(data.currentBid),
      targetRoi: numberOrNull(data.targetRoi),
      targetCpa: numberOrNull(data.targetCpa),
      payRoi: numberOrNull(data.payRoi),
      verifyRoi: numberOrNull(data.verifyRoi),
      grossProfitRoi: numberOrNull(data.grossProfitRoi),
      attributedVerifyGmv: numberOrNull(data.attributedVerifyGmv),
      grossProfit: numberOrNull(data.grossProfit),
      liveGmv: numberOrNull(data.liveGmv),
      shelfGmv: numberOrNull(data.shelfGmv),
      searchGmv: numberOrNull(data.searchGmv),
      poiVisits: intOrNull(data.poiVisits),
      storeSearches: intOrNull(data.storeSearches),
      searchAfterVerifyCount: intOrNull(data.searchAfterVerifyCount),
      detailCtr: numberOrNull(data.detailCtr),
      complaintRate: numberOrNull(data.complaintRate),
      badReviewRate: numberOrNull(data.badReviewRate),
      refundRate: numberOrNull(data.refundRate),
      scoreDrop: booleanFrom(data.scoreDrop),
      fulfillmentAbnormal: booleanFrom(data.fulfillmentAbnormal),
      inventoryStatus: data.inventoryStatus || null,
      reservationStatus: data.reservationStatus || null,
      hostScriptRisk: booleanFrom(data.hostScriptRisk),
      platformSubsidyAmount: numberOrNull(data.platformSubsidyAmount),
      adCouponAmount: numberOrNull(data.adCouponAmount),
      rebateCouponAmount: numberOrNull(data.rebateCouponAmount),
      merchantSubsidyAmount: numberOrNull(data.merchantSubsidyAmount),
      sourceQuality: data.sourceQuality
    }
  });

  return NextResponse.json(snapshot);
}
