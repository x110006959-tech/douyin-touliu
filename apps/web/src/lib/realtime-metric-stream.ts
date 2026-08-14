import type { RealtimeMetricFrame } from "@douyin-local-life/shared";

export type RealtimeMetricStreamStatus = "CONNECTING" | "CONNECTED" | "RECONNECTING";

type StreamOptions = {
  url: string;
  authorizationToken: string | null;
  onFrame: (frame: RealtimeMetricFrame) => void;
  onStatus: (status: RealtimeMetricStreamStatus) => void;
};

type SseEvent = { event: string; data: string };

export function subscribeRealtimeMetricStream(options: StreamOptions) {
  let stopped = false;
  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connectedOnce = false;

  const connect = async () => {
    if (stopped) return;
    options.onStatus(connectedOnce ? "RECONNECTING" : "CONNECTING");
    controller = new AbortController();
    try {
      const response = await fetch(options.url, {
        credentials: "include",
        signal: controller.signal,
        headers: {
          accept: "text/event-stream",
          ...(options.authorizationToken ? { authorization: `Bearer ${options.authorizationToken}` } : {})
        }
      });
      if (!response.ok) throw new Error(`实时数据连接失败（HTTP ${response.status}）`);
      if (!response.body) throw new Error("实时数据连接缺少响应流");
      connectedOnce = true;
      options.onStatus("CONNECTED");
      const parser = createSseEventParser((event) => {
        if (event.event !== "pulse") return;
        const parsed: unknown = JSON.parse(event.data);
        if (isRealtimeMetricFrame(parsed)) options.onFrame(parsed);
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (!stopped) {
        const chunk = await reader.read();
        if (chunk.done) break;
        parser.push(decoder.decode(chunk.value, { stream: true }));
      }
      parser.push(decoder.decode());
    } catch (error) {
      if (!stopped && !(error instanceof DOMException && error.name === "AbortError")) options.onStatus("RECONNECTING");
    } finally {
      controller = null;
      if (!stopped) reconnectTimer = setTimeout(() => void connect(), 1_500);
    }
  };

  void connect();
  return () => {
    stopped = true;
    controller?.abort();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };
}

export function createSseEventParser(onEvent: (event: SseEvent) => void) {
  let buffer = "";
  return {
    push(chunk: string) {
      buffer = `${buffer}${chunk}`.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseEvent(block);
        if (event) onEvent(event);
        boundary = buffer.indexOf("\n\n");
      }
    }
  };
}

function parseSseEvent(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    if (line.startsWith("data:")) data.push(line.slice("data:".length).trimStart());
  }
  return data.length ? { event, data: data.join("\n") } : null;
}

function isRealtimeMetricFrame(value: unknown): value is RealtimeMetricFrame {
  if (!isRecord(value)) return false;
  return typeof value.collectionTaskId === "string"
    && typeof value.routeKey === "string"
    && typeof value.pageType === "string"
    && typeof value.observedAt === "string"
    && typeof value.receivedAt === "string"
    && Array.isArray(value.successfulEndpoints)
    && value.successfulEndpoints.every((endpoint) => typeof endpoint === "string")
    && Array.isArray(value.metrics)
    && value.metrics.every((metric) => isRecord(metric) && typeof metric.key === "string" && typeof metric.name === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
