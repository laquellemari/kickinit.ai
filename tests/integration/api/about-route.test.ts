// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { saveAbout } from "@/lib/about/about";
import { useTestDb } from "../../helpers/db";

import { GET } from "@/app/api/places/[placeId]/about/route";

// The rate limiter lives for the whole file, so each test is its own visitor.
let n = 0;
const ip = () => `10.0.0.${++n}`;
const req = (from: string) => new Request("http://x/api/places/ChIJ1/about", { headers: { "x-forwarded-for": from } });
const params = (placeId: string) => ({ params: Promise.resolve({ placeId }) });
const GOOD = "A French-inspired rooftop bar with fire pits, live jazz and skyline views.";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const apis = (claude: () => Response, places: () => Response = () => json(200, { id: "ChIJ1", displayName: { text: "Perch" } })) => {
  const f = vi.fn(async (url: string) => (url.startsWith("https://places") ? places() : claude()));
  vi.stubGlobal("fetch", f);
  return f;
};

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); vi.stubEnv("ANTHROPIC_API_KEY", "sk"); vi.stubEnv("GOOGLE_PLACES_API_KEY", "g"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/places/:placeId/about", () => {
  it("200: writes the description on first visit, cacheable for an hour", async () => {
    const me = ip();
    apis(() => json(200, { content: [{ type: "text", text: GOOD }] }));
    const res = await GET(req(me), params("ChIJ1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await res.json()).toEqual({ about: GOOD });
  });
  it("200: a cached description costs nothing and is never rate limited", async () => {
    const me = ip();
    await saveAbout("ChIJ1", { about: GOOD, checkedAt: new Date() });
    const f = apis(() => { throw new Error("no"); });
    for (let i = 0; i < 12; i++) expect((await GET(req(me), params("ChIJ1"))).status).toBe(200);
    expect(f).not.toHaveBeenCalled();
  });
  it("200 with null when Google knows too little", async () => {
    const me = ip();
    apis(() => json(200, { content: [{ type: "text", text: "NONE" }] }));
    expect(await (await GET(req(me), params("ChIJ1"))).json()).toEqual({ about: null });
  });
  it("400 for a bad id", async () => {
    const me = ip();
    const res = await GET(req(me), params("a b"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Place id has invalid characters" });
  });
  it("boundary: 10 new descriptions a minute per visitor, the 11th is 429; another visitor is unaffected", async () => {
    const me = ip();
    apis(() => json(200, { content: [{ type: "text", text: "NONE" }] }));
    for (let i = 0; i < 10; i++) expect((await GET(req(me), params(`P${i}`))).status).toBe(200);
    const res = await GET(req(me), params("P10"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many venues at once. Try again in a minute." });
    expect((await GET(req(ip()), params("P10"))).status).toBe(200);
  });
  it("503 when Claude isn't configured", async () => {
    const me = ip();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    apis(() => { throw new Error("no"); });
    const res = await GET(req(me), params("ChIJ1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Venue descriptions are not configured" });
  });
  it("502 when Claude fails", async () => {
    const me = ip();
    apis(() => json(500, { error: { message: "boom" } }));
    expect((await GET(req(me), params("ChIJ1"))).status).toBe(502);
  });
  it("404 when Google doesn't know the place", async () => {
    const me = ip();
    apis(() => json(200, {}), () => json(404, { error: { status: "NOT_FOUND" } }));
    expect((await GET(req(me), params("ChIJ1"))).status).toBe(404);
  });
});
