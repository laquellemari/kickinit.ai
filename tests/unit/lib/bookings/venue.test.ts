import { describe, it, expect } from "vitest";
import { partnerFacts, liveFacts, hourIn, CITY_TZ } from "@/lib/bookings/venue";
import { ALL_EXPERIENCES } from "@/lib/catalog/catalog";
import { createLivePlace } from "../../../helpers/factories";

describe("venue facts", () => {
  it("every partner city has a time zone", () => {
    for (const e of ALL_EXPERIENCES) expect(CITY_TZ[e.city], e.city).toBeDefined();
  });
  it("partner: catalog tags, city, neighborhood, cuisine, and the local hour in the venue's time zone", () => {
    // 2026-11-15 02:30 UTC is 6:30 pm Saturday in Los Angeles (PST, UTC-8)
    expect(partnerFacts("carasau-pasta-bar", new Date("2026-11-15T02:30:00Z"))).toEqual({
      tags: ["restaurant", "italian", "romantic"], city: "Los Angeles", country: "US", neighborhood: "Mid-City", cuisine: "italian", localHour: 18,
    });
  });
  it("partner without a cuisine has null cuisine; out-of-town getaways use Pacific time too", () => {
    expect(partnerFacts("sustainable-wine-tours", new Date("2026-11-15T02:30:00Z"))).toMatchObject({ cuisine: null, city: "Santa Barbara", localHour: 18 });
    // summer: PDT is UTC-7
    expect(partnerFacts("the-cactai", new Date("2026-07-15T02:30:00Z"))).toMatchObject({ city: "Palm Springs", localHour: 19 });
  });
  it("unknown partner throws", () => {
    expect(() => partnerFacts("nope", new Date())).toThrow("Experience not found: nope");
  });
  it("live: category tags plus Google's type, the venue's city/country, local hour from its UTC offset", () => {
    expect(liveFacts(createLivePlace(), new Date("2026-11-15T03:30:00Z"))).toEqual({
      tags: ["restaurant", "italian_restaurant"], city: "San Diego", country: "US", neighborhood: null, cuisine: null, localHour: 19,
    });
  });
  it("live with no type or offset falls back to UTC and category tags", () => {
    expect(liveFacts(createLivePlace({ primaryType: null, utcOffsetMinutes: null, category: "wellness" }), new Date("2026-11-15T03:30:00Z"))).toMatchObject({ tags: ["wellness", "spa"], localHour: 3 });
  });
  it("boundary: midnight is hour 0, not 24", () => {
    expect(hourIn("America/New_York", new Date("2026-11-15T05:00:00Z"))).toBe(0);
    expect(liveFacts(createLivePlace({ utcOffsetMinutes: 0 }), new Date("2026-11-15T00:00:00Z")).localHour).toBe(0);
  });
});
