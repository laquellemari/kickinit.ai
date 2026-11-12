// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchEvents, findVenueIds, venueNames, toLiveEvent, bestImage, isEventVenue, eventWhen, eventPrice, clearEventCache, EventsError, MAX_EVENTS, MAX_VENUES, CACHE_MS,
} from "@/lib/events/ticketmaster";

const NOW = new Date("2026-11-11T20:00:00Z");
const tm = (o: Record<string, unknown> = {}) => ({
  id: "G5v1", name: "Adele", url: "https://www.ticketmaster.com/event/G5v1",
  dates: { start: { localDate: "2026-11-14", localTime: "20:00:00" }, status: { code: "onsale" } },
  images: [{ url: "https://s1.ticketm.net/a_3_2.jpg", ratio: "3_2", width: 1024 }, { url: "https://s1.ticketm.net/a_16_9.jpg", ratio: "16_9", width: 640 }, { url: "https://s1.ticketm.net/big_16_9.jpg", ratio: "16_9", width: 2048 }],
  priceRanges: [{ type: "standard", min: 59.5, max: 250, currency: "USD" }],
  classifications: [{ segment: { name: "Music" }, genre: { name: "Pop" } }],
  _embedded: { venues: [{ name: "The Colosseum at Caesars Palace", city: { name: "Las Vegas" }, state: { stateCode: "NV" } }] },
  ...o,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const urlOf = (f: ReturnType<typeof vi.fn>, n: number) => new URL((f.mock.calls[n] as unknown as [URL])[0].toString());

beforeEach(() => { vi.stubEnv("TICKETMASTER_API_KEY", "tm-key"); clearEventCache(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("toLiveEvent", () => {
  it("maps Ticketmaster's event: venue, local time, widest 16:9 image, price range, genre", () => {
    expect(toLiveEvent(tm())).toEqual({
      id: "tm:G5v1", name: "Adele", url: "https://www.ticketmaster.com/event/G5v1", localDate: "2026-11-14", localTime: "20:00:00",
      venue: "The Colosseum at Caesars Palace", city: "Las Vegas", state: "NV", image: "https://s1.ticketm.net/big_16_9.jpg",
      priceMin: 59.5, priceMax: 250, currency: "USD", genre: "Pop",
    });
  });
  it("a mangled apostrophe from Ticketmaster is repaired; a single question mark is kept", () => {
    expect(toLiveEvent(tm({ name: "Danny Elfman???s Music" }))!.name).toBe("Danny Elfman’s Music");
    expect(toLiveEvent(tm({ name: "Who? Live" }))!.name).toBe("Who? Live");
  });
  it("missing pieces become empty or null; an Undefined genre falls back to the segment", () => {
    expect(toLiveEvent(tm({ dates: { start: { localDate: "2026-11-14" } }, images: [], priceRanges: [{ min: 40 }], _embedded: undefined, classifications: [{ genre: { name: "Undefined" }, segment: { name: "Comedy" } }] })))
      .toMatchObject({ localTime: null, venue: "", city: "", state: "", image: null, priceMin: 40, priceMax: null, currency: null, genre: "Comedy" });
    expect(toLiveEvent(tm({ priceRanges: undefined, classifications: undefined }))).toMatchObject({ priceMin: null, genre: null });
    expect(toLiveEvent(tm({ classifications: [{ segment: { name: "Undefined" } }] }))!.genre).toBeNull();
  });
  it.each([
    ["cancelled", { dates: { start: { localDate: "2026-11-14" }, status: { code: "cancelled" } } }],
    ["postponed", { dates: { start: { localDate: "2026-11-14" }, status: { code: "postponed" } } }],
    ["no date", { dates: { start: {} } }],
    ["no dates at all", { dates: undefined }],
    ["no ticket page", { url: undefined }],
    ["no name", { name: undefined }],
  ])("drops events that are %s", (_l, o) => expect(toLiveEvent(tm(o))).toBeNull());
});

describe("bestImage", () => {
  it("any https image when there's no 16:9; none without https", () => {
    expect(bestImage([{ url: "https://x/a.jpg", ratio: "4_3" }, { url: "https://x/b.jpg", ratio: "4_3", width: 10 }])).toBe("https://x/b.jpg");
    expect(bestImage([{ url: "https://x/b.jpg", ratio: "4_3", width: 10 }, { url: "https://x/a.jpg", ratio: "4_3" }])).toBe("https://x/b.jpg");
    expect(bestImage([{ url: "http://x/a.jpg", ratio: "16_9" }, { ratio: "16_9" }])).toBeNull();
    expect(bestImage(undefined)).toBeNull();
  });
});

describe("formatting", () => {
  it.each([
    [{ localDate: "2026-11-14", localTime: "20:00:00" }, "Sat, Nov 14 · 8:00 PM"],
    [{ localDate: "2026-11-14", localTime: "00:30:00" }, "Sat, Nov 14 · 12:30 AM"],
    [{ localDate: "2026-11-14", localTime: "12:05:00" }, "Sat, Nov 14 · 12:05 PM"],
    [{ localDate: "2026-11-14", localTime: null }, "Sat, Nov 14 · time TBA"],
  ])("eventWhen(%j) = %s", (e, s) => expect(eventWhen(e)).toBe(s));
  it.each([
    [{ priceMin: 59.5, priceMax: 250, currency: "USD" }, "$60–$250"],
    [{ priceMin: 59.5, priceMax: 59.6, currency: "USD" }, "From $60"],
    [{ priceMin: 1200, priceMax: null, currency: null }, "From $1,200"],
    [{ priceMin: null, priceMax: null, currency: null }, null],
    [{ priceMin: 50, priceMax: 90, currency: "CAD" }, null],
  ])("eventPrice(%j) = %s", (e, s) => expect(eventPrice(e)).toBe(s));
  it.each(["performing_arts_theater", "concert_hall", "stadium", "arena", "live_music_venue", "amphitheatre", "event_venue", "comedy_club"])("%s is a stage", (t) => expect(isEventVenue(t)).toBe(true));
  it.each(["restaurant", "spa", "casino", "", null, undefined])("%j is not", (t) => expect(isEventVenue(t)).toBe(false));
});

describe("searchEvents", () => {
  it("by keyword and city: sorted soonest first, from today, US only, with our key", async () => {
    const f = vi.fn(async () => json({ _embedded: { events: [tm(), tm({ id: "G2", name: "Jazz Night" })] } }));
    vi.stubGlobal("fetch", f);
    const events = await searchEvents({ keyword: "concerts", city: "Las Vegas", stateCode: "nv", category: "music" }, NOW);
    expect(events.map((e) => e.id)).toEqual(["tm:G5v1", "tm:G2"]);
    const u = urlOf(f, 0);
    expect(u.origin + u.pathname).toBe("https://app.ticketmaster.com/discovery/v2/events.json");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      apikey: "tm-key", size: String(MAX_EVENTS), sort: "date,asc", countryCode: "US", city: "Las Vegas", stateCode: "NV",
      keyword: "concerts", classificationName: "music", startDateTime: "2026-11-11T00:00:00Z",
    });
  });
  it("by venue: finds the venue (preferring the city), then lists its events", async () => {
    const venues = json({ _embedded: { venues: [{ id: "KovZ1", name: "The Colosseum", city: { name: "Atlantic City" } }, { id: "KovZ2", name: "The Colosseum at Caesars", city: { name: "Las Vegas" } }] } });
    const f = vi.fn()
      .mockResolvedValueOnce(venues)
      .mockResolvedValueOnce(json({ _embedded: { venues: [{ id: "KovZ2", name: "The Colosseum at Caesars", city: { name: "Las Vegas" } }] } }))
      .mockResolvedValueOnce(json({ _embedded: { events: [tm()] } }));
    vi.stubGlobal("fetch", f);
    expect(await searchEvents({ venue: "The Colosseum", city: "Las Vegas" }, NOW)).toHaveLength(1);
    expect(Object.fromEntries(urlOf(f, 0).searchParams)).toMatchObject({ keyword: "The Colosseum", size: "10", countryCode: "US" });
    expect(urlOf(f, 1).searchParams.get("keyword")).toBe("Colosseum");
    expect(urlOf(f, 2).searchParams.get("venueId")).toBe("KovZ2");
    expect(urlOf(f, 2).searchParams.get("city")).toBeNull();
  });
  it("a venue that Ticketmaster doesn't know: no events, and no event search", async () => {
    const f = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", f);
    expect(await searchEvents({ venue: "Nowhere Hall" }, NOW)).toEqual([]);
    expect(f.mock.calls.every((c) => String((c as unknown as [URL])[0]).includes("/venues.json"))).toBe(true);
  });
  it("Google's name differs from Ticketmaster's: every spelling is tried and the matching listings pooled (parking listing included)", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ _embedded: { venues: [{ id: "KovPark", name: "Colosseum at Caesars Parking", city: { name: "Las Vegas" } }, { id: "KovPool", name: "Caesars Palace Pool", city: { name: "Las Vegas" } }] } }))
      .mockResolvedValueOnce(json({ _embedded: { venues: [{ id: "KovColo", name: "The Colosseum at Caesars Palace", city: { name: "Las Vegas" } }, { id: "KovPark", name: "Colosseum at Caesars Parking", city: { name: "Las Vegas" } }] } }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ _embedded: { events: [tm()] } }));
    vi.stubGlobal("fetch", f);
    expect(await searchEvents({ venue: "The Colosseum Theater at Caesars Palace", city: "Las Vegas" }, NOW)).toHaveLength(1);
    expect(urlOf(f, 0).searchParams.get("keyword")).toBe("The Colosseum Theater at Caesars Palace");
    expect(urlOf(f, 1).searchParams.get("keyword")).toBe("Colosseum at Caesars Palace");
    expect(urlOf(f, 2).searchParams.get("keyword")).toBe("Colosseum");
    expect(urlOf(f, 3).searchParams.get("venueId")).toBe("KovPark,KovColo");
  });
  it("a date range: Ticketmaster's window, then only events on those local dates", async () => {
    const f = vi.fn(async () => json({ _embedded: { events: [tm(), tm({ id: "late", name: "Late show", dates: { start: { localDate: "2026-11-16" } } })] } }));
    vi.stubGlobal("fetch", f);
    expect((await searchEvents({ city: "Las Vegas", from: "2026-11-13", to: "2026-11-15" }, NOW)).map((e) => e.id)).toEqual(["tm:G5v1"]);
    expect(urlOf(f, 0).searchParams.get("startDateTime")).toBe("2026-11-13T00:00:00Z");
    expect(urlOf(f, 0).searchParams.get("endDateTime")).toBe("2026-11-15T23:59:59Z");
  });
  it("one listing per show, venue and day (Ticketmaster repeats them per ticket type), and dropped events are skipped", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ _embedded: { events: [tm(), tm({ id: "vip" }), tm({ id: "x", url: undefined }), tm({ id: "next", dates: { start: { localDate: "2026-11-15" } } })] } })));
    expect((await searchEvents({ keyword: "adele" }, NOW)).map((e) => e.id)).toEqual(["tm:G5v1", "tm:next"]);
  });
  it("no events at all: an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    expect(await searchEvents({ keyword: "x" }, NOW)).toEqual([]);
  });
  it(`caches the same search for ${CACHE_MS / 60000} minutes`, async () => {
    const f = vi.fn(async () => json({ _embedded: { events: [tm()] } }));
    vi.stubGlobal("fetch", f);
    await searchEvents({ keyword: "adele" }, NOW);
    await searchEvents({ keyword: "adele" }, new Date(NOW.getTime() + CACHE_MS - 1));
    expect(f).toHaveBeenCalledTimes(1);
    await searchEvents({ keyword: "adele" }, new Date(NOW.getTime() + CACHE_MS));
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("defaults now to the current time", async () => {
    const f = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", f);
    await searchEvents({ keyword: "x" });
    expect(urlOf(f, 0).searchParams.get("startDateTime")).toBe(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  });
  it.each([
    [{}, "Say what, where or which venue"],
    [{ keyword: "  ", stateCode: "Nevada" }, "Say what, where or which venue"],
    [{ keyword: "x", from: "14/11/2026" }, "Dates must look like 2026-11-14"],
    [{ keyword: "x", to: "tomorrow" }, "Dates must look like 2026-11-14"],
  ])("rejects %j before calling Ticketmaster", async (q, msg) => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(searchEvents(q, NOW)).rejects.toMatchObject({ status: 400, message: msg });
    expect(f).not.toHaveBeenCalled();
  });
  it("not configured: 503", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    await expect(searchEvents({ keyword: "x" }, NOW)).rejects.toEqual(new EventsError(503, "Event search is not configured"));
  });
  it.each([
    [429, { fault: { faultstring: "Rate limit quota violation" } }, 429, "Ticketmaster: Rate limit quota violation"],
    [400, { errors: [{ detail: "Bad classification" }] }, 502, "Ticketmaster: Bad classification"],
    [500, undefined, 502, "Ticketmaster: HTTP 500"],
  ])("Ticketmaster error %i → %i", async (status, body, ours, msg) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body ? JSON.stringify(body) : "", { status })));
    await expect(searchEvents({ keyword: "x" }, NOW)).rejects.toMatchObject({ status: ours, message: msg });
  });
});

describe("venueNames", () => {
  it("full name, then without 'The' and generic words, then the part before ' at ' (same city only)", () => {
    expect(venueNames("The Colosseum Theater at Caesars Palace")).toEqual([
      { name: "The Colosseum Theater at Caesars Palace", cityOnly: false },
      { name: "Colosseum at Caesars Palace", cityOnly: false },
      { name: "Colosseum", cityOnly: true },
    ]);
  });
  it("no duplicates, nothing under 3 letters", () => {
    expect(venueNames("Sphere")).toEqual([{ name: "Sphere", cityOnly: false }]);
    expect(venueNames("The Arena")).toEqual([{ name: "The Arena", cityOnly: false }]);
  });
});

describe("findVenueIds", () => {
  it("the short name is only used with a city, and only same-city matches count", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ _embedded: { venues: [{ id: "elsewhere", name: "Colosseum", city: { name: "Rome" } }] } }));
    vi.stubGlobal("fetch", f);
    expect(await findVenueIds("The Colosseum Theater at Caesars Palace", { city: "Las Vegas" })).toEqual([]);
    expect(f).toHaveBeenCalledTimes(3);
    const g = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", g);
    expect(await findVenueIds("The Colosseum Theater at Caesars Palace")).toEqual([]);
    expect(g).toHaveBeenCalledTimes(2);
  });
  it("any city when none match, named venues only, filtered by state when given, capped at MAX_VENUES", async () => {
    const f = vi.fn(async () => json({ _embedded: { venues: [{ id: "a", name: "Big Arena" }, { id: "b", name: "Big Arena North", city: { name: "Reno" } }, { id: "x", name: "Small Hall" }, { id: "y" }] } }));
    vi.stubGlobal("fetch", f);
    expect(await findVenueIds("Big Arena", { city: "Las Vegas", stateCode: "NV" })).toEqual(["a", "b"]);
    expect(urlOf(f, 0).searchParams.get("stateCode")).toBe("NV");
    const many = vi.fn(async () => json({ _embedded: { venues: Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, name: `Big Arena ${i}` })) } }));
    vi.stubGlobal("fetch", many);
    expect(await findVenueIds("Big Arena")).toHaveLength(MAX_VENUES);
  });
});
