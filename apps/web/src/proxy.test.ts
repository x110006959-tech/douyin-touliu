import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  setNodeEnv(originalNodeEnv);
});

describe("Web security proxy", () => {
  it("adds a nonce CSP and allows the configured API origin", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    const response = proxy(new NextRequest("https://www.example.com/dashboard"));
    const csp = response.headers.get("content-security-policy") || "";

    expect(csp).toMatch(/script-src 'self' 'nonce-[a-f0-9]+'/);
    expect(csp).toContain("connect-src 'self' https://api.example.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("permissions-policy")).toBe("camera=(), geolocation=(), microphone=()");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  });

  it("enables HSTS only for production responses", () => {
    setNodeEnv("production");
    const response = proxy(new NextRequest("https://www.example.com/"));

    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(response.headers.get("content-security-policy")).toContain("upgrade-insecure-requests");
  });
});

function setNodeEnv(value: string | undefined) {
  const environment = process.env as Record<string, string | undefined>;
  if (value === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = value;
}
