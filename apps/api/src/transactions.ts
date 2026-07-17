import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export function isSerializableConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") return true;
  return error instanceof Error && /could not serialize access|\b40001\b/i.test(error.message);
}

export async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 4
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isSerializableConflict(error) || attempt >= maxRetries) throw error;
      attempt += 1;
    }
  }
}
