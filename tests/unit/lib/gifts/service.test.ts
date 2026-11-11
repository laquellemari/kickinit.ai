// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import {
  createGift, contributionBounds, checkContribution, addContribution, fundIfComplete, closeIfDue, closeDuePools, redeemGift,
  raisedCents, MIN_CONTRIBUTION_CENTS, type CreateGiftInput,
} from "@/lib/gifts/service";
import { getGift, insertGift, insertContribution, listContributions, transitionGift, setContributionStatus } from "@/lib/gifts/repo";
import { getBooking } from "@/lib/bookings/repo";
import { resetTokenCache } from "@/lib/paypal/client";
import { useTestDb } from "../../../helpers/db";
import { createNewGift, createNewContribution } from "../../../helpers/factories";
import { mockPayPal, pp, setPayPalEnv } from "../../../helpers/paypal";

const NOW = new Date("2026-11-11T12:00:00Z");
const HOUR = 3_600_000, DAY = 24 * HOUR;
const SANDBOX = "https://api-m.sandbox.paypal.com";
const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => (c as unknown as [string])[0].replace(SANDBOX, ""));
const auth = (value: string, o: Record<string, unknown> = {}) => ({ status: 201, body: pp.authorizedOrder({ amount: { value, currency_code: "USD" }, ...o }) });
const giftInput = (o: Partial<CreateGiftInput> = {}): CreateGiftInput => ({
  organizerId: "org", organizerName: "Kavon", experienceId: "hugh-spa", partySize: 2, recipientName: "Mom", note: "Happy 60th",
  mode: "pool", deadline: new Date(NOW.getTime() + 3 * DAY).toISOString(), now: NOW, ...o,
});

/** Checks the gift's status and how much is raised, held and captured. */
async function verifyGift(id: string, expected: { status: string; raisedCents: number; held: number; captured: number; voided: number }) {
  const g = (await getGift(id))!;
  const cs = await listContributions(id);
  expect(g.status).toBe(expected.status);
  expect(raisedCents(cs)).toBe(expected.raisedCents);
  expect(cs.filter((c) => c.status === "held")).toHaveLength(expected.held);
  expect(cs.filter((c) => c.status === "captured")).toHaveLength(expected.captured);
  expect(cs.filter((c) => c.status === "voided")).toHaveLength(expected.voided);
}

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); setPayPalEnv(); resetTokenCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("createGift", () => {
  it("pool: prices from the catalog, trims text, keeps the chosen deadline", async () => {
    const g = await createGift(giftInput({ organizerName: "  Kavon ", recipientName: " Mom ", note: "  Happy 60th " }));
    expect(g).toMatchObject({ status: "open", mode: "pool", amountCents: 19000, name: "Hugh Spa", organizerName: "Kavon", recipientName: "Mom", note: "Happy 60th", partySize: 2 });
    expect(g.deadline.getTime()).toBe(NOW.getTime() + 3 * DAY);
  });
  it("solo: deadline is a day to finish paying, and the note is optional", async () => {
    const g = await createGift(giftInput({ mode: "solo", deadline: undefined, note: undefined }));
    expect(g).toMatchObject({ mode: "solo", note: "" });
    expect(g.deadline.getTime()).toBe(NOW.getTime() + DAY);
  });
  it("defaults now to the current time", async () => {
    const g = await createGift(giftInput({ now: undefined, mode: "solo" }));
    expect(g.deadline.getTime()).toBeGreaterThan(Date.now());
  });
  it.each([
    ["no organizer name", { organizerName: " " }, 400, "Your name is required"],
    ["long organizer name", { organizerName: "x".repeat(61) }, 400, "Your name can be at most 60 characters"],
    ["no recipient", { recipientName: undefined }, 400, "Their name is required"],
    ["long note", { note: "x".repeat(501) }, 400, "The note can be at most 500 characters"],
    ["bad mode", { mode: "split" }, 400, "Choose to pay in full or start a group pool"],
    ["missing experience", { experienceId: "" }, 400, "Experience id is required"],
    ["unknown experience", { experienceId: "nope" }, 404, "Experience not found: nope"],
    ["party too big", { experienceId: "desuar-hollywood-spa", partySize: 3 }, 400, "Party size for DESUAR HOLLYWOOD SPA must be from 1 to 2"],
    ["pool with no deadline", { deadline: undefined }, 400, "Pick a pool deadline between 1 hour and 14 days from now"],
    ["pool deadline garbage", { deadline: "soon" }, 400, "Pick a pool deadline between 1 hour and 14 days from now"],
  ])("rejects %s", async (_l, o, status, message) => {
    await expect(createGift(giftInput(o as Partial<CreateGiftInput>))).rejects.toMatchObject({ status, message });
  });
  it("boundaries: deadline 1 hour and 14 days are allowed; 1 ms outside is not; 60/500 characters allowed", async () => {
    await expect(createGift(giftInput({ deadline: new Date(NOW.getTime() + HOUR).toISOString(), organizerName: "x".repeat(60), note: "y".repeat(500) }))).resolves.toBeDefined();
    await expect(createGift(giftInput({ deadline: new Date(NOW.getTime() + 14 * DAY).toISOString() }))).resolves.toBeDefined();
    await expect(createGift(giftInput({ deadline: new Date(NOW.getTime() + HOUR - 1).toISOString() }))).rejects.toThrow("Pick a pool deadline");
    await expect(createGift(giftInput({ deadline: new Date(NOW.getTime() + 14 * DAY + 1).toISOString() }))).rejects.toThrow("Pick a pool deadline");
  });
});

describe("contributionBounds / checkContribution", () => {
  it("pool: $5 to whatever's left; solo: exactly the full price", async () => {
    const pool = await insertGift(createNewGift());
    expect(contributionBounds(pool, [])).toEqual({ minCents: 500, maxCents: 19000 });
    await insertContribution(createNewContribution(pool.id, { amountCents: 16000 }));
    expect(contributionBounds(pool, await listContributions(pool.id))).toEqual({ minCents: 500, maxCents: 3000 });
    const solo = await insertGift(createNewGift({ mode: "solo" }));
    expect(contributionBounds(solo, [])).toEqual({ minCents: 19000, maxCents: 19000 });
  });
  it("released (voided) holds don't count toward the total", async () => {
    const g = await insertGift(createNewGift());
    const c = await insertContribution(createNewContribution(g.id, { amountCents: 10000 }));
    await setContributionStatus(c.id, "held", "voided");
    expect(contributionBounds(g, await listContributions(g.id)).maxCents).toBe(19000);
  });
  it("when less than $5 is left, the minimum drops to what's left", async () => {
    const g = await insertGift(createNewGift({ amountCents: 1000 }));
    await insertContribution(createNewContribution(g.id, { amountCents: 700 }));
    expect(contributionBounds(g, await listContributions(g.id))).toEqual({ minCents: 300, maxCents: 300 });
  });
  it("fully raised: nothing more can be added", async () => {
    const g = await insertGift(createNewGift({ amountCents: 1000 }));
    await insertContribution(createNewContribution(g.id, { amountCents: 1000 }));
    expect(contributionBounds(g, await listContributions(g.id))).toEqual({ minCents: 0, maxCents: 0 });
  });
  it.each([
    ["below $5", 499, "Chip in between $5.00 and $190.00"],
    ["above what's left", 19001, "Chip in between $5.00 and $190.00"],
    ["fractional cents", 500.5, "Chip in between $5.00 and $190.00"],
  ])("pool rejects %s", async (_l, cents, msg) => {
    const g = await insertGift(createNewGift());
    expect(() => checkContribution(g, [], cents, NOW)).toThrow(msg);
  });
  it("boundary: exactly $5 and exactly the remainder are accepted", async () => {
    const g = await insertGift(createNewGift());
    expect(() => checkContribution(g, [], MIN_CONTRIBUTION_CENTS, NOW)).not.toThrow();
    expect(() => checkContribution(g, [], 19000, NOW)).not.toThrow();
  });
  it("solo rejects anything but the full amount", async () => {
    const g = await insertGift(createNewGift({ mode: "solo" }));
    expect(() => checkContribution(g, [], 18999, NOW)).toThrow("The gift costs $190.00");
  });
  it("closed when past the deadline (boundary: exactly at the deadline is closed) or not open", async () => {
    const g = await insertGift(createNewGift({ deadline: NOW }));
    expect(() => checkContribution(g, [], 1000, NOW)).toThrow("This gift isn't taking contributions anymore");
    const f = await insertGift(createNewGift());
    const funded = (await transitionGift(f.id, ["open"], "funded"))!;
    expect(() => checkContribution(funded, [], 1000, NOW)).toThrow("This gift isn't taking contributions anymore");
  });
});

describe("addContribution", () => {
  it("partial: holds the money, gift stays open, nothing charged", async () => {
    const g = await insertGift(createNewGift({ deadline: new Date(NOW.getTime() + DAY) }));
    const f = mockPayPal({ status: 200, body: pp.token() }, auth("50.00"));
    const r = await addContribution({ giftId: g.id, orderId: "C1", name: " Ana ", contributorId: "f1", now: NOW });
    expect(r.contribution).toMatchObject({ name: "Ana", amountCents: 5000, status: "held", contributorId: "f1" });
    expect(r.gift.status).toBe("open");
    await verifyGift(g.id, { status: "open", raisedCents: 5000, held: 1, captured: 0, voided: 0 });
    expect(urls(f)).toEqual(["/v1/oauth2/token", "/v2/checkout/orders/C1/authorize"]);
  });
  it("the contribution that completes the pool charges every hold and funds the gift", async () => {
    const g = await insertGift(createNewGift({ deadline: new Date(NOW.getTime() + DAY) }));
    await insertContribution(createNewContribution(g.id, { amountCents: 14000, authorizationId: "A-EARLY" }));
    const f = mockPayPal({ status: 200, body: pp.token() }, auth("50.00", { id: "A-LAST" }), { status: 201, body: pp.capture({ id: "CAP1" }) }, { status: 201, body: pp.capture({ id: "CAP2" }) });
    const r = await addContribution({ giftId: g.id, orderId: "C2", name: "Ben", contributorId: "f2", now: NOW });
    expect(r.gift.status).toBe("funded");
    await verifyGift(g.id, { status: "funded", raisedCents: 19000, held: 0, captured: 2, voided: 0 });
    expect(urls(f).slice(2)).toEqual(["/v2/payments/authorizations/A-EARLY/capture", "/v2/payments/authorizations/A-LAST/capture"]);
  });
  it("solo: one full payment funds it immediately", async () => {
    const g = await insertGift(createNewGift({ mode: "solo", deadline: new Date(NOW.getTime() + DAY) }));
    mockPayPal({ status: 200, body: pp.token() }, auth("190.00"), { status: 201, body: pp.capture() });
    expect((await addContribution({ giftId: g.id, orderId: "S1", name: "Kavon", contributorId: "org", now: NOW })).gift.status).toBe("funded");
  });
  it("is idempotent per PayPal order", async () => {
    const g = await insertGift(createNewGift({ deadline: new Date(NOW.getTime() + DAY) }));
    mockPayPal({ status: 200, body: pp.token() }, auth("50.00"));
    const first = await addContribution({ giftId: g.id, orderId: "C1", name: "Ana", contributorId: "f1", now: NOW });
    const f = mockPayPal();
    const again = await addContribution({ giftId: g.id, orderId: "C1", name: "Ana", contributorId: "f1", now: NOW });
    expect(again.contribution.id).toBe(first.contribution.id);
    expect(f).not.toHaveBeenCalled();
  });
  describe("payment integrity: wrong amounts are released, nothing saved", () => {
    it.each([
      ["more than is left", auth("500.00")],
      ["below the minimum", auth("1.00")],
      ["no amount", { status: 201, body: pp.authorizedOrder({ amount: undefined }) }],
      ["a different currency", { status: 201, body: pp.authorizedOrder({ amount: { value: "50.00", currency_code: "EUR" } }) }],
    ])("%s", async (_l, authReply) => {
      const g = await insertGift(createNewGift({ deadline: new Date(NOW.getTime() + DAY) }));
      const f = mockPayPal({ status: 200, body: pp.token() }, authReply, { status: 204 });
      await expect(addContribution({ giftId: g.id, orderId: "C1", name: "Ana", contributorId: "f1", now: NOW })).rejects.toMatchObject({ status: 400 });
      expect(urls(f).at(-1)).toMatch(/\/void$/);
      await verifyGift(g.id, { status: "open", raisedCents: 0, held: 0, captured: 0, voided: 0 });
    });
    it("a pool that closed while you were in PayPal releases your hold", async () => {
      const g = await insertGift(createNewGift({ deadline: NOW }));
      mockPayPal({ status: 200, body: pp.token() }, auth("50.00"), { status: 204 });
      await expect(addContribution({ giftId: g.id, orderId: "C1", name: "Ana", contributorId: "f1", now: NOW })).rejects.toMatchObject({ status: 409 });
    });
  });
  it.each([
    ["missing order id", { orderId: "" }, 400, "Order id is required"],
    ["missing name", { name: "" }, 400, "Your name is required"],
    ["unknown gift", { giftId: "nope" }, 404, "Gift not found"],
  ])("validation: %s (PayPal not called)", async (_l, o, status, message) => {
    const g = await insertGift(createNewGift());
    const f = mockPayPal();
    await expect(addContribution({ giftId: g.id, orderId: "C1", name: "Ana", contributorId: "f1", now: NOW, ...o })).rejects.toMatchObject({ status, message });
    expect(f).not.toHaveBeenCalled();
  });
  it("access control: someone else's PayPal order can't be reused", async () => {
    const g = await insertGift(createNewGift());
    await insertContribution(createNewContribution(g.id, { paypalOrderId: "C1", contributorId: "owner" }));
    await expect(addContribution({ giftId: g.id, orderId: "C1", name: "X", contributorId: "intruder", now: NOW })).rejects.toMatchObject({ status: 409 });
    const other = await insertGift(createNewGift());
    await expect(addContribution({ giftId: other.id, orderId: "C1", name: "X", contributorId: "owner", now: NOW })).rejects.toMatchObject({ status: 409 });
  });
  it("if charging fails after the last hold, holds stay in place for a retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const g = await insertGift(createNewGift({ amountCents: 5000, deadline: new Date(NOW.getTime() + DAY) }));
    mockPayPal({ status: 200, body: pp.token() }, auth("50.00"), { status: 503, body: pp.error("SERVICE_UNAVAILABLE", "Down") });
    const r = await addContribution({ giftId: g.id, orderId: "C1", name: "Ana", contributorId: "f1", now: NOW });
    expect(r.gift.status).toBe("open");
    await verifyGift(g.id, { status: "open", raisedCents: 5000, held: 1, captured: 0, voided: 0 });
  });
  it("defaults now to the current time", async () => {
    const g = await insertGift(createNewGift({ deadline: new Date(Date.now() + DAY) }));
    mockPayPal({ status: 200, body: pp.token() }, auth("50.00"));
    expect((await addContribution({ giftId: g.id, orderId: "C9", name: "Ana", contributorId: "f1" })).contribution.status).toBe("held");
  });
});

describe("fundIfComplete", () => {
  it("does nothing when not fully raised, or already funded", async () => {
    const g = await insertGift(createNewGift());
    await insertContribution(createNewContribution(g.id, { amountCents: 100 }));
    const f = mockPayPal();
    expect((await fundIfComplete(g.id)).status).toBe("open");
    await transitionGift(g.id, ["open"], "funded");
    expect((await fundIfComplete(g.id)).status).toBe("funded");
    expect(f).not.toHaveBeenCalled();
  });
  it("if someone else funded it mid-way, returns the current gift", async () => {
    const g = await insertGift(createNewGift({ amountCents: 1000 }));
    const c = await insertContribution(createNewContribution(g.id, { amountCents: 1000 }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify(pp.token()), { status: 200 });
      await transitionGift(g.id, ["open"], "funded");
      return new Response(JSON.stringify(pp.capture()), { status: 201 });
    }));
    expect((await fundIfComplete(g.id)).status).toBe("funded");
    void c;
  });
});

describe("closeIfDue / closeDuePools (the deadline job)", () => {
  it("short of the goal at the deadline: every hold is released and the gift expires", async () => {
    const g = await insertGift(createNewGift({ deadline: NOW }));
    await insertContribution(createNewContribution(g.id, { amountCents: 5000, authorizationId: "A1" }));
    await insertContribution(createNewContribution(g.id, { amountCents: 6000, authorizationId: "A2" }));
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 204 }, { status: 204 });
    expect((await closeIfDue(g, NOW)).status).toBe("expired");
    await verifyGift(g.id, { status: "expired", raisedCents: 0, held: 0, captured: 0, voided: 2 });
    expect(urls(f).slice(1)).toEqual(["/v2/payments/authorizations/A1/void", "/v2/payments/authorizations/A2/void"]);
  });
  it("covered but not yet charged at the deadline: it gets funded, not expired", async () => {
    const g = await insertGift(createNewGift({ amountCents: 5000, deadline: NOW }));
    await insertContribution(createNewContribution(g.id, { amountCents: 5000 }));
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
    expect((await closeIfDue(g, NOW)).status).toBe("funded");
  });
  it("before the deadline, or not open: untouched", async () => {
    const f = mockPayPal();
    const g = await insertGift(createNewGift({ deadline: new Date(NOW.getTime() + 1) }));
    expect((await closeIfDue(g, NOW)).status).toBe("open");
    const done = (await transitionGift((await insertGift(createNewGift({ deadline: NOW }))).id, ["open"], "funded"))!;
    expect((await closeIfDue(done, NOW)).status).toBe("funded");
    expect(f).not.toHaveBeenCalled();
  });
  it("an empty pool just expires", async () => {
    const g = await insertGift(createNewGift({ deadline: NOW }));
    expect((await closeIfDue(g, NOW)).status).toBe("expired");
  });
  it("if it changed mid-way, returns the current state", async () => {
    const g = await insertGift(createNewGift({ deadline: NOW }));
    await insertContribution(createNewContribution(g.id));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify(pp.token()), { status: 200 });
      await transitionGift(g.id, ["open"], "expired");
      return new Response(null, { status: 204 });
    }));
    expect((await closeIfDue(g, NOW)).status).toBe("expired");
  });
  it("closeDuePools counts funded, expired and failures, and keeps going after a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const covered = await insertGift(createNewGift({ amountCents: 1000, deadline: new Date(NOW.getTime() - 3) }));
    await insertContribution(createNewContribution(covered.id, { amountCents: 1000, authorizationId: "OK" }));
    const broken = await insertGift(createNewGift({ deadline: new Date(NOW.getTime() - 2) }));
    await insertContribution(createNewContribution(broken.id, { authorizationId: "BAD" }));
    await insertGift(createNewGift({ deadline: new Date(NOW.getTime() - 1) })); // empty → expires
    await insertGift(createNewGift({ deadline: new Date(NOW.getTime() + DAY) })); // not due
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify(pp.token()), { status: 200 });
      if (url.includes("/BAD/")) return new Response(JSON.stringify(pp.error("INTERNAL", "x")), { status: 500 });
      return new Response(JSON.stringify(pp.capture()), { status: 201 });
    }));
    expect(await closeDuePools(NOW)).toEqual({ checked: 3, funded: 1, expired: 1, failed: 1 });
  });
  it("closeDuePools defaults now to the current time", async () => {
    expect(await closeDuePools()).toEqual({ checked: 0, funded: 0, expired: 0, failed: 0 });
  });
});

describe("redeemGift", () => {
  const SAT = new Date(NOW.getTime() + 3 * DAY).toISOString();
  it("turns a funded gift into a confirmed booking for the recipient, once", async () => {
    const g = await insertGift(createNewGift());
    await transitionGift(g.id, ["open"], "funded");
    const f = mockPayPal();
    const r = await redeemGift({ code: g.redeemCode, userId: "mom", startsAt: SAT, now: NOW });
    expect(r.gift).toMatchObject({ status: "redeemed", bookingId: r.booking.id });
    expect(r.booking).toMatchObject({ status: "confirmed", userId: "mom", itemId: "hugh-spa", amount: "190.00", partySize: 2, paypalOrderId: `gift:${g.id}` });
    expect(r.booking.facts).toMatchObject({ city: "Los Angeles", neighborhood: "Pico-Union", tags: ["wellness", "spa", "bathhouse", "sauna", "korean_spa"] });
    expect((await getBooking(r.booking.id))?.status).toBe("confirmed");
    expect(f).not.toHaveBeenCalled(); // already paid by the givers
    await expect(redeemGift({ code: g.redeemCode, userId: "mom", startsAt: SAT, now: NOW })).rejects.toMatchObject({ status: 409, message: "This gift has already been redeemed" });
  });
  it.each([
    ["open", 409, "This gift is still being funded"],
    ["expired", 410, "This gift pool closed before it was fully funded"],
  ])("a gift that is %s can't be redeemed", async (status, code, message) => {
    const g = await insertGift(createNewGift());
    if (status !== "open") await transitionGift(g.id, ["open"], status as "expired");
    await expect(redeemGift({ code: g.redeemCode, userId: "mom", startsAt: SAT, now: NOW })).rejects.toMatchObject({ status: code, message });
  });
  it("unknown code → 404; bad time → 400 (and the gift stays redeemable)", async () => {
    await expect(redeemGift({ code: "nope", userId: "mom", startsAt: SAT, now: NOW })).rejects.toMatchObject({ status: 404 });
    const g = await insertGift(createNewGift());
    await transitionGift(g.id, ["open"], "funded");
    await expect(redeemGift({ code: g.redeemCode, userId: "mom", startsAt: "soon", now: NOW })).rejects.toMatchObject({ status: 400 });
    expect((await getGift(g.id))?.status).toBe("funded");
  });
  it("two redeems racing: only one wins", async () => {
    const g = await insertGift(createNewGift());
    await transitionGift(g.id, ["open"], "funded");
    const results = await Promise.allSettled([
      redeemGift({ code: g.redeemCode, userId: "a", startsAt: SAT, now: NOW }),
      redeemGift({ code: g.redeemCode, userId: "b", startsAt: SAT, now: NOW }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("defaults now to the current time", async () => {
    const g = await insertGift(createNewGift());
    await transitionGift(g.id, ["open"], "funded");
    await expect(redeemGift({ code: g.redeemCode, userId: "m", startsAt: "2000-01-01T00:00:00Z" })).rejects.toThrow("at least an hour");
  });
});
