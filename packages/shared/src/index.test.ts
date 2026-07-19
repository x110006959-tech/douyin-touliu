import { describe, expect, it } from "vitest";
import {
  collectionSnapshotSchema,
  createProjectSchema,
  decisionEngineInputSchema,
  evaluateAccountIdentityMatch,
  generatedOptimizationRecommendationSchema,
  hasTrustedAccountIdEvidence,
  identifyMetricKey,
  standardizeMetricKey
} from "./index";

describe("metric dictionary", () => {
  it("maps explicit verification ROI aliases to the standard key", () => {
    expect(identifyMetricKey("verify_roi")).toBe("verify_roi");
    expect(identifyMetricKey("核销 ROI")).toBe("verify_roi");
    expect(identifyMetricKey("整体支付ROI")).toBe("pay_roi");
    expect(identifyMetricKey("全域支付ROI")).toBe("full_domain_pay_roi");
  });

  it("does not guess the meaning of a bare ROI label", () => {
    expect(identifyMetricKey("ROI")).toBe("unknown");
  });

  it("maps metric names when raw keys are not standard", () => {
    expect(standardizeMetricKey({ key: "foo_123", name: "点击率" })).toBe("ctr");
  });

  it("marks unknown metrics as unknown", () => {
    expect(identifyMetricKey("完全未知字段")).toBe("unknown");
    expect(standardizeMetricKey({ key: "random_metric", name: "自定义备注" })).toBe("unknown");
  });
});

describe("project subject requirements", () => {
  it("requires a provider name for service-provider operations", () => {
    const result = createProjectSchema.safeParse({
      name: "服务商项目",
      subjectType: "SERVICE_PROVIDER",
      operatorType: "SERVICE_PROVIDER_LIVE",
      cooperationType: "SERVICE_PROVIDER_CONTRACT",
      subjectConfidence: 1
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["serviceProviderName"]);
  });

  it("keeps provider name optional for merchant self-broadcast projects", () => {
    const result = createProjectSchema.safeParse({
      name: "官方自播项目",
      subjectType: "MERCHANT_OFFICIAL",
      operatorType: "MERCHANT_SELF",
      cooperationType: "NONE",
      subjectConfidence: 1
    });

    expect(result.success).toBe(true);
  });
});

describe("collection snapshot contracts", () => {
  const snapshot = {
    pageType: "LIVE_DATA_SCREEN",
    sourceUrl: "https://eos.douyin.com/dp/liveScreen",
    pageTitle: "直播数据大屏",
    rawDomText: "",
    rawNetworkJson: [],
    rawTableData: [],
    visibleMetricsJson: [],
    localCollectedAt: "2026-07-18T08:00:00.000Z"
  };

  it("accepts only registered account evidence sources", () => {
    expect(collectionSnapshotSchema.safeParse({
      ...snapshot,
      accountMatchEvidence: { idSource: "URL:advid", nameSource: "VISIBLE_TEXT_LABEL" }
    }).success).toBe(true);
    expect(collectionSnapshotSchema.safeParse({
      ...snapshot,
      accountMatchEvidence: { idSource: "UNTRUSTED_SOURCE", nameSource: null }
    }).success).toBe(false);
  });

  it("requires the claimed URL source to contain the detected account id", () => {
    expect(hasTrustedAccountIdEvidence({
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=account-1001",
      detectedAccountId: "account-1001",
      evidence: { idSource: "URL:advid", nameSource: null }
    })).toBe(true);
    expect(hasTrustedAccountIdEvidence({
      sourceUrl: "https://attacker.example.com/?advid=account-1001",
      detectedAccountId: "account-1001",
      evidence: { idSource: "URL:advid", nameSource: null }
    })).toBe(false);
    expect(hasTrustedAccountIdEvidence({
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=account-1002",
      detectedAccountId: "account-1001",
      evidence: { idSource: "URL:advid", nameSource: null }
    })).toBe(false);
    expect(hasTrustedAccountIdEvidence({
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2?advid=account-1001",
      detectedAccountId: "account-1001",
      evidence: { idSource: "MANUAL_CONFIRMATION", nameSource: null }
    })).toBe(false);
  });

  it("never trusts a client-declared account status without verifiable evidence", () => {
    expect(evaluateAccountIdentityMatch({
      expectedAccountId: "account-1001",
      expectedAccountName: "账号 A",
      sourceUrl: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      detectedAccountId: "account-1001",
      detectedAccountName: "账号 A",
      evidence: { idSource: null, nameSource: "VISIBLE_TEXT_LABEL" }
    })).toMatchObject({ status: "UNVERIFIED" });
  });
});

describe("decision contracts", () => {
  const subject = { subjectType: "MERCHANT_OFFICIAL", operatorType: "MERCHANT_SELF", cooperationType: "NONE", controlLevel: "HIGH", confidence: 1 };

  it("accepts typed tables and collection quality", () => {
    expect(decisionEngineInputSchema.safeParse({
      businessType: "DOUYIN_LOCAL_LIFE",
      subject,
      metrics: [],
      tables: [{ routeKey: "LIVE_PRODUCT_TAB", pageType: "LIVE_PRODUCT_TAB", rows: [["商品ID", "商品名称"], ["p-1", "套餐 A"]] }],
      networkJsonSummary: [],
      collectionQuality: {
        requiredRoutes: ["LIVE_DATA_SCREEN"],
        routes: [{ routeKey: "LIVE_DATA_SCREEN", state: "FRESH", lastCollectedAt: "2026-07-16T08:00:00.000Z", ageMs: 1_000 }],
        completeness: 1,
        missingRoutes: [], staleRoutes: [], blocksStrongActions: false
      }
    }).success).toBe(true);
  });

  it("rejects object cells and generated recommendations without evidence", () => {
    expect(decisionEngineInputSchema.safeParse({
      businessType: "DOUYIN_LOCAL_LIFE", subject, metrics: [], networkJsonSummary: [],
      tables: [{ routeKey: "LIVE_PRODUCT_TAB", pageType: "LIVE_PRODUCT_TAB", rows: [[{ invented: true }]] }]
    }).success).toBe(false);
    expect(generatedOptimizationRecommendationSchema.safeParse({
      priority: "P1", dimension: "PRODUCT", title: "测试建议", reason: "测试原因",
      steps: ["人工执行"], verifyMetrics: ["订单"], ruleBoundary: "不得自动操作平台"
    }).success).toBe(false);
  });
});
