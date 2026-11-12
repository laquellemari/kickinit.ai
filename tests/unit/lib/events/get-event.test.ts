// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEvent, clearEventDetailCache, EventsError, CACHE_MS } from "@/lib/events/ticketmaster";

const NOW = new Date("2026-11-12T15:00:00Z");
const tm = (venue: Record<string, unknown> = { location: { latitude: "36.1162", longitude: "-115.1745" } }, o: Record<string, unknown> = {}) => ({
  id: "G5v1", name: "Adele", url: "https://www.ticketmaster.com/event/G5v1",
  dates: { start: { localDate: "2026-11-14", localTime: "20:00:00" }, status: { code: "onsale" } },
  _embedded: { venues: [{ name: "The Colosseum", city: { name: "Las Vegas" }, state: { stateCode: "NV" }, ...venue }] },
  ...o,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const stub = (...res: Response[]) => {
  const f = vi.fn();
  for (const r of res) f.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", f);
  return f;
};

beforeEach(() => { vi.stubEnv("TICKETMASTER_API_KEY", "tm-key"); clearEventDetailCache(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("getEvent", () => {
  it("happy: one event by id, with its venue's coordinates", async () => {
    const f = stub(json(tm()));
    const d = await getEvent("G5v1", NOW);
    expect(d).toMatchObject({ event: { id: "tm:G5v1", name: "Adele", venue: "The Colosseum" }, lat: 36.1162, lng: -115.1745 });
    const url = new URL(String((f.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe("/discovery/v2/events/G5v1.json");
    expect(url.searchParams.get("apikey")).toBe("tm-key");
  });
  it("takes our tm: id too", async () => {
    stub(json(tm()));
    expect((await getEvent("tm:G5v1", NOW))?.event.id).toBe("tm:G5v1");
  });
  it(`is cached for ${CACHE_MS / 60000} minutes`, async () => {
    const f = stub(json(tm()), json(tm()));
    await getEvent("G5v1", NOW);
    await getEvent("G5v1", new Date(NOW.getTime() + CACHE_MS - 1));
    expect(f).toHaveBeenCalledTimes(1);
    await getEvent("G5v1", new Date(NOW.getTime() + CACHE_MS));
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("no or bad coordinates → null coordinates (both, never one)", async () => {
    stub(json(tm({})), json(tm({ location: { latitude: "36.1", longitude: "" } })), json(tm({ location: { latitude: "91", longitude: "10" } })), json(tm({ location: { latitude: "x", longitude: "181" } })));
    for (const id of ["a", "b", "c", "d"]) expect(await getEvent(id, NOW)).toMatchObject({ lat: null, lng: null });
  });
  it("a cancelled event → null, and that is cached too", async () => {
    const f = stub(json(tm(undefined, { dates: { start: { localDate: "2026-11-14" }, status: { code: "cancelled" } } })));
    expect(await getEvent("G5v1", NOW)).toBeNull();
    expect(await getEvent("G5v1", NOW)).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("an unknown id → null", async () => {
    stub(json({ errors: [{ detail: "Resource not found with provided criteria" }] }, 404), json({}, 404));
    expect(await getEvent("nope", NOW)).toBeNull();
    expect(await getEvent("nope2", NOW)).toBeNull();
  });
  it("a bad id is refused without calling Ticketmaster", async () => {
    const f = stub();
    await expect(getEvent("a/b", NOW)).rejects.toMatchObject({ status: 400, message: "Event id has invalid characters" });
    await expect(getEvent("x".repeat(65), NOW)).rejects.toBeInstanceOf(EventsError);
    expect(f).not.toHaveBeenCalled();
  });
  it("other Ticketmaster failures are passed on", async () => {
    stub(json({ fault: { faultstring: "Rate limit" } }, 429));
    await expect(getEvent("G5v1", NOW)).rejects.toMatchObject({ status: 429 });
  });
  it("now defaults to the clock; 503 without a key", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    await expect(getEvent("G5v1")).rejects.toMatchObject({ status: 503 });
  });
});
