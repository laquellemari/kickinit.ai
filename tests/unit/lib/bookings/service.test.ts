// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { placeBooking, confirmBooking, declineBooking, closeBill, parseStartsAt, BookingError, type PlaceBookingInput } from "@/lib/bookings/service";
import { getBooking, getBookingByOrder, insertBooking, transition } from "@/lib/bookings/repo";
import { resetTokenCache } from "@/lib/paypal/client";
import { useTestDb } from "../../../helpers/db";
import { createNewBooking } from "../../../helpers/factories";
import { verifyBooking } from "../../../helpers/verification";
import { mockPayPal, pp, setPayPalEnv } from "../../../helpers/paypal";

const NOW = new Date("2026-11-11T12:00:00Z");
const SAT = "2026-11-14T19:30:00.000Z";
const input = (o: Partial<PlaceBookingInput> = {}): PlaceBookingInput => ({
  orderId: "ORDER-1", kind: "partner", itemId: "carasau-pasta-bar", partySize: 2, startsAt: SAT, userId: "u1", now: NOW, ...o,
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
      verifyBooking(b, { status: "confirmed", kind: "partner", itemId: "carasau-pasta-bar", name: "Carasau Pasta Bar", amount: "180.00", partySize: 2, paypalOrderId: "ORDER-1", authorizationId: "0AW2184448108334S", captureId: "7TK53561YB803214S", userId: "u1" });
      expect(b.startsAt.toISOString()).toBe(SAT);
      expect(b.holdExpiresAt?.toISOString()).toBe("2026-12-12T21:20:49.000Z");
      expect(urls(f)).toEqual(["/v1/oauth2/token", "/v2/checkout/orders/ORDER-1/authorize", "/v2/payments/authorizations/0AW2184448108334S/capture"]);
    });

    it("live (request to book): prices from Google, authorizes, stays held, no capture", async () => {
      const f = mockPayPal(
        { status: 200, body: gPlace },
        { status: 200, body: pp.token() },
        { status: 201, body: pp.authorizedOrder({ amount: { value: "100.00", currency_code: "USD" } }) },
      );
      const b = await placeBooking(input({ kind: "live", itemId: "gp:ChIJ1" }));
      verifyBooking(b, { status: "held", kind: "live", itemId: "gp:ChIJ1", name: "Barbusa", amount: "100.00", captureId: null });
      expect(urls(f).filter((u) => u.includes("capture"))).toEqual([]);
    });

    it("a hold with no expiry from PayPal is saved with a null expiry", async () => {
      mockPayPal({ status: 200, body: gPlace }, { status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder({ amount: { value: "100.00", currency_code: "USD" }, expiration_time: undefined }) });
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
      ["party too big for the venue", { itemId: "desuar-hollywood-spa", partySize: 3 }, 400, "Party size for DESUAR HOLLYWOOD SPA must be from 1 to 2"],
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
  it("confirm a request-to-book: reserved, nothing charged (the hold waits for the bill)", async () => {
    const b = await insertBooking(createNewBooking({ kind: "live", itemId: "gp:ChIJ1", authorizationId: "AUTHL", fee: "4.00" }));
    const f = mockPayPal();
    verifyBooking(await confirmBooking(b.id), { status: "confirmed", captureId: null });
    expect(f).not.toHaveBeenCalled();
  });
  it("confirm a request-to-book that changes mid-call → 409", async () => {
    const b = await insertBooking(createNewBooking({ kind: "live", itemId: "gp:ChIJ1" }));
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

describe("placeBooking stores the fee and the saved PayPal (option 3)", () => {
  it("live with consent: fee from the quote, vault id from PayPal", async () => {
    mockPayPal(
      { status: 200, body: gPlace },
      { status: 200, body: pp.token() },
      { status: 201, body: { ...pp.authorizedOrder({ amount: { value: "100.00", currency_code: "USD" } }), payment_source: { paypal: { attributes: { vault: { id: "VLT1", status: "VAULTED" } } } } } },
    );
    const b = await placeBooking(input({ kind: "live", itemId: "gp:ChIJ1" }));
    expect(b).toMatchObject({ fee: "4.00", vaultId: "VLT1", settlement: null });
  });
  it("partner: no fee, no saved PayPal", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder() }, { status: 201, body: pp.capture() });
    expect(await placeBooking(input())).toMatchObject({ fee: null, vaultId: null });
  });
});

describe("closeBill (pay the venue's bill from the hold)", () => {
  // Hold $100 = $80 estimated bill + $16 headroom + $4 fee.
  const live = async (o: Parameters<typeof createNewBooking>[0] = {}) => {
    const b = await insertBooking(createNewBooking({ kind: "live", itemId: "gp:ChIJ1", name: "Barbusa", amount: "100.00", fee: "4.00", authorizationId: "AUTHB", ...o }));
    await transition(b.id, ["held"], "confirmed");
    return b;
  };
  const captureBody = (f: ReturnType<typeof vi.fn>, n = 1) => JSON.parse((f.mock.calls[n] as unknown as [string, RequestInit])[1].body as string);
  const reqId = (f: ReturnType<typeof vi.fn>, n: number) => new Headers((f.mock.calls[n] as unknown as [string, RequestInit])[1].headers).get("paypal-request-id");

  it("bill under the hold: captures bill + fee, releases the rest, nothing owed", async () => {
    const b = await live();
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture({ id: "CAP1" }) });
    const s = await closeBill({ id: b.id, billTotal: "72.50", now: NOW });
    expect(urls(f)[1]).toBe("/v2/payments/authorizations/AUTHB/capture");
    expect(captureBody(f)).toEqual({ final_capture: true, amount: { value: "76.50", currency_code: "USD" } });
    expect(reqId(f, 1)).toBe(`settle-${b.id}`);
    expect(s).toMatchObject({ captureId: "CAP1", settlement: { billTotal: "72.50", capturedTotal: "76.50", overage: "0.00", overageStatus: "none", overageCaptureId: null, settledAt: NOW } });
  });
  it("boundary: bill + fee exactly equal to the hold is all captured, nothing over", async () => {
    const b = await live();
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
    expect((await closeBill({ id: b.id, billTotal: "96.00", now: NOW })).settlement).toMatchObject({ capturedTotal: "100.00", overage: "0.00", overageStatus: "none" });
  });
  it("over the hold with consent: whole hold captured, the rest charged to the saved PayPal", async () => {
    const b = await live({ vaultId: "VLT1" });
    const f = mockPayPal(
      { status: 200, body: pp.token() },
      { status: 201, body: pp.capture({ id: "CAP2" }) },
      { status: 201, body: { id: "ORD2", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "OVR2", status: "COMPLETED" }] } }] } },
    );
    const s = await closeBill({ id: b.id, billTotal: "120.00", now: NOW });
    expect(captureBody(f)).toEqual({ final_capture: true, amount: { value: "100.00", currency_code: "USD" } });
    expect(captureBody(f, 2)).toMatchObject({ intent: "CAPTURE", payment_source: { paypal: { vault_id: "VLT1" } }, purchase_units: [{ amount: { value: "24.00" }, description: "Barbusa: bill above the hold", reference_id: b.id }] });
    expect(reqId(f, 2)).toBe(`overage-${b.id}`);
    expect(s.settlement).toMatchObject({ billTotal: "120.00", capturedTotal: "100.00", overage: "24.00", overageStatus: "charged", overageCaptureId: "OVR2" });
  });
  it("boundary: 1 cent over the hold is charged to the saved PayPal", async () => {
    const b = await live({ vaultId: "VLT1" });
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() }, { status: 201, body: { id: "O", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "C", status: "COMPLETED" }] } }] } });
    expect((await closeBill({ id: b.id, billTotal: "96.01", now: NOW })).settlement).toMatchObject({ overage: "0.01", overageStatus: "charged" });
  });
  it("over the hold without consent: the guest pays the difference at the table (option 4)", async () => {
    const b = await live();
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
    expect((await closeBill({ id: b.id, billTotal: "120.00", now: NOW })).settlement).toMatchObject({ overage: "24.00", overageStatus: "pay_at_table", overageCaptureId: null });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("saved PayPal declines: falls back to paying at the table, and logs why", async () => {
    const b = await live({ vaultId: "VLT1" });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() }, { status: 422, body: { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }], message: "declined" } });
    expect((await closeBill({ id: b.id, billTotal: "120.00", now: NOW })).settlement).toMatchObject({ overageStatus: "pay_at_table", overage: "24.00" });
    expect(err.mock.calls[0][0]).toContain("pays the rest at the table");
  });
  it("accepts a number and a missing fee (counts as $0)", async () => {
    const b = await live({ fee: null });
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
    expect((await closeBill({ id: b.id, billTotal: 50, now: NOW })).settlement).toMatchObject({ billTotal: "50.00", capturedTotal: "50.00" });
  });
  it.each([
    [undefined, "Enter the final bill, like 96.50"], ["", "Enter the final bill, like 96.50"], ["abc", "Enter the final bill, like 96.50"],
    ["-5", "Enter the final bill, like 96.50"], ["0.00", "Enter the final bill, like 96.50"], ["10.123", "Enter the final bill, like 96.50"],
    ["10000.01", "The bill can't be more than $10000.00"],
  ])("rejects bill %j without touching PayPal", async (billTotal, msg) => {
    const b = await live();
    const f = mockPayPal();
    await expect(closeBill({ id: b.id, billTotal })).rejects.toMatchObject({ status: 400, message: msg });
    expect(f).not.toHaveBeenCalled();
  });
  it("boundary: $0.01 and $10,000.00 bills are accepted", async () => {
    for (const billTotal of ["0.01", "10000.00"]) {
      const b = await live({ amount: "10000.00", fee: null });
      mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
      expect((await closeBill({ id: b.id, billTotal })).settlement!.billTotal).toBe(billTotal);
      resetTokenCache();
    }
  });
  it("unknown booking → 404", async () => {
    await expect(closeBill({ id: "00000000-0000-0000-0000-000000000000", billTotal: "10" })).rejects.toMatchObject({ status: 404 });
  });
  it("partner bookings have no bill to close", async () => {
    const b = await insertBooking(createNewBooking({ kind: "partner" }));
    await expect(closeBill({ id: b.id, billTotal: "10" })).rejects.toMatchObject({ status: 409, message: "Only request-to-book bookings have a bill to close" });
  });
  it("not yet confirmed by the venue → 409", async () => {
    const b = await insertBooking(createNewBooking({ kind: "live", itemId: "gp:ChIJ1" }));
    await expect(closeBill({ id: b.id, billTotal: "10" })).rejects.toMatchObject({ status: 409, message: "The venue has to confirm the booking before the bill can be closed" });
  });
  it("closing twice → 409 the second time, PayPal not called again", async () => {
    const b = await live();
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
    await closeBill({ id: b.id, billTotal: "50" });
    const f = mockPayPal();
    await expect(closeBill({ id: b.id, billTotal: "50" })).rejects.toMatchObject({ status: 409, message: "This bill is already closed" });
    expect(f).not.toHaveBeenCalled();
  });
  it("capture fails (e.g. the hold expired): nothing recorded, can retry", async () => {
    const b = await live();
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: pp.error("AUTHORIZATION_EXPIRED", "Expired") });
    await expect(closeBill({ id: b.id, billTotal: "50" })).rejects.toMatchObject({ issue: "AUTHORIZATION_EXPIRED" });
    expect((await getBooking(b.id))!.settlement).toBeNull();
  });
  it("a race where someone else closes it mid-call → 409", async () => {
    const b = await live();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify(pp.token()), { status: 200 });
      await transition(b.id, ["confirmed"], "failed");
      return new Response(JSON.stringify(pp.capture()), { status: 201 });
    }));
    await expect(closeBill({ id: b.id, billTotal: "50" })).rejects.toMatchObject({ status: 409, message: "Booking changed while closing the bill" });
  });
});
