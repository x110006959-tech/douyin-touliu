import { afterEach, describe, expect, it, vi } from "vitest";
import { selectPageAdapter } from "./page-adapters";

type FakeElement = {
  tagName: string;
  textContent: string;
  parentElement: FakeElement | null;
  children: FakeElement[];
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  querySelectorAll(selector: string): FakeElement[];
};

function card(label: string, value: string, period = "今日") {
  const container = element("DIV", "", []);
  const labelElement = element("SPAN", label, [], container);
  const valueElement = element("SPAN", value, [], container);
  const periodElement = period ? element("SPAN", period, [], container) : null;
  container.children.push(labelElement, valueElement, ...(periodElement ? [periodElement] : []));
  container.textContent = [label, value, period].filter(Boolean).join(" ");
  return container;
}

function nestedLabelCard(label: string, value: string, period = "今日") {
  const container = element("DIV", `${label} ${value} ${period}`, []);
  const labelBranch = element("DIV", label, [], container);
  const labelWrapper = element("SPAN", label, [], labelBranch);
  const labelElement = element("SPAN", label, [], labelWrapper);
  labelWrapper.children.push(labelElement);
  labelBranch.children.push(labelWrapper);
  const valueElement = element("SPAN", value, [], container);
  const periodElement = element("SPAN", period, [], container);
  container.children.push(labelBranch, valueElement, periodElement);
  return container;
}

function splitValueCard(label: string, valueParts: string[], period = "今日") {
  const container = element("DIV", `${label} ${valueParts.join("")} ${period}`, []);
  const labelElement = element("DIV", label, [], container);
  const valueContainer = element("DIV", valueParts.join(""), [], container);
  const parts = valueParts.map((value) => element("DIV", value, [], valueContainer));
  valueContainer.children.push(...parts);
  const periodElement = period ? element("SPAN", period, [], container) : null;
  container.children.push(labelElement, valueContainer, ...(periodElement ? [periodElement] : []));
  return container;
}

function directTextValueCard(label: string, value: string, suffix: string, period = "") {
  const container = element("DIV", `${label}${value}${period}`, []);
  const labelBranch = element("DIV", label, [], container);
  const labelElement = element("SPAN", label, [], labelBranch);
  labelBranch.children.push(labelElement);
  const valueElement = element("DIV", value, [], container);
  const suffixElement = element("SPAN", suffix, [], valueElement);
  valueElement.children.push(suffixElement);
  const periodElement = period ? element("SPAN", period, [], container) : null;
  container.children.push(labelBranch, valueElement, ...(periodElement ? [periodElement] : []));
  return container;
}

function metricSelector(...labels: string[]) {
  const selector = element("DIV", labels.join(" "), []);
  selector.getAttribute = (name: string) => name === "class" ? "radio-select-container" : null;
  selector.children.push(...labels.map((label) => {
    const item = element("DIV", label, [], selector);
    item.getAttribute = (name: string) => name === "class" ? "radio-select-item" : null;
    const text = element("SPAN", label, [], item);
    item.children.push(text);
    return item;
  }));
  return selector;
}

function comparisonCard(label: string, value: string, benchmark: string, period = "") {
  const container = element("DIV", `${label} ${value} 近7场均值 ${benchmark} ${period}`, []);
  const labelElement = element("DIV", label, [], container);
  const currentValue = element("DIV", value, [], container);
  const comparison = element("DIV", `近7场均值 ${benchmark}`, [], container);
  const comparisonLabel = element("DIV", "近7场均值", [], comparison);
  const comparisonValue = element("DIV", benchmark, [], comparison);
  comparison.children.push(comparisonLabel, comparisonValue);
  const periodElement = period ? element("SPAN", period, [], container) : null;
  container.children.push(labelElement, currentValue, comparison, ...(periodElement ? [periodElement] : []));
  return container;
}

function chartLegend(label: string, value: string) {
  const chart = element("DIV", `${label} ${value}`, []);
  const legend = element("DIV", `${label} ${value}`, [], chart);
  const labelElement = element("DIV", label, [], legend);
  const valueElement = element("DIV", value, [], legend);
  chart.getAttribute = (name: string) => name === "class" ? "linechart-module" : null;
  legend.children.push(labelElement, valueElement);
  chart.children.push(legend);
  return chart;
}

function fakeDocument(cards: FakeElement[], tableElements: FakeElement[] = []) {
  const root = element("BODY", "", cards);
  cards.forEach((item) => { item.parentElement = root; });
  return {
    visibilityState: "visible",
    querySelectorAll(selector: string) {
      if (selector === "*") return flatten(root).filter((item) => item !== root);
      if (selector === 'table,[role="table"],[role="grid"]') return tableElements;
      if (selector === "table" || selector === "canvas" || selector.includes("aria-rowcount") || selector.includes("h1")) return [];
      return [];
    },
    querySelector: () => null
  } as unknown as Document;
}

function element(tagName: string, textContent: string, children: FakeElement[], parentElement: FakeElement | null = null): FakeElement {
  const element = {
    tagName,
    textContent,
    parentElement,
    children,
    getAttribute: () => null,
    hasAttribute: () => false,
    querySelectorAll(selector: string) {
      if (selector === "*") return flatten(element).filter((item) => item !== element);
      return [];
    }
  } as FakeElement;
  children.forEach((child) => { child.parentElement = element; });
  return element;
}

function flatten(element: FakeElement): FakeElement[] {
  return [element, ...element.children.flatMap(flatten)];
}

describe("local promotion page adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("binds each ROI only to its own card value", () => {
    const input = {
      document: fakeDocument([card("整体支付ROI", "1.25"), card("全域支付ROI", "1.58"), card("消耗", "1,000"), card("成交订单数", "20")]),
      url: "https://localads.chengzijianzhan.cn/dashboard",
      title: "巨量本地推数据总览",
      visibleText: "",
      tables: []
    };
    const adapter = selectPageAdapter(input);
    const metrics = adapter.extractMetrics(input);
    expect(adapter.pageType).toBe("LOCAL_PROMOTION_DASHBOARD");
    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pay_roi", value: "1.25" }),
      expect.objectContaining({ key: "full_domain_pay_roi", value: "1.58" }),
      expect.objectContaining({ key: "spend", value: "1000" }),
      expect.objectContaining({ key: "orders", value: "20" })
    ]));
  });

  it("does not select a value when one card has multiple numeric candidates", () => {
    const parent = element("DIV", "", []);
    const roiLabel = element("SPAN", "整体支付ROI", [], parent);
    const first = element("SPAN", "1.25", [], parent);
    const second = element("SPAN", "1.58", [], parent);
    const period = element("SPAN", "今日", [], parent);
    parent.children.push(roiLabel, first, second, period);
    parent.textContent = "整体支付ROI 1.25 1.58 今日";
    const input = { document: fakeDocument([parent]), url: "https://localads.chengzijianzhan.cn/dashboard", title: "巨量本地推数据总览", visibleText: "", tables: [] };
    expect(selectPageAdapter(input).extractMetrics(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pay_roi", value: null, rawEvidence: expect.objectContaining({ validationStatus: "INVALID", validationReasons: ["FIELD_VALUE_NOT_UNIQUE"] }) })
    ]));
  });

  it("ignores duplicate metric cards hidden by page CSS", () => {
    const visibleCard = nestedLabelCard("整体支付ROI", "4");
    const hiddenCard = card("整体支付ROI", "99");
    const hiddenElements = new Set(flatten(hiddenCard));
    vi.stubGlobal("window", {
      getComputedStyle(element: FakeElement) {
        return {
          display: hiddenElements.has(element) ? "none" : "block",
          visibility: "visible",
          opacity: "1"
        };
      }
    });
    const input = {
      document: fakeDocument([visibleCard, hiddenCard]),
      url: "https://localads.chengzijianzhan.cn/dashboard",
      title: "巨量本地推数据总览",
      visibleText: "",
      tables: []
    };

    expect(selectPageAdapter(input).extractMetrics(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "pay_roi",
        value: "4",
        rawEvidence: expect.objectContaining({ displayValue: "4", validationStatus: "REQUIRES_REVIEW" })
      })
    ]));
  });

  it("does not bind an ROI label to a preceding adjacent amount", () => {
    const parent = element("DIV", "消耗 4万 整体支付ROI 4 今日", []);
    const adjacentSpend = element("SPAN", "4万", [], parent);
    const roiLabel = element("SPAN", "整体支付ROI", [], parent);
    const roiValue = element("SPAN", "4", [], parent);
    const period = element("SPAN", "今日", [], parent);
    parent.children.push(adjacentSpend, roiLabel, roiValue, period);
    const input = { document: fakeDocument([parent]), url: "https://localads.chengzijianzhan.cn/dashboard", title: "巨量本地推数据总览", visibleText: "", tables: [] };

    expect(selectPageAdapter(input).extractMetrics(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pay_roi", value: "4", rawEvidence: expect.objectContaining({ fieldLabel: "整体支付ROI" }) })
    ]));
  });

  it("marks duplicate same-name ROI cards and missing periods invalid", () => {
    const duplicated = { document: fakeDocument([card("整体支付ROI", "4"), card("整体支付ROI", "5")]), url: "https://localads.chengzijianzhan.cn/dashboard", title: "巨量本地推数据总览", visibleText: "", tables: [] };
    expect(selectPageAdapter(duplicated).extractMetrics(duplicated)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pay_roi", value: null, rawEvidence: expect.objectContaining({ validationReasons: ["FIELD_BINDING_AMBIGUOUS"] }) })
    ]));

    const missingPeriod = { document: fakeDocument([card("整体支付ROI", "4", "")]), url: "https://localads.chengzijianzhan.cn/dashboard", title: "巨量本地推数据总览", visibleText: "", tables: [] };
    expect(selectPageAdapter(missingPeriod).extractMetrics(missingPeriod)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "pay_roi", rawEvidence: expect.objectContaining({ validationStatus: "INVALID", validationReasons: ["TIME_RANGE_MISSING"] }) })
    ]));
  });

  it("keeps the visible ROI value but rejects unrelated realtime labels as a period", () => {
    const container = nestedLabelCard("整体支付ROI", "56", "");
    const realtimeAudience = element("SPAN", "实时在线人数", [], container);
    container.children.push(realtimeAudience);
    container.textContent = "整体支付ROI 56 实时在线人数";
    const input = { document: fakeDocument([container]), url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2", title: "巨量本地推数据总览", visibleText: "", tables: [] };

    expect(selectPageAdapter(input).extractMetrics(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "pay_roi",
        value: "56",
        rawEvidence: expect.objectContaining({
          displayValue: "56",
          timeRange: null,
          validationStatus: "INVALID",
          validationReasons: ["TIME_RANGE_MISSING"]
        })
      })
    ]));
  });

  it("joins split value fragments from one metric card", () => {
    const input = {
      document: fakeDocument([splitValueCard("全域支付ROI", ["58", ".52"])]),
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      title: "巨量本地推数据总览",
      visibleText: "",
      tables: [],
      routeKey: "LOCAL_PROMOTION_DASHBOARD" as const
    };

    expect(selectPageAdapter(input).extractMetrics(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "full_domain_pay_roi", value: "58.52", rawEvidence: expect.objectContaining({ displayValue: "58.52" }) })
    ]));
  });

  it("accepts observed local promotion labels without widening unrelated labels", () => {
    const input = {
      document: fakeDocument([
        splitValueCard("全域成交金额(元)", ["6", ".85万"]),
        splitValueCard("全域消耗(元)", ["1,169", ".85"]),
        card("全域成交订单数", "1,440"),
        card("全域商品点击次数", "4,768")
      ]),
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      title: "巨量本地推数据总览",
      visibleText: "",
      tables: [],
      routeKey: "LOCAL_PROMOTION_DASHBOARD" as const
    };

    expect(selectPageAdapter(input).extractMetrics(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "gmv", value: "68500" }),
      expect.objectContaining({ key: "spend", value: "1169.85" }),
      expect.objectContaining({ key: "orders", value: "1440" }),
      expect.objectContaining({ key: "clicks", value: "4768" })
    ]));
  });

  it("uses the current card value instead of a comparison benchmark", () => {
    const input = {
      document: fakeDocument([comparisonCard("小时看播次数", "5,268.05", "5,791.32")]),
      url: "https://eos.douyin.com/dp/liveScreen?mode=flow",
      title: "直播流量",
      visibleText: "",
      tables: [],
      routeKey: "LIVE_TRAFFIC_TAB" as const
    };

    expect(selectPageAdapter(input).extractMetrics(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "hourly_live_views", value: "5268.05", rawEvidence: expect.objectContaining({ displayValue: "5,268.05" }) })
    ]));
  });

  it("does not turn table headers into invalid card metrics", () => {
    const header = element("TH", "成交金额", []);
    const table = element("TABLE", "成交金额", [header]);
    const input = {
      document: fakeDocument([table], [table]),
      url: "https://eos.douyin.com/dp/liveScreen?mode=product",
      title: "直播大屏商品页",
      visibleText: "",
      tables: [[['商品名称', '成交金额'], ['商品 A', '100']]],
      routeKey: "LIVE_PRODUCT_TAB" as const
    };

    expect(selectPageAdapter(input).extractMetrics(input)).toEqual([]);
  });

  it("does not treat chart legends or tabs as card evidence", () => {
    const input = {
      document: fakeDocument([chartLegend("整体支付ROI", "58.68")]),
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      title: "巨量本地推数据总览",
      visibleText: "",
      tables: [],
      routeKey: "LOCAL_PROMOTION_DASHBOARD" as const
    };

    expect(selectPageAdapter(input).extractMetrics(input)).toEqual([]);
  });

  it("preserves an explicit missing display value instead of confusing it with numeric zero", () => {
    const input = { document: fakeDocument([card("消耗", "--"), card("成交订单数", "0")]), url: "https://localads.chengzijianzhan.cn/dashboard", title: "巨量本地推数据总览", visibleText: "", tables: [] };
    const metrics = selectPageAdapter(input).extractMetrics(input);

    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "spend", value: null, rawEvidence: expect.objectContaining({ displayValue: "--", validationStatus: "INVALID", validationReasons: ["VALUE_MISSING"] }) }),
      expect.objectContaining({ key: "orders", value: "0", rawEvidence: expect.objectContaining({ displayValue: "0" }) })
    ]));
  });

  it("uses one-shot manual route confirmation for local promotion route adapters", () => {
    expect(selectPageAdapter({ document: fakeDocument([]), url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2", title: "", visibleText: "", tables: [], routeKey: "LOCAL_PROMOTION_DASHBOARD" }).pageType).toBe("LOCAL_PROMOTION_DASHBOARD");
    expect(selectPageAdapter({ document: fakeDocument([]), url: "https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2", title: "", visibleText: "", tables: [], routeKey: "TASK_TABLE" }).pageType).toBe("TASK_TABLE");
  });

  it("keeps ARIA grid headers and row identities as table binding evidence", () => {
    const table = element("DIV", "", []);
    const tableContext = element("SECTION", "今日", [element("SPAN", "今日", []), table]);
    const document = fakeDocument([tableContext], [table]) as Document & { querySelector(selector: string): Element | null };
    document.querySelector = (selector: string) => selector.includes('[role="grid"]') ? table as unknown as Element : null;
    const input = {
      document,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2",
      title: "任务列表",
      visibleText: "",
      tables: [[['任务名称', '消耗', '整体支付ROI'], ['计划 A', '4万', '4.00']]],
      routeKey: "TASK_TABLE" as const
    };
    const adapter = selectPageAdapter(input);
    const meta = adapter.extractCoverage(input, []);

    expect(meta.renderModes).toContain("TABLE");
    expect(meta.tableBindings).toEqual([expect.objectContaining({
      headers: ['任务名称', '消耗', '整体支付ROI'],
      identityColumn: '任务名称',
      identityColumnIndex: 0,
      timeRange: "今日",
      validationStatus: 'REQUIRES_REVIEW'
    })]);
  });

  it("does not use a row date inside the captured table as the table period", () => {
    const rowDate = element("SPAN", "2026-08-03", []);
    const table = element("TABLE", "2026-08-03", [rowDate]);
    const input = {
      document: fakeDocument([table], [table]),
      url: "https://eos.douyin.com/dp/liveScreen?mode=product",
      title: "直播大屏商品页",
      visibleText: "",
      tables: [[['商品信息', '上架时间'], ['商品 A', '2026-08-03']]],
      routeKey: "LIVE_PRODUCT_TAB" as const
    };

    expect(selectPageAdapter(input).extractCoverage(input, []).tableBindings).toEqual([
      expect.objectContaining({
        timeRange: null,
        validationStatus: "INVALID",
        validationReasons: expect.arrayContaining(["TIME_RANGE_MISSING"])
      })
    ]);
  });

  it("rejects table header offsets, row width drift, and duplicate row identities", () => {
    const table = element("DIV", "", []);
    const tableContext = element("SECTION", "今日", [element("SPAN", "今日", []), table]);
    const document = fakeDocument([tableContext], [table]);
    const input = {
      document,
      url: "https://localads.chengzijianzhan.cn/lamp/pc/promotion/roi2",
      title: "任务列表",
      visibleText: "",
      tables: [[['任务名称', '', '消耗'], ['计划 A', '100'], ['计划 A', '', '200']]],
      routeKey: "TASK_TABLE" as const
    };

    expect(selectPageAdapter(input).extractCoverage(input, []).tableBindings).toEqual([
      expect.objectContaining({
        headers: ['任务名称', '', '消耗'],
        validationStatus: "INVALID",
        validationReasons: expect.arrayContaining(["TABLE_HEADER_MISSING", "TABLE_COLUMN_COUNT_MISMATCH", "TABLE_ROW_IDENTITY_DUPLICATED"])
      })
    ]);
  });
});

describe("live overview page adapter", () => {
  it("reads direct text values with one unit/decorative child and ignores chart selectors", () => {
    const input = {
      document: fakeDocument([
        directTextValueCard("当前在线人数", "208", ""),
        directTextValueCard("千次观看成交金额", "4,287.54元", "元"),
        directTextValueCard("商品转化率", "31.15%", "%"),
        directTextValueCard("成交订单数", "2,788", ""),
        metricSelector("成交金额", "成交订单数", "在线人数")
      ]),
      url: "https://eos.douyin.com/dp/liveScreen?tab=trend&mode=main",
      title: "直播数据大屏",
      visibleText: "",
      tables: [],
      routeKey: "LIVE_DATA_SCREEN" as const
    };
    const adapter = selectPageAdapter(input);
    const metrics = adapter.extractMetrics(input);

    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "current_online_viewers", value: "208" }),
      expect.objectContaining({ key: "gpm", value: "4287.54" }),
      expect.objectContaining({ key: "product_conversion_rate", value: "0.3115" }),
      expect.objectContaining({ key: "orders", value: "2788" })
    ]));
    expect(metrics.some((metric) => metric.key === "gmv")).toBe(false);
    expect(adapter.extractCoverage(input, metrics)).toMatchObject({
      extractedFields: expect.arrayContaining(["current_online_viewers", "gpm", "product_conversion_rate", "orders"]),
      coverageRatio: 0.57
    });
  });

  it("keeps the page display value and precision as auditable evidence", () => {
    const input = {
      document: fakeDocument([card("千次观看成交金额", "7,530.73元"), card("成交订单数", "13,527")]),
      url: "https://eos.douyin.com/dp/liveScreen?tab=trend&mode=main",
      title: "直播数据大屏",
      visibleText: "",
      tables: [],
      routeKey: "LIVE_DATA_SCREEN" as const
    };
    const adapter = selectPageAdapter(input);
    const metrics = adapter.extractMetrics(input);
    expect(adapter.version).toBe("2.2.0");
    expect(metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "gpm", value: "7530.73", unit: "yuan", rawEvidence: expect.objectContaining({ displayValue: "7,530.73元", normalizedValue: "7530.73", displayPrecision: 2 }) }),
      expect.objectContaining({ key: "orders", value: "13527" })
    ]));
  });

  it("keeps a calibrated card structure stable when only the period value changes", () => {
    const today = {
      document: fakeDocument([card("整体支付ROI", "4", "今日")]),
      url: "https://localads.chengzijianzhan.cn/lamp/pc/liveboard2",
      title: "巨量本地推数据总览",
      visibleText: "",
      tables: [],
      routeKey: "LOCAL_PROMOTION_DASHBOARD" as const
    };
    const yesterday = { ...today, document: fakeDocument([card("整体支付ROI", "4", "昨日")]) };
    const adapter = selectPageAdapter(today);
    const todayMetrics = adapter.extractMetrics(today);
    const yesterdayMetrics = adapter.extractMetrics(yesterday);

    expect(todayMetrics[0]?.rawEvidence?.timeRange).toBe("今日");
    expect(yesterdayMetrics[0]?.rawEvidence?.timeRange).toBe("昨日");
    expect(todayMetrics[0]?.rawEvidence?.calibrationSignature).toBe(yesterdayMetrics[0]?.rawEvidence?.calibrationSignature);
    expect(adapter.extractCoverage(today, todayMetrics).pageFingerprint).toBe(
      adapter.extractCoverage(yesterday, yesterdayMetrics).pageFingerprint
    );
  });
});
