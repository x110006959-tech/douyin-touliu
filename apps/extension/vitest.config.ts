import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@douyin-local-life/shared/safety": fileURLToPath(new URL("../../packages/shared/src/safety.ts", import.meta.url)),
      "@douyin-local-life/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url))
    }
  }
});
