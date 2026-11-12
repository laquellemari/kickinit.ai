// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { priceFor, PriceError } from "@/lib/bookings/pricing";
import { saveMenu } from "@/lib/pricing/menu-store";
import type { MenuItem } from "@/lib/pricing/menu";
import { mockPayPal as mockFetch } from "../../../helpers/paypal";
import { useTestDb } from "../../../helpers/db";

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); vi.stubEnv("GOOGLE_PLACES_API_KEY", "g"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const place = (o: Record<string, unknown> = {}) => ({ status: 200, body: { id: "ChIJ1", displayName: { text: "Spa Uno" }, primaryType: "spa", location: { latitude: 1, longitude: 2 }, ...o } });
const item = (o: Partial<MenuItem> = {}): MenuItem => ({ id: "massage-150", name: "60-minute massage", price: "150.00", per: "person", durationMinutes: 60, sourceUrl: "https://spauno.com/prices", ...o });
const withMenu = (items: MenuItem[]) => saveMenu("ChIJ1", { items, checkedAt: new Date() });

describe("priceFor: partners", () => {
  it("a fixed-price partner: venue price + 20% concierge fee", async () => {
    const r = await priceFor("partner", "hugh-spa", 2);
    expect(r).toMatchObject({ kind: "partner", name: "Hugh Spa", quote: { venueTotal: "190.00", fee: "38.00", total: "228.00", free: false, experienceId: "hugh-spa", serviceId: null } });
  });
  it("members pay no fee", async () => {
    expect((await priceFor("partner", "hugh-spa", 2, { member: true })).quote).toMatchObject({ venueTotal: "190.00", fee: "0.00", total: "190.00" });
  });
  it("a partner restaurant is free to book", async () => {
    expect((await priceFor("partner", "carasau-pasta-bar", 2)).quote).toMatchObject({ free: true, venueTotal: "0.00", fee: "0.00", total: "0.00" });
  });
  it("factsAt describes the partner", async () => {
    expect((await priceFor("partner", "hugh-spa", 2)).factsAt(new Date("2026-11-14T19:00:00Z")).city).toBe("Los Angeles");
  });
});

describe("priceFor: request-to-book venues", () => {
  it("a restaurant is free: no menu lookup, nothing to pay", async () => {
    const f = mockFetch(place({ primaryType: "italian_restaurant", displayName: { text: "Barbusa" } }));
    const r = await priceFor("live", "gp:ChIJ1", 3);
    expect(r).toMatchObject({ kind: "live", name: "Barbusa", quote: { free: true, total: "0.00", unitPrice: "0.00", experienceId: "gp:ChIJ1", description: "Barbusa · 3 guests (request)" } });
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://places.googleapis.com/v1/places/ChIJ1");
  });
  it("anything else: the venue's own published price × guests + fee", async () => {
    await withMenu([item(), item({ id: "facial-95", name: "Facial", price: "95.00" })]);
    mockFetch(place());
    const r = await priceFor("live", "gp:ChIJ1", 2, { serviceId: "massage-150" });
    expect(r.quote).toMatchObject({ venueTotal: "300.00", fee: "60.00", total: "360.00", unitPrice: "150.00", free: false, serviceId: "massage-150", serviceName: "60-minute massage", description: "Spa Uno: 60-minute massage · 2 guests (request)" });
    expect(r.factsAt(new Date()).tags).toBeDefined();
  });
  it("a per-group price isn't multiplied by guests; members pay no fee", async () => {
    await withMenu([item({ id: "room-300", name: "Private sauna room", price: "300.00", per: "group" })]);
    mockFetch(place());
    expect((await priceFor("live", "gp:ChIJ1", 4, { serviceId: "room-300", member: true })).quote).toMatchObject({ venueTotal: "300.00", fee: "0.00", total: "300.00" });
  });
  it("a long name is cut so the PayPal description fits 127 characters", async () => {
    await withMenu([item({ name: "x".repeat(80) })]);
    mockFetch(place({ displayName: { text: "y".repeat(80) } }));
    const d = (await priceFor("live", "gp:ChIJ1", 1, { serviceId: "massage-150" })).quote.description;
    expect(d.length).toBe(127);
    expect(d.endsWith(" · 1 guest (request)")).toBe(true);
  });
  it("a long restaurant name is cut too", async () => {
    mockFetch(place({ primaryType: "bar", displayName: { text: "z".repeat(140) } }));
    expect((await priceFor("live", "gp:ChIJ1", 2)).quote.description.length).toBe(127);
  });
  it("no published prices: 409", async () => {
    await withMenu([]);
    mockFetch(place());
    await expect(priceFor("live", "gp:ChIJ1", 2, { serviceId: "massage-150" })).rejects.toMatchObject({ status: 409, message: "This venue doesn't publish its prices, so it can't be booked through kickinit yet" });
  });
  it("a service that isn't on the menu: 400", async () => {
    await withMenu([item()]);
    mockFetch(place());
    await expect(priceFor("live", "gp:ChIJ1", 2, { serviceId: "gone-99" })).rejects.toMatchObject({ status: 400, message: "That price isn't on the venue's menu anymore. Pick another" });
  });
  it.each([undefined, "", 5])("no service picked (%j): 400, before any lookup", async (serviceId) => {
    mockFetch(place());
    await expect(priceFor("live", "gp:ChIJ1", 2, { serviceId })).rejects.toMatchObject({ status: 400, message: "Pick one of the venue's listed prices" });
  });
});

describe("priceFor: validation", () => {
  it.each([
    ["bad kind", "other", "hugh-spa", 2, 400, "Kind must be partner or live"],
    ["missing id", "partner", "", 2, 400, "Item id is required"],
    ["non-string id", "partner", 5, 2, 400, "Item id is required"],
    ["live id without prefix", "live", "ChIJ1", 2, 400, "Live item ids start with gp:"],
    ["unknown partner", "partner", "nope", 2, 404, "Experience not found: nope"],
    ["partner party too big", "partner", "hugh-spa", 99, 400, "Party size"],
    ["live party 0", "live", "gp:ChIJ1", 0, 400, "Party size must be a whole number from 1 to 20"],
    ["live party 21", "live", "gp:ChIJ1", 21, 400, "Party size must be a whole number from 1 to 20"],
    ["live party 1.5", "live", "gp:ChIJ1", 1.5, 400, "Party size must be a whole number from 1 to 20"],
  ])("rejects %s", async (_l, kind, id, party, status, msg) => {
    const err = await priceFor(kind, id, party as number).catch((e) => e);
    expect(err).toBeInstanceOf(PriceError);
    expect(err).toMatchObject({ status });
    expect(err.message).toContain(msg);
  });
  it("boundary: live parties of 1 and 20 are fine", async () => {
    mockFetch(place({ primaryType: "cafe" }), place({ primaryType: "cafe" }));
    expect((await priceFor("live", "gp:ChIJ1", 1)).quote.partySize).toBe(1);
    expect((await priceFor("live", "gp:ChIJ1", 20)).quote.partySize).toBe(20);
  });
});
