// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { searchNear, RATED_MASK, NEARBY_RADIUS_M } from "@/lib/places/client";
import { mockPayPal as mockFetch } from "../../../helpers/paypal";

const place = (id: string, rating: number | undefined, count: number, status = "OPERATIONAL") => ({
  id, displayName: { text: id }, primaryType: "restaurant", businessStatus: status, rating, userRatingCount: count,
});

beforeEach(() => vi.stubEnv("GOOGLE_PLACES_API_KEY", "g-key"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("searchNear", () => {
  it("happy: biases the search to a circle around the point, with ratings, best rated first, open places only", async () => {
    const f = mockFetch({ status: 200, body: { places: [place("b", 4.5, 10), place("a", 4.8, 5), place("c", 4.5, 99), place("closed", 5, 999, "CLOSED_PERMANENTLY"), place("none", undefined, 0)] } });
    const r = await searchNear("dinner near The Colosseum", { lat: 36.1, lng: -115.2 });
    expect(r.map((p) => p.placeId)).toEqual(["a", "c", "b", "none"]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(new Headers(init.headers).get("x-goog-fieldmask")).toBe(RATED_MASK);
    expect(JSON.parse(String(init.body))).toEqual({
      textQuery: "dinner near The Colosseum", pageSize: 20,
      locationBias: { circle: { center: { latitude: 36.1, longitude: -115.2 }, radius: NEARBY_RADIUS_M } },
    });
  });
  it("unrated places sort last, whichever order Google returns them in", async () => {
    mockFetch({ status: 200, body: { places: [place("u1", undefined, 0), place("r", 4, 1), place("u2", undefined, 3)] } }, { status: 200, body: { places: [place("r", 4, 1), place("u1", undefined, 0)] } });
    expect((await searchNear("x", null)).map((p) => p.placeId)).toEqual(["r", "u2", "u1"]);
    expect((await searchNear("x", null)).map((p) => p.placeId)).toEqual(["r", "u1"]);
  });
  it("without a point: a plain text search", async () => {
    const f = mockFetch({ status: 200, body: {} });
    expect(await searchNear("  dessert near Sphere  ", null)).toEqual([]);
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ textQuery: "dessert near Sphere", pageSize: 20 });
  });
  it("validation: text required, at most 200 characters (boundary)", async () => {
    mockFetch({ status: 200, body: {} });
    await expect(searchNear(" ", null)).rejects.toThrow("Search text is required");
    await expect(searchNear("x".repeat(201), null)).rejects.toThrow("Search text cannot exceed 200 characters");
    await expect(searchNear("x".repeat(200), null)).resolves.toEqual([]);
  });
});
