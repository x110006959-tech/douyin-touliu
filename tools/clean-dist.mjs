import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const target = process.argv[2];
if (!target || target === "." || target === "..") {
  throw new Error("A safe build output directory is required.");
}

await rm(resolve(process.cwd(), target), { recursive: true, force: true });
