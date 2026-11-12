import { describe, it, expect } from "vitest";
import { withFee, isDiningExperience, isDiningType, CONCIERGE_FEE_RATE, MEMBERSHIP_PRICE } from "@/lib/pricing/fees";
import { ALL_EXPERIENCES } from "@/lib/catalog/catalog";

describe("withFee", () => {
  it("adds 20% to the venue's exact price", () => {
    expect(CONCIERGE_FEE_RATE).toBe(0.2);
    expect(withFee(15000, false)).toEqual({ venueTotal: "150.00", fee: "30.00", total: "180.00" });
  });
  it("members pay no fee", () => expect(withFee(15000, true)).toEqual({ venueTotal: "150.00", fee: "0.00", total: "150.00" }));
  it("rounds the fee to the nearest cent", () => {
    expect(withFee(1999, false)).toEqual({ venueTotal: "19.99", fee: "4.00", total: "23.99" });
    expect(withFee(1, false)).toEqual({ venueTotal: "0.01", fee: "0.00", total: "0.01" });
    expect(withFee(3, false).fee).toBe("0.01");
  });
  it("boundary: zero is allowed", () => expect(withFee(0, false)).toEqual({ venueTotal: "0.00", fee: "0.00", total: "0.00" }));
  it.each([-1, 1.5, Number.NaN])("rejects %s cents", (c) => {
    expect(() => withFee(c, false)).toThrow("Venue price must be a whole number of cents, zero or more");
  });
  it("membership costs $9.99 a month", () => expect(MEMBERSHIP_PRICE).toBe("9.99"));
});

describe("which partners are free to book", () => {
  it.each([
    [["restaurant", "italian"], true],
    [["nightlife", "bar", "live_music"], true],
    [["nightlife", "speakeasy", "cocktail_bar"], true],
    [["nightlife", "rooftop_bar"], true],
    [["nightlife", "magic", "cocktail_bar"], false],
    [["nightlife", "bowling", "bar"], false],
    [["nightlife", "karaoke", "bar"], false],
    [["wellness", "spa"], false],
    [[], false],
  ])("%j → %s", (tags, free) => expect(isDiningExperience({ tags })).toBe(free));
  it("in the shipped catalog: the 12 restaurants and 4 bars are free, the spa isn't", () => {
    const free = ALL_EXPERIENCES.filter(isDiningExperience).map((e) => e.id);
    expect(free).toContain("carasau-pasta-bar");
    expect(free).toContain("vibrato-grill-jazz");
    expect(free).not.toContain("hugh-spa");
    expect(free).not.toContain("black-rabbit-rose");
    expect(free).toHaveLength(16);
  });
});

describe("which Google place types are free to book", () => {
  it.each(["restaurant", "italian_restaurant", "bar", "wine_bar", "sushi_bar", "cafe", "coffee_shop", "bakery", "pub", "night_club", "steak_house", "diner"])("%s is dining", (t) => {
    expect(isDiningType(t)).toBe(true);
  });
  it.each(["spa", "massage", "yoga_studio", "museum", "karaoke", "hotel", "barber_shop", "", null, undefined])("%j is not", (t) => {
    expect(isDiningType(t)).toBe(false);
  });
});
