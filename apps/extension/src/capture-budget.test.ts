import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCaptureBudget, captureBudget, collectBudgetedTables, createCaptureBudgetState } from "./capture-budget";

afterEach(() => vi.unstubAllGlobals());

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

  it("collects only the currently rendered rows from an ARIA grid", () => {
    vi.stubGlobal("window", {
      getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" })
    });
    const grid = fakeElement("DIV");
    const headerRow = fakeElement("DIV", grid);
    const dataRow = fakeElement("DIV", grid);
    const headerCells = [fakeElement("DIV", headerRow, "任务名称"), fakeElement("DIV", headerRow, "消耗")];
    const dataCells = [fakeElement("DIV", dataRow, "计划 A"), fakeElement("DIV", dataRow, "4万")];
    grid.querySelectorAll = (selector: string) => selector === '[role="row"]' ? [headerRow, dataRow] as never : [] as never;
    headerRow.querySelectorAll = () => headerCells as never;
    dataRow.querySelectorAll = () => dataCells as never;
    const document = {
      querySelectorAll: (selector: string) => selector === 'table,[role="table"],[role="grid"]' ? [grid] : []
    } as unknown as Document;

    const tables = collectBudgetedTables(document, createCaptureBudgetState());

    expect(tables).toEqual([[['任务名称', '消耗'], ['计划 A', '4万']]]);
  });
});

function fakeElement(tagName: string, parentElement: Element | null = null, textContent = "") {
  const element = {
    tagName,
    parentElement,
    textContent,
    hasAttribute: () => false,
    getAttribute: () => null,
    querySelectorAll: () => [] as Element[],
    closest(selector: string) {
      if (selector.includes("table") || selector.includes('[role="grid"]')) return gridAncestor(element as unknown as Element);
      if (selector.includes("tr") || selector.includes('[role="row"]')) return parentElement;
      return null;
    }
  };
  return element as unknown as Element & { querySelectorAll: (selector: string) => Element[] };
}

function gridAncestor(element: Element | null): Element | null {
  let current = element;
  while (current) {
    if (current.tagName === "DIV" && current.parentElement === null) return current;
    current = current.parentElement;
  }
  return null;
}
