// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nightTimes, planNight, clearNightCache, DEFAULT_SHOW, STOPS_PER_PART, MIN_RATINGS } from "@/lib/night/plan";
import type { EventDetail } from "@/lib/events/ticketmaster";
import { createLiveEvent, createLivePlace } from "../../../helpers/factories";

const NOW = new Date("2026-11-12T15:00:00Z");
const detail = (o: Partial<EventDetail> = {}, e = {}): EventDetail => ({ event: createLiveEvent(e), lat: 36.1, lng: -115.2, ...o });
const spot = (id: string, o = {}) => createLivePlace({ placeId: id, name: id, rating: 4.6, ratingCount: 500, ...o });

beforeEach(() => clearNightCache());

describe("nightTimes", () => {
  it("an 8 pm show: dinner at 6, out around 10:30 (too late to book a slot)", () => {
    expect(nightTimes("20:00:00")).toEqual({ dinner: "18:00", meal: "Dinner", show: "20:00", afterLabel: "10:30 pm", afterSlot: null });
  });
  it("a 7:30 show: dinner at 5:30, out at 10 (a bookable slot)", () => {
    expect(nightTimes("19:30:00")).toEqual({ dinner: "17:30", meal: "Dinner", show: "19:30", afterLabel: "10:00 pm", afterSlot: "22:00" });
  });
  it("dinner rounds down to the half hour, after rounds up", () => {
    expect(nightTimes("19:45:00")).toMatchObject({ dinner: "17:30", afterLabel: "10:30 pm" });
  });
  it(`time TBA (or unreadable): planned around a ${DEFAULT_SHOW} show`, () => {
    expect(nightTimes(null)).toEqual({ dinner: "17:30", meal: "Dinner", show: null, afterLabel: "10:00 pm", afterSlot: "22:00" });
    expect(nightTimes("TBA")).toMatchObject({ show: null, dinner: "17:30" });
  });
  it("boundary: dinner at 4 pm is dinner, 3:30 is lunch", () => {
    expect(nightTimes("18:00:00")).toMatchObject({ dinner: "16:00", meal: "Dinner" });
    expect(nightTimes("17:59:00")).toMatchObject({ dinner: "15:30", meal: "Lunch" });
  });
  it("a matinee: lunch before, and the after-show slot is bookable", () => {
    expect(nightTimes("14:00:00")).toEqual({ dinner: "12:00", meal: "Lunch", show: "14:00", afterLabel: "4:30 pm", afterSlot: "16:30" });
  });
  it("a morning show: the meal never goes before the first bookable slot", () => {
    expect(nightTimes("10:00:00")).toMatchObject({ dinner: "09:00", meal: "Lunch" });
  });
  it("a late show lets out after midnight", () => {
    expect(nightTimes("23:00:00")).toMatchObject({ dinner: "21:00", afterLabel: "1:30 am", afterSlot: null });
  });
});

describe("planNight", () => {
  it("happy: searches near the venue for dinner and for dessert or drinks, three good spots each", async () => {
    const search = vi.fn(async (q: string) => (q.startsWith("dinner") ? ["d1", "d2", "d3", "d4"].map((id) => spot(id)) : ["a1", "a2"].map((id) => spot(id, { typeLabel: "Dessert shop" }))));
    const p = await planNight(detail(), search, NOW);
    expect(search.mock.calls).toEqual([
      ["dinner restaurants near The Colosseum at Caesars Palace, Las Vegas, NV", { lat: 36.1, lng: -115.2 }],
      ["dessert or cocktail bar near The Colosseum at Caesars Palace, Las Vegas, NV", { lat: 36.1, lng: -115.2 }],
    ]);
    expect(p.before.map((s) => s.placeId)).toEqual(["d1", "d2", "d3"]);
    expect(p.before).toHaveLength(STOPS_PER_PART);
    expect(p.after).toEqual([
      { placeId: "a1", name: "a1", typeLabel: "Dessert shop", rating: 4.6, ratingCount: 500, address: "1 Main St, San Diego, CA" },
      { placeId: "a2", name: "a2", typeLabel: "Dessert shop", rating: 4.6, ratingCount: 500, address: "1 Main St, San Diego, CA" },
    ]);
    expect(p.times).toMatchObject({ dinner: "18:00", show: "20:00" });
    expect(p.event.id).toBe("tm:G5v1");
  });
  it("skips places that aren't somewhere to eat or drink, other stages, and little-known places", async () => {
    const search = vi.fn(async () => [
      spot("museum", { dining: false }), spot("stage", { primaryType: "concert_hall" }),
      spot("few", { ratingCount: MIN_RATINGS - 1 }), spot("enough", { ratingCount: MIN_RATINGS }),
    ]);
    const p = await planNight(detail(), search, NOW);
    expect(p.before.map((s) => s.placeId)).toEqual(["enough"]);
  });
  it("never suggests the same place twice", async () => {
    const search = vi.fn(async () => [spot("same")]);
    const p = await planNight(detail(), search, NOW);
    expect(p.before.map((s) => s.placeId)).toEqual(["same"]);
    expect(p.after).toEqual([]);
  });
  it("a matinee looks for lunch; no coordinates or city/state still works", async () => {
    const search = vi.fn(async () => []);
    await planNight(detail({ lat: null, lng: null }, { localTime: "13:00:00", city: "", state: "" }), search, NOW);
    expect(search).toHaveBeenNthCalledWith(1, "lunch restaurants near The Colosseum at Caesars Palace", null);
  });
  it("one lat without lng is no point at all", async () => {
    const search = vi.fn(async () => []);
    await planNight(detail({ lng: null }), search, NOW);
    expect(search.mock.calls[0][1]).toBeNull();
  });
  it("one half failing doesn't lose the other", async () => {
    const search = vi.fn(async (q: string) => { if (q.startsWith("dinner")) throw new Error("Google down"); return [spot("a1")]; });
    const p = await planNight(detail(), search, NOW);
    expect(p.before).toEqual([]);
    expect(p.after.map((s) => s.placeId)).toEqual(["a1"]);
  });
  it("is cached for 30 minutes per event when anything was found", async () => {
    const search = vi.fn(async () => [spot("d1")]);
    await planNight(detail(), search, NOW);
    await planNight(detail(), search, new Date(NOW.getTime() + 30 * 60_000 - 1));
    expect(search).toHaveBeenCalledTimes(2);
    await planNight(detail(), search, new Date(NOW.getTime() + 30 * 60_000));
    expect(search).toHaveBeenCalledTimes(4);
  });
  it("an empty night is asked again next time", async () => {
    const search = vi.fn(async () => []);
    await planNight(detail(), search, NOW);
    await planNight(detail(), search, NOW);
    expect(search).toHaveBeenCalledTimes(4);
  });
  it("defaults: Google search and the clock", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const p = await planNight(detail());
    expect(p.before).toEqual([]);
    vi.unstubAllEnvs();
  });
});
