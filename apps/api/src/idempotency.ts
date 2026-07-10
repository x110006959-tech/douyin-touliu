import type { Request } from "express";
import { Prisma } from "@prisma/client";

const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function readIdempotencyKey(req: Request) {
  const raw = req.header("idempotency-key");
  if (!raw) return { key: null, error: null };
  const key = raw.trim();
  if (!idempotencyKeyPattern.test(key)) {
    return { key: null, error: "Idempotency-Key 只能包含字母、数字、点、下划线、冒号和连字符，且最长 128 位。" };
  }
  return { key, error: null };
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
