// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { getPlaceFacts, FACTS_MASK, FEATURES, MAX_REVIEWS, MAX_REVIEW_CHARS, PlacesError } from "@/lib/places/client";
import { mockPayPal as mockFetch } from "../../../helpers/paypal";

const full = {
  id: "ChIJ1", displayName: { text: "Perch" }, primaryTypeDisplayName: { text: "Bar" }, types: ["bar", "restaurant", "point_of_interest", "establishment"],
  addressComponents: [{ longText: "Downtown", shortText: "Downtown", types: ["neighborhood"] }, { longText: "Los Angeles", shortText: "LA", types: ["locality"] }],
  editorialSummary: { text: "French-inspired  rooftop bar." }, generativeSummary: { overview: { text: "Rooftop with fire pits." } },
  reviewSummary: { text: { text: "People love the view." } },
  reviews: [{ originalText: { text: "Great  view" }, text: { text: "translated" } }, { text: { text: "Lovely brunch" } }, { text: { text: "   " } }, {}],
  rating: 4.4, userRatingCount: 9000, priceLevel: "PRICE_LEVEL_MODERATE",
  servesCocktails: true, liveMusic: true, outdoorSeating: false, servesBrunch: "yes",
};

beforeEach(() => vi.stubEnv("GOOGLE_PLACES_API_KEY", "g-key"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("getPlaceFacts", () => {
  it("happy: asks for the description fields and maps everything Google says", async () => {
    const f = mockFetch({ status: 200, body: full });
    expect(await getPlaceFacts("ChIJ1")).toEqual({
      name: "Perch", typeLabel: "Bar", types: ["bar", "restaurant"], neighborhood: "Downtown", city: "Los Angeles",
      editorial: "French-inspired rooftop bar.", overview: "Rooftop with fire pits.", reviewSummary: "People love the view.",
      reviews: ["Great view", "Lovely brunch"], rating: 4.4, ratingCount: 9000, priceLevel: "$$",
      features: ["serves cocktails", "has live music"],
    });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJ1");
    expect(new Headers(init.headers).get("x-goog-fieldmask")).toBe(FACTS_MASK);
  });
  it("the mask covers the summaries, reviews and every feature", () => {
    for (const k of ["editorialSummary", "generativeSummary", "reviewSummary", "reviews", "types", ...FEATURES.map(([x]) => x)]) expect(FACTS_MASK.split(",")).toContain(k);
  });
  it("a bare place: defaults everywhere", async () => {
    mockFetch({ status: 200, body: { id: "ChIJ2", priceLevel: "PRICE_LEVEL_UNSPECIFIED", addressComponents: [{ longText: "Soho", shortText: "Soho", types: ["sublocality_level_1"] }, { longText: "London", shortText: "London", types: ["postal_town"] }] } });
    expect(await getPlaceFacts("ChIJ2")).toEqual({
      name: "Unnamed place", typeLabel: "Place", types: [], neighborhood: "Soho", city: "London", editorial: null, overview: null,
      reviewSummary: null, reviews: [], rating: null, ratingCount: 0, priceLevel: null, features: [],
    });
  });
  it("neighborhood falls back to a plain sublocality, else empty", async () => {
    mockFetch({ status: 200, body: { id: "a", addressComponents: [{ longText: "Midtown", shortText: "M", types: ["sublocality"] }] } }, { status: 200, body: { id: "b" } });
    expect((await getPlaceFacts("a")).neighborhood).toBe("Midtown");
    expect(await getPlaceFacts("b")).toMatchObject({ neighborhood: "", city: "" });
  });
  it(`boundary: at most ${MAX_REVIEWS} reviews of ${MAX_REVIEW_CHARS} characters`, async () => {
    const long = "x".repeat(MAX_REVIEW_CHARS + 1);
    mockFetch({ status: 200, body: { id: "a", reviews: Array.from({ length: MAX_REVIEWS + 1 }, () => ({ text: { text: long } })) } });
    const r = (await getPlaceFacts("a")).reviews;
    expect(r).toHaveLength(MAX_REVIEWS);
    expect(r[0]).toHaveLength(MAX_REVIEW_CHARS);
  });
  it("rejects a bad id without calling Google", async () => {
    const f = mockFetch();
    await expect(getPlaceFacts("a b")).rejects.toThrow("Place id has invalid characters");
    expect(f).not.toHaveBeenCalled();
  });
  it("Google errors surface as PlacesError", async () => {
    mockFetch({ status: 404, body: { error: { status: "NOT_FOUND", message: "gone" } } });
    await expect(getPlaceFacts("a")).rejects.toBeInstanceOf(PlacesError);
  });
});
