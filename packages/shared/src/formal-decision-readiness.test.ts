import { describe, expect, it } from "vitest";
import { evaluateFormalDecisionReadiness } from "./formal-decision-readiness";

const readyInput = {
  missingRequiredRouteLabels: [],
  unverifiedRequiredRouteLabels: [],
  staleRequiredRouteLabels: [],
  subjectReady: true,
  reviewTotalCount: 3,
  reviewPendingCount: 0
};

describe("formal decision readiness", () => {
  it.each([
    ["missing route", { missingRequiredRouteLabels: ["直播数据大屏概览"] }, "基础采集路线未完成"],
    ["unverified route", { unverifiedRequiredRouteLabels: ["巨量本地推数据总览"] }, "尚未确认属于当前账号"],
    ["stale route", { staleRequiredRouteLabels: ["巨量本地推数据总览"] }, "数据已过期"],
    ["pending subject", { subjectReady: false }, "主体或操盘主体尚未校准"],
    ["no review metrics", { reviewTotalCount: 0 }, "尚未开始人工复核"],
    ["pending review metrics", { reviewPendingCount: 2 }, "还有 2 项指标待复核"]
  ])("blocks %s", (_name, patch, expected) => {
    const result = evaluateFormalDecisionReadiness({ ...readyInput, ...patch });
    expect(result.ready).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.includes(expected))).toBe(true);
  });

  it("does not treat partial, ROI, or GPM advisories as hard blockers", () => {
    expect(evaluateFormalDecisionReadiness(readyInput)).toEqual({ ready: true, blockingReasons: [] });
  });
});
