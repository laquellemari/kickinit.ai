import { describe, it, expect } from "vitest";
import { quoteLive } from "@/lib/places/quote";
import { createLivePlace } from "../../../helpers/factories";
import { verifyQuote } from "../../../helpers/verification";

describe("quoteLive", () => {
  it("estimate × party, marked as a request", () => {
    verifyQuote(quoteLive(createLivePlace(), 2), { experienceId: "gp:ChIJsd1", partySize: 2, unitPrice: "60.00", total: "120.00", currency: "USD", description: "Cucina Sorella · 2 guests (request)" });
  });
  it("singular guest", () => verifyQuote(quoteLive(createLivePlace(), 1), { description: "Cucina Sorella · 1 guest (request)", total: "60.00" }));
  it("no float drift", () => verifyQuote(quoteLive(createLivePlace({ estimatePerPerson: "19.99" }), 3), { total: "59.97" }));
  it("long names fit PayPal's 127 characters", () => verifyQuote(quoteLive(createLivePlace({ name: "N".repeat(300) }), 2), { partySize: 2 }));
  it.each([0, 21, 1.5])("rejects party size %s", (n) => {
    expect(() => quoteLive(createLivePlace(), n)).toThrow("Party size must be a whole number from 1 to 20");
  });
  it("boundary: 20 guests is allowed", () => verifyQuote(quoteLive(createLivePlace(), 20), { total: "1200.00" }));
});
