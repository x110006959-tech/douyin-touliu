export function liveScreenCapturePlan(input: {
  mode: "SNAPSHOT" | "PULSE";
  internalApiEnabled: boolean;
  internalApiEligible: boolean;
}) {
  const collectInternalApi = input.internalApiEnabled && input.internalApiEligible;
  return {
    collectInternalApi,
    // A pulse named and surfaced as API must never silently become a DOM pulse.
    // Formal snapshots retain DOM evidence for fallback and API/DOM calibration.
    collectDom: input.mode === "SNAPSHOT"
  };
}
