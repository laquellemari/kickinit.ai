// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { visitorId, isAdmin } from "@/lib/visitor";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

const U = "11111111-1111-4111-8111-111111111111";
const r = (headers: Record<string, string> = {}) => new Request("http://x", { headers });
afterEach(() => vi.unstubAllEnvs());

describe("visitorId", () => {
  it("reads the kid cookie among others", () => expect(visitorId(r({ cookie: `a=1; kid=${U}; b=2` }))).toBe(U));
  it.each([["no cookie header", {}], ["no kid", { cookie: "a=1" }], ["not a uuid", { cookie: "kid=abc" }], ["empty", { cookie: "kid=" }]])("401 with %s", (_l, h) => {
    expect(() => visitorId(r(h))).toThrow("We couldn't identify your browser");
  });
});

describe("isAdmin", () => {
  it("true only with the exact configured key", () => {
    vi.stubEnv("ADMIN_API_KEY", "k");
    expect(isAdmin(r({ "x-admin-key": "k" }))).toBe(true);
    expect(isAdmin(r({ "x-admin-key": "K" }))).toBe(false);
    expect(isAdmin(r())).toBe(false);
  });
  it("false when no key is configured, even if the header is empty", () => {
    vi.stubEnv("ADMIN_API_KEY", "");
    expect(isAdmin(r({ "x-admin-key": "" }))).toBe(false);
  });
});

describe("middleware", () => {
  it("sets a long-lived httpOnly visitor cookie when missing, and passes it to this request", () => {
    const res = middleware(new NextRequest("http://x/plan", { headers: { cookie: "a=1" } }));
    const c = res.cookies.get("kid")!;
    expect(c.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(c).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
    expect(res.headers.get("x-middleware-request-cookie")).toContain(`kid=${c.value}`);
  });
  it("works with no existing cookies", () => {
    const res = middleware(new NextRequest("http://x/"));
    expect(res.headers.get("x-middleware-request-cookie")).toBe(`kid=${res.cookies.get("kid")!.value}`);
  });
  it("leaves an existing visitor cookie alone", () => {
    const res = middleware(new NextRequest("http://x/", { headers: { cookie: `kid=${U}` } }));
    expect(res.cookies.get("kid")).toBeUndefined();
  });
  it("marks the cookie secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(middleware(new NextRequest("http://x/")).cookies.get("kid")!.secure).toBe(true);
  });
});
