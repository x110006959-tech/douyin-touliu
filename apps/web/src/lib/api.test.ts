import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, cookieSessionMarker, createIdempotencyKey, setCsrfToken } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
  setCsrfToken(null);
});

describe("web API client", () => {
  it("returns data and sends the SaaS token only to the configured API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { ok: true }, error: null }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(apiFetch("/health", "saas-token")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/health",
      expect.objectContaining({ credentials: "include", headers: expect.objectContaining({ authorization: "Bearer saas-token" }) })
    );
  });

  it("uses the HttpOnly cookie session with its in-memory CSRF token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: "user-1" }, error: null }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    setCsrfToken("csrf-test");
    await apiFetch("/projects", cookieSessionMarker, { method: "POST", body: "{}" });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(new Headers(init?.headers).get("x-csrf-token")).toBe("csrf-test");
  });

  it("surfaces request IDs from structured API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: { code: "INTERNAL_ERROR", message: "服务暂时不可用", requestId: "request-123" }
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      )
    );

    await expect(apiFetch("/failure", null)).rejects.toThrow("服务暂时不可用（请求 request-123）");
  });

  it("creates bounded idempotency keys", () => {
    const key = createIdempotencyKey("decision:" + "x".repeat(200));
    expect(key.length).toBeLessThanOrEqual(128);
    expect(key).toMatch(/^decision:/);
  });
});
