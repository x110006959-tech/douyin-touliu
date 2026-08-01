import type { CaptureMeta } from "@douyin-local-life/shared";

export const captureBudget = {
  maxTraversalNodes: 50_000,
  maxRows: 1_000,
  maxColumns: 100,
  maxCells: 50_000,
  maxTableTextBytes: 1_048_576,
  maxVisibleTextBytes: 1_048_576,
  maxDurationMs: 100
} as const;

export type CaptureBudgetState = {
  startedAt: number;
  traversedNodes: number;
  rows: number;
  columns: number;
  cells: number;
  tableTextBytes: number;
  visibleTextBytes: number;
  reasons: Set<string>;
};

export function createCaptureBudgetState(now = performance.now()): CaptureBudgetState {
  return {
    startedAt: now,
    traversedNodes: 0,
    rows: 0,
    columns: 0,
    cells: 0,
    tableTextBytes: 0,
    visibleTextBytes: 0,
    reasons: new Set()
  };
}

export function collectBudgetedVisibleText(document: Document, state: CaptureBudgetState) {
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  const chunks: string[] = [];
  while (walker.nextNode()) {
    if (!consumeNode(state)) break;
    const text = walker.currentNode.textContent?.trim() || "";
    const parent = walker.currentNode.parentElement;
    if (!text || !parent || !isCaptureVisibleElement(parent)) continue;
    const accepted = consumeText(state, text, "VISIBLE_TEXT_LIMIT", "visibleTextBytes", captureBudget.maxVisibleTextBytes);
    if (accepted) chunks.push(accepted);
    if (isTimedOut(state)) break;
  }
  return chunks.join("\n");
}

export function collectBudgetedTables(document: Document, state: CaptureBudgetState) {
  const tables: string[][][] = [];
  for (const table of document.querySelectorAll('table,[role="table"],[role="grid"]')) {
    if (!consumeNode(state) || !isCaptureVisibleElement(table)) break;
    const rows: string[][] = [];
    const rowSelector = table.tagName === "TABLE" ? "tr" : '[role="row"]';
    const cellSelector = table.tagName === "TABLE"
      ? "th,td"
      : '[role="columnheader"],[role="rowheader"],[role="cell"],[role="gridcell"]';
    for (const row of table.querySelectorAll(rowSelector)) {
      if (!belongsToTable(row, table)) continue;
      if (!consumeNode(state) || state.rows >= captureBudget.maxRows) {
        state.reasons.add("TABLE_ROW_LIMIT");
        break;
      }
      const cells: string[] = [];
      for (const cell of row.querySelectorAll(cellSelector)) {
        if (!belongsToRow(cell, row)) continue;
        if (!consumeNode(state) || state.cells >= captureBudget.maxCells || cells.length >= captureBudget.maxColumns) {
          state.reasons.add(state.cells >= captureBudget.maxCells ? "TABLE_CELL_LIMIT" : "TABLE_COLUMN_LIMIT");
          break;
        }
        if (!isCaptureVisibleElement(cell)) continue;
        const text = consumeText(state, cell.textContent?.trim() || "", "TABLE_TEXT_LIMIT", "tableTextBytes", captureBudget.maxTableTextBytes);
        if (text) cells.push(text);
        state.cells += 1;
      }
      state.rows += 1;
      state.columns = Math.max(state.columns, cells.length);
      if (cells.length) rows.push(cells);
      if (isTimedOut(state)) break;
    }
    if (rows.length) tables.push(rows);
    if (isTimedOut(state) || state.rows >= captureBudget.maxRows || state.cells >= captureBudget.maxCells) break;
  }
  return tables;
}

function belongsToTable(element: Element, table: Element) {
  return typeof element.closest !== "function"
    || element.closest('table,[role="table"],[role="grid"]') === table;
}

function belongsToRow(element: Element, row: Element) {
  return typeof element.closest !== "function"
    || element.closest('tr,[role="row"]') === row;
}

export function applyCaptureBudget(meta: CaptureMeta, state: CaptureBudgetState): CaptureMeta {
  if (performance.now() - state.startedAt >= captureBudget.maxDurationMs) state.reasons.add("TIME_BUDGET_EXCEEDED");
  const truncationReasons = [...new Set([...meta.truncationReasons, ...state.reasons])];
  const truncatedFields = [...new Set([
    ...meta.truncatedFields,
    ...(truncationReasons.some((reason) => reason.includes("TABLE")) ? ["rawTableData"] : []),
    ...(truncationReasons.some((reason) => reason.includes("VISIBLE_TEXT")) ? ["rawDomText"] : [])
  ])];
  const partial = truncationReasons.length > 0;
  return {
    ...meta,
    completeness: partial ? "PARTIAL" : meta.completeness,
    originalBytes: Math.max(meta.originalBytes, state.tableTextBytes + state.visibleTextBytes),
    acceptedBytes: state.tableTextBytes + state.visibleTextBytes,
    truncatedFields,
    truncationReasons
  };
}

function consumeNode(state: CaptureBudgetState) {
  if (isTimedOut(state)) return false;
  state.traversedNodes += 1;
  if (state.traversedNodes > captureBudget.maxTraversalNodes) {
    state.reasons.add("NODE_TRAVERSAL_LIMIT");
    return false;
  }
  return true;
}

function consumeText(
  state: CaptureBudgetState,
  value: string,
  reason: string,
  field: "tableTextBytes" | "visibleTextBytes",
  limit: number
) {
  if (!value) return "";
  const available = Math.max(0, limit - state[field]);
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= available) {
    state[field] += bytes.byteLength;
    return value;
  }
  state.reasons.add(reason);
  if (!available) return "";
  let result = "";
  for (const character of value) {
    const next = result + character;
    if (new TextEncoder().encode(next).byteLength > available) break;
    result = next;
  }
  state[field] += new TextEncoder().encode(result).byteLength;
  return result;
}

function isTimedOut(state: CaptureBudgetState) {
  if (performance.now() - state.startedAt < captureBudget.maxDurationMs) return false;
  state.reasons.add("TIME_BUDGET_EXCEEDED");
  return true;
}

export function isCaptureVisibleElement(element: Element) {
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return false;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(current.tagName)) return false;
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return false;
    current = current.parentElement;
  }
  return true;
}
