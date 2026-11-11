// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { searchRatedPlaces, getPlacePhoto, clearPhotoCache, RATED_MASK, FIELD_MASK, PlacesError } from "@/lib/places/client";
import { mockPayPal as mockFetch } from "../../../helpers/paypal";

const gPlace = (o: Record<string, unknown> = {}) => ({
  id: "ChIJ1", displayName: { text: "Joe's" }, formattedAddress: "11 Washington Ave, Miami Beach, FL", location: { latitude: 25.76, longitude: -80.13 },
  primaryType: "seafood_restaurant", primaryTypeDisplayName: { text: "Seafood restaurant" }, googleMapsUri: "https://maps.google.com/?cid=9", businessStatus: "OPERATIONAL",
  addressComponents: [
    { longText: "South of Fifth", shortText: "SoFi", types: ["neighborhood", "political"] },
    { longText: "Miami Beach", shortText: "Miami Beach", types: ["locality"] },
    { longText: "United States", shortText: "US", types: ["country"] },
  ], rating: 4.6, userRatingCount: 12000, ...o,
});
const H = (f: ReturnType<typeof vi.fn>, i = 0) => {
  const [url, init] = f.mock.calls[i] as unknown as [string, RequestInit];
  return { url, init, h: new Headers(init.headers) };
};
const HOUR = 3_600_000;

beforeEach(() => { vi.stubEnv("GOOGLE_PLACES_API_KEY", "g-key"); clearPhotoCache(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("searchRatedPlaces", () => {
  it("happy: 20 results with rating fields, neighborhood, best rated first then most reviewed", async () => {
    const f = mockFetch({ status: 200, body: { places: [
      gPlace({ id: "A", rating: 4.5, userRatingCount: 900 }),
      gPlace({ id: "B", rating: 4.8, userRatingCount: 50 }),
      gPlace({ id: "C", rating: 4.8, userRatingCount: 4000 }),
      gPlace({ id: "D", rating: undefined, userRatingCount: undefined }),
      gPlace({ id: "X", businessStatus: "CLOSED_PERMANENTLY", rating: 5 }),
    ] } });
    const r = await searchRatedPlaces("  best seafood Miami  ");
    expect(r.map((p) => p.placeId)).toEqual(["C", "B", "A", "D"]);
    expect(r[0]).toEqual({
      placeId: "C", name: "Joe's", address: "11 Washington Ave, Miami Beach, FL", lat: 25.76, lng: -80.13, primaryType: "seafood_restaurant",
      typeLabel: "Seafood restaurant", neighborhood: "South of Fifth", city: "Miami Beach", country: "US", rating: 4.8, ratingCount: 4000, mapsUrl: "https://maps.google.com/?cid=9",
    });
    expect(r[3]).toMatchObject({ rating: null, ratingCount: 0 });
    const { url, init, h } = H(f);
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(JSON.parse(init.body as string)).toEqual({ textQuery: "best seafood Miami", pageSize: 20 });
    expect(h.get("x-goog-fieldmask")).toBe(RATED_MASK);
    expect(RATED_MASK).toBe(`${FIELD_MASK},places.rating,places.userRatingCount`);
  });
  it("neighborhood falls back to sublocality, then empty", async () => {
    mockFetch({ status: 200, body: { places: [
      gPlace({ id: "A", addressComponents: [{ longText: "Brickell", shortText: "Brickell", types: ["sublocality_level_1"] }] }),
      gPlace({ id: "B", rating: 4.5, addressComponents: [{ longText: "Wynwood", shortText: "Wynwood", types: ["sublocality"] }] }),
      gPlace({ id: "C", rating: 4.4, addressComponents: undefined }),
    ] } });
    expect((await searchRatedPlaces("x")).map((p) => p.neighborhood)).toEqual(["Brickell", "Wynwood", ""]);
  });
  it("unrated places sort last wherever they start", async () => {
    mockFetch(
      { status: 200, body: { places: [gPlace({ id: "N1", rating: undefined }), gPlace({ id: "R", rating: 4.1 }), gPlace({ id: "N2", rating: undefined, userRatingCount: 5 })] } },
      { status: 200, body: { places: [gPlace({ id: "R", rating: 4.1 }), gPlace({ id: "N1", rating: undefined })] } },
    );
    expect((await searchRatedPlaces("x")).map((p) => p.placeId)).toEqual(["R", "N1", "N2"]);
    expect((await searchRatedPlaces("x")).map((p) => p.placeId)).toEqual(["R", "N1"]);
  });
  it("address parts without a types list are skipped instead of crashing", async () => {
    mockFetch({ status: 200, body: { places: [gPlace({ addressComponents: [{ longText: "Odd", shortText: "Odd" }, { longText: "Venice", shortText: "Venice", types: ["neighborhood"] }] })] } });
    expect((await searchRatedPlaces("x"))[0]).toMatchObject({ neighborhood: "Venice", city: "" });
  });
  it("no results", async () => {
    mockFetch({ status: 200, body: {} });
    expect(await searchRatedPlaces("x")).toEqual([]);
  });
  it.each([["", "Search text is required"], ["   ", "Search text is required"], ["a".repeat(201), "Search text cannot exceed 200 characters"]])("rejects %j", async (q, msg) => {
    const f = mockFetch();
    await expect(searchRatedPlaces(q)).rejects.toThrow(msg);
    expect(f).not.toHaveBeenCalled();
  });
  it("boundary: 200 characters is allowed", async () => {
    mockFetch({ status: 200, body: { places: [] } });
    await expect(searchRatedPlaces("a".repeat(200))).resolves.toEqual([]);
  });
  it("Google errors become PlacesError", async () => {
    mockFetch({ status: 403, body: { error: { status: "PERMISSION_DENIED", message: "nope" } } });
    await expect(searchRatedPlaces("x")).rejects.toBeInstanceOf(PlacesError);
  });
});

describe("getPlacePhoto", () => {
  const details = (o: Record<string, unknown> = {}) => ({ status: 200, body: { photos: [{ name: "places/ChIJ1/photos/P1", authorAttributions: [{ displayName: "Ana R", uri: "https://maps.google.com/contrib/1" }], ...o }, { name: "places/ChIJ1/photos/P2" }] } });
  it("happy: details (photos only), then the first photo's 800px URL without a redirect, with the credit", async () => {
    const f = mockFetch(details(), { status: 200, body: { name: "places/ChIJ1/photos/P1/media", photoUri: "https://lh3.googleusercontent.com/p/abc" } });
    expect(await getPlacePhoto("ChIJ1")).toEqual({ uri: "https://lh3.googleusercontent.com/p/abc", author: "Ana R", authorUri: "https://maps.google.com/contrib/1" });
    const a = H(f, 0), b = H(f, 1);
    expect(a.url).toBe("https://places.googleapis.com/v1/places/ChIJ1");
    expect(a.h.get("x-goog-fieldmask")).toBe("photos");
    expect(b.url).toBe("https://places.googleapis.com/v1/places/ChIJ1/photos/P1/media?maxWidthPx=800&skipHttpRedirect=true");
    expect(b.h.has("x-goog-fieldmask")).toBe(false);
    expect(b.h.get("x-goog-api-key")).toBe("g-key");
  });
  it("no credit on the photo: author fields are null", async () => {
    mockFetch(details({ authorAttributions: undefined }), { status: 200, body: { photoUri: "https://x/y" } });
    expect(await getPlacePhoto("ChIJ1")).toEqual({ uri: "https://x/y", author: null, authorUri: null });
  });
  it("credit without a name or link", async () => {
    mockFetch(details({ authorAttributions: [{}] }), { status: 200, body: { photoUri: "https://x/y" } });
    expect(await getPlacePhoto("ChIJ1")).toEqual({ uri: "https://x/y", author: null, authorUri: null });
  });
  it("a place with no photos returns null after one call", async () => {
    const f = mockFetch({ status: 200, body: {} });
    expect(await getPlacePhoto("ChIJ1")).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("media with no URL returns null", async () => {
    mockFetch(details(), { status: 200, body: {} });
    expect(await getPlacePhoto("ChIJ1")).toBeNull();
  });
  it("cache: reused just under 12 hours, refetched at exactly 12 hours; nulls are cached too", async () => {
    const f = mockFetch({ status: 200, body: {} }, details(), { status: 200, body: { photoUri: "https://x/new" } });
    expect(await getPlacePhoto("ChIJ1", 0)).toBeNull();
    expect(await getPlacePhoto("ChIJ1", 12 * HOUR - 1)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    expect(await getPlacePhoto("ChIJ1", 12 * HOUR)).toMatchObject({ uri: "https://x/new" });
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("cache is per place", async () => {
    const f = mockFetch({ status: 200, body: {} }, { status: 200, body: {} });
    await getPlacePhoto("A", 0); await getPlacePhoto("B", 0);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("rejects a bad place id without calling Google", async () => {
    const f = mockFetch();
    await expect(getPlacePhoto("../etc")).rejects.toThrow("Place id has invalid characters");
    expect(f).not.toHaveBeenCalled();
  });
  it("errors are not cached", async () => {
    mockFetch({ status: 500, body: { error: { status: "INTERNAL" } } }, { status: 200, body: {} });
    await expect(getPlacePhoto("ChIJ1", 0)).rejects.toBeInstanceOf(PlacesError);
    expect(await getPlacePhoto("ChIJ1", 1)).toBeNull();
  });
  it("not configured", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    await expect(getPlacePhoto("ChIJ1")).rejects.toThrow("Live search is not configured");
  });
});
