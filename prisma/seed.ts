import { prisma } from "../src/lib/prisma";
import { runDiagnosis } from "../src/lib/diagnosis";

async function main() {
  const account = await prisma.accountProfile.upsert({
    where: { id: "demo-account" },
    update: {},
    create: {
      id: "demo-account",
      platform: "抖音来客",
      accountName: "示例门店官方号",
      merchantName: "示例本地生活商家",
      storeName: "示例门店",
      usage: "本地推监控",
      memo: "演示账号，可删除",
      sessionStatus: "missing"
    }
  });

  const activity = await prisma.activitySnapshot.create({
    data: {
      name: "示例城市消费券",
      type: "政府消费券",
      city: "上海",
      category: "餐饮",
      verifiedStatus: "unverified",
      canCountInRoi: false,
      notes: "演示数据：未后台核验，不计入 ROI"
    }
  });

  const snapshot = await prisma.liveSnapshot.create({
    data: {
      accountId: account.id,
      activityId: activity.id,
      liveRoomName: "7月4日午市直播",
      merchantName: account.merchantName,
      storeName: account.storeName,
      subjectType: "商家官方自播",
      dailyBudget: 800,
      remainingBudget: 360,
      todaySpend: 440,
      spendLast30m: 80,
      targetRoi: 1.8,
      payRoi: 1.2,
      verifyRoi: null,
      attributedVerifyGmv: 720,
      shelfGmv: 360,
      searchGmv: 180,
      poiVisits: 260,
      storeSearches: 120,
      inventoryStatus: "待校准",
      sourceQuality: "manual"
    }
  });

  const diagnosis = runDiagnosis({
    snapshot,
    activity,
    subjectProfile: null
  });

  await prisma.diagnosisResult.create({
    data: {
      snapshotId: snapshot.id,
      intelligence: diagnosis.intelligence,
      judgement: diagnosis.judgement,
      operation: diagnosis.operation,
      output: diagnosis.output,
      actions: JSON.stringify(diagnosis.actions),
      tags: JSON.stringify(diagnosis.tags),
      confidence: diagnosis.confidence,
      missingFields: JSON.stringify(diagnosis.missingFields),
      evidenceFields: JSON.stringify(diagnosis.evidenceFields)
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
