// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { placeBooking, confirmBooking, declineBooking, parseStartsAt, BookingError, type PlaceBookingInput } from "@/lib/bookings/service";
import { getBooking, getBookingByOrder, insertBooking, transition } from "@/lib/bookings/repo";
import { resetTokenCache } from "@/lib/paypal/client";
import { useTestDb } from "../../../helpers/db";
import { createNewBooking } from "../../../helpers/factories";
import { verifyBooking } from "../../../helpers/verification";
import { mockPayPal, pp, setPayPalEnv } from "../../../helpers/paypal";

const NOW = new Date("2026-11-11T12:00:00Z");
const SAT = "2026-11-14T19:30:00.000Z";
const input = (o: Partial<PlaceBookingInput> = {}): PlaceBookingInput => ({
  orderId: "ORDER-1", kind: "partner", itemId: "marea", partySize: 2, startsAt: SAT, userId: "u1", now: NOW, ...o,
});
const SANDBOX = "https://api-m.sandbox.paypal.com";
const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => (c as unknown as [string])[0].replace(SANDBOX, ""));
const gPlace = { id: "ChIJ1", displayName: { text: "Barbusa" }, primaryType: "italian_restaurant", location: { latitude: 1, longitude: 2 } };

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); setPayPalEnv(); vi.stubEnv("GOOGLE_PLACES_API_KEY", "g"); resetTokenCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("placeBooking", () => {
  describe("happy path", () => {
    it("partner (instant book): authorizes, checks the amount, saves, captures → confirmed", async () => {
      const f = mockPayPal(
        { status: 200, body: pp.token() },
        { status: 201, body: pp.authorizedOrder() },
        { status: 201, body: pp.capture() },
      );
      const b = await placeBooking(input());
      verifyBooking(b, { status: "confirmed", kind: "partner", itemId: "marea", name: "Ristorante Marea", amount: "180.00", partySize: 2, paypalOrderId: "ORDER-1", authorizationId: "0AW2184448108334S", captureId: "7TK53561YB803214S", userId: "u1" });
      expect(b.startsAt.toISOString()).toBe(SAT);
      expect(b.holdExpiresAt?.toISOString()).toBe("2026-12-12T21:20:49.000Z");
      expect(urls(f)).toEqual(["/v1/oauth2/token", "/v2/checkout/orders/ORDER-1/authorize", "/v2/payments/authorizations/0AW2184448108334S/capture"]);
    });

    it("live (request to book): prices from Google, authorizes, stays held, no capture", async () => {
      const f = mockPayPal(
        { status: 200, body: gPlace },
        { status: 200, body: pp.token() },
        { status: 201, body: pp.authorizedOrder({ amount: { value: "120.00", currency_code: "USD" } }) },
      );
      const b = await placeBooking(input({ kind: "live", itemId: "gp:ChIJ1" }));
      verifyBooking(b, { status: "held", kind: "live", itemId: "gp:ChIJ1", name: "Barbusa", amount: "120.00", captureId: null });
      expect(urls(f).filter((u) => u.includes("capture"))).toEqual([]);
    });

    it("a hold with no expiry from PayPal is saved with a null expiry", async () => {
      mockPayPal({ status: 200, body: gPlace }, { status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder({ amount: { value: "120.00", currency_code: "USD" }, expiration_time: undefined }) });
      verifyBooking(await placeBooking(input({ kind: "live", itemId: "gp:ChIJ1" })), { status: "held", holdExpiresAt: null });
    });

    it("is idempotent: retrying the same PayPal order returns the same booking without calling PayPal", async () => {
      mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder() }, { status: 201, body: pp.capture() });
      const first = await placeBooking(input());
      const f = mockPayPal();
      const again = await placeBooking(input());
      expect(again.id).toBe(first.id);
      expect(f).not.toHaveBeenCalled();
    });

    it("if the instant capture fails, the booking stays held (money still on hold) and it's logged", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder() }, { status: 503, body: pp.error("SERVICE_UNAVAILABLE", "Down") });
      verifyBooking(await placeBooking(input()), { status: "held", captureId: null });
      expect(log).toHaveBeenCalled();
    });
  });

  describe("validation (PayPal is never called)", () => {
    it.each([
      ["missing order id", { orderId: "" }, 400, "Order id is required"],
      ["missing time", { startsAt: undefined }, 400, "Pick a date and time"],
      ["garbage time", { startsAt: "soon" }, 400, "Pick a date and time"],
      ["time in the past", { startsAt: "2026-11-10T19:00:00Z" }, 400, "Pick a time at least an hour from now"],
      ["bad kind", { kind: "x" }, 400, "Kind must be partner or live"],
      ["unknown partner", { itemId: "nope" }, 404, "Experience not found: nope"],
      ["party too big for the venue", { itemId: "halcyon-spa", partySize: 3 }, 400, "Party size for Halcyon Spa must be from 1 to 2"],
    ])("%s", async (_l, o, status, msg) => {
      const f = mockPayPal();
      await expect(placeBooking(input(o as Partial<PlaceBookingInput>))).rejects.toMatchObject({ status, message: msg });
      expect(f).not.toHaveBeenCalled();
    });
  });

  describe("payment integrity", () => {
    it.each([
      ["a different amount", { amount: { value: "0.01", currency_code: "USD" } }],
      ["a different currency", { amount: { value: "180.00", currency_code: "EUR" } }],
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
  it("confirm: captures with a stable idempotency key → confirmed", async () => {
    const b = await insertBooking(createNewBooking({ kind: "live", authorizationId: "AUTHX" }));
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
        return new Response(paypalReply.body ? JSON.stringify(paypalReply.body) : null, { status: paypalReply.status });
      }));
      await expect(fn(b.id)).rejects.toMatchObject({ status: 409, message: msg });
    },
  );
  it("BookingError carries a status", () => {
    expect(new BookingError(418, "x")).toMatchObject({ name: "BookingError", status: 418, message: "x" });
  });
});
