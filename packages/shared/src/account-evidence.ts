import { z } from "zod";

export const accountIdEvidenceSources = [
  "URL:advertiser_id",
  "URL:account_id",
  "URL:advid",
  "URL:aadvid",
  "MANUAL_CONFIRMATION"
] as const;
export const accountNameEvidenceSources = ["VISIBLE_TEXT_LABEL", "MANUAL_CONFIRMATION"] as const;

const accountIdQueryParamBySource = {
  "URL:advertiser_id": "advertiser_id",
  "URL:account_id": "account_id",
  "URL:advid": "advid",
  "URL:aadvid": "aadvid"
} as const;

const trustedAccountEvidencePaths = new Map<string, readonly string[]>([
  ["eos.douyin.com", ["/dp/liveScreen"]],
  ["localads.chengzijianzhan.cn", ["/lamp/pc/liveboard2", "/lamp/pc/promotion/roi2"]]
]);

export type AccountIdEvidenceSource = (typeof accountIdEvidenceSources)[number];
export type AccountNameEvidenceSource = (typeof accountNameEvidenceSources)[number];

export type AccountMatchEvidence = {
  idSource: AccountIdEvidenceSource | null;
  nameSource: AccountNameEvidenceSource | null;
};

export const accountMatchEvidenceSchema = z.object({
  idSource: z.enum(accountIdEvidenceSources).nullable(),
  nameSource: z.enum(accountNameEvidenceSources).nullable()
}).strict();

export function hasTrustedAccountIdEvidence(input: {
  sourceUrl?: string | null;
  detectedAccountId?: string | null;
  evidence?: AccountMatchEvidence | null;
}) {
  const source = input.evidence?.idSource;
  if (!source || source === "MANUAL_CONFIRMATION") return false;
  const queryParam = accountIdQueryParamBySource[source];
  const detectedAccountId = normalizeAccountEvidenceValue(input.detectedAccountId);
  if (!queryParam || !detectedAccountId) return false;
  try {
    const sourceUrl = new URL(input.sourceUrl || "");
    if (!isTrustedAccountEvidenceUrl(sourceUrl)) return false;
    return normalizeAccountEvidenceValue(sourceUrl.searchParams.get(queryParam)) === detectedAccountId;
  } catch {
    return false;
  }
}

export function evaluateAccountIdentityMatch(input: {
  expectedAccountId?: string | null;
  expectedAccountName?: string | null;
  sourceUrl?: string | null;
  detectedAccountId?: string | null;
  detectedAccountName?: string | null;
  evidence?: AccountMatchEvidence | null;
}): { status: "MATCHED" | "MISMATCHED" | "UNVERIFIED"; reason: string } {
  const expectedId = normalizeAccountEvidenceValue(input.expectedAccountId);
  const expectedName = normalizeAccountEvidenceValue(input.expectedAccountName);
  const detectedId = normalizeAccountEvidenceValue(input.detectedAccountId);
  const detectedName = normalizeAccountEvidenceValue(input.detectedAccountName);

  if (expectedId && detectedId) {
    if (!hasTrustedAccountIdEvidence(input)) {
      return { status: "UNVERIFIED", reason: "页面账号 ID 缺少可验证的 URL 来源" };
    }
    return expectedId === detectedId
      ? { status: "MATCHED", reason: "平台账号 ID 完全一致" }
      : { status: "MISMATCHED", reason: "平台账号 ID 不一致" };
  }
  if (expectedId) return { status: "UNVERIFIED", reason: "账号档案已有平台账号 ID，但当前页面未识别到账号 ID" };
  if (expectedName && detectedName) {
    return expectedName === detectedName
      ? { status: "UNVERIFIED", reason: "页面账号名称一致，仍需人工确认" }
      : { status: "MISMATCHED", reason: "平台账号名称不一致" };
  }
  return { status: "UNVERIFIED", reason: "当前页面未识别到可核对的账号 ID 或账号名称" };
}

export function normalizeAccountEvidenceValue(value: string | null | undefined) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

function isTrustedAccountEvidenceUrl(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const allowedPaths = trustedAccountEvidencePaths.get(url.hostname.toLowerCase());
  return Boolean(allowedPaths?.some((path) => url.pathname === path));
}
