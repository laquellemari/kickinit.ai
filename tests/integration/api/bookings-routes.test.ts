// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { POST as create, GET as mine } from "@/app/api/bookings/route";
import { GET as one } from "@/app/api/bookings/[id]/route";
import { POST as confirm } from "@/app/api/bookings/[id]/confirm/route";
import { POST as decline } from "@/app/api/bookings/[id]/decline/route";
import { POST as rateRoute } from "@/app/api/bookings/[id]/rating/route";
import { POST as proposeRoute } from "@/app/api/bookings/[id]/propose/route";
import { POST as proposalRoute } from "@/app/api/bookings/[id]/proposal/route";
import { markCheckedIn } from "@/lib/bookings/repo";
import { GET as adminList } from "@/app/api/admin/bookings/route";
import { insertBooking, transition } from "@/lib/bookings/repo";
import { resetTokenCache } from "@/lib/paypal/client";
import { getDb, setDb } from "@/lib/db";
import { useTestDb } from "../../helpers/db";
import { createNewBooking } from "../../helpers/factories";
import { mockPayPal, pp, setPayPalEnv } from "../../helpers/paypal";

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const ADMIN = "admin-secret";
const FUTURE = new Date(Date.now() + 3 * 86_400_000).toISOString();

const req = (o: { method?: string; body?: unknown; visitor?: string | null; admin?: string; url?: string } = {}) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.visitor !== null) headers.cookie = `theme=dark; kid=${o.visitor ?? ME}`;
  if (o.admin) headers["x-admin-key"] = o.admin;
  return new Request(o.url ?? "http://localhost/api/bookings", { method: o.method ?? "GET", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
};
const p = (id: string) => ({ params: Promise.resolve({ id }) });
async function verifyRes(res: Response, expected: { status: number; body?: Record<string, unknown> }) {
  expect(res.status).toBe(expected.status);
  const json = await res.json();
  if (expected.body) expect(json).toMatchObject(expected.body);
  return json;
}

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); setPayPalEnv(); vi.stubEnv("ADMIN_API_KEY", ADMIN); resetTokenCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("POST /api/bookings", () => {
  const paid = (value: string) => pp.authorizedOrder({ amount: { value, currency_code: "USD" } });
  it("happy: a paid partner booking is placed, charged (price + fee) and returned without private fields", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: paid("228.00") }, { status: 201, body: pp.capture() });
    const body = await verifyRes(await create(req({ method: "POST", body: { orderId: "O1", kind: "partner", itemId: "hugh-spa", partySize: "2", startsAt: FUTURE } })), {
      status: 201, body: { kind: "partner", itemId: "hugh-spa", name: "Hugh Spa", partySize: 2, amount: "228.00", fee: "38.00", free: false, status: "confirmed", paypalOrderId: "O1", startsAt: FUTURE },
    });
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("authorizationId");
  });
  it("members are priced without the fee", async () => {
    await (await getDb()).query("INSERT INTO memberships (user_id, subscription_id, status, checked_at) VALUES ($1, 'I-1', 'ACTIVE', now())", [ME]);
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: paid("190.00") }, { status: 201, body: pp.capture() });
    await verifyRes(await create(req({ method: "POST", body: { orderId: "O2", kind: "partner", itemId: "hugh-spa", partySize: 2, startsAt: FUTURE } })), { status: 201, body: { amount: "190.00", fee: "0.00" } });
  });
  it("free: a restaurant is booked with no PayPal at all, and shows no order id", async () => {
    const f = mockPayPal();
    await verifyRes(await create(req({ method: "POST", body: { free: true, kind: "partner", itemId: "carasau-pasta-bar", partySize: 2, startsAt: FUTURE } })), {
      status: 201, body: { itemId: "carasau-pasta-bar", amount: "0.00", status: "confirmed", free: true, paypalOrderId: null },
    });
    expect(f).not.toHaveBeenCalled();
  });
  it("free: a paid experience can't be booked for free", async () => {
    await verifyRes(await create(req({ method: "POST", body: { free: true, kind: "partner", itemId: "hugh-spa", partySize: 2, startsAt: FUTURE } })), { status: 400, body: { error: "This booking is paid with PayPal" } });
  });
  it("free must be exactly true; anything else is the paid path", async () => {
    await verifyRes(await create(req({ method: "POST", body: { free: "true", kind: "partner", itemId: "carasau-pasta-bar", partySize: 2, startsAt: FUTURE } })), { status: 400, body: { error: "Order id is required" } });
  });
  it("400 on validation, before PayPal", async () => {
    const f = mockPayPal();
    await verifyRes(await create(req({ method: "POST", body: { orderId: 7, kind: "partner", itemId: "carasau-pasta-bar", partySize: 2, startsAt: FUTURE } })), { status: 400, body: { error: "Order id is required" } });
    expect(f).not.toHaveBeenCalled();
  });
  it("404 for an unknown experience", async () => {
    await verifyRes(await create(req({ method: "POST", body: { orderId: "O1", kind: "partner", itemId: "nope", partySize: 2, startsAt: FUTURE } })), { status: 404, body: { error: "Experience not found: nope" } });
  });
  describe("access control", () => {
    it("401 without a visitor cookie", async () => {
      await verifyRes(await create(req({ method: "POST", visitor: null, body: {} })), { status: 401, body: { error: /couldn't identify your browser/ } as never });
    });
    it("401 with a malformed visitor cookie", async () => {
      await verifyRes(await create(req({ method: "POST", visitor: "not-a-uuid", body: {} })), { status: 401 });
    });
  });
  it("503 when the database isn't configured", async () => {
    setDb(null);
    vi.stubEnv("DATABASE_URL", "");
    await verifyRes(await create(req({ method: "POST", body: { orderId: "O1", kind: "partner", itemId: "hugh-spa", partySize: 2, startsAt: FUTURE } })), { status: 503, body: { error: "Database is not configured" } });
    await t.reset();
  });
});

describe("GET /api/bookings (mine)", () => {
  it("lists only my bookings", async () => {
    const a = await insertBooking(createNewBooking({ userId: ME }));
    await insertBooking(createNewBooking({ userId: THEM }));
    const body = await verifyRes(await mine(req()), { status: 200 });
    expect(body.bookings.map((b: { id: string }) => b.id)).toEqual([a.id]);
  });
  it("401 without a visitor cookie", async () => {
    await verifyRes(await mine(req({ visitor: null })), { status: 401 });
  });
});

describe("GET /api/bookings/:id", () => {
  it("the owner can see it", async () => {
    const b = await insertBooking(createNewBooking({ userId: ME }));
    await verifyRes(await one(req(), p(b.id)), { status: 200, body: { id: b.id, status: "held", holdExpiresAt: "2026-12-13T00:00:00.000Z", checkedInAt: null, city: "Miami" } });
  });
  it("a booking with no hold expiry shows null", async () => {
    const b = await insertBooking(createNewBooking({ userId: ME, holdExpiresAt: null }));
    await verifyRes(await one(req(), p(b.id)), { status: 200, body: { holdExpiresAt: null } });
  });
  describe("access control", () => {
    it("another visitor gets 404 (not 403, so ids don't leak)", async () => {
      const b = await insertBooking(createNewBooking({ userId: THEM }));
      await verifyRes(await one(req(), p(b.id)), { status: 404, body: { error: "Booking not found" } });
    });
    it("an admin can see anyone's, even without a visitor cookie", async () => {
      const b = await insertBooking(createNewBooking({ userId: THEM }));
      await verifyRes(await one(req({ visitor: null, admin: ADMIN }), p(b.id)), { status: 200, body: { id: b.id } });
    });
    it("a wrong admin key is treated as a normal visitor", async () => {
      const b = await insertBooking(createNewBooking({ userId: THEM }));
      await verifyRes(await one(req({ admin: "wrong" }), p(b.id)), { status: 404 });
    });
  });
  it("a non-UUID id is 404 without touching the database", async () => {
    await verifyRes(await one(req(), p("../x")), { status: 404 });
  });
  it("401 without a cookie when not admin", async () => {
    await verifyRes(await one(req({ visitor: null }), p("00000000-0000-0000-0000-000000000000")), { status: 401 });
  });
});

describe.each([
  ["confirm", confirm, { status: 201, body: pp.capture() }, "confirmed"],
  ["decline", decline, { status: 204 }, "declined"],
] as const)("POST /api/bookings/:id/%s", (action, handler, paypalReply, finalStatus) => {
  it(`admin can ${action} a held booking`, async () => {
    const b = await insertBooking(createNewBooking({ kind: "live" }));
    mockPayPal({ status: 200, body: pp.token() }, paypalReply);
    await verifyRes(await handler(req({ method: "POST", admin: ADMIN }), p(b.id)), { status: 200, body: { id: b.id, status: finalStatus } });
  });
  it("401 without the admin key (the booking's owner can't do it either)", async () => {
    const b = await insertBooking(createNewBooking({ userId: ME }));
    const f = mockPayPal();
    await verifyRes(await handler(req({ method: "POST" }), p(b.id)), { status: 401, body: { error: "Admin key required" } });
    expect(f).not.toHaveBeenCalled();
  });
  it("404 for a bad id", async () => {
    await verifyRes(await handler(req({ method: "POST", admin: ADMIN }), p("x")), { status: 404 });
  });
  it("409 when already final", async () => {
    const b = await insertBooking(createNewBooking());
    mockPayPal({ status: 200, body: pp.token() }, paypalReply);
    await handler(req({ method: "POST", admin: ADMIN }), p(b.id));
    await verifyRes(await handler(req({ method: "POST", admin: ADMIN }), p(b.id)), { status: 409, body: { error: `Booking is already ${finalStatus}` } });
  });
});

describe("GET /api/admin/bookings", () => {
  it("lists everyone's bookings, filterable by status", async () => {
    await insertBooking(createNewBooking({ userId: ME }));
    await insertBooking(createNewBooking({ userId: THEM }));
    expect((await verifyRes(await adminList(req({ admin: ADMIN, url: "http://x/api/admin/bookings" })), { status: 200 })).bookings).toHaveLength(2);
    expect((await verifyRes(await adminList(req({ admin: ADMIN, url: "http://x/api/admin/bookings?status=confirmed" })), { status: 200 })).bookings).toHaveLength(0);
  });
  it("400 for an unknown status", async () => {
    await verifyRes(await adminList(req({ admin: ADMIN, url: "http://x/api/admin/bookings?status=paid" })), { status: 400, body: { error: "Status must be one of held, confirmed, declined, failed" } });
  });
  it("401 without the admin key", async () => {
    await verifyRes(await adminList(req({ url: "http://x/api/admin/bookings" })), { status: 401 });
  });
});

describe("POST /api/bookings/:id/rating", () => {
  it("the guest rates a checked-in visit; the booking then shows the rating", async () => {
    const b = await insertBooking(createNewBooking({ userId: ME }));
    await transition(b.id, ["held"], "confirmed");
    await markCheckedIn(b.id, new Date());
    const json = await verifyRes(await rateRoute(req({ method: "POST", body: { stars: 5, note: "Great" } }), p(b.id)), { status: 201, body: { stars: 5, note: "Great" } });
    expect(typeof json.createdAt).toBe("string");
    await verifyRes(await one(req({}), p(b.id)), { status: 200, body: { id: b.id, rating: { stars: 5, note: "Great" } } });
  });
  it("an unrated booking shows rating: null", async () => {
    const b = await insertBooking(createNewBooking({ userId: ME }));
    await verifyRes(await one(req({}), p(b.id)), { status: 200, body: { rating: null } });
  });
  it("401 without a visitor; 404 for a bad id; 400 for bad stars", async () => {
    const b = await insertBooking(createNewBooking({ userId: ME }));
    await transition(b.id, ["held"], "confirmed");
    await markCheckedIn(b.id, new Date());
    await verifyRes(await rateRoute(req({ method: "POST", visitor: null, body: { stars: 5 } }), p(b.id)), { status: 401 });
    await verifyRes(await rateRoute(req({ method: "POST", body: { stars: 5 } }), p("x")), { status: 404 });
    await verifyRes(await rateRoute(req({ method: "POST", body: { stars: 9 } }), p(b.id)), { status: 400, body: { error: "Pick 1 to 5 stars" } });
  });
});

describe("offering another time", () => {
  const NEW = new Date(Date.now() + 4 * 86_400_000).toISOString();
  const held = () => insertBooking(createNewBooking({ userId: ME, kind: "live", paypalOrderId: `free:${Math.random()}`, authorizationId: "", amount: "0.00" }));
  it("the desk offers a time; the guest sees it and takes it", async () => {
    const b = await held();
    await verifyRes(await proposeRoute(req({ method: "POST", admin: ADMIN, body: { startsAt: NEW } }), p(b.id)), { status: 200, body: { proposedStartsAt: NEW, status: "held" } });
    await verifyRes(await one(req(), p(b.id)), { status: 200, body: { proposedStartsAt: NEW } });
    await verifyRes(await proposalRoute(req({ method: "POST", body: { accept: true } }), p(b.id)), { status: 200, body: { status: "confirmed", startsAt: NEW, proposedStartsAt: null } });
  });
  it("the guest can say no", async () => {
    const b = await held();
    await proposeRoute(req({ method: "POST", admin: ADMIN, body: { startsAt: NEW } }), p(b.id));
    await verifyRes(await proposalRoute(req({ method: "POST", body: { accept: false } }), p(b.id)), { status: 200, body: { status: "declined" } });
  });
  it("offering needs the admin key (the guest can't move their own booking)", async () => {
    const b = await held();
    await verifyRes(await proposeRoute(req({ method: "POST", body: { startsAt: NEW } }), p(b.id)), { status: 401 });
  });
  it("only the guest can answer; others get 404, no cookie 401", async () => {
    const b = await held();
    await proposeRoute(req({ method: "POST", admin: ADMIN, body: { startsAt: NEW } }), p(b.id));
    await verifyRes(await proposalRoute(req({ method: "POST", visitor: THEM, body: { accept: true } }), p(b.id)), { status: 404 });
    await verifyRes(await proposalRoute(req({ method: "POST", visitor: null, body: { accept: true } }), p(b.id)), { status: 401 });
  });
  it("bad ids are 404 on both; bad input is 400", async () => {
    await verifyRes(await proposeRoute(req({ method: "POST", admin: ADMIN, body: { startsAt: NEW } }), p("x")), { status: 404 });
    await verifyRes(await proposalRoute(req({ method: "POST", body: { accept: true } }), p("x")), { status: 404 });
    const b = await held();
    await verifyRes(await proposeRoute(req({ method: "POST", admin: ADMIN, body: { startsAt: "soon" } }), p(b.id)), { status: 400, body: { error: "Pick a date and time" } });
    await verifyRes(await proposalRoute(req({ method: "POST", body: { accept: "yes" } }), p(b.id)), { status: 400, body: { error: "Say yes or no to the new time" } });
  });
});
