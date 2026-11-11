// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { searchLivePlaces, getLivePlace, estimateFor, FIELD_MASK, PlacesError } from "@/lib/places/client";
import { mockPayPal as mockFetch } from "../../../helpers/paypal";

const gPlace = (o: Record<string, unknown> = {}) => ({
  id: "ChIJ123", displayName: { text: "Cucina Sorella" }, formattedAddress: "1 Main St, San Diego, CA",
  location: { latitude: 32.7, longitude: -117.16 }, primaryType: "italian_restaurant",
  primaryTypeDisplayName: { text: "Italian restaurant" }, googleMapsUri: "https://maps.google.com/?cid=1", businessStatus: "OPERATIONAL", ...o,
});

function verifyLivePlace(p: ReturnType<typeof Object>, expected: { name: string; category: string; estimate: string }) {
  expect(p).toMatchObject({ name: expected.name, category: expected.category, estimatePerPerson: expected.estimate });
  expect(p.id).toBe(`gp:${p.placeId}`);
}

beforeEach(() => vi.stubEnv("GOOGLE_PLACES_API_KEY", "g-key"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("searchLivePlaces", () => {
  it("happy: POSTs a Text Search with the key and a Pro-only field mask", async () => {
    const f = mockFetch({ status: 200, body: { places: [gPlace()] } });
    const r = await searchLivePlaces("romantic italian dinner in San Diego");
    verifyLivePlace(r[0], { name: "Cucina Sorella", category: "culinary", estimate: "60.00" });
    expect(r[0]).toMatchObject({ address: "1 Main St, San Diego, CA", lat: 32.7, lng: -117.16, typeLabel: "Italian restaurant", mapsUrl: "https://maps.google.com/?cid=1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const h = new Headers(init.headers);
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    expect(h.get("x-goog-api-key")).toBe("g-key");
    expect(h.get("x-goog-fieldmask")).toBe(FIELD_MASK);
    expect(JSON.parse(init.body as string)).toEqual({ textQuery: "romantic italian dinner in San Diego", pageSize: 6 });
  });
  it("reads city, country code and UTC offset from Pro-tier fields", async () => {
    mockFetch({ status: 200, body: { places: [gPlace({
      addressComponents: [
        { longText: "San Diego", shortText: "San Diego", types: ["locality", "political"] },
        { longText: "United States", shortText: "US", types: ["country", "political"] },
      ],
      utcOffsetMinutes: -480,
    })] } });
    expect((await searchLivePlaces("x"))[0]).toMatchObject({ city: "San Diego", country: "US", utcOffsetMinutes: -480, primaryType: "italian_restaurant" });
  });
  it("UK-style addresses use postal_town; missing parts become empty/null", async () => {
    mockFetch({ status: 200, body: { places: [
      gPlace({ addressComponents: [{ longText: "London", shortText: "London", types: ["postal_town"] }, { longText: "United Kingdom", shortText: "GB", types: ["country"] }] }),
      gPlace({ id: "Z", primaryType: undefined }),
    ] } });
    const [uk, bare] = await searchLivePlaces("x");
    expect(uk).toMatchObject({ city: "London", country: "GB" });
    expect(bare).toMatchObject({ city: "", country: "", utcOffsetMinutes: null, primaryType: null });
  });
  it("the field mask never includes Enterprise-priced fields", () => {
    for (const f of ["rating", "priceLevel", "userRatingCount", "websiteUri", "regularOpeningHours", "reviews"]) expect(FIELD_MASK).not.toContain(f);
  });
  it("drops closed businesses", async () => {
    mockFetch({ status: 200, body: { places: [gPlace({ businessStatus: "CLOSED_PERMANENTLY" }), gPlace({ id: "B", businessStatus: "CLOSED_TEMPORARILY" }), gPlace({ id: "C", businessStatus: undefined })] } });
    expect((await searchLivePlaces("x")).map((p) => p.placeId)).toEqual(["C"]);
  });
  it("no results returns an empty list", async () => {
    mockFetch({ status: 200, body: {} });
    expect(await searchLivePlaces("zzz")).toEqual([]);
  });
  it("falls back sensibly when optional fields are missing", async () => {
    mockFetch({ status: 200, body: { places: [{ id: "X", displayName: { text: "Spot" }, location: { latitude: 1, longitude: 2 } }] } });
    expect((await searchLivePlaces("x"))[0]).toMatchObject({ address: "", typeLabel: "Place", category: "culture", estimatePerPerson: "50.00", mapsUrl: "https://www.google.com/maps/place/?q=place_id:X" });
  });
  it("a place with no name or location still renders", async () => {
    mockFetch({ status: 200, body: { places: [{ id: "Y" }] } });
    expect((await searchLivePlaces("x"))[0]).toMatchObject({ name: "Unnamed place", lat: 0, lng: 0 });
  });
  it.each([
    ["empty query", "  ", "Search text is required"],
    ["long query", "x".repeat(201), "Search text cannot exceed 200 characters"],
  ])("validation: %s", async (_l, q, msg) => {
    const f = mockFetch();
    await expect(searchLivePlaces(q)).rejects.toThrow(msg);
    expect(f).not.toHaveBeenCalled();
  });
  it("boundary: 200-character query is allowed", async () => {
    mockFetch({ status: 200, body: { places: [] } });
    await expect(searchLivePlaces("x".repeat(200))).resolves.toEqual([]);
  });
  it("throws a config error without a key", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    await expect(searchLivePlaces("x")).rejects.toThrow("Live search is not configured");
  });
  it("surfaces Google's error status and message", async () => {
    mockFetch({ status: 403, body: { error: { status: "PERMISSION_DENIED", message: "API key not valid." } } });
    await expect(searchLivePlaces("x")).rejects.toMatchObject({ name: "PlacesError", status: 403, message: "Google Places PERMISSION_DENIED: API key not valid." });
  });
  it("handles an error with no body", async () => {
    mockFetch({ status: 500 });
    const e = await searchLivePlaces("x").catch((x) => x);
    expect(e).toBeInstanceOf(PlacesError);
    expect(e.message).toBe("Google Places UNKNOWN: HTTP 500");
  });
});

describe("getLivePlace", () => {
  it("fetches one place by id with the same field mask", async () => {
    const f = mockFetch({ status: 200, body: gPlace({ id: "ChIJabc" }) });
    verifyLivePlace(await getLivePlace("ChIJabc"), { name: "Cucina Sorella", category: "culinary", estimate: "60.00" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJabc");
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("x-goog-fieldmask")).toBe(FIELD_MASK.replaceAll("places.", ""));
  });
  it("rejects an unsafe id without calling Google", async () => {
    const f = mockFetch();
    await expect(getLivePlace("../x")).rejects.toThrow("Place id has invalid characters");
    await expect(getLivePlace("")).rejects.toThrow("Place id has invalid characters");
    expect(f).not.toHaveBeenCalled();
  });
  it("404 becomes a not-found error", async () => {
    mockFetch({ status: 404, body: { error: { status: "NOT_FOUND", message: "Not found" } } });
    await expect(getLivePlace("ChIJnope")).rejects.toMatchObject({ status: 404 });
  });
  it("refuses a closed business", async () => {
    mockFetch({ status: 200, body: gPlace({ businessStatus: "CLOSED_PERMANENTLY" }) });
    await expect(getLivePlace("ChIJ123")).rejects.toThrow("This place is closed");
  });
});

describe("estimateFor", () => {
  it.each([
    ["italian_restaurant", "culinary", "60.00"], ["restaurant", "culinary", "60.00"], ["cafe", "culinary", "20.00"], ["bakery", "culinary", "20.00"],
    ["spa", "wellness", "120.00"], ["massage", "wellness", "120.00"], ["sauna", "wellness", "120.00"],
    ["gym", "movement", "35.00"], ["yoga_studio", "movement", "35.00"], ["fitness_center", "movement", "35.00"],
    ["museum", "culture", "30.00"], ["art_gallery", "culture", "30.00"], ["performing_arts_theater", "culture", "70.00"],
    ["night_club", "nightlife", "45.00"], ["bar", "nightlife", "45.00"], ["karaoke", "nightlife", "45.00"],
    ["park", "outdoors", "40.00"], ["marina", "outdoors", "40.00"], ["tour_agency", "outdoors", "40.00"],
    ["hotel", "getaways", "250.00"], ["lodging", "getaways", "250.00"],
    ["cooking_class", "create", "80.00"],
    [undefined, "culture", "50.00"], ["dentist", "culture", "50.00"],
  ])("%s -> %s at $%s/person", (type, category, estimate) => {
    expect(estimateFor(type)).toEqual({ category, estimatePerPerson: estimate });
  });
});
