// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { placeBooking, requestFreeBooking, confirmBooking, declineBooking, proposeTime, answerProposal, parseStartsAt, BookingError, LIVE_MAX_DAYS, MAX_UPCOMING_FREE, type PlaceBookingInput } from "@/lib/bookings/service";
import { getBooking, getBookingByOrder, insertBooking, markCheckedIn, transition } from "@/lib/bookings/repo";
import { resetTokenCache } from "@/lib/paypal/client";
import { saveMenu } from "@/lib/pricing/menu-store";
import { useTestDb } from "../../../helpers/db";
import { createNewBooking } from "../../../helpers/factories";
import { verifyBooking } from "../../../helpers/verification";
import { mockPayPal, pp, setPayPalEnv } from "../../../helpers/paypal";

const NOW = new Date("2026-11-11T12:00:00Z");
const SAT = "2026-11-14T19:30:00.000Z";
const DAY = 86_400_000;
/** Hugh Spa for 2: $190 venue price + $38 concierge fee. */
const input = (o: Partial<PlaceBookingInput> = {}): PlaceBookingInput => ({
  orderId: "ORDER-1", kind: "partner", itemId: "hugh-spa", partySize: 2, startsAt: SAT, userId: "u1", now: NOW, ...o,
});
const SANDBOX = "https://api-m.sandbox.paypal.com";
const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => (c as unknown as [string])[0].replace(SANDBOX, ""));
const held = (value = "228.00", o: Record<string, unknown> = {}) => pp.authorizedOrder({ amount: { value, currency_code: "USD" }, ...o });
const gSpa = { id: "ChIJ1", displayName: { text: "Spa Uno" }, primaryType: "spa", location: { latitude: 1, longitude: 2 } };
const gDiner = { id: "ChIJ2", displayName: { text: "Barbusa" }, primaryType: "italian_restaurant", location: { latitude: 1, longitude: 2 } };
/** Spa Uno publishes a $150 massage: for 2, $300 + $60 fee. */
const liveInput = (o: Partial<PlaceBookingInput> = {}) => input({ kind: "live", itemId: "gp:ChIJ1", serviceId: "massage-150", ...o });
const seedMenu = () => saveMenu("ChIJ1", { items: [{ id: "massage-150", name: "60-minute massage", price: "150.00", per: "person", durationMinutes: 60, sourceUrl: "https://spauno.com/prices" }], checkedAt: new Date() });

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); setPayPalEnv(); vi.stubEnv("GOOGLE_PLACES_API_KEY", "g"); resetTokenCache(); await seedMenu(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("placeBooking (paid)", () => {
  describe("happy path", () => {
    it("partner (instant book): authorizes venue price + fee, checks the amount, saves, captures → confirmed", async () => {
      const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: held() }, { status: 201, body: pp.capture() });
      const b = await placeBooking(input());
      verifyBooking(b, { status: "confirmed", kind: "partner", itemId: "hugh-spa", name: "Hugh Spa", amount: "228.00", partySize: 2, paypalOrderId: "ORDER-1", authorizationId: "0AW2184448108334S", captureId: "7TK53561YB803214S", userId: "u1" });
      expect(b).toMatchObject({ fee: "38.00", serviceName: null });
      expect(b.startsAt.toISOString()).toBe(SAT);
      expect(b.holdExpiresAt?.toISOString()).toBe("2026-12-12T21:20:49.000Z");
      expect(urls(f)).toEqual(["/v1/oauth2/token", "/v2/checkout/orders/ORDER-1/authorize", "/v2/payments/authorizations/0AW2184448108334S/capture"]);
    });
    it("members: venue price only, no fee", async () => {
      mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: held("190.00") }, { status: 201, body: pp.capture() });
      expect(await placeBooking(input({ member: true }))).toMatchObject({ amount: "190.00", fee: "0.00", status: "confirmed" });
    });
    it("live: the venue's published price, held until we confirm with the venue (no capture)", async () => {
      const f = mockPayPal({ status: 200, body: gSpa }, { status: 200, body: pp.token() }, { status: 201, body: held("360.00") });
      const b = await placeBooking(liveInput());
      verifyBooking(b, { status: "held", kind: "live", itemId: "gp:ChIJ1", name: "Spa Uno", amount: "360.00", captureId: null });
      expect(b).toMatchObject({ fee: "60.00", serviceName: "60-minute massage" });
      expect(urls(f).filter((u) => u.includes("capture"))).toEqual([]);
    });
    it("a hold with no expiry from PayPal is saved with a null expiry", async () => {
      mockPayPal({ status: 200, body: gSpa }, { status: 200, body: pp.token() }, { status: 201, body: held("360.00", { expiration_time: undefined }) });
      verifyBooking(await placeBooking(liveInput()), { status: "held", holdExpiresAt: null });
    });
    it("is idempotent: retrying the same PayPal order returns the same booking without calling PayPal", async () => {
      mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: held() }, { status: 201, body: pp.capture() });
      const first = await placeBooking(input());
      const f = mockPayPal();
      const again = await placeBooking(input());
      expect(again.id).toBe(first.id);
      expect(f).not.toHaveBeenCalled();
    });
    it("if the instant capture fails, the booking stays held (money still on hold) and it's logged", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: held() }, { status: 503, body: pp.error("SERVICE_UNAVAILABLE", "Down") });
      verifyBooking(await placeBooking(input()), { status: "held", captureId: null });
      expect(log).toHaveBeenCalled();
    });
  });

  describe("validation (PayPal is never called)", () => {
    it.each([
      ["missing order id", { orderId: "" }, 400, "Order id is required"],
      ["a free order id", { orderId: "free:abc" }, 400, "Order id is invalid"],
      ["missing time", { startsAt: undefined }, 400, "Pick a date and time"],
      ["garbage time", { startsAt: "soon" }, 400, "Pick a date and time"],
      ["time in the past", { startsAt: "2026-11-10T19:00:00Z" }, 400, "Pick a time at least an hour from now"],
      ["bad kind", { kind: "x" }, 400, "Kind must be partner or live"],
      ["unknown partner", { itemId: "nope" }, 404, "Experience not found: nope"],
      ["party too big for the venue", { itemId: "desuar-hollywood-spa", partySize: 3 }, 400, "Party size for DESUAR HOLLYWOOD SPA must be from 1 to 2"],
      ["a restaurant (free to book)", { itemId: "carasau-pasta-bar" }, 400, "Restaurants and bars are free to book, so there's nothing to pay"],
      ["live with no service picked", { kind: "live", itemId: "gp:ChIJ1" }, 400, "Pick one of the venue's listed prices"],
    ])("%s", async (_l, o, status, msg) => {
      const f = mockPayPal({ status: 200, body: gSpa });
      await expect(placeBooking(input(o as Partial<PlaceBookingInput>))).rejects.toMatchObject({ status, message: msg });
      expect(urls(f).some((u) => u.includes("paypal") || u.startsWith("/v"))).toBe(false);
    });
    it("other errors pass through unchanged (e.g. Google is down)", async () => {
      mockPayPal({ status: 500, body: { error: { status: "INTERNAL", message: "boom" } } });
      await expect(placeBooking(liveInput())).rejects.toMatchObject({ name: "PlacesError" });
    });
  });

  describe("payment integrity", () => {
    it.each([
      ["a different amount", { amount: { value: "0.01", currency_code: "USD" } }],
      ["the venue price without the fee", { amount: { value: "190.00", currency_code: "USD" } }],
      ["a different currency", { amount: { value: "228.00", currency_code: "EUR" } }],
      ["no amount", { amount: undefined }],
    ])("PayPal holding %s → hold released, nothing saved", async (_l, auth) => {
      const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder(auth) }, { status: 204 });
      await expect(placeBooking(input())).rejects.toMatchObject({ status: 400, message: "The payment amount doesn't match the price, so we released the hold" });
      expect(urls(f).at(-1)).toBe("/v2/payments/authorizations/0AW2184448108334S/void");
      expect(await getBookingByOrder("ORDER-1")).toBeNull();
    });
  });

  describe("access control", () => {
    it("someone else's PayPal order can't be claimed", async () => {
      await insertBooking(createNewBooking({ userId: "owner", paypalOrderId: "ORDER-1" }));
      await expect(placeBooking(input({ userId: "intruder" }))).rejects.toMatchObject({ status: 409, message: "This payment belongs to another booking" });
    });
  });

  describe("request-to-book date window", () => {
    it("dates beyond 28 days are refused before PayPal holds anything", async () => {
      expect(LIVE_MAX_DAYS).toBe(28);
      const f = mockPayPal({ status: 200, body: gSpa });
      await expect(placeBooking(liveInput({ startsAt: new Date(NOW.getTime() + 28 * DAY + 1).toISOString() })))
        .rejects.toMatchObject({ status: 400, message: "Request-to-book dates open up to 28 days ahead" });
      expect(urls(f).some((u) => u.includes("/authorize"))).toBe(false);
    });
    it("boundary: exactly 28 days ahead is fine; partners can still book 89 days out", async () => {
      mockPayPal({ status: 200, body: gSpa }, { status: 200, body: pp.token() }, { status: 201, body: held("360.00") });
      await expect(placeBooking(liveInput({ startsAt: new Date(NOW.getTime() + 28 * DAY).toISOString() }))).resolves.toMatchObject({ kind: "live" });
      resetTokenCache();
      mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: held() }, { status: 201, body: pp.capture() });
      await expect(placeBooking(input({ orderId: "ORD-P89", startsAt: new Date(NOW.getTime() + 89 * DAY).toISOString() }))).resolves.toMatchObject({ kind: "partner" });
    });
  });
});

describe("requestFreeBooking (restaurants and bars)", () => {
  const free = (o: Partial<PlaceBookingInput> = {}) => {
    const rest: Partial<PlaceBookingInput> = input({ itemId: "carasau-pasta-bar", ...o });
    delete rest.orderId;
    return rest as Omit<PlaceBookingInput, "orderId">;
  };
  it("a partner restaurant: confirmed straight away, nothing paid, no PayPal", async () => {
    const f = mockPayPal();
    const b = await requestFreeBooking(free());
    verifyBooking(b, { status: "confirmed", kind: "partner", itemId: "carasau-pasta-bar", amount: "0.00", authorizationId: "", captureId: null, holdExpiresAt: null });
    expect(b.paypalOrderId).toMatch(/^free:[0-9a-f-]{36}$/);
    expect(b.fee).toBe("0.00");
    expect(f).not.toHaveBeenCalled();
  });
  it("any other restaurant: a request our concierge confirms with the venue", async () => {
    mockPayPal({ status: 200, body: gDiner });
    verifyBooking(await requestFreeBooking(free({ kind: "live", itemId: "gp:ChIJ2" })), { status: "held", kind: "live", name: "Barbusa", amount: "0.00" });
  });
  it("defaults now to the current time", async () => {
    await expect(requestFreeBooking({ ...free(), now: undefined, startsAt: "2000-01-01T00:00:00Z" })).rejects.toThrow("at least an hour");
  });
  it.each([
    ["a paid experience", { itemId: "hugh-spa" }, 400, "This booking is paid with PayPal"],
    ["no time", { startsAt: undefined }, 400, "Pick a date and time"],
    ["unknown partner", { itemId: "nope" }, 404, "Experience not found: nope"],
  ])("%s → %i", async (_l, o, status, msg) => {
    await expect(requestFreeBooking(free(o as Partial<PlaceBookingInput>))).rejects.toMatchObject({ status, message: msg });
  });
  it(`boundary: ${MAX_UPCOMING_FREE} upcoming free bookings are allowed, the next is refused (429)`, async () => {
    for (let i = 0; i < MAX_UPCOMING_FREE; i++) await requestFreeBooking(free());
    await expect(requestFreeBooking(free())).rejects.toMatchObject({ status: 429, message: `You already have ${MAX_UPCOMING_FREE} upcoming restaurant bookings. Check in or wait for one to pass first` });
  });
  it("past, attended, declined and paid bookings don't count toward the limit, nor other visitors'", async () => {
    for (let i = 0; i < MAX_UPCOMING_FREE - 1; i++) await requestFreeBooking(free());
    const attended = await requestFreeBooking(free());
    await markCheckedIn(attended.id, NOW);
    const declined = await insertBooking(createNewBooking({ userId: "u1", paypalOrderId: "free:d", startsAt: new Date(SAT) }));
    await transition(declined.id, ["held"], "declined");
    await insertBooking(createNewBooking({ userId: "u1", paypalOrderId: "free:past", startsAt: new Date("2026-11-01T00:00:00Z") }));
    await insertBooking(createNewBooking({ userId: "u1", paypalOrderId: "PAID-1", startsAt: new Date(SAT) }));
    await insertBooking(createNewBooking({ userId: "u2", paypalOrderId: "free:other", startsAt: new Date(SAT) }));
    await expect(requestFreeBooking(free())).resolves.toMatchObject({ status: "confirmed" });
  });
});

describe("parseStartsAt boundaries", () => {
  const HOUR = 3_600_000, DAY = 24 * HOUR;
  it("exactly 1 hour ahead is allowed; 1 ms less is not", () => {
    expect(parseStartsAt(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBeInstanceOf(Date);
    expect(() => parseStartsAt(new Date(NOW.getTime() + HOUR - 1).toISOString(), NOW)).toThrow("at least an hour");
  });
  it("exactly 90 days ahead is allowed; 1 ms more is not", () => {
    expect(parseStartsAt(new Date(NOW.getTime() + 90 * DAY).toISOString(), NOW)).toBeInstanceOf(Date);
    expect(() => parseStartsAt(new Date(NOW.getTime() + 90 * DAY + 1).toISOString(), NOW)).toThrow("up to 90 days ahead");
  });
  it("defaults now to the current time", async () => {
    const f = mockPayPal();
    await expect(placeBooking({ ...input(), now: undefined, startsAt: "2000-01-01T00:00:00Z" })).rejects.toThrow("at least an hour");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("confirmBooking / declineBooking (venue's answer)", () => {
  it("confirm a paid request-to-book: the exact price is captured now", async () => {
    const b = await insertBooking(createNewBooking({ kind: "live", itemId: "gp:ChIJ1", authorizationId: "AUTHL", fee: "60.00" }));
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture({ id: "CAPL" }) });
    verifyBooking(await confirmBooking(b.id), { status: "confirmed", captureId: "CAPL" });
    expect(urls(f)[1]).toBe("/v2/payments/authorizations/AUTHL/capture");
  });
  it("confirm or decline a free booking: no PayPal at all", async () => {
    const f = mockPayPal();
    const a = await insertBooking(createNewBooking({ kind: "live", paypalOrderId: "free:a", authorizationId: "", amount: "0.00" }));
    const b = await insertBooking(createNewBooking({ kind: "live", paypalOrderId: "free:b", authorizationId: "", amount: "0.00" }));
    verifyBooking(await confirmBooking(a.id), { status: "confirmed", captureId: null });
    verifyBooking(await declineBooking(b.id), { status: "declined" });
    expect(f).not.toHaveBeenCalled();
  });
  it("confirm a free booking that changes mid-call → 409", async () => {
    const b = await insertBooking(createNewBooking({ kind: "live", itemId: "gp:ChIJ2", paypalOrderId: "free:race", authorizationId: "" }));
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    const orig = db.query.bind(db);
    vi.spyOn(db, "query").mockImplementation(async (...a: Parameters<typeof db.query>) => {
      if (String(a[0]).includes("SET status")) await orig("UPDATE bookings SET status = 'declined' WHERE id = $1", [b.id]);
      return orig(...a);
    });
    await expect(confirmBooking(b.id)).rejects.toMatchObject({ status: 409, message: "Booking changed while confirming" });
  });
  it("confirm a partner: captures with a stable idempotency key → confirmed", async () => {
    const b = await insertBooking(createNewBooking({ kind: "partner", authorizationId: "AUTHX" }));
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture({ id: "CAPX" }) });
    verifyBooking(await confirmBooking(b.id), { status: "confirmed", captureId: "CAPX" });
    expect(new Headers((f.mock.calls[1] as unknown as [string, RequestInit])[1].headers).get("paypal-request-id")).toBe(`capture-${b.id}`);
  });
  it("decline: voids → declined, nothing charged", async () => {
    const b = await insertBooking(createNewBooking({ authorizationId: "AUTHY" }));
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 204 });
    verifyBooking(await declineBooking(b.id), { status: "declined", captureId: null });
    expect(urls(f)[1]).toBe("/v2/payments/authorizations/AUTHY/void");
  });
  it.each([["confirm", confirmBooking], ["decline", declineBooking]] as const)("%s: unknown booking → 404", async (_l, fn) => {
    await expect(fn("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404, message: "Booking not found" });
  });
  it.each([["confirm", confirmBooking], ["decline", declineBooking]] as const)("%s: already-final booking → 409, PayPal not called", async (_l, fn) => {
    const b = await insertBooking(createNewBooking());
    await transition(b.id, ["held"], "declined");
    const f = mockPayPal();
    await expect(fn(b.id)).rejects.toMatchObject({ status: 409, message: "Booking is already declined" });
    expect(f).not.toHaveBeenCalled();
  });
  it("a PayPal failure leaves the booking held so it can be retried", async () => {
    const b = await insertBooking(createNewBooking());
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: pp.error("AUTHORIZATION_EXPIRED", "Expired") });
    await expect(confirmBooking(b.id)).rejects.toMatchObject({ issue: "AUTHORIZATION_EXPIRED" });
    verifyBooking(await getBooking(b.id), { status: "held" });
  });
  it.each([["confirm", confirmBooking, "Booking changed while confirming", { status: 201, body: pp.capture() }], ["decline", declineBooking, "Booking changed while declining", { status: 204 }]] as const)(
    "%s: a race where the booking changes mid-call → 409",
    async (_l, fn, msg, paypalReply) => {
      const b = await insertBooking(createNewBooking());
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify(pp.token()), { status: 200 });
        await transition(b.id, ["held"], "declined"); // someone else finishes first
        return new Response("body" in paypalReply ? JSON.stringify(paypalReply.body) : null, { status: paypalReply.status });
      }));
      await expect(fn(b.id)).rejects.toMatchObject({ status: 409, message: msg });
    },
  );
  it("BookingError carries a status", () => {
    expect(new BookingError(418, "x")).toMatchObject({ name: "BookingError", status: 418, message: "x" });
  });
});


describe("offering another time (the venue can't do the requested one)", () => {
  const REQ = new Date("2026-11-14T19:30:00Z");
  const NEW = "2026-11-14T21:00:00.000Z";
  const heldLive = (o: Parameters<typeof createNewBooking>[0] = {}) =>
    insertBooking(createNewBooking({ userId: "u1", kind: "live", itemId: "gp:ChIJ1", authorizationId: "AUTHL", amount: "360.00", startsAt: REQ, ...o }));

  it("the desk offers a time: saved on the booking, nothing charged", async () => {
    const b = await heldLive();
    const f = mockPayPal();
    const offered = await proposeTime({ id: b.id, startsAt: NEW, now: NOW });
    expect(offered).toMatchObject({ status: "held", proposedStartsAt: new Date(NEW), startsAt: REQ });
    expect(f).not.toHaveBeenCalled();
  });
  it("the guest takes it: the time moves (local hour too), and the exact price is charged now", async () => {
    const b = await heldLive();
    await proposeTime({ id: b.id, startsAt: NEW, now: NOW });
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture({ id: "CAPN" }) });
    const done = await answerProposal({ id: b.id, userId: "u1", accept: true });
    verifyBooking(done, { status: "confirmed", captureId: "CAPN" });
    expect(done.startsAt.toISOString()).toBe(NEW);
    expect(done.proposedStartsAt).toBeNull();
    expect(done.facts.localHour).toBe(21);
    expect(urls(f)[1]).toBe("/v2/payments/authorizations/AUTHL/capture");
  });
  it("the local hour wraps past midnight, and earlier times move it back", async () => {
    const late = await heldLive({ facts: { tags: [], city: "", country: "US", neighborhood: null, cuisine: null, localHour: 23 } });
    await proposeTime({ id: late.id, startsAt: "2026-11-14T21:30:00Z", now: NOW });
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
    expect((await answerProposal({ id: late.id, userId: "u1", accept: true })).facts.localHour).toBe(1);
    resetTokenCache();
    const early = await heldLive({ facts: { tags: [], city: "", country: "US", neighborhood: null, cuisine: null, localHour: 1 } });
    await proposeTime({ id: early.id, startsAt: "2026-11-14T17:30:00Z", now: NOW });
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
    expect((await answerProposal({ id: early.id, userId: "u1", accept: true })).facts.localHour).toBe(23);
  });
  it("the guest says no: the hold is released, nothing charged", async () => {
    const b = await heldLive();
    await proposeTime({ id: b.id, startsAt: NEW, now: NOW });
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 204 });
    verifyBooking(await answerProposal({ id: b.id, userId: "u1", accept: false }), { status: "declined" });
    expect(urls(f)[1]).toBe("/v2/payments/authorizations/AUTHL/void");
  });
  it("free restaurant requests work the same, with no PayPal", async () => {
    const b = await heldLive({ paypalOrderId: "free:x", authorizationId: "", amount: "0.00" });
    await proposeTime({ id: b.id, startsAt: NEW, now: NOW });
    const f = mockPayPal();
    verifyBooking(await answerProposal({ id: b.id, userId: "u1", accept: true }), { status: "confirmed", captureId: null });
    expect(f).not.toHaveBeenCalled();
  });
  describe("offer validation", () => {
    it.each([
      ["no time", undefined, 400, "Pick a date and time"],
      ["in the past", "2026-11-10T19:00:00Z", 400, "Pick a time at least an hour from now"],
      ["the same time", REQ.toISOString(), 400, "Offer a different time from the one requested"],
    ])("%s", async (_l, at, status, msg) => {
      const b = await heldLive();
      await expect(proposeTime({ id: b.id, startsAt: at, now: NOW })).rejects.toMatchObject({ status, message: msg });
    });
    it("unknown booking → 404; already answered → 409", async () => {
      await expect(proposeTime({ id: "00000000-0000-0000-0000-000000000000", startsAt: NEW, now: NOW })).rejects.toMatchObject({ status: 404 });
      const b = await heldLive();
      await transition(b.id, ["held"], "confirmed");
      await expect(proposeTime({ id: b.id, startsAt: NEW, now: NOW })).rejects.toMatchObject({ status: 409, message: "Booking is already confirmed" });
    });
    it(`boundary: a paid request can be moved up to ${LIVE_MAX_DAYS} days after it was made, not past it (PayPal's hold window)`, async () => {
      const b = await heldLive();
      const edge = new Date(b.createdAt.getTime() + LIVE_MAX_DAYS * DAY);
      await expect(proposeTime({ id: b.id, startsAt: new Date(edge.getTime() + 60_000).toISOString(), now: new Date(b.createdAt) })).rejects.toMatchObject({ status: 400, message: `Offer a time within ${LIVE_MAX_DAYS} days of the request` });
      await expect(proposeTime({ id: b.id, startsAt: edge.toISOString(), now: new Date(b.createdAt) })).resolves.toMatchObject({ proposedStartsAt: edge });
    });
    it("partners and free bookings aren't limited to the hold window", async () => {
      const p = await insertBooking(createNewBooking({ userId: "u1", kind: "partner", startsAt: REQ }));
      const far = new Date(p.createdAt.getTime() + 60 * DAY).toISOString();
      await expect(proposeTime({ id: p.id, startsAt: far, now: new Date(p.createdAt) })).resolves.toMatchObject({ status: "held" });
      const free = await heldLive({ paypalOrderId: "free:far", authorizationId: "" });
      await expect(proposeTime({ id: free.id, startsAt: far, now: new Date(free.createdAt) })).resolves.toMatchObject({ status: "held" });
    });
    it("defaults now to the current time", async () => {
      const b = await heldLive();
      await expect(proposeTime({ id: b.id, startsAt: "2000-01-01T00:00:00Z" })).rejects.toThrow("at least an hour");
    });
    it("a race where the booking is answered mid-offer → 409", async () => {
      const b = await heldLive();
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      const orig = db.query.bind(db);
      vi.spyOn(db, "query").mockImplementation(async (...a: Parameters<typeof db.query>) => {
        if (String(a[0]).includes("SET proposed_starts_at")) await orig("UPDATE bookings SET status = 'declined' WHERE id = $1", [b.id]);
        return orig(...a);
      });
      await expect(proposeTime({ id: b.id, startsAt: NEW, now: NOW })).rejects.toMatchObject({ status: 409, message: "Booking changed while offering a time" });
    });
  });
  describe("answer validation and access", () => {
    it.each([undefined, "yes", 1])("accept must be true or false (%j)", async (accept) => {
      const b = await heldLive();
      await proposeTime({ id: b.id, startsAt: NEW, now: NOW });
      await expect(answerProposal({ id: b.id, userId: "u1", accept })).rejects.toMatchObject({ status: 400, message: "Say yes or no to the new time" });
    });
    it("someone else's booking, or an unknown one → 404", async () => {
      const b = await heldLive();
      await proposeTime({ id: b.id, startsAt: NEW, now: NOW });
      await expect(answerProposal({ id: b.id, userId: "intruder", accept: true })).rejects.toMatchObject({ status: 404 });
      await expect(answerProposal({ id: "00000000-0000-0000-0000-000000000000", userId: "u1", accept: true })).rejects.toMatchObject({ status: 404 });
    });
    it("no offer waiting → 409", async () => {
      const b = await heldLive();
      await expect(answerProposal({ id: b.id, userId: "u1", accept: true })).rejects.toMatchObject({ status: 409, message: "There's no new time waiting for an answer" });
    });
    it("a race where the offer disappears mid-answer → 409", async () => {
      const b = await heldLive();
      await proposeTime({ id: b.id, startsAt: NEW, now: NOW });
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      const orig = db.query.bind(db);
      vi.spyOn(db, "query").mockImplementation(async (...a: Parameters<typeof db.query>) => {
        if (String(a[0]).includes("proposed_starts_at = NULL")) await orig("UPDATE bookings SET proposed_starts_at = NULL WHERE id = $1", [b.id]);
        return orig(...a);
      });
      await expect(answerProposal({ id: b.id, userId: "u1", accept: true })).rejects.toMatchObject({ status: 409, message: "Booking changed while taking the new time" });
    });
  });
});
