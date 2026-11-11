// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mockPayPal as mockFetch } from "../../helpers/paypal";
import { clearPhotoCache } from "@/lib/places/client";

const load = async () => {
  vi.resetModules();
  return { photo: await import("@/app/api/places/photo/[placeId]/route"), search: await import("@/app/api/places/search/route") };
};
const req = (url: string, ip = "1.1.1.1") => new Request(url, { headers: { "x-forwarded-for": ip } });
const params = (placeId: string) => ({ params: Promise.resolve({ placeId }) });

beforeEach(() => { vi.stubEnv("GOOGLE_PLACES_API_KEY", "g-key"); clearPhotoCache(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/places/photo/:placeId", () => {
  it("200 with the URL and credit, cacheable for an hour", async () => {
    const { photo } = await load();
    mockFetch({ status: 200, body: { photos: [{ name: "places/A/photos/1", authorAttributions: [{ displayName: "Ana", uri: "https://u" }] }] } }, { status: 200, body: { photoUri: "https://img" } });
    const res = await photo.GET(req("http://x/api/places/photo/A"), params("A"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await res.json()).toEqual({ uri: "https://img", author: "Ana", authorUri: "https://u" });
  });
  it("404 when the place has no photo", async () => {
    const { photo } = await load();
    mockFetch({ status: 200, body: {} });
    const res = await photo.GET(req("http://x"), params("A"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No photo for this place" });
  });
  it("400 for a bad id", async () => {
    const { photo } = await load();
    expect((await photo.GET(req("http://x"), params("a b"))).status).toBe(400);
  });
  it("502 when Google fails", async () => {
    const { photo } = await load();
    mockFetch({ status: 500, body: { error: { status: "INTERNAL" } } });
    expect((await photo.GET(req("http://x"), params("A"))).status).toBe(502);
  });
  it("rate limit: 120 per minute per visitor, the 121st is 429; other visitors unaffected", async () => {
    const { photo } = await load();
    mockFetch({ status: 200, body: {} });
    for (let i = 0; i < 120; i++) expect((await photo.GET(req("http://x", "9.9.9.9"), params("A"))).status).toBe(404);
    const over = await photo.GET(req("http://x", "9.9.9.9"), params("A"));
    expect(over.status).toBe(429);
    expect((await photo.GET(req("http://x", "8.8.8.8"), params("A"))).status).toBe(404);
  });
});

describe("GET /api/places/search", () => {
  it("200 with rated places", async () => {
    const { search } = await load();
    mockFetch({ status: 200, body: { places: [{ id: "A", displayName: { text: "Joe's" }, rating: 4.7, userRatingCount: 10 }] } });
    const res = await search.GET(req("http://x/api/places/search?q=seafood%20miami"));
    expect(res.status).toBe(200);
    expect((await res.json()).places[0]).toMatchObject({ placeId: "A", name: "Joe's", rating: 4.7, ratingCount: 10 });
  });
  it("400 without a query", async () => {
    const { search } = await load();
    const res = await search.GET(req("http://x/api/places/search"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Search text is required" });
  });
  it("rate limit: 10 per minute, the 11th is 429", async () => {
    const { search } = await load();
    for (let i = 0; i < 10; i++) expect((await search.GET(req("http://x/api/places/search"))).status).toBe(400);
    const res = await search.GET(req("http://x/api/places/search"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests. Try again in a minute." });
  });
});
