import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LIVE_SCREEN_ACCOUNT_ID = "cmr5epfkw0005ae0sq4pkelum";
const LIVE_ROOM_NAME = "好想来零食乐园-广东区域号 粤夏狂欢季";

const productScreenshot =
  "C:/Users/Admin/AppData/Local/Temp/codex-clipboard-07755c7e-981e-458b-be20-08d72b1e6b4d.png";
const trafficScreenshot =
  "C:/Users/Admin/AppData/Local/Temp/codex-clipboard-88cc2c35-2163-48a7-a380-f5cb55958568.png";

const productEvidenceFiles = [
  productScreenshot,
  "C:/Users/Admin/Documents/字节投流/collector/.cache/chrome-product-visible-full.png",
  "C:/Users/Admin/Documents/字节投流/collector/.cache/chrome-product-list-scroll-up-check.png",
  "C:/Users/Admin/Documents/字节投流/collector/.cache/chrome-product-list-scroll-down-check.png",
  "C:/Users/Admin/Documents/字节投流/collector/.cache/chrome-product-list-scroll-3.png"
];

const productFields = {
  pageType: "live_product",
  dataDomain: "douyin_live_monitor_product",
  liveRoomName: LIVE_ROOM_NAME,
  capturedFrom: "user_screenshot_and_chrome_scroll",
  evidenceFiles: productEvidenceFiles,
  captureCoverage: {
    visibleRows: 13,
    hasMoreRows: false,
    observedScrollBottom: true,
    note: "已合并用户截图、Chrome 首屏截图和商品列表滚动截图；商品名称仍有截断，金额合计与直播成交金额不完全一致，保留待校准。"
  },
  topProducts: [
    {
      rankTag: "成交金额Top1",
      name: "100元代金券【随机立减】...",
      nameTruncated: true,
      salePrice: 98,
      payAmount: 144192,
      silentPeriodGmv: 2516,
      payOrders: 1547
    },
    {
      rankTag: "曝光成交率Top1",
      name: "【单瓶低至3.3元新客】农夫...",
      nameTruncated: true,
      salePrice: 13.5,
      payAmount: 10936.8,
      silentPeriodGmv: 10509,
      payOrders: 1077
    }
  ],
  recommendedReturnProducts: [
    {
      name: "【单瓶低至3.3元新客】农夫山泉东方树叶...",
      nameTruncated: true,
      salePrice: 13.5,
      productGmv: 10936.8,
      exposureClickRate: 5.82,
      explanationPeriodPopularityChange: 0
    },
    {
      name: "60元代金券【随机立减】广东",
      salePrice: 59,
      productGmv: 43405,
      exposureClickRate: 4.83,
      explanationPeriodPopularityChange: 0
    }
  ],
  products: [
    {
      name: "100元代金券【随机立减】...",
      nameTruncated: true,
      productId: "1850390298266627",
      salePrice: 98,
      flashPrice: null,
      payAmount: 144192,
      payOrders: 1547,
      paySuccessUsers: 1429,
      productExposureCount: 133643
    },
    {
      name: "60元代金券【随机立减】...",
      nameTruncated: true,
      productId: "1865128620514312",
      salePrice: 59,
      flashPrice: null,
      payAmount: 43405,
      payOrders: 773,
      paySuccessUsers: 752,
      productExposureCount: 28964
    },
    {
      name: "【单瓶低至3.3元新客】农...",
      nameTruncated: true,
      productId: "1866408655230979",
      salePrice: 13.5,
      flashPrice: 9.9,
      payAmount: 10936.8,
      payOrders: 1077,
      paySuccessUsers: 1035,
      productExposureCount: 14855
    },
    {
      name: "【三张60元代金券-随机立减】...",
      nameTruncated: true,
      productId: "1865338925943817",
      salePrice: 177,
      flashPrice: null,
      payAmount: 10788,
      payOrders: 62,
      paySuccessUsers: 59,
      productExposureCount: 27907
    },
    {
      name: "100元代金券【粤夏狂欢】...",
      nameTruncated: true,
      productId: "1850273911213063",
      salePrice: 100,
      flashPrice: 94,
      payAmount: 5264,
      payOrders: 56,
      paySuccessUsers: 54,
      productExposureCount: 20059
    },
    {
      name: "【低至75折】农夫山泉尖...",
      nameTruncated: true,
      productId: "1867596176993292",
      salePrice: 9,
      flashPrice: 6.8,
      payAmount: 2373.2,
      payOrders: 329,
      paySuccessUsers: 301,
      productExposureCount: 12351
    },
    {
      name: "【单瓶0.49元】2次卡好...",
      nameTruncated: true,
      productId: "1865153142729788",
      salePrice: 13.78,
      flashPrice: 11.8,
      payAmount: 2301,
      payOrders: 184,
      paySuccessUsers: 174,
      productExposureCount: 10825
    },
    {
      name: "【低至76折】好想来甄选...",
      nameTruncated: true,
      productId: "1867585165798427",
      salePrice: 6,
      flashPrice: null,
      payAmount: 66,
      payOrders: 10,
      paySuccessUsers: 9,
      productExposureCount: 6972
    },
    {
      name: "【福袋】妙可蓝多芝士奶...",
      nameTruncated: true,
      productId: "1864996075700279",
      salePrice: 2.6,
      flashPrice: null,
      payAmount: 46.9,
      payOrders: 244,
      paySuccessUsers: 243,
      productExposureCount: 4640
    },
    {
      name: "【低至81折】好想来甄选...",
      nameTruncated: true,
      productId: "1867585077609476",
      salePrice: 8,
      flashPrice: null,
      payAmount: 40,
      payOrders: 5,
      paySuccessUsers: 5,
      productExposureCount: 6681
    },
    {
      name: "【福袋】优之唯品清润橄...",
      nameTruncated: true,
      productId: "1864996356887555",
      salePrice: 2.6,
      flashPrice: null,
      payAmount: 12,
      payOrders: 70,
      paySuccessUsers: 70,
      productExposureCount: 4503
    },
    {
      name: "【低至69折】好想来甄选...",
      nameTruncated: true,
      productId: "1867585244182540",
      salePrice: 8,
      flashPrice: null,
      payAmount: 8,
      payOrders: 1,
      paySuccessUsers: 1,
      productExposureCount: 6365
    },
    {
      name: "【广东夏日狂欢季】嘉士...",
      nameTruncated: true,
      productId: "1866406148072474",
      salePrice: 9.9,
      flashPrice: null,
      payAmount: 0,
      payOrders: 0,
      paySuccessUsers: 0,
      productExposureCount: 8209
    }
  ],
  productAudience: {
    gender: "女 62.24%",
    age: "24-30 37.06%",
    city: "深圳 26.83%",
    fanStatus: "非粉丝 92.95%"
  },
  productFunnel: [
    { name: "商品曝光人数", value: 22937, rate: null, change: null },
    { name: "商品点击人数", value: 3037, rate: 13.24, change: "下降60.54%" },
    { name: "商详访问人数", value: 1909, rate: 62.86, change: "上升8.32%" },
    { name: "提单页人数", value: 1741, rate: 91.2, change: "下降0.78%" },
    { name: "成交人数", value: 1429, rate: 82.08, change: "下降48.15%" }
  ],
  reconciliation: {
    liveRoomGmv: 232290,
    capturedProductPayAmountSum: 219432.9,
    difference: 12857.1,
    status: "待校准",
    note: "商品列表可见支付金额合计与直播间成交金额不一致，可能来自口径差异、截断商品名或仍有后台未展示字段，诊断不得据此编造核销 ROI。"
  },
  dataQuality: {
    confidence: 0.9,
    requiresManualVerification: true,
    missingFields: ["完整商品名称", "商品金额与直播GMV口径差异", "全商品后台导出核对"]
  }
};

const trafficFields = {
  pageType: "live_traffic",
  dataDomain: "douyin_live_monitor_traffic",
  liveRoomName: LIVE_ROOM_NAME,
  capturedFrom: "user_supplied_screenshot_and_page_text",
  evidenceFiles: [
    trafficScreenshot,
    "C:/Users/Admin/Documents/字节投流/collector/.cache/chrome-live-flow-current.png"
  ],
  selectedChannel: "全部",
  selectedMetric: "曝光次数",
  trafficOverview: {
    totalWatchUsers: 31800,
    hourlyWatchCount: 3574.59,
    hourlyNaturalWatch: 2695.48,
    hourlyCommercialWatch: 879.11
  },
  trafficChannels: [
    { name: "关注页曝光次数", metric: "曝光次数", status: "图表可见，具体序列待采集" },
    { name: "其他曝光次数", metric: "曝光次数", status: "图表可见，具体序列待采集" },
    { name: "推荐页呼吸灯曝光次数", metric: "曝光次数", status: "图表可见，具体序列待采集" },
    { name: "搜索曝光次数", metric: "曝光次数", status: "图表可见，具体序列待采集" },
    { name: "社交分享曝光次数", metric: "曝光次数", status: "图表可见，具体序列待采集" },
    { name: "他人主页曝光次数", metric: "曝光次数", status: "图表可见，具体序列待采集" },
    { name: "其他推荐路径曝光次数", metric: "曝光次数", status: "页面文本可见，序列待采集" },
    { name: "POI直播入口曝光次数", metric: "曝光次数", status: "页面文本可见，序列待采集" },
    { name: "收藏回访曝光次数", metric: "曝光次数", status: "页面文本可见，序列待采集" },
    { name: "同城页曝光次数", metric: "曝光次数", status: "页面文本可见，序列待采集" },
    { name: "本地推竞价直播曝光次数", metric: "曝光次数", status: "页面文本可见，序列待采集" },
    { name: "直播间推广曝光次数", metric: "曝光次数", status: "页面文本可见，序列待采集" },
    { name: "巨量广告直播曝光次数", metric: "曝光次数", status: "页面文本可见，序列待采集" }
  ],
  notes: [
    { text: "截图显示自然/商业小时看播拆分，商业小时看播约占24.6%。" },
    { text: "流量趋势图还有 1/6 分页，分渠道序列待继续采集。" },
    { text: "全域推广直播间内流量/订单来源面板为空态，提示精准数据前往本地推查看。" }
  ],
  dataQuality: {
    confidence: 0.92,
    requiresManualVerification: true,
    missingFields: ["流量趋势完整6页", "分渠道时间序列", "本地推精准来源数据", "引流短视频页数据"]
  }
};

function rawTextForProduct() {
  return [
    "主导航商品页：关注商品、推荐返场、商品列表与商品画像/转化。",
    "已合并首屏和下拉截图，可见商品13行；商品名仍存在截断，金额口径需后台导出校准。",
    "主要商品：100元代金券支付144,192元/1547单；60元代金券支付43,405元/773单；农夫山泉新客品支付10,936.8元/1077单。",
    "补采商品：2次卡支付2,301元；低价甄选/福袋类多为低支付或0成交。",
    "商品转化：曝光22,937，点击3,037，商详1,909，提单1,741，成交1,429。"
  ].join("\n");
}

function rawTextForTraffic() {
  return [
    "主导航流量页：整场累计看播3.18万，小时看播3,574.59，自然2,695.48，商业879.11。",
    "当前筛选：流量渠道全部，指标曝光次数。",
    "页面文本还包含POI直播入口、同城页、本地推竞价、直播间推广、巨量广告等渠道名，但具体时间序列待补采。",
    "流量/订单来源面板为空态，提示精准数据前往本地推。"
  ].join("\n");
}

async function upsertEvidence({
  pageName,
  screenshotPath,
  parsedFields,
  rawText,
  confidence
}: {
  pageName: string;
  screenshotPath: string;
  parsedFields: unknown;
  rawText: string;
  confidence: number;
}) {
  const parsed = JSON.stringify(parsedFields);
  const existing = await prisma.rawEvidence.findFirst({ where: { screenshotPath } });
  const data = {
    accountId: LIVE_SCREEN_ACCOUNT_ID,
    source: "ocr",
    pageName,
    targetUrl: null,
    status: "pending_verification",
    confidence,
    rawText,
    rawPayload: parsed,
    parsedFields: parsed,
    failureReason: null,
    screenshotPath,
    needsCalibration: true
  };

  const evidence = existing
    ? await prisma.rawEvidence.update({ where: { id: existing.id }, data })
    : await prisma.rawEvidence.create({ data });

  await prisma.calibrationItem.upsert({
    where: { id: `${evidence.id}-parsedFields` },
    update: {
      currentValue: parsed,
      confidence,
      status: "pending",
      reason: "截图OCR/人工识别字段待校准"
    },
    create: {
      id: `${evidence.id}-parsedFields`,
      evidenceId: evidence.id,
      fieldName: "parsedFields",
      currentValue: parsed,
      confidence,
      status: "pending",
      reason: "截图OCR/人工识别字段待校准"
    }
  });

  return evidence;
}

async function main() {
  const productEvidence = await upsertEvidence({
    pageName: "直播大屏-商品页（主导航）",
    screenshotPath: productScreenshot,
    parsedFields: productFields,
    rawText: rawTextForProduct(),
    confidence: 0.9
  });
  const trafficEvidence = await upsertEvidence({
    pageName: "直播大屏-流量页（主导航）",
    screenshotPath: trafficScreenshot,
    parsedFields: trafficFields,
    rawText: rawTextForTraffic(),
    confidence: 0.92
  });

  console.log(
    JSON.stringify(
      {
        productEvidenceId: productEvidence.id,
        trafficEvidenceId: trafficEvidence.id,
        products: productFields.products.length,
        productPayAmountSum: productFields.reconciliation.capturedProductPayAmountSum
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
