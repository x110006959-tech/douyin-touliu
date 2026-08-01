import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  fileURLToPath(new URL("./layout.tsx", import.meta.url)),
  "utf8"
);
const homePageSource = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);

describe("home page filing footer", () => {
  it("keeps the filing link at the bottom of short pages", () => {
    expect(layoutSource).toContain('className="flex min-h-screen flex-col"');
    expect(layoutSource).toContain('<main className="flex flex-1 flex-col">{children}</main>');
    expect(layoutSource).toContain('href="https://beian.miit.gov.cn/"');
    expect(layoutSource).toContain('target="_blank"');
    expect(layoutSource).toContain("辽ICP备2026002223号");
    expect(homePageSource).toContain("w-full flex-1 max-w-6xl");
    expect(homePageSource).not.toContain("min-h-screen");
  });
});
