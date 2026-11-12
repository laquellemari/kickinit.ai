// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { GET as status } from "@/app/api/membership/route";
import { POST as start } from "@/app/api/membership/subscription/route";
import { POST as activate } from "@/app/api/membership/activate/route";
import { POST as cancel } from "@/app/api/membership/cancel/route";
import { GET as menu } from "@/app/api/places/[placeId]/menu/route";
import { resetTokenCache } from "@/lib/paypal/client";
import { saveMenu } from "@/lib/pricing/menu-store";
import { getDb } from "@/lib/db";
import { useTestDb } from "../../helpers/db";
import { mockPayPal, pp, setPayPalEnv } from "../../helpers/paypal";

const ME = "11111111-1111-4111-8111-111111111111";
const req = (o: { method?: string; body?: unknown; visitor?: string | null; ip?: string; url?: string } = {}) => {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": o.ip ?? "1.1.1.1" };
  if (o.visitor !== null) headers.cookie = `kid=${o.visitor ?? ME}`;
  return new Request(o.url ?? "https://kickinit.example/api/membership", { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
};
const plan = () => getDb().then((db) => db.query("INSERT INTO app_settings (key, value) VALUES ('membership_plan:sandbox', 'P-PLAN1')"));
const active = () => getDb().then((db) => db.query("INSERT INTO memberships (user_id, subscription_id, status, checked_at) VALUES ($1, 'I-SUB1', 'ACTIVE', now())", [ME]));

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); setPayPalEnv(); resetTokenCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("GET /api/membership", () => {
  it("not a member", async () => {
    const res = await status(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ member: false, status: null, since: null, price: "9.99" });
  });
  it("a member, with when they joined", async () => {
    await active();
    const body = await (await status(req())).json();
    expect(body).toMatchObject({ member: true, status: "ACTIVE", price: "9.99" });
    expect(typeof body.since).toBe("string");
  });
  it("401 without a visitor cookie", async () => expect((await status(req({ visitor: null }))).status).toBe(401));
});

describe("POST /api/membership/subscription", () => {
  it("starts a subscription returning to this site's /membership", async () => {
    await plan();
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: { id: "I-NEW" } });
    const res = await start(req({ method: "POST" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "I-NEW" });
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).application_context.return_url).toBe("https://kickinit.example/membership");
  });
  it("409 when already a member", async () => {
    await active();
    expect((await start(req({ method: "POST" }))).status).toBe(409);
  });
  it("401 without a visitor cookie", async () => expect((await start(req({ method: "POST", visitor: null }))).status).toBe(401));
  it("503 when PayPal isn't configured", async () => {
    setPayPalEnv({ PAYPAL_CLIENT_ID: undefined });
    await plan();
    expect((await start(req({ method: "POST", ip: "7.7.7.7" }))).status).toBe(503);
  });
  it("rate limit: 10 a minute per visitor, the 11th is 429", async () => {
    await active();
    for (let i = 0; i < 10; i++) expect((await start(req({ method: "POST", ip: "9.9.9.9" }))).status).toBe(409);
    const res = await start(req({ method: "POST", ip: "9.9.9.9" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many tries. Try again in a minute." });
  });
});

describe("POST /api/membership/activate", () => {
  it("PayPal confirms it: you're a member", async () => {
    await plan();
    mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: { id: "I-SUB1", status: "ACTIVE", plan_id: "P-PLAN1", custom_id: ME } });
    const res = await activate(req({ method: "POST", body: { subscriptionId: "I-SUB1" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ member: true, status: "ACTIVE" });
  });
  it("someone else's subscription: 403", async () => {
    await plan();
    mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: { id: "I-SUB1", status: "ACTIVE", plan_id: "P-PLAN1", custom_id: "other" } });
    expect((await activate(req({ method: "POST", body: { subscriptionId: "I-SUB1" } }))).status).toBe(403);
  });
  it("400 on a bad id or body", async () => {
    expect((await activate(req({ method: "POST", body: { subscriptionId: "x y" } }))).status).toBe(400);
    expect((await activate(req({ method: "POST" }))).status).toBe(400);
  });
  it("401 without a visitor cookie", async () => expect((await activate(req({ method: "POST", visitor: null, body: {} }))).status).toBe(401));
});

describe("POST /api/membership/cancel", () => {
  it("cancels", async () => {
    await active();
    mockPayPal({ status: 200, body: pp.token() }, { status: 204 });
    const res = await cancel(req({ method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ member: false, status: "CANCELLED" });
  });
  it("404 when not a member", async () => expect((await cancel(req({ method: "POST" }))).status).toBe(404));
  it("401 without a visitor cookie", async () => expect((await cancel(req({ method: "POST", visitor: null }))).status).toBe(401));
});

describe("GET /api/places/:placeId/menu", () => {
  const p = (placeId: string) => ({ params: Promise.resolve({ placeId }) });
  const g = (o: Record<string, unknown> = {}) => ({ status: 200, body: { id: "ChIJ1", displayName: { text: "Spa Uno" }, primaryType: "spa", websiteUri: "https://spauno.com", ...o } });
  beforeEach(() => vi.stubEnv("GOOGLE_PLACES_API_KEY", "g"));
  it("a cached menu comes back with when it was checked", async () => {
    const item = { id: "massage-150", name: "Massage", price: "150.00", per: "person", durationMinutes: 60, sourceUrl: "https://spauno.com/m" };
    await saveMenu("ChIJ1", { items: [item as never], checkedAt: new Date("2026-11-11T00:00:00Z") });
    mockPayPal(g());
    const res = await menu(req({ ip: "2.2.2.2" }), p("ChIJ1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dining: false, items: [item], checkedAt: "2026-11-11T00:00:00.000Z" });
  });
  it("a restaurant has no menu to read: it's free to book", async () => {
    const f = mockPayPal(g({ primaryType: "bar" }));
    expect(await (await menu(req({ ip: "3.3.3.3" }), p("ChIJ1"))).json()).toEqual({ dining: true, items: [] });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("not configured for lookups: 503", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockPayPal(g());
    const res = await menu(req({ ip: "4.4.4.4" }), p("ChIJ1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Price lookup is not configured" });
  });
  it("a bad place id: 400; unknown to Google: 404", async () => {
    expect((await menu(req({ ip: "5.5.5.5" }), p("bad id!"))).status).toBe(400);
    mockPayPal({ status: 404, body: { error: { status: "NOT_FOUND", message: "x" } } });
    expect((await menu(req({ ip: "5.5.5.5" }), p("ChIJnope"))).status).toBe(404);
  });
  it("rate limit: 6 a minute, the 7th is 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(g({ primaryType: "cafe" }).body))));
    for (let i = 0; i < 6; i++) expect((await menu(req({ ip: "6.6.6.6" }), p("ChIJ1"))).status).toBe(200);
    const res = await menu(req({ ip: "6.6.6.6" }), p("ChIJ1"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many price lookups. Try again in a minute." });
  });
});
