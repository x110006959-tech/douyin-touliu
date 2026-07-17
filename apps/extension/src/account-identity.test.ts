import { describe, expect, it } from "vitest";
import { compareAccountIdentity, detectAccountIdentity } from "./account-identity";

describe("extension account identity boundary", () => {
  it("extracts the advertiser id from the observed local promotion URL", () => {
    const result = detectAccountIdentity("直播数据大屏", "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=1837899261171721");
    expect(result.accountId).toBe("1837899261171721");
    expect(result.evidence.idSource).toBe("URL:advid");
  });

  it("requires an exact page id when the account profile has an id", () => {
    expect(compareAccountIdentity({ platformAccountId: "1001", accountName: "账号 A" }, { detectedAccountId: "1001" })).toBe("MATCHED");
    expect(compareAccountIdentity({ platformAccountId: "1001", accountName: "账号 A" }, { detectedAccountId: "1002" })).toBe("MISMATCHED");
    expect(compareAccountIdentity({ platformAccountId: "1001", accountName: "账号 A" }, { detectedAccountName: "账号 A" })).toBe("UNVERIFIED");
    expect(compareAccountIdentity({ accountName: "账号 A" }, { detectedAccountName: "账号A" })).toBe("MATCHED");
    expect(compareAccountIdentity({ accountName: "账号 A" }, {})).toBe("UNVERIFIED");
  });
});
