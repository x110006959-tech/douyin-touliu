import type { ActivitySnapshot, LiveSnapshot } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { validateDiagnosisActions } from "./constants";
import { runDiagnosis } from "./diagnosis";
import { diagnosisPriorityPath, diagnosisRuleVersion, outputContract, subjectRulebook } from "./diagnosis-rules";

const baseSnapshot: LiveSnapshot = {
  id: "snapshot-1",
  accountId: null,
  subjectProfileId: null,
  activityId: null,
  sourceEvidenceId: null,
  liveRoomName: "测试直播",
  merchantName: "测试商家",
  storeName: "测试门店",
  capturedAt: new Date(),
  subjectType: "商家官方自播",
  accountIdentity: "商家官方号",
  operatorType: "商家自播",
  cooperationType: "无",
  controlLevel: "高",
  subjectConfidence: 0.9,
  subjectSource: "manual_verified",
  serviceProviderName: null,
  serviceMode: null,
  serviceFee: null,
  serviceScheduleStatus: null,
  serviceScriptStatus: null,
  serviceFieldControlIssue: false,
  servicePricePromiseRisk: false,
  materialAssetStatus: null,
  fanAssetStatus: null,
  dailyBudget: 1000,
  remainingBudget: 500,
  todaySpend: 500,
  spendLast30m: 60,
  currentBid: 10,
  targetRoi: 2,
  targetCpa: null,
  payRoi: 1,
  verifyRoi: 2.2,
  grossProfitRoi: null,
  attributedVerifyGmv: 700,
  grossProfit: null,
  liveGmv: 300,
  shelfGmv: 250,
  searchGmv: 200,
  poiVisits: 200,
  storeSearches: 100,
  searchAfterVerifyCount: 20,
  detailCtr: null,
  complaintRate: 0.01,
  badReviewRate: 0.01,
  refundRate: 0.03,
  scoreDrop: false,
  fulfillmentAbnormal: false,
  inventoryStatus: "充足",
  reservationStatus: "充足",
  hostScriptRisk: false,
  platformSubsidyAmount: null,
  adCouponAmount: null,
  rebateCouponAmount: null,
  merchantSubsidyAmount: null,
  sourceQuality: "manual",
  createdAt: new Date(),
  updatedAt: new Date()
};

const unverifiedActivity: ActivitySnapshot = {
  id: "activity-1",
  name: "未核验活动",
  type: "平台补贴",
  city: null,
  category: null,
  accountTier: null,
  startsAt: null,
  endsAt: null,
  subsidyOwner: "platform",
  verifiedStatus: "unverified",
  canCountInRoi: false,
  platformSubsidyAmount: 100,
  adCouponAmount: null,
  rebateCouponAmount: null,
  merchantSubsidyAmount: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("runDiagnosis", () => {
  it("缺少核销 ROI 时不得输出加预算", () => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        verifyRoi: null
      }
    });

    expect(result.actions).not.toContain("加预算");
    expect(result.missingFields).toContain("核销 ROI 缺失");
    expect(result.output).toContain("数据缺失");
    expect([...result.output].length).toBeLessThanOrEqual(120);
  });

  it("活动未核验时只给核验或稳预算动作", () => {
    const result = runDiagnosis({
      snapshot: baseSnapshot,
      activity: unverifiedActivity
    });

    expect(result.actions).toEqual(["核验活动", "稳预算"]);
    expect(result.actions).not.toContain("加预算");
  });

  it("风险信号出现时禁止加预算", () => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        refundRate: 0.2
      }
    });

    expect(result.actions).toContain("暂停跑量");
    expect(result.actions).toContain("修复口碑");
    expect(result.actions).not.toContain("加预算");
  });

  it("自动采集退款率单点毛刺未确认时不触发暂停跑量", () => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        refundRate: 0.2
      },
      metricSignals: {
        refundRate: {
          field: "refundRate",
          label: "退款升高",
          threshold: 0.12,
          values: [0.03, 0.2],
          sampleCount: 3,
          windowMinutes: 3,
          latestValue: 0.2,
          trend: "insufficient",
          confirmed: false
        }
      }
    });

    expect(result.actions).not.toContain("暂停跑量");
    expect(result.evidenceFields.unconfirmedRiskFields).toEqual(["refundRate"]);
  });

  it("自动采集退款率连续三次上升后才触发风险动作", () => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        refundRate: 0.2
      },
      metricSignals: {
        refundRate: {
          field: "refundRate",
          label: "退款升高",
          threshold: 0.12,
          values: [0.1, 0.13, 0.2],
          sampleCount: 3,
          windowMinutes: 3,
          latestValue: 0.2,
          trend: "increasing",
          confirmed: true
        }
      }
    });

    expect(result.actions).toContain("暂停跑量");
    expect(result.output).toContain("退款升高");
  });

  it("非动作库词会被运行时校验拒绝", () => {
    expect(() => validateDiagnosisActions(["加预算", "建议观望"])).toThrow("诊断动作不在动作库中");
  });

  it("全域 ROI 达标但直播 ROI 低时不直接暂停跑量", () => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        payRoi: 1,
        verifyRoi: 2.2,
        attributedVerifyGmv: 500,
        shelfGmv: 350,
        searchGmv: 250
      }
    });

    expect(result.actions).toContain("稳预算");
    expect(result.actions).toContain("强化货架承接");
    expect(result.actions).not.toContain("暂停跑量");
  });

  it("诊断结果带第一版优化后的规则版本、优先级和输出契约", () => {
    const result = runDiagnosis({ snapshot: baseSnapshot });

    expect(result.evidenceFields.ruleVersion).toBe(diagnosisRuleVersion);
    expect(result.evidenceFields.priorityPath).toEqual([...diagnosisPriorityPath]);
    expect(result.evidenceFields.outputContract).toEqual(outputContract);
    expect(result.evidenceFields.ruleFocusSignals).toEqual(subjectRulebook["商家官方自播"].focusSignals);
    expect([...result.output].length).toBeLessThanOrEqual(outputContract.maxChars);
    expect(result.output).toContain("【操作指令】");
  });

  it("服务商代播账号 ROI 好但执行差时调整 SOP 且不关计划", () => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        subjectType: "服务商代播/代运营",
        accountIdentity: "商家官方号",
        operatorType: "服务商代播",
        cooperationType: "服务商合同",
        serviceProviderName: "示例服务商",
        serviceMode: "代播",
        serviceFee: 200,
        serviceScheduleStatus: "正常",
        serviceScriptStatus: "讲解弱",
        serviceFieldControlIssue: true,
        grossProfit: 1400,
        verifyRoi: 2.4
      }
    });

    expect(result.actions).toContain("调整服务商 SOP");
    expect(result.actions).toContain("优化讲解");
    expect(result.actions).not.toContain("暂停跑量");
    expect(result.evidenceFields.algorithm).toBe("服务商真实成本算法");
    expect(result.evidenceFields.ruleFocusSignals).toEqual(subjectRulebook["服务商代播/代运营"].focusSignals);
  });

  it("服务费后毛利 ROI 不达标时重谈服务费用并降低出价", () => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        subjectType: "服务商代播/代运营",
        accountIdentity: "商家官方号",
        operatorType: "服务商代播",
        cooperationType: "服务商合同",
        serviceProviderName: "示例服务商",
        serviceMode: "代播",
        serviceFee: 800,
        grossProfit: 600,
        verifyRoi: 2.4,
        payRoi: 2.2,
        attributedVerifyGmv: 1200,
        shelfGmv: 0,
        searchGmv: 0
      }
    });

    expect(result.actions).toEqual(["重谈服务费用", "降低出价"]);
    expect(result.output).toContain("服务商后毛利ROI");
    expect(result.actions).not.toContain("加预算");
  });

  it("主体缺失时不进入服务商或达人专属结论", () => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        subjectType: null,
        liveRoomName: "测试直播",
        accountIdentity: null,
        operatorType: null,
        cooperationType: null,
        subjectConfidence: null
      }
    });

    expect(result.actions).toEqual(["稳预算", "检查库存/预约", "强化货架承接"]);
    expect(result.tags).toContain("subject_missing");
    expect(result.evidenceFields.algorithm).toBe("保守校准算法");
  });

  it("服务商错价或承诺风险优先暂停跑量并修复口碑", () => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        subjectType: "服务商代播/代运营",
        operatorType: "服务商代播",
        cooperationType: "服务商合同",
        serviceProviderName: "示例服务商",
        serviceMode: "代播",
        serviceFee: 200,
        grossProfit: 1400,
        servicePricePromiseRisk: true
      }
    });

    expect(result.actions).toContain("暂停跑量");
    expect(result.actions).toContain("修复口碑");
    expect(result.actions).toContain("调整服务商 SOP");
    expect(result.actions).not.toContain("加预算");
  });

  it.each([
    ["商家官方自播", "官方自播算法"],
    ["职人/店长直播", "职人信任算法"],
    ["外部达人直播", "达人增量算法"],
    ["达人矩阵/机构团长直播", "达人矩阵算法"],
    ["平台活动/官方会场", "活动核验算法"],
    ["品牌/区域矩阵直播", "区域矩阵算法"]
  ])("%s 能进入对应算法框架", (subjectType, algorithm) => {
    const result = runDiagnosis({
      snapshot: {
        ...baseSnapshot,
        subjectType,
        operatorType: null,
        cooperationType: null
      }
    });

    expect(result.evidenceFields.subjectType).toBe(subjectType);
    expect(result.evidenceFields.algorithm).toBe(algorithm);
  });
});
