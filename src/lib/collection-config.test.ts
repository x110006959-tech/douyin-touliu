import { describe, expect, it } from "vitest";
import {
  hasRunnableSubjectConfig,
  isCollectionJobDue,
  nextRunAt,
  parseCollectionJobCursor,
  parseSelectorText,
  scheduleToMs,
  selectorToCliValue,
  stringifyCollectionJobCursor
} from "./collection-config";

describe("collection job config", () => {
  it("parses field selectors for the Scrapling collector", () => {
    const selectors = parseSelectorText("title=title::text\n!body=body::text\n# comment");

    expect(selectors).toEqual([
      { fieldName: "title", css: "title::text", required: false },
      { fieldName: "body", css: "body::text", required: true }
    ]);
    expect(selectorToCliValue(selectors[1])).toBe("!body=body::text");
  });

  it("parses short polling schedules", () => {
    expect(scheduleToMs("15s")).toBe(15_000);
    expect(scheduleToMs("1m")).toBe(60_000);
    expect(scheduleToMs("2h")).toBe(7_200_000);
    expect(scheduleToMs("bad")).toBeNull();
  });

  it("marks scheduled jobs due from cursor state", () => {
    const cursor = stringifyCollectionJobCursor({
      selectors: [],
      nextRunAt: "2026-07-04T00:00:00.000Z"
    });
    const job = {
      id: "job-1",
      accountId: null,
      type: "scrapling_public",
      targetName: "活动页",
      targetUrl: "https://example.com",
      schedule: "30s",
      status: "idle",
      lastRunAt: null,
      lastError: null,
      cursor,
      createdAt: new Date("2026-07-04T00:00:00.000Z"),
      updatedAt: new Date("2026-07-04T00:00:00.000Z")
    };

    expect(parseCollectionJobCursor(cursor).nextRunAt).toBe("2026-07-04T00:00:00.000Z");
    expect(isCollectionJobDue(job, new Date("2026-07-04T00:00:31.000Z"))).toBe(true);
    expect(nextRunAt("30s", new Date("2026-07-04T00:00:31.000Z"))).toBe("2026-07-04T00:01:01.000Z");
  });

  it("parses subject config and only allows concrete subject types to run", () => {
    const runnable = parseCollectionJobCursor(
      stringifyCollectionJobCursor({
        selectors: [],
        subjectConfig: {
          subjectType: "服务商代播/代运营",
          accountIdentity: "商家官方号",
          operatorType: "服务商代播",
          subjectConfidence: 0.95
        }
      })
    );
    const pending = parseCollectionJobCursor(
      stringifyCollectionJobCursor({
        selectors: [],
        subjectConfig: {
          subjectType: "主体待校准"
        }
      })
    );

    expect(runnable.subjectConfig).toMatchObject({
      subjectType: "服务商代播/代运营",
      subjectSource: "collection_job"
    });
    expect(hasRunnableSubjectConfig(runnable)).toBe(true);
    expect(hasRunnableSubjectConfig(pending)).toBe(false);
  });
});
