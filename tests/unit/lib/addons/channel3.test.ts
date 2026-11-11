// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addOnsFor, clearAddOnCache, PAIRINGS, MAX_ADDON_PRICE } from "@/lib/addons/channel3";
import { GET } from "@/app/api/addons/route";
import { CATEGORIES } from "@/lib/catalog/types";
import { mockPayPal as mockFetch } from "../../../helpers/paypal";

const offer = (o: Record<string, unknown> = {}) => ({ url: "https://aff.example/buy", domain: "nordstrom.com", price: { price: 42, currency: "USD" }, availability: "InStock", ...o });
const product = (o: Record<string, unknown> = {}) => ({
  id: "prod_1", title: "Lavender Bath Set", brands: [{ id: "b1", name: "Aesop" }],
  images: [{ url: "https://img/side.jpg" }, { url: "https://img/main.jpg", is_main_image: true }], offers: [offer()], ...o,
});

beforeEach(() => { clearAddOnCache(); vi.stubEnv("CHANNEL3_API_KEY", "c3-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("addOnsFor", () => {
  it("happy: searches Channel3 with the pairing for the experience's category and returns clean add-ons", async () => {
    const f = mockFetch({ status: 200, body: { products: [product()] } });
    expect(await addOnsFor("hugh-spa")).toEqual([{
      id: "prod_1", title: "Lavender Bath Set", brand: "Aesop", imageUrl: "https://img/main.jpg", price: "42.00", currency: "USD", url: "https://aff.example/buy", merchant: "nordstrom.com",
    }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.trychannel3.com/v1/search");
    expect(new Headers(init.headers).get("x-api-key")).toBe("c3-key");
    expect(JSON.parse(init.body as string)).toEqual({ query: PAIRINGS.wellness, limit: 12, filters: { price: { max_price: 75 }, availability: ["InStock"], condition: "new" } });
  });
  it("every category has a pairing", () => {
    for (const c of CATEGORIES) expect(PAIRINGS[c]).toMatch(/gift/);
  });
  it("picks the cheapest in-stock USD offer under the cap, and skips products without one", async () => {
    mockFetch({ status: 200, body: { products: [
      product({ id: "a", offers: [offer({ price: { price: 60, currency: "USD" }, url: "u60" }), offer({ price: { price: 30, currency: "USD" }, url: "u30" }), offer({ price: { price: 20, currency: "USD" }, availability: "OutOfStock" })] }),
      product({ id: "b", offers: [offer({ price: { price: 30, currency: "EUR" } })] }),
      product({ id: "c", offers: [offer({ price: { price: MAX_ADDON_PRICE + 0.01, currency: "USD" } })] }),
      product({ id: "d", offers: undefined }),
    ] } });
    const r = await addOnsFor("carasau-pasta-bar");
    expect(r.map((x) => [x.id, x.price, x.url])).toEqual([["a", "30.00", "u30"]]);
  });
  it("boundary: exactly $75 is allowed", async () => {
    mockFetch({ status: 200, body: { products: [product({ offers: [offer({ price: { price: 75, currency: "USD" } })] })] } });
    expect((await addOnsFor("carasau-pasta-bar"))[0].price).toBe("75.00");
  });
  it("caps at 3", async () => {
    mockFetch({ status: 200, body: { products: [1, 2, 3, 4, 5].map((i) => product({ id: `p${i}` })) } });
    expect(await addOnsFor("carasau-pasta-bar")).toHaveLength(3);
  });
  it("missing brand and images are fine; first image used when none is marked main", async () => {
    mockFetch({ status: 200, body: { products: [product({ brands: undefined, images: undefined }), product({ id: "x", images: [{ url: "https://img/first.jpg" }] })] } });
    const r = await addOnsFor("carasau-pasta-bar");
    expect(r[0]).toMatchObject({ brand: null, imageUrl: null });
    expect(r[1].imageUrl).toBe("https://img/first.jpg");
  });
  it("caches per pairing for an hour", async () => {
    const f = mockFetch({ status: 200, body: { products: [product()] } }, { status: 200, body: { products: [] } });
    await addOnsFor("hugh-spa", 0);
    await addOnsFor("desuar-hollywood-spa", 60 * 60 * 1000 - 1); // same category, same pairing
    expect(f).toHaveBeenCalledTimes(1);
    expect(await addOnsFor("hugh-spa", 60 * 60 * 1000)).toEqual([]); // expired → refetched
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("no key: returns nothing without calling Channel3", async () => {
    vi.stubEnv("CHANNEL3_API_KEY", "");
    const f = mockFetch();
    expect(await addOnsFor("carasau-pasta-bar")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
  it.each([
    ["an HTTP error", { status: 401, body: { error: "bad key" } }],
    ["no products field", { status: 200, body: {} }],
  ])("%s returns nothing (and logs errors) instead of breaking the gift page", async (_l, reply) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch(reply);
    expect(await addOnsFor("carasau-pasta-bar")).toEqual([]);
    if (reply.status !== 200) expect(log).toHaveBeenCalled();
  });
  it("unknown experience throws", async () => {
    await expect(addOnsFor("nope")).rejects.toThrow("Experience not found: nope");
  });
});

describe("GET /api/addons", () => {
  it("returns add-ons for the experience", async () => {
    mockFetch({ status: 200, body: { products: [product()] } });
    const res = await GET(new Request("http://x/api/addons?experience=hugh-spa"));
    expect(res.status).toBe(200);
    expect((await res.json()).addOns).toHaveLength(1);
  });
  it("404 for an unknown or missing experience", async () => {
    expect((await GET(new Request("http://x/api/addons?experience=nope"))).status).toBe(404);
    expect((await GET(new Request("http://x/api/addons"))).status).toBe(404);
  });
});
