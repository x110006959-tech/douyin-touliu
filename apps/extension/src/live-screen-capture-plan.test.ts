import { describe, expect, it } from "vitest";
import { liveScreenCapturePlan } from "./live-screen-capture-plan";

describe("live screen capture plan", () => {
  it("does not silently downgrade an API pulse to DOM when the switch is closed", () => {
    expect(liveScreenCapturePlan({ mode: "PULSE", internalApiEnabled: false, internalApiEligible: true })).toEqual({
      collectInternalApi: false,
      collectDom: false
    });
  });

  it("does not run a DOM pulse when the current live page is not API eligible", () => {
    expect(liveScreenCapturePlan({ mode: "PULSE", internalApiEnabled: true, internalApiEligible: false })).toEqual({
      collectInternalApi: false,
      collectDom: false
    });
  });

  it("merges DOM and API evidence for a formal snapshot", () => {
    expect(liveScreenCapturePlan({ mode: "SNAPSHOT", internalApiEnabled: true, internalApiEligible: true })).toEqual({
      collectInternalApi: true,
      collectDom: true
    });
  });

  it("keeps a formal snapshot on DOM when the API switch is closed", () => {
    expect(liveScreenCapturePlan({ mode: "SNAPSHOT", internalApiEnabled: false, internalApiEligible: true })).toEqual({
      collectInternalApi: false,
      collectDom: true
    });
  });

  it("uses only API pulse fields when the page is eligible and the switch is open", () => {
    expect(liveScreenCapturePlan({ mode: "PULSE", internalApiEnabled: true, internalApiEligible: true })).toEqual({
      collectInternalApi: true,
      collectDom: false
    });
  });
});
