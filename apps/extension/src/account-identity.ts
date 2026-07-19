import type { AccountIdEvidenceSource, AccountMatchEvidence } from "@douyin-local-life/shared";

export type DetectedAccountIdentity = {
  accountId: string | null;
  accountName: string | null;
  evidence: AccountMatchEvidence;
};

const accountIdQueryParams = ["advertiser_id", "account_id", "advid", "aadvid"] as const;

export function detectAccountIdentity(text: string, sourceUrl: string): DetectedAccountIdentity {
  let accountId: string | null = null;
  let idSource: AccountIdEvidenceSource | null = null;
  try {
    const url = new URL(sourceUrl);
    for (const key of accountIdQueryParams) {
      const value = url.searchParams.get(key)?.trim();
      if (value && /^[A-Za-z0-9_-]{4,100}$/.test(value)) {
        accountId = value;
        idSource = `URL:${key}`;
        break;
      }
    }
  } catch {
    // Invalid URLs are handled by the page and API validation layers.
  }
  const nameMatch = text.match(/(?:当前账号|账号名称|账户名称|广告主名称)\s*[:：]?\s*([^\n]{2,100})/);
  const accountName = nameMatch?.[1]?.trim() || null;
  return { accountId, accountName, evidence: { idSource, nameSource: accountName ? "VISIBLE_TEXT_LABEL" : null } };
}

export function compareAccountIdentity(
  expected: { platformAccountId?: string | null; accountName?: string | null },
  detected: { detectedAccountId?: string | null; detectedAccountName?: string | null }
) {
  const expectedId = normalizeAccountValue(expected.platformAccountId);
  const detectedId = normalizeAccountValue(detected.detectedAccountId);
  if (expectedId) {
    if (!detectedId) return "UNVERIFIED";
    return expectedId === detectedId ? "MATCHED" : "MISMATCHED";
  }
  const expectedName = normalizeAccountValue(expected.accountName);
  const detectedName = normalizeAccountValue(detected.detectedAccountName);
  if (expectedName && detectedName && expectedName !== detectedName) return "MISMATCHED";
  return "UNVERIFIED";
}

export function normalizeAccountValue(value: string | null | undefined) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}
