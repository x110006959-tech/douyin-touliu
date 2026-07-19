export function createKeyedSingleFlight() {
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    run<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);
      if (existing) return existing as Promise<T>;

      const current = operation().finally(() => {
        if (inFlight.get(key) === current) inFlight.delete(key);
      });
      inFlight.set(key, current);
      return current;
    },
    size() {
      return inFlight.size;
    }
  };
}
