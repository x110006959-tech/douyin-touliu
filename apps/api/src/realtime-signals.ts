import {
  metricValueSemantic,
  metricValueToRuleNumber,
  type MetricKey,
  type MetricPulse,
  type RealtimeMetricFrame,
  type RealtimeSignal,
  type VisibleMetric
} from "@douyin-local-life/shared";

type StoredPulse = MetricPulse & { receivedAt: number };
type SignalListener = (signals: RealtimeSignal[]) => void;
type MetricFrameListener = (frame: RealtimeMetricFrame) => void;

const pulseRetentionMs = 15 * 60 * 1000;
const maxPulsesPerTask = 180;
const maxTasks = 1_000;
const pulseStore = new Map<string, StoredPulse[]>();
const signalStore = new Map<string, RealtimeSignal[]>();
const listeners = new Map<string, Set<SignalListener>>();
const metricFrameListeners = new Map<string, Set<MetricFrameListener>>();

export function recordMetricPulse(collectionTaskId: string, pulse: MetricPulse, now = Date.now()) {
  if (!pulseStore.has(collectionTaskId) && pulseStore.size >= maxTasks) {
    const oldestTaskId = pulseStore.keys().next().value as string | undefined;
    if (oldestTaskId) {
      pulseStore.delete(oldestTaskId);
      signalStore.delete(oldestTaskId);
    }
  }
  const pulses = pulseStore.get(collectionTaskId) || [];
  pulses.push({ ...pulse, receivedAt: now });
  const retained = pulses.filter((item) => now - item.receivedAt <= pulseRetentionMs).slice(-maxPulsesPerTask);
  pulseStore.delete(collectionTaskId);
  pulseStore.set(collectionTaskId, retained);
  const signals = deriveSignals(collectionTaskId, retained, now);
  signalStore.set(collectionTaskId, signals);
  for (const listener of listeners.get(collectionTaskId) || []) listener(signals);
  const frame = toRealtimeMetricFrame(collectionTaskId, retained.at(-1)!);
  for (const listener of metricFrameListeners.get(collectionTaskId) || []) listener(frame);
  return { signals, pulseCount: retained.length, frame };
}

export function latestRealtimeSignals(collectionTaskId: string) {
  return signalStore.get(collectionTaskId) || [];
}

export function subscribeRealtimeSignals(collectionTaskId: string, listener: SignalListener) {
  const taskListeners = listeners.get(collectionTaskId) || new Set<SignalListener>();
  taskListeners.add(listener);
  listeners.set(collectionTaskId, taskListeners);
  return () => {
    taskListeners.delete(listener);
    if (taskListeners.size === 0) listeners.delete(collectionTaskId);
  };
}

export function latestRealtimeMetricFrame(collectionTaskId: string, now = Date.now()) {
  const latest = pulseStore.get(collectionTaskId)?.at(-1);
  return latest && now - latest.receivedAt <= pulseRetentionMs ? toRealtimeMetricFrame(collectionTaskId, latest) : null;
}

export function subscribeRealtimeMetricFrames(collectionTaskId: string, listener: MetricFrameListener) {
  const taskListeners = metricFrameListeners.get(collectionTaskId) || new Set<MetricFrameListener>();
  taskListeners.add(listener);
  metricFrameListeners.set(collectionTaskId, taskListeners);
  return () => {
    taskListeners.delete(listener);
    if (taskListeners.size === 0) metricFrameListeners.delete(collectionTaskId);
  };
}

export function clearRealtimeSignalStore() {
  pulseStore.clear();
  signalStore.clear();
  listeners.clear();
  metricFrameListeners.clear();
}

function toRealtimeMetricFrame(collectionTaskId: string, pulse: StoredPulse): RealtimeMetricFrame {
  return {
    collectionTaskId,
    routeKey: pulse.routeKey,
    pageType: pulse.pageType,
    observedAt: pulse.localCapturedAt,
    receivedAt: new Date(pulse.receivedAt).toISOString(),
    metrics: pulse.metrics,
    successfulEndpoints: pulse.captureMeta.liveScreenInternalApi?.endpointStatuses
      .filter((status) => status.status === "SUCCESS")
      .map((status) => status.endpoint) || []
  };
}

function deriveSignals(collectionTaskId: string, pulses: StoredPulse[], now: number): RealtimeSignal[] {
  const latest = pulses.at(-1);
  if (!latest) return [];
  const baseline = [...pulses].reverse().find((pulse) => latest.receivedAt - pulse.receivedAt >= 30_000) || pulses[0];
  const signals: RealtimeSignal[] = [];
  const dataAgeMs = Math.max(0, now - new Date(latest.localCapturedAt).getTime());
  const observedAt = latest.localCapturedAt;
  if (dataAgeMs > 15_000) {
    signals.push(signal(collectionTaskId, "DATA_STALE", "WARNING", `实时数据已延迟 ${Math.round(dataAgeMs / 1000)} 秒`, observedAt, dataAgeMs, { dataAgeMs }));
  }
  if (!baseline || baseline === latest) return signals;

  const currentRoi = firstNumber(latest.metrics, ["gross_profit_roi", "verify_roi", "pay_roi"]);
  const baselineRoi = firstNumber(baseline.metrics, ["gross_profit_roi", "verify_roi", "pay_roi"]);
  if (currentRoi != null && baselineRoi != null && baselineRoi > 0) {
    const change = (currentRoi - baselineRoi) / baselineRoi;
    if (Math.abs(change) >= 0.1) {
      const percent = Math.round(Math.abs(change) * 100);
      signals.push(signal(
        collectionTaskId,
        "ROI_CHANGE",
        Math.abs(change) >= 0.25 ? "CRITICAL" : "WARNING",
        `近${formatWindow(latest.receivedAt - baseline.receivedAt)} ROI ${change < 0 ? "下降" : "上升"} ${percent}%`,
        observedAt,
        dataAgeMs,
        { currentRoi, baselineRoi, change }
      ));
    }
  }

  const currentSpend = metricNumber(latest.metrics, "spend");
  const baselineSpend = metricNumber(baseline.metrics, "spend");
  const currentOrders = metricNumber(latest.metrics, "orders");
  const baselineOrders = metricNumber(baseline.metrics, "orders");
  if (currentSpend != null && baselineSpend != null && currentOrders != null && baselineOrders != null) {
    const spendDelta = currentSpend - baselineSpend;
    const orderDelta = currentOrders - baselineOrders;
    if (spendDelta >= Math.max(50, baselineSpend * 0.1) && orderDelta <= 0) {
      signals.push(signal(collectionTaskId, "ORDER_STALL", "CRITICAL", `消耗增加 ${round(spendDelta)} 元但订单未增长`, observedAt, dataAgeMs, { spendDelta, orderDelta }));
    } else if (spendDelta > 0) {
      signals.push(signal(collectionTaskId, "SPEND_ACCELERATION", "INFO", `近${formatWindow(latest.receivedAt - baseline.receivedAt)}消耗增加 ${round(spendDelta)} 元`, observedAt, dataAgeMs, { spendDelta, orderDelta }));
    }
  }

  addLiveRoomSignals(signals, collectionTaskId, baseline, latest, observedAt, dataAgeMs);
  return signals.slice(0, 10);
}

function addLiveRoomSignals(
  signals: RealtimeSignal[],
  collectionTaskId: string,
  baseline: StoredPulse,
  latest: StoredPulse,
  observedAt: string,
  dataAgeMs: number
) {
  const windowMs = latest.receivedAt - baseline.receivedAt;
  const windowLabel = formatWindow(windowMs);
  const currentOnline = metricNumber(latest.metrics, "current_online_viewers");
  const baselineOnline = metricNumber(baseline.metrics, "current_online_viewers");
  const currentHourlyViews = metricNumber(latest.metrics, "hourly_live_views");
  const baselineHourlyViews = metricNumber(baseline.metrics, "hourly_live_views");
  const onlineChange = meaningfulRelativeChange(currentOnline, baselineOnline, 5, 0.1);
  const hourlyViewChange = meaningfulRelativeChange(currentHourlyViews, baselineHourlyViews, 20, 0.1);
  const trafficChange = onlineChange || hourlyViewChange;
  if (trafficChange) {
    const direction = trafficChange.change < 0 ? "下降" : "上升";
    const source = onlineChange ? "当前在线人数" : "小时看播速度";
    signals.push(signal(
      collectionTaskId,
      "TRAFFIC_CHANGE",
      trafficChange.change < 0 ? (trafficChange.change <= -0.25 ? "CRITICAL" : "WARNING") : "INFO",
      `近${windowLabel}${source}${direction} ${formatPercentChange(trafficChange.change)}`,
      observedAt,
      dataAgeMs,
      { current: trafficChange.current, baseline: trafficChange.baseline, change: trafficChange.change, source },
      trafficChange.change < 0
        ? "人工检查直播节奏、画面或讲解是否中断，并核对自然与商业流量入口变化；先观察下一个窗口再决定是否调整。"
        : "当前进房表现改善，保持直播和投流变量稳定，继续观察下一个窗口。"
    ));
  }

  const clickRate = meaningfulRelativeChange(
    metricNumber(latest.metrics, "live_room_click_rate"),
    metricNumber(baseline.metrics, "live_room_click_rate"),
    0.005,
    0.1
  );
  if (clickRate) {
    signals.push(signal(
      collectionTaskId,
      "CLICK_RATE_CHANGE",
      clickRate.change < 0 ? (clickRate.change <= -0.25 ? "CRITICAL" : "WARNING") : "INFO",
      `近${windowLabel}直播间点击率${clickRate.change < 0 ? "下降" : "上升"} ${formatPercentChange(clickRate.change)}（${formatRate(clickRate.baseline)} → ${formatRate(clickRate.current)}）`,
      observedAt,
      dataAgeMs,
      { currentRate: clickRate.current, baselineRate: clickRate.baseline, change: clickRate.change },
      clickRate.change < 0
        ? "人工检查当前讲解商品、福利露出和商品卡承接；不要仅凭单个 30 秒窗口调整投流。"
        : "当前点击承接改善，保持变量稳定并继续观察成交金额与 GPM 是否同步。"
    ));
  }

  const gpm = meaningfulRelativeChange(
    metricNumber(latest.metrics, "gpm"),
    metricNumber(baseline.metrics, "gpm"),
    100,
    0.1
  );
  if (gpm) {
    signals.push(signal(
      collectionTaskId,
      "GPM_CHANGE",
      gpm.change < 0 ? (gpm.change <= -0.25 ? "CRITICAL" : "WARNING") : "INFO",
      `近${windowLabel} GPM ${gpm.change < 0 ? "下降" : "上升"} ${formatPercentChange(gpm.change)}（${formatMoney(gpm.baseline)} → ${formatMoney(gpm.current)}）`,
      observedAt,
      dataAgeMs,
      { currentGpm: gpm.current, baselineGpm: gpm.baseline, change: gpm.change },
      gpm.change < 0
        ? "人工核对高成交商品占比、价格权益和讲解节奏，结合正式快照再决定是否调整。"
        : "单位流量变现改善，继续核对成交是否稳定，不要因短时高值立即加量。"
    ));
  }

  const currentGmv = metricNumber(latest.metrics, "gmv");
  const baselineGmv = metricNumber(baseline.metrics, "gmv");
  const currentViewers = metricNumber(latest.metrics, "live_viewers");
  const baselineViewers = metricNumber(baseline.metrics, "live_viewers");
  if (currentGmv != null && baselineGmv != null) {
    const gmvDelta = currentGmv - baselineGmv;
    const viewerDelta = currentViewers != null && baselineViewers != null ? currentViewers - baselineViewers : null;
    if (gmvDelta > 0) {
      const perMinute = windowMs > 0 ? gmvDelta * 60_000 / windowMs : 0;
      signals.push(signal(
        collectionTaskId,
        "GMV_MOMENTUM",
        "INFO",
        `近${windowLabel}成交金额增加 ${formatMoney(gmvDelta)}，折算约 ${formatMoney(perMinute)}/分钟`,
        observedAt,
        dataAgeMs,
        { gmvDelta: round(gmvDelta), gmvPerMinute: round(perMinute), viewerDelta },
        "保持当前节奏，继续观察点击率、GPM 与成交增量是否在后续窗口一致。"
      ));
    } else if (viewerDelta != null && viewerDelta >= 20) {
      signals.push(signal(
        collectionTaskId,
        "GMV_MOMENTUM",
        "WARNING",
        `近${windowLabel}新增看播 ${round(viewerDelta)} 人，但成交金额未增长`,
        observedAt,
        dataAgeMs,
        { gmvDelta: round(gmvDelta), viewerDelta },
        "人工检查商品讲解、价格权益、商品卡和下单路径；保持投流变量稳定，先完成一轮真实讲解再复核。"
      ));
    }
  }
}

function signal(
  collectionTaskId: string,
  kind: RealtimeSignal["kind"],
  severity: RealtimeSignal["severity"],
  message: string,
  observedAt: string,
  dataAgeMs: number,
  evidence: RealtimeSignal["evidence"],
  suggestion?: string
): RealtimeSignal {
  return {
    id: `${collectionTaskId}:${kind}:${observedAt}`,
    collectionTaskId,
    kind,
    severity,
    message,
    observedAt,
    dataAgeMs,
    evidence,
    ...(suggestion ? { suggestion } : {})
  };
}

function meaningfulRelativeChange(current: number | null, baseline: number | null, minimumDelta: number, minimumRatio: number) {
  if (current == null || baseline == null || baseline <= 0) return null;
  const delta = current - baseline;
  const change = delta / baseline;
  return Math.abs(delta) >= minimumDelta && Math.abs(change) >= minimumRatio
    ? { current, baseline, change }
    : null;
}

function firstNumber(metrics: VisibleMetric[], keys: MetricKey[]) {
  for (const key of keys) {
    const value = metricNumber(metrics, key);
    if (value != null) return value;
  }
  return null;
}

function metricNumber(metrics: VisibleMetric[], key: MetricKey) {
  const metric = metrics.find((item) => item.key === key);
  return metric ? metricValueToRuleNumber(metric, metricValueSemantic(key)) : null;
}

function formatWindow(ms: number) {
  return ms >= 60_000 ? `${Math.max(1, Math.round(ms / 60_000))}分钟` : `${Math.max(1, Math.round(ms / 1000))}秒`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPercentChange(value: number) {
  return `${Math.round(Math.abs(value) * 100)}%`;
}

function formatRate(value: number) {
  return `${round(value * 100)}%`;
}

function formatMoney(value: number) {
  return `¥${round(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
