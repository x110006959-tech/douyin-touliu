type SseWritable = {
  destroyed: boolean;
  writableEnded: boolean;
  writableLength: number;
  once(event: "drain", listener: () => void): unknown;
  off(event: "drain", listener: () => void): unknown;
  write(chunk: string): boolean;
};

export const maxSseBufferedBytes = 256 * 1024;

export function createLatestSseWriter<T>(response: SseWritable, format: (value: T) => string, maxBufferedBytes = maxSseBufferedBytes) {
  let waitingForDrain = false;
  let closed = false;
  let pendingValue: T | null = null;

  const flushPending = () => {
    waitingForDrain = false;
    if (closed || pendingValue === null || isBackpressured()) return;
    const value = pendingValue;
    pendingValue = null;
    write(value);
  };

  const waitForDrain = () => {
    if (waitingForDrain || closed) return;
    waitingForDrain = true;
    response.once("drain", flushPending);
  };

  const isBackpressured = () => response.writableLength > maxBufferedBytes;

  const write = (value: T) => {
    if (closed || response.destroyed || response.writableEnded) return;
    if (isBackpressured()) {
      pendingValue = value;
      waitForDrain();
      return;
    }
    if (!response.write(format(value))) waitForDrain();
  };

  return {
    push(value: T) {
      if (closed || response.destroyed || response.writableEnded) return;
      if (waitingForDrain || isBackpressured()) {
        pendingValue = value;
        waitForDrain();
        return;
      }
      write(value);
    },
    canWriteHeartbeat() {
      return !closed && !waitingForDrain && pendingValue === null && !isBackpressured();
    },
    close() {
      if (closed) return;
      closed = true;
      pendingValue = null;
      if (waitingForDrain) response.off("drain", flushPending);
      waitingForDrain = false;
    }
  };
}

export function createKeyedLatestSseWriter<T>(
  response: SseWritable,
  format: (value: T) => string,
  keyOf: (value: T) => string,
  maxBufferedBytes = maxSseBufferedBytes
) {
  let waitingForDrain = false;
  let closed = false;
  const pendingValues = new Map<string, T>();

  const isBackpressured = () => response.writableLength > maxBufferedBytes;

  const flushPending = () => {
    waitingForDrain = false;
    if (closed) return;
    if (isBackpressured()) {
      waitForDrain();
      return;
    }
    for (const [key, value] of pendingValues) {
      pendingValues.delete(key);
      if (!response.write(format(value)) || isBackpressured()) {
        waitForDrain();
        return;
      }
    }
  };

  const waitForDrain = () => {
    if (waitingForDrain || closed) return;
    waitingForDrain = true;
    response.once("drain", flushPending);
  };

  return {
    push(value: T) {
      if (closed || response.destroyed || response.writableEnded) return;
      if (waitingForDrain || isBackpressured()) {
        pendingValues.set(keyOf(value), value);
        waitForDrain();
        return;
      }
      if (!response.write(format(value))) waitForDrain();
    },
    canWriteHeartbeat() {
      return !closed && !waitingForDrain && pendingValues.size === 0 && !isBackpressured();
    },
    close() {
      if (closed) return;
      closed = true;
      pendingValues.clear();
      if (waitingForDrain) response.off("drain", flushPending);
      waitingForDrain = false;
    }
  };
}
