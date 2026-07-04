export function collectorPath(...segments: string[]) {
  return ["collector", ...segments].filter(Boolean).join("/");
}
