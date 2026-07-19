import { describe, expect, it } from "vitest";
import type { DecisionTableInput } from "@douyin-local-life/shared";
import { analyzeInvestmentUnitTables, structureTaskCollectionTables } from "./table-analysis";

const capturedAt = "2026-07-19T10:00:00.000Z";

describe("structured task collection data", () => {
  it("normalizes visible task tables without inventing missing values", () => {
    const tables: DecisionTableInput[] = [{
      routeKey: "TASK_TABLE",
      pageType: "TASK_TABLE",
      rows: [
        ["任务ID", "任务名称", "状态", "日预算", "消耗", "支付ROI", "目标ROI", "订单", "曝光", "点击", "点击率"],
        ["task-1", "门店直播投流", "投放中", "1000", "300", "2.5", "2", "5", "2000", "100", "5%"],
        ["task-2", "异常值任务", "投放中", "bad", "-1", "invalid", "-", "-", "-", "-", "101%"],
        ["", "", "投放中", "100", "bad", "-", "-", "-", "-", "-", "-"]
      ]
    }];

    const structured = structureTaskCollectionTables(tables, {
      routeKey: "TASK_TABLE",
      capturedAt,
      adapterId: "task-table",
      adapterVersion: "1.0.0"
    });

    expect(structured).toMatchObject({
      kind: "TASK_ROWS",
      acceptedRowCount: 2,
      rejectedRowCount: 1,
      schemaVersion: "collection-records-v1"
    });
    if (!structured || structured.kind !== "TASK_ROWS") throw new Error("Expected task rows");
    expect(structured.rows[0]).toMatchObject({
      taskId: "task-1",
      taskName: "门店直播投流",
      budget: 1000,
      spend: 300,
      roi: 2.5,
      targetRoi: 2,
      ctr: 0.05,
      provenance: { tableIndex: 0, rowIndex: 0 }
    });
    expect(structured.rows[1]).toMatchObject({
      taskId: "task-2",
      budget: null,
      spend: null,
      roi: null,
      ctr: null
    });
    expect(structured.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("预算"),
      expect.stringContaining("消耗"),
      expect.stringContaining("ROI"),
      expect.stringContaining("CTR")
    ]));
  });

  it("prefers canonical task rows over conflicting legacy table input", () => {
    const structured = structureTaskCollectionTables([{
      routeKey: "TASK_TABLE",
      pageType: "TASK_TABLE",
      rows: [
        ["任务名称", "消耗", "ROI", "订单", "曝光"],
        ["标准结构任务", 300, 3, 5, 2000]
      ]
    }], { routeKey: "TASK_TABLE", capturedAt })!;
    const analysis = analyzeInvestmentUnitTables([{
      routeKey: "TASK_TABLE",
      pageType: "TASK_TABLE",
      rows: [
        ["任务名称", "消耗", "ROI", "订单", "曝光"],
        ["旧表任务", 300, 0.5, 5, 2000]
      ]
    }], 2, [structured]);

    expect(analysis.status).toBe("READY");
    if (analysis.status !== "READY") throw new Error("Expected ready analysis");
    expect(analysis.candidates[0]?.name).toBe("标准结构任务");
    expect(analysis.evidence.join("\n")).not.toContain("旧表任务");
  });
});
