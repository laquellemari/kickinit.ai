// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { similarTo, MAX_RECOMMENDATIONS, NEARBY_KM } from "@/lib/places/similar";
import { estimateSpend, estimateFor, getLivePlace, DETAIL_MASK, FIELD_MASK, PRICE_LEVEL_USD } from "@/lib/places/client";
import { getExperience, searchExperiences } from "@/lib/catalog/catalog";
import { createLivePlace } from "../../../helpers/factories";
import { mockPayPal as mockFetch } from "../../../helpers/paypal";

const usd = (units: string) => ({ units, currencyCode: "USD" });

describe("estimateSpend (the per-person PayPal hold)", () => {
  const base = { primaryType: "izakaya_restaurant", typeLabel: "Izakaya restaurant" };
  it("uses the midpoint of Google's price range", () => {
    expect(estimateSpend({ ...base, priceRange: { startPrice: usd("20"), endPrice: usd("30") }, priceLevel: "PRICE_LEVEL_EXPENSIVE" }))
      .toEqual({ category: "culinary", estimatePerPerson: "25.00", estimateBasis: "Google lists $20–$30 per person" });
  });
  it("open-ended range ('from $50'): uses the start", () => {
    expect(estimateSpend({ ...base, priceRange: { startPrice: usd("50") } })).toMatchObject({ estimatePerPerson: "50.00", estimateBasis: "Google lists from $50 per person" });
  });
  it.each(Object.entries(PRICE_LEVEL_USD))("no range: price level %s", (level, [amount, signs]) => {
    expect(estimateSpend({ ...base, priceLevel: level })).toMatchObject({ estimatePerPerson: amount.toFixed(2), estimateBasis: `Google rates it ${signs}` });
  });
  it("non-USD or zero ranges and unknown/free levels fall back to the venue type", () => {
    for (const p of [
      { priceRange: { startPrice: { units: "20", currencyCode: "EUR" } } },
      { priceRange: { startPrice: usd("0") } },
      { priceRange: { startPrice: {} } },
      { priceLevel: "PRICE_LEVEL_FREE" },
      {},
    ]) expect(estimateSpend({ ...base, ...p })).toEqual({ category: "culinary", estimatePerPerson: "40.00", estimateBasis: "Typical spend for a izakaya restaurant" });
  });
  it("a range with a bad end price uses the start alone", () => {
    expect(estimateSpend({ ...base, priceRange: { startPrice: usd("20"), endPrice: { units: "x", currencyCode: "USD" } } }).estimatePerPerson).toBe("20.00");
  });
  it("typical spends are lower than before for restaurants and spas", () => {
    expect(estimateFor("italian_restaurant").estimatePerPerson).toBe("40.00");
    expect(estimateFor("spa").estimatePerPerson).toBe("100.00");
  });
});

describe("venue page details from Google", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_PLACES_API_KEY", "k"));
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("asks for the description and rating, and uses them", async () => {
    const f = mockFetch({ status: 200, body: { id: "A", displayName: { text: "Izakaya Gazen" }, primaryType: "izakaya_restaurant", primaryTypeDisplayName: { text: "Izakaya restaurant" }, editorialSummary: { text: "Cozy izakaya." }, rating: 4.5, userRatingCount: 900, priceLevel: "PRICE_LEVEL_MODERATE" } });
    expect(await getLivePlace("A")).toMatchObject({ summary: "Cozy izakaya.", rating: 4.5, ratingCount: 900, estimatePerPerson: "30.00", estimateBasis: "Google rates it $$" });
    expect(new Headers((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get("x-goog-fieldmask")).toBe(DETAIL_MASK);
    expect(DETAIL_MASK).toContain("editorialSummary,generativeSummary,rating,userRatingCount");
    expect(FIELD_MASK).toContain("places.priceLevel,places.priceRange");
  });
  it("falls back to Google's generated overview, then nothing", async () => {
    mockFetch({ status: 200, body: { id: "A", generativeSummary: { overview: { text: "AI overview." } } } }, { status: 200, body: { id: "B", editorialSummary: {} } });
    expect((await getLivePlace("A")).summary).toBe("AI overview.");
    expect(await getLivePlace("B")).toMatchObject({ summary: null, rating: null, ratingCount: 0 });
  });
});

describe("similarTo", () => {
  const la = createLivePlace({ placeId: "ChIJself", typeLabel: "Italian restaurant", address: "1 Spring St, Los Angeles", lat: 34.05, lng: -118.25, category: "culinary" });
  it("nearby partners in the category first (instant book, priced for the party), then Google's similar places", async () => {
    const search = vi.fn(async () => [createLivePlace({ placeId: "ChIJx", name: "Bestia", typeLabel: "Italian restaurant", estimatePerPerson: "45.00" })]);
    const r = await similarTo(la, 2, search);
    expect(search).toHaveBeenCalledWith("Italian restaurant near 1 Spring St, Los Angeles");
    const partners = searchExperiences({ category: "culinary", partySize: 2, near: { lat: 34.05, lng: -118.25, radiusKm: NEARBY_KM }, limit: 6 });
    expect(r.slice(0, partners.length).map((x) => x.key)).toEqual(partners.map((p) => p.id));
    expect(r[0]).toMatchObject({ kind: "partner", href: `/experience/${partners[0].id}?party=2`, meta: `${partners[0].neighborhood} · Instant book` });
    expect(r.at(-1)).toEqual({ key: "gp:ChIJx", kind: "live", href: "/request/ChIJx?party=2", name: "Bestia", meta: "Italian restaurant · Request", price: "≈ $90", placeId: "ChIJx", bg: "#E6EDF3" });
  });
  it("never recommends the venue itself, or a Google copy of a partner", async () => {
    const carasau = getExperience("carasau-pasta-bar")!;
    const r = await similarTo({ ...la, placeId: carasau.placeId }, 2, async () => [createLivePlace({ placeId: carasau.placeId }), createLivePlace({ placeId: "ChIJself" })]);
    expect(r.map((x) => x.placeId)).not.toContain(carasau.placeId);
    expect(r.filter((x) => x.kind === "live").map((x) => x.placeId)).toEqual(["ChIJself"]);
  });
  it("Google failing still returns the partners", async () => {
    const r = await similarTo(la, 2, async () => { throw new Error("down"); });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.kind === "partner")).toBe(true);
  });
  it("far from any partner: Google's only; capped at 12", async () => {
    const sd = { ...la, lat: 32.7, lng: -117.16 };
    const many = Array.from({ length: 15 }, (_, i) => createLivePlace({ placeId: `P${i}` }));
    const r = await similarTo(sd, 2, async () => many);
    expect(r).toHaveLength(MAX_RECOMMENDATIONS);
    expect(r.every((x) => x.kind === "live")).toBe(true);
  });
  it("uses the real search by default", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const r = await similarTo({ ...la, lat: 0, lng: 0 }, 2);
    expect(r).toEqual([]);
    vi.unstubAllEnvs();
  });
});
