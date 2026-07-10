import type { Request } from "express";

const defaultPageSize = 50;
const maximumPageSize = 100;
const cursorPattern = /^[A-Za-z0-9_-]{1,128}$/;

export function readPagination(req: Request, fallback = defaultPageSize) {
  const requestedLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : fallback;
  const take = Number.isInteger(requestedLimit) ? Math.min(maximumPageSize, Math.max(1, requestedLimit)) : fallback;
  const rawCursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";
  return {
    take,
    cursor: rawCursor && cursorPattern.test(rawCursor) ? rawCursor : null,
    cursorError: Boolean(rawCursor) && !cursorPattern.test(rawCursor)
  };
}

export function cursorArgs(cursor: string | null): { cursor?: { id: string }; skip?: number } {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {};
}
