import { describe, expect, it } from "vitest";
import { cursorArgs, readPagination } from "./pagination.js";

describe("pagination", () => {
  it("bounds page sizes and accepts safe cursors", () => {
    const result = readPagination({ query: { limit: "500", cursor: "cursor_123" } } as never);
    expect(result).toEqual({ take: 100, cursor: "cursor_123", cursorError: false });
    expect(cursorArgs(result.cursor)).toEqual({ cursor: { id: "cursor_123" }, skip: 1 });
  });

  it("rejects malformed cursors and normalizes invalid limits", () => {
    expect(readPagination({ query: { limit: "nope", cursor: "bad cursor" } } as never)).toEqual({
      take: 50,
      cursor: null,
      cursorError: true
    });
  });
});
