import { describe, it, expect } from "vitest";
import { searchExperiences, getExperience, quote, distanceKm, ALL_EXPERIENCES } from "@/lib/catalog/catalog";
import { ALL_QUESTS } from "@/lib/quests/engine";
import { CATEGORIES } from "@/lib/catalog/types";
import { createExperience } from "../../helpers/factories";
import { verifyQuote, verifyResultIds } from "../../helpers/verification";

const BRICKELL = { lat: 25.765, lng: -80.193 };
const a = createExperience({ id: "a", name: "Alpha Italian", tags: ["restaurant", "italian"], price: "50.00" });
const b = createExperience({ id: "b", name: "Bravo Spa", category: "wellness", tags: ["spa", "massage"], price: "200.00", description: "Quiet massage.", lat: 25.8150, lng: -80.1220 });
const c = createExperience({ id: "c", name: "Charlie Karaoke", category: "nightlife", tags: ["karaoke"], price: "120.00", pricing: "per_group", partyMin: 2, partyMax: 10, description: "Private room." });
const d = createExperience({ id: "d", name: "Delta Tacos", tags: ["restaurant", "mexican"], city: "Austin", lat: 30.262, lng: -97.727, price: "20.00", description: "Tacos in Austin." });
const LIST = [a, b, c, d];
const search = (p: Parameters<typeof searchExperiences>[0]) => searchExperiences(p, LIST);

describe("shipped catalog", () => {
  it("has unique ids, valid categories and prices, and covers all 8 categories", () => {
    expect(new Set(ALL_EXPERIENCES.map((e) => e.id)).size).toBe(ALL_EXPERIENCES.length);
    for (const e of ALL_EXPERIENCES) {
      expect(CATEGORIES).toContain(e.category);
      expect(e.price).toMatch(/^\d+\.\d{2}$/);
      expect(e.partyMin).toBeLessThanOrEqual(e.partyMax);
    }
    expect(new Set(ALL_EXPERIENCES.map((e) => e.category)).size).toBe(8);
  });
  it("includes the four home-page postcards", () => {
    for (const id of ["marea", "still-water", "biscayne-dusk", "blue-room"]) expect(getExperience(id)).toBeDefined();
  });
  it("every category has experiences whose tags advance at least one quest", () => {
    const questTags = new Set(ALL_QUESTS.flatMap((q) => q.requirement.tags));
    for (const cat of CATEGORIES) {
      const hit = ALL_EXPERIENCES.filter((e) => e.category === cat).some((e) => e.tags.some((t) => questTags.has(t)));
      expect(hit, cat).toBe(true);
    }
  });
});

describe("searchExperiences", () => {
  describe("happy path", () => {
    it("no filters returns everything, sorted by name", () => verifyResultIds(search({}), ["a", "b", "c", "d"]));
    it("filters by category", () => verifyResultIds(search({ category: "wellness" }), ["b"]));
    it("filters by any of several tags", () => verifyResultIds(search({ tags: ["mexican", "karaoke"] }), ["c", "d"]));
    it("text search matches name, tags, description and city, ranked by matches", () => {
      verifyResultIds(search({ q: "italian" }), ["a"]);
      verifyResultIds(search({ q: "massage quiet" }), ["b"]);
      verifyResultIds(search({ q: "austin" }), ["d"]);
    });
    it("text search ranks more matching words first", () => {
      verifyResultIds(search({ q: "tacos restaurant" }), ["d", "a"]);
    });
    it("text search ignores case and punctuation", () => verifyResultIds(search({ q: "  ITALIAN!! " }), ["a"]));
    it("near filters by radius and sorts by distance, with distance attached", () => {
      const r = search({ near: { ...BRICKELL, radiusKm: 20 } });
      verifyResultIds(r, ["a", "c", "b"]);
      expect(r[0].distanceKm).toBeCloseTo(0, 1);
      expect(r[2].distanceKm).toBeGreaterThan(5);
    });
    it("partySize hides experiences that can't take the group", () => verifyResultIds(search({ partySize: 1 }), ["a", "b", "d"]));
    it("maxTotal compares the total for the party", () => {
      verifyResultIds(search({ maxTotal: 100, partySize: 2 }), ["a", "d"]); // a=100, d=40, c=120 group, b=400
      verifyResultIds(search({ maxTotal: 120, partySize: 2 }), ["a", "c", "d"]);
    });
    it("results carry the party total", () => {
      expect(search({ partySize: 3 }).find((r) => r.id === "a")!.total).toBe("150.00");
    });
    it("limit caps the result count", () => expect(search({ limit: 2 })).toHaveLength(2));
    it("an empty query string is ignored", () => verifyResultIds(search({ q: "   " }), ["a", "b", "c", "d"]));
  });

  describe("validation", () => {
    it.each([
      [{ category: "sports" }, "Unknown category: sports"],
      [{ partySize: 0 }, "Party size must be a whole number from 1 to 20"],
      [{ partySize: 2.5 }, "Party size must be a whole number from 1 to 20"],
      [{ maxTotal: -1 }, "Max total must be zero or more"],
      [{ maxTotal: NaN }, "Max total must be zero or more"],
      [{ limit: 0 }, "Limit must be a whole number from 1 to 50"],
      [{ near: { lat: 91, lng: 0, radiusKm: 5 } }, "Latitude must be between -90 and 90"],
      [{ near: { lat: 0, lng: -181, radiusKm: 5 } }, "Longitude must be between -180 and 180"],
      [{ near: { lat: 0, lng: 0, radiusKm: 0 } }, "Radius must be more than 0 and at most 500 km"],
    ])("rejects %o", (params, msg) => {
      expect(() => search(params as Parameters<typeof search>[0])).toThrow(msg);
    });
  });

  describe("boundary", () => {
    it("partySize 20 and limit 50 are allowed; 21 and 51 are not", () => {
      expect(() => search({ partySize: 20, limit: 50 })).not.toThrow();
      expect(() => search({ partySize: 21 })).toThrow("Party size");
      expect(() => search({ limit: 51 })).toThrow("Limit");
    });
    it("radius 500 km is allowed, 500.1 is not", () => {
      expect(() => search({ near: { ...BRICKELL, radiusKm: 500 } })).not.toThrow();
      expect(() => search({ near: { ...BRICKELL, radiusKm: 500.1 } })).toThrow("Radius");
    });
    it("maxTotal 0 returns nothing; exactly the total is included", () => {
      verifyResultIds(search({ maxTotal: 0 }), []);
      verifyResultIds(search({ maxTotal: 20, partySize: 1 }), ["d"]);
    });
    it("latitude ±90 and longitude ±180 are accepted", () => {
      expect(() => search({ near: { lat: 90, lng: 180, radiusKm: 1 } })).not.toThrow();
      expect(() => search({ near: { lat: -90, lng: -180, radiusKm: 1 } })).not.toThrow();
    });
    it("a query with no matches returns an empty list", () => verifyResultIds(search({ q: "zzzz" }), []));
  });

  it("defaults to the shipped catalog", () => {
    expect(searchExperiences({ category: "wellness" }).every((e) => e.category === "wellness")).toBe(true);
  });
});

describe("quote", () => {
  it("per person: price × party", () => {
    verifyQuote(quote("a", 2, LIST), { experienceId: "a", partySize: 2, unitPrice: "50.00", total: "100.00", currency: "USD", description: "Alpha Italian · 2 guests" });
  });
  it("per group: flat price whatever the party", () => {
    verifyQuote(quote("c", 7, LIST), { total: "120.00", unitPrice: "120.00", description: "Charlie Karaoke · 7 guests" });
  });
  it("1 guest is singular", () => verifyQuote(quote("a", 1, LIST), { description: "Alpha Italian · 1 guest", total: "50.00" }));
  it("no floating-point drift", () => {
    const e = createExperience({ id: "f", price: "19.99" });
    verifyQuote(quote("f", 3, [e]), { total: "59.97" });
  });
  it("long names are trimmed to fit PayPal's 127-character description", () => {
    const e = createExperience({ id: "long", name: "N".repeat(200) });
    verifyQuote(quote("long", 2, [e]), { experienceId: "long" });
  });
  it("defaults to the shipped catalog", () => verifyQuote(quote("marea", 2), { total: "180.00" }));
  it.each([
    ["unknown id", "nope", 2, "Experience not found: nope"],
    ["party below the minimum", "c", 1, "Party size for Charlie Karaoke must be from 2 to 10"],
    ["party above the maximum", "a", 9, "Party size for Alpha Italian must be from 1 to 8"],
    ["non-integer party", "a", 1.5, "Party size must be a whole number from 1 to 20"],
  ])("rejects %s", (_l, id, size, msg) => {
    expect(() => quote(id as string, size as number, LIST)).toThrow(msg);
  });
  it("boundary: exactly partyMin and partyMax are allowed", () => {
    expect(quote("c", 2, LIST).total).toBe("120.00");
    expect(quote("c", 10, LIST).total).toBe("120.00");
  });
});

describe("distanceKm", () => {
  it("is 0 for the same point and ~1,780 km Miami→Austin", () => {
    expect(distanceKm(BRICKELL, BRICKELL)).toBe(0);
    expect(distanceKm(BRICKELL, { lat: 30.262, lng: -97.727 })).toBeGreaterThan(1700);
    expect(distanceKm(BRICKELL, { lat: 30.262, lng: -97.727 })).toBeLessThan(1850);
  });
});
