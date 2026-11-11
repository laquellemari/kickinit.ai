// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { POST as create } from "@/app/api/gifts/route";
import { GET as view } from "@/app/api/gifts/[id]/route";
import { POST as contribute } from "@/app/api/gifts/[id]/contributions/route";
import { GET as redeemInfo, POST as redeem } from "@/app/api/gifts/redeem/[code]/route";
import { POST as cron } from "@/app/api/cron/close-pools/route";
import { POST as order } from "@/app/api/paypal/orders/route";
import { insertGift, insertContribution, transitionGift } from "@/lib/gifts/repo";
import { resetTokenCache } from "@/lib/paypal/client";
import { useTestDb } from "../../helpers/db";
import { createNewGift, createNewContribution } from "../../helpers/factories";
import { mockPayPal, pp, setPayPalEnv } from "../../helpers/paypal";

const ORG = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
const ADMIN = "admin-secret";
const DAY = 86_400_000;
const req = (o: { method?: string; body?: unknown; visitor?: string | null; admin?: string } = {}) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.visitor !== null) headers.cookie = `kid=${o.visitor ?? ORG}`;
  if (o.admin) headers["x-admin-key"] = o.admin;
  return new Request("http://localhost/api/x", { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
};
const id = (v: string) => ({ params: Promise.resolve({ id: v }) });
const code = (v: string) => ({ params: Promise.resolve({ code: v }) });
/** Checks status (showing the server's error message on a mismatch) and body. */
async function verifyRes(res: Response, expected: { status: number; body?: Record<string, unknown> }) {
  const json = await res.json();
  expect({ status: res.status, error: res.status === expected.status ? undefined : json.error }).toEqual({ status: expected.status, error: undefined });
  if (expected.body) expect(json).toMatchObject(expected.body);
  return json;
}

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); setPayPalEnv(); vi.stubEnv("ADMIN_API_KEY", ADMIN); resetTokenCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("POST /api/gifts", () => {
  it("creates a pool and shows the organizer their redeem code", async () => {
    const deadline = new Date(Date.now() + 3 * DAY).toISOString();
    const body = await verifyRes(await create(req({ method: "POST", body: { experienceId: "still-water", partySize: "2", organizerName: "Kavon", recipientName: "Mom", note: "60!", mode: "pool", deadline } })), {
      status: 201, body: { status: "open", mode: "pool", amount: "190.00", raised: "0.00", remaining: "190.00", minContribution: "5.00", maxContribution: "190.00", isOrganizer: true, contributors: [] },
    });
    expect(body.redeemCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
  it("400 on bad input", async () => {
    await verifyRes(await create(req({ method: "POST", body: { experienceId: "still-water", partySize: 2, organizerName: "", recipientName: "Mom", mode: "solo" } })), { status: 400, body: { error: "Your name is required" } });
  });
  it("401 without a visitor cookie", async () => {
    await verifyRes(await create(req({ method: "POST", visitor: null, body: {} })), { status: 401 });
  });
});

describe("GET /api/gifts/:id", () => {
  it("anyone with the link sees progress and contributors, but never the redeem code", async () => {
    const g = await insertGift(createNewGift({ organizerId: ORG, deadline: new Date(Date.now() + DAY) }));
    await insertContribution(createNewContribution(g.id, { name: "Ana", amountCents: 5000 }));
    const friend = await verifyRes(await view(req({ visitor: FRIEND }), id(g.id)), {
      status: 200, body: { raised: "50.00", remaining: "140.00", contributors: [{ name: "Ana", amount: "50.00" }], isOrganizer: false, redeemCode: null },
    });
    expect(friend).not.toHaveProperty("organizerId");
    const anon = await verifyRes(await view(req({ visitor: null }), id(g.id)), { status: 200 });
    expect(anon.redeemCode).toBeNull();
    const org = await verifyRes(await view(req(), id(g.id)), { status: 200, body: { isOrganizer: true } });
    expect(org.redeemCode).toBe(g.redeemCode);
  });
  it("viewing a pool past its deadline closes it (releases holds)", async () => {
    const g = await insertGift(createNewGift({ deadline: new Date(Date.now() - 1000) }));
    await insertContribution(createNewContribution(g.id, { authorizationId: "A1" }));
    mockPayPal({ status: 200, body: pp.token() }, { status: 204 });
    await verifyRes(await view(req(), id(g.id)), { status: 200, body: { status: "expired", raised: "0.00", contributors: [] } });
  });
  it("404 for unknown or malformed ids", async () => {
    await verifyRes(await view(req(), id("00000000-0000-0000-0000-000000000000")), { status: 404 });
    await verifyRes(await view(req(), id("../x")), { status: 404 });
  });
});

describe("chipping in: POST /api/paypal/orders {kind: gift} then POST /api/gifts/:id/contributions", () => {
  it("happy: order holds the chosen amount, then the contribution is recorded", async () => {
    const g = await insertGift(createNewGift({ organizerId: ORG, deadline: new Date(Date.now() + DAY) }));
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.order({ id: "GO1" }) });
    await verifyRes(await order(req({ method: "POST", visitor: FRIEND, body: { kind: "gift", giftId: g.id, amount: "50" } })), { status: 201, body: { id: "GO1", amount: "50.00" } });
    const sent = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).purchase_units[0];
    expect(sent.amount).toEqual({ currency_code: "USD", value: "50.00" });
    expect(sent.description).toBe("Gift for Mom: Still Water Bathhouse");
    // The access token is cached from the order call, so PayPal is only asked to authorize.
    mockPayPal({ status: 201, body: pp.authorizedOrder({ amount: { value: "50.00", currency_code: "USD" } }) });
    await verifyRes(await contribute(req({ method: "POST", visitor: FRIEND, body: { orderId: "GO1", name: "Ana" } }), id(g.id)), {
      status: 201, body: { raised: "50.00", contributors: [{ name: "Ana", amount: "50.00" }], isOrganizer: false, redeemCode: null },
    });
  });
  it.each([
    ["too little", "4.99", 400, "Chip in between $5.00 and $190.00"],
    ["too much", "190.01", 400, "Chip in between $5.00 and $190.00"],
    ["not a number", "lots", 400, "Chip in between $5.00 and $190.00"],
    ["three decimals", "5.001", 400, "Chip in between $5.00 and $190.00"],
  ])("order: %s is refused before PayPal", async (_l, amount, status, error) => {
    const g = await insertGift(createNewGift({ deadline: new Date(Date.now() + DAY) }));
    const f = mockPayPal();
    await verifyRes(await order(req({ method: "POST", body: { kind: "gift", giftId: g.id, amount } })), { status, body: { error } });
    expect(f).not.toHaveBeenCalled();
  });
  it("order: unknown gift 404; closed gift 409", async () => {
    await verifyRes(await order(req({ method: "POST", body: { kind: "gift", giftId: "nope", amount: "10" } })), { status: 404, body: { error: "Gift not found" } });
    const g = await insertGift(createNewGift());
    await transitionGift(g.id, ["open"], "funded");
    await verifyRes(await order(req({ method: "POST", body: { kind: "gift", giftId: g.id, amount: "10" } })), { status: 409 });
  });
  it("contribution: 401 without a visitor; 404 unknown gift", async () => {
    await verifyRes(await contribute(req({ method: "POST", visitor: null, body: {} }), id("x")), { status: 401 });
    await verifyRes(await contribute(req({ method: "POST", body: { orderId: "O", name: "A" } }), id("00000000-0000-0000-0000-000000000000")), { status: 404 });
  });
  it("contribution: missing orderId is 400", async () => {
    await verifyRes(await contribute(req({ method: "POST", body: { orderId: 5, name: "A" } }), id("x")), { status: 400, body: { error: "Order id is required" } });
  });
});

describe("redeem", () => {
  it("GET shows the recipient what they got, without amounts", async () => {
    const g = await insertGift(createNewGift());
    const body = await verifyRes(await redeemInfo(req(), code(g.redeemCode)), { status: 200, body: { name: "Still Water Bathhouse", recipientName: "Mom", organizerName: "Kavon", status: "open" } });
    expect(body).not.toHaveProperty("amount");
  });
  it("POST books it for the recipient", async () => {
    const g = await insertGift(createNewGift());
    await transitionGift(g.id, ["open"], "funded");
    await verifyRes(await redeem(req({ method: "POST", visitor: FRIEND, body: { startsAt: new Date(Date.now() + 3 * DAY).toISOString() } }), code(g.redeemCode)), {
      status: 201, body: { status: "confirmed", itemId: "still-water", amount: "190.00" },
    });
  });
  it("404 for malformed or unknown codes", async () => {
    await verifyRes(await redeemInfo(req(), code("short")), { status: 404 });
    await verifyRes(await redeemInfo(req(), code("A".repeat(22))), { status: 404 });
    await verifyRes(await redeem(req({ method: "POST", body: {} }), code("short")), { status: 404 });
  });
  it("410 for an expired pool", async () => {
    const g = await insertGift(createNewGift());
    await transitionGift(g.id, ["open"], "expired");
    await verifyRes(await redeem(req({ method: "POST", body: { startsAt: new Date(Date.now() + 3 * DAY).toISOString() } }), code(g.redeemCode)), { status: 410 });
  });
  it("401 without a visitor", async () => {
    await verifyRes(await redeem(req({ method: "POST", visitor: null, body: {} }), code("A".repeat(22))), { status: 401 });
  });
  it("GET passes database errors through safely", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { setDb } = await import("@/lib/db");
    setDb(null);
    await verifyRes(await redeemInfo(req(), code("A".repeat(22))), { status: 503 });
    await verifyRes(await view(req(), id("00000000-0000-0000-0000-000000000000")), { status: 503 });
    await t.reset();
  });
});

describe("POST /api/cron/close-pools", () => {
  it("admin: closes due pools and reports counts", async () => {
    await insertGift(createNewGift({ deadline: new Date(Date.now() - 1000) }));
    await verifyRes(await cron(req({ method: "POST", admin: ADMIN })), { status: 200, body: { checked: 1, funded: 0, expired: 1, failed: 0 } });
  });
  it("401 without the admin key", async () => {
    await verifyRes(await cron(req({ method: "POST" })), { status: 401 });
  });
});
