import type { MetricKey, MetricPulse, RealtimeSignal, VisibleMetric } from "@douyin-local-life/shared";

type StoredPulse = MetricPulse & { receivedAt: number };
type SignalListener = (signals: RealtimeSignal[]) => void;

const pulseRetentionMs = 15 * 60 * 1000;
const maxPulsesPerTask = 180;
const maxTasks = 1_000;
const pulseStore = new Map<string, StoredPulse[]>();
const signalStore = new Map<string, RealtimeSignal[]>();
const listeners = new Map<string, Set<SignalListener>>();

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
  return { signals, pulseCount: retained.length };
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

export function clearRealtimeSignalStore() {
  pulseStore.clear();
  signalStore.clear();
  listeners.clear();
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
  return signals.slice(0, 10);
}

function signal(collectionTaskId: string, kind: RealtimeSignal["kind"], severity: RealtimeSignal["severity"], message: string, observedAt: string, dataAgeMs: number, evidence: RealtimeSignal["evidence"]): RealtimeSignal {
  return { id: `${collectionTaskId}:${kind}:${observedAt}`, collectionTaskId, kind, severity, message, observedAt, dataAgeMs, evidence };
}

function firstNumber(metrics: VisibleMetric[], keys: MetricKey[]) {
  for (const key of keys) {
    const value = metricNumber(metrics, key);
    if (value != null) return value;
  }
  return null;
}

function metricNumber(metrics: VisibleMetric[], key: MetricKey) {
  const raw = metrics.find((metric) => metric.key === key)?.value;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatWindow(ms: number) {
  return ms >= 60_000 ? `${Math.max(1, Math.round(ms / 60_000))}分钟` : `${Math.max(1, Math.round(ms / 1000))}秒`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
