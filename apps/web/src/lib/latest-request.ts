export type LatestRequestGuard = {
  begin(): number;
  isCurrent(version: number): boolean;
  invalidate(): void;
};

export function createLatestRequestGuard(): LatestRequestGuard {
  let currentVersion = 0;
  return {
    begin() {
      currentVersion += 1;
      return currentVersion;
    },
    isCurrent(version) {
      return version === currentVersion;
    },
    invalidate() {
      currentVersion += 1;
    }
  };
}
