import { describe, it, expect } from "vitest";
import { liveCopy } from "@/lib/bookings/bill-copy";
import type { PublicBooking } from "@/lib/bookings/public";

const b = (o: Partial<PublicBooking> = {}): PublicBooking => ({
  id: "b", kind: "live", itemId: "gp:1", name: "Barbusa", partySize: 2, startsAt: "x", amount: "100.00", currency: "USD", status: "confirmed",
  paypalOrderId: "O", holdExpiresAt: null, createdAt: "x", checkedInAt: null, city: "LA", fee: "4.00", overageConsent: false, settlement: null, ...o,
});
const s = (o: Partial<NonNullable<PublicBooking["settlement"]>>) => ({ billTotal: "80.00", capturedTotal: "84.00", overage: "0.00", overageStatus: "none" as const, settledAt: "x", ...o });

describe("liveCopy (what a request-to-book guest sees)", () => {
  it("partners and released/failed bookings use the standard copy", () => {
    expect(liveCopy(b({ kind: "partner" }))).toBeNull();
    expect(liveCopy(b({ status: "declined" }))).toBeNull();
    expect(liveCopy(b({ status: "failed" }))).toBeNull();
  });
  it("requested: the hold and what it covers", () => {
    expect(liveCopy(b({ status: "held" }))).toEqual({ title: "Request sent.", stamp: "ON HOLD", amountLabel: "Held", amount: "100.00",
      body: "PayPal is holding $100: your estimated bill, room for tip, and the $4 booking fee. Nothing is charged unless the venue confirms; if they can't take you, the hold is released." });
  });
  it("reserved, with consent: overage goes on saved PayPal", () => {
    expect(liveCopy(b({ overageConsent: true }))!.body).toContain("If the bill comes in higher, the difference goes on your saved PayPal.");
  });
  it("reserved, without consent: overage paid at the table", () => {
    const c = liveCopy(b())!;
    expect(c).toMatchObject({ title: "You're booked.", stamp: "RESERVED", amountLabel: "Held", amount: "100.00" });
    expect(c.body).toBe("The venue confirmed. PayPal is holding $100. When the bill closes you're charged the real bill plus the $4 booking fee, and the rest is released. If the bill comes in higher, you'll pay the difference at the table.");
  });
  it("paid within the hold: what was charged and what came back", () => {
    expect(liveCopy(b({ settlement: s({}) }))).toEqual({ title: "Bill paid.", stamp: "PAID", amountLabel: "Charged", amount: "84.00", body: "Bill $80 + $4 booking fee. $84 charged from your hold; $16 released back to you." });
  });
  it("boundary: used the whole hold, nothing released", () => {
    expect(liveCopy(b({ settlement: s({ billTotal: "96.00", capturedTotal: "100.00" }) }))!.body).toBe("Bill $96 + $4 booking fee. $100 charged from your hold.");
  });
  it("over the hold, charged to saved PayPal", () => {
    expect(liveCopy(b({ settlement: s({ billTotal: "120.00", capturedTotal: "100.00", overage: "24.00", overageStatus: "charged" }) }))).toEqual({
      title: "Bill paid.", stamp: "PAID", amountLabel: "Charged", amount: "124.00", body: "Bill $120 + $4 booking fee. $100 came from your hold and $24 was charged to your saved PayPal." });
  });
  it("over the hold, pay at the table: flagged as an alert", () => {
    expect(liveCopy(b({ settlement: s({ billTotal: "120.50", capturedTotal: "100.00", overage: "24.50", overageStatus: "pay_at_table" }) }))).toEqual({
      title: "Almost done.", stamp: "PAY AT TABLE", amountLabel: "Charged", amount: "100.00", alert: true,
      body: "Bill $120.50 + $4 booking fee. $100 came from your hold. Please pay the remaining $24.50 at the table." });
  });
  it("no fee recorded shows $0", () => {
    expect(liveCopy(b({ status: "held", fee: null }))!.body).toContain("the $0 booking fee");
  });
});
