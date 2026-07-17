import { describe, expect, it } from "vitest";
import { applyCaptureBudget, captureBudget, createCaptureBudgetState } from "./capture-budget";

describe("capture budget", () => {
  it("marks evidence partial when a global collection limit is reached", () => {
    const state = createCaptureBudgetState();
    state.reasons.add("TABLE_CELL_LIMIT");
    state.tableTextBytes = captureBudget.maxTableTextBytes;

    const meta = applyCaptureBudget({
      adapterId: "fixture",
      adapterVersion: "1",
      pageFingerprint: "fixture",
      completeness: "COMPLETE",
      coverageRatio: 1,
      expectedFields: [],
      extractedFields: [],
      visibleRegions: [],
      renderModes: ["DOM"],
      tabState: "VISIBLE",
      originalBytes: 0,
      acceptedBytes: 0,
      truncatedFields: [],
      truncationReasons: []
    }, state);

    expect(meta.completeness).toBe("PARTIAL");
    expect(meta.truncatedFields).toContain("rawTableData");
    expect(meta.truncationReasons).toContain("TABLE_CELL_LIMIT");
  });
});
