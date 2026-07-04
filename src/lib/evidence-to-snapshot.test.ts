import type { RawEvidence } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { extractSnapshotDataFromEvidence } from "./evidence-to-snapshot";

function evidence(parsedFields: unknown): RawEvidence & { account: { accountName: string; merchantName: null; storeName: null } } {
  return {
    id: "evidence-1",
    accountId: "account-1",
    source: "ocr",
    pageName: "直播大屏-商品页",
    targetUrl: null,
    status: "verified",
    confidence: 0.9,
    rawText: null,
    rawPayload: "{}",
    parsedFields: JSON.stringify(parsedFields),
    failureReason: null,
    screenshotPath: null,
    needsCalibration: false,
    verifiedAt: new Date("2026-07-04T01:00:00.000Z"),
    createdAt: new Date("2026-07-04T00:00:00.000Z"),
    updatedAt: new Date("2026-07-04T01:00:00.000Z"),
    account: {
      accountName: "好想来零食乐园-广东区域号",
      merchantName: null,
      storeName: null
    }
  };
}

describe("extractSnapshotDataFromEvidence", () => {
  it("promotes verified live screen evidence into a formal snapshot without guessing subject from name", () => {
    const snapshot = extractSnapshotDataFromEvidence(
      evidence({
        page: "抖音生活服务直播数据大屏-今日直播间",
        liveTitle: "好想来零食乐园-广东区域号 粤夏狂欢季",
        liveRoomTransactionAmount: 232290,
        todaySpend: 1000,
        targetRoi: 2,
        verifyRoi: null,
        inventoryStatus: "待校准"
      })
    );

    expect(snapshot).toMatchObject({
      accountId: "account-1",
      sourceEvidenceId: "evidence-1",
      liveRoomName: "好想来零食乐园-广东区域号 粤夏狂欢季",
      subjectType: "主体待校准",
      liveGmv: 232290,
      todaySpend: 1000,
      targetRoi: 2,
      inventoryStatus: "待校准",
      sourceQuality: "manual_verified"
    });
  });

  it("uses configured subject type as the formal routing field", () => {
    const snapshot = extractSnapshotDataFromEvidence(
      evidence({
        pageType: "live_dashboard",
        liveRoomName: "服务商代播测试",
        subjectType: "服务商代播/代运营",
        accountIdentity: "商家官方号",
        operatorType: "服务商代播",
        subjectSource: "collection_job",
        liveRoomTransactionAmount: 1000
      })
    );

    expect(snapshot).toMatchObject({
      liveRoomName: "服务商代播测试",
      subjectType: "服务商代播/代运营",
      accountIdentity: "商家官方号",
      operatorType: "服务商代播",
      subjectSource: "collection_job"
    });
  });

  it("promotes product evidence while preserving reconciliation as待校准 data", () => {
    const snapshot = extractSnapshotDataFromEvidence(
      evidence({
        pageType: "live_product",
        liveRoomName: "商品页直播",
        reconciliation: {
          liveRoomGmv: 232290,
          capturedProductPayAmountSum: 219432.9
        }
      })
    );

    expect(snapshot).toMatchObject({
      liveRoomName: "商品页直播",
      liveGmv: 232290,
      shelfGmv: 219432.9,
      verifyRoi: undefined,
      inventoryStatus: "待校准"
    });
  });
});
