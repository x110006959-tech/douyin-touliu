import type { Prisma, RawEvidence } from "@prisma/client";

type EvidenceWithAccount = RawEvidence & {
  account?: {
    accountName: string;
    merchantName: string | null;
    storeName: string | null;
  } | null;
};

type JsonRecord = Record<string, unknown>;

function parseJson(value: string): JsonRecord {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
  } catch {
    return {};
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function intOrUndefined(value: unknown): number | undefined {
  const next = numberOrUndefined(value);
  return next === undefined ? undefined : Math.trunc(next);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const next = numberOrUndefined(value);
    if (next !== undefined) return next;
  }
  return undefined;
}

function firstInt(...values: unknown[]) {
  for (const value of values) {
    const next = intOrUndefined(value);
    if (next !== undefined) return next;
  }
  return undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const next = stringOrUndefined(value);
    if (next) return next;
  }
  return undefined;
}

function inferSubject(evidence: EvidenceWithAccount, parsed: JsonRecord) {
  const explicit = firstString(parsed.subjectType);
  if (explicit) return explicit;
  return "主体待校准";
}

function shouldPromote(parsed: JsonRecord, evidence: EvidenceWithAccount) {
  const pageType = firstString(parsed.pageType, parsed.page, evidence.pageName)?.toLowerCase() || "";
  return (
    pageType.includes("live") ||
    pageType.includes("直播") ||
    pageType.includes("商品") ||
    pageType.includes("流量") ||
    Boolean(parsed.liveRoomName || parsed.liveTitle || parsed.liveRoomTransactionAmount)
  );
}

export function extractSnapshotDataFromEvidence(
  evidence: EvidenceWithAccount
): Prisma.LiveSnapshotUncheckedCreateInput | null {
  const parsed = parseJson(evidence.parsedFields);
  if (!shouldPromote(parsed, evidence)) return null;

  const liveMetrics = record(parsed.liveMetrics);
  const reconciliation = record(parsed.reconciliation);

  const liveRoomName = firstString(parsed.liveRoomName, parsed.liveTitle, evidence.pageName);
  if (!liveRoomName) return null;

  const liveGmv = firstNumber(
    parsed.liveRoomTransactionAmount,
    parsed.transactionAmount,
    liveMetrics.liveGmv,
    liveMetrics.gmv,
    reconciliation.liveRoomGmv
  );

  const shelfGmv = firstNumber(parsed.shelfGmv, reconciliation.capturedProductPayAmountSum);
  const storeSearches = firstInt(parsed.storeSearches, parsed.storeSearchCount);
  const poiVisits = firstInt(parsed.poiVisits, parsed.poiVisitCount);

  return {
    accountId: evidence.accountId || undefined,
    sourceEvidenceId: evidence.id,
    liveRoomName,
    merchantName: firstString(parsed.merchantName, evidence.account?.merchantName) || null,
    storeName: firstString(parsed.storeName, evidence.account?.storeName) || null,
    subjectType: inferSubject(evidence, parsed),
    accountIdentity: firstString(parsed.accountIdentity),
    operatorType: firstString(parsed.operatorType),
    cooperationType: firstString(parsed.cooperationType),
    controlLevel: firstString(parsed.controlLevel),
    subjectConfidence: firstNumber(parsed.subjectConfidence),
    subjectSource: firstString(parsed.subjectSource) || evidence.source,
    serviceProviderName: firstString(parsed.serviceProviderName),
    serviceMode: firstString(parsed.serviceMode, parsed.serviceType),
    serviceFee: firstNumber(parsed.serviceFee),
    serviceScheduleStatus: firstString(parsed.serviceScheduleStatus),
    serviceScriptStatus: firstString(parsed.serviceScriptStatus),
    serviceFieldControlIssue: parsed.serviceFieldControlIssue === true,
    servicePricePromiseRisk: parsed.servicePricePromiseRisk === true,
    materialAssetStatus: firstString(parsed.materialAssetStatus),
    fanAssetStatus: firstString(parsed.fanAssetStatus),
    dailyBudget: firstNumber(parsed.dailyBudget),
    remainingBudget: firstNumber(parsed.remainingBudget),
    todaySpend: firstNumber(parsed.todaySpend),
    spendLast30m: firstNumber(parsed.spendLast30m),
    currentBid: firstNumber(parsed.currentBid),
    targetRoi: firstNumber(parsed.targetRoi),
    targetCpa: firstNumber(parsed.targetCpa),
    payRoi: firstNumber(parsed.payRoi),
    verifyRoi: firstNumber(parsed.verifyRoi),
    grossProfitRoi: firstNumber(parsed.grossProfitRoi),
    attributedVerifyGmv: firstNumber(parsed.attributedVerifyGmv, parsed.verifyGmv),
    grossProfit: firstNumber(parsed.grossProfit),
    liveGmv: liveGmv ?? null,
    shelfGmv: shelfGmv ?? null,
    searchGmv: firstNumber(parsed.searchGmv),
    poiVisits: poiVisits ?? null,
    storeSearches: storeSearches ?? null,
    searchAfterVerifyCount: firstInt(parsed.searchAfterVerifyCount),
    detailCtr: firstNumber(parsed.detailCtr),
    complaintRate: firstNumber(parsed.complaintRate),
    badReviewRate: firstNumber(parsed.badReviewRate),
    refundRate: firstNumber(parsed.refundRate),
    scoreDrop: parsed.scoreDrop === true,
    fulfillmentAbnormal: parsed.fulfillmentAbnormal === true,
    inventoryStatus: firstString(parsed.inventoryStatus) || "待校准",
    reservationStatus: firstString(parsed.reservationStatus) || "待校准",
    hostScriptRisk: parsed.hostScriptRisk === true,
    platformSubsidyAmount: firstNumber(parsed.platformSubsidyAmount),
    adCouponAmount: firstNumber(parsed.adCouponAmount),
    rebateCouponAmount: firstNumber(parsed.rebateCouponAmount),
    merchantSubsidyAmount: firstNumber(parsed.merchantSubsidyAmount),
    sourceQuality: evidence.status === "verified" ? "manual_verified" : "pending_verification",
    capturedAt: evidence.verifiedAt || evidence.createdAt
  };
}
