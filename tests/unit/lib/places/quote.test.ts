import { describe, it, expect } from "vitest";
import { quoteLive, holdFor, HEADROOM, BOOKING_FEE_CENTS } from "@/lib/places/quote";
import { createLivePlace } from "../../../helpers/factories";
import { verifyQuote } from "../../../helpers/verification";

describe("holdFor (estimated bill + 20% headroom + $4 booking fee)", () => {
  it("$60 × 2: $120 bill + $24 headroom + $4 fee = $148 hold", () => {
    expect(holdFor("60.00", 2)).toEqual({ billEstimate: "120.00", headroom: "24.00", fee: "4.00", total: "148.00" });
    expect(HEADROOM).toBe(0.2);
    expect(BOOKING_FEE_CENTS).toBe(400);
  });
  it("no float drift: $19.99 × 3 = $59.97 + $11.99 (rounded) + $4 = $75.96", () => {
    expect(holdFor("19.99", 3)).toEqual({ billEstimate: "59.97", headroom: "11.99", fee: "4.00", total: "75.96" });
  });
  it("headroom rounds half up to the cent", () => {
    expect(holdFor("0.05", 5).headroom).toBe("0.05"); // 25¢ × 20% = 5¢
    expect(holdFor("0.03", 1).headroom).toBe("0.01"); // 0.6¢ → 1¢
  });
});

describe("quoteLive", () => {
  it("holds the estimate + headroom + fee, with the breakdown, marked as a request", () => {
    verifyQuote(quoteLive(createLivePlace(), 2), { experienceId: "gp:ChIJsd1", partySize: 2, unitPrice: "60.00", total: "148.00", currency: "USD", description: "Cucina Sorella · 2 guests (request)" });
    expect(quoteLive(createLivePlace(), 2).breakdown).toEqual({ billEstimate: "120.00", headroom: "24.00", fee: "4.00" });
  });
  it("singular guest", () => verifyQuote(quoteLive(createLivePlace(), 1), { description: "Cucina Sorella · 1 guest (request)", total: "76.00" }));
  it("long names fit PayPal's 127 characters", () => verifyQuote(quoteLive(createLivePlace({ name: "N".repeat(300) }), 2), { partySize: 2 }));
  it.each([0, 21, 1.5])("rejects party size %s", (n) => {
    expect(() => quoteLive(createLivePlace(), n)).toThrow("Party size must be a whole number from 1 to 20");
  });
  it("boundary: 20 guests is allowed", () => verifyQuote(quoteLive(createLivePlace(), 20), { total: "1444.00" }));
});
