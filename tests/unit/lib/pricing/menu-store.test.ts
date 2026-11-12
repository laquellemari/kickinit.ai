// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { cachedMenu, saveMenu, menuFor, FOUND_TTL_DAYS, EMPTY_TTL_DAYS, MENU_VERSION } from "@/lib/pricing/menu-store";
import type { MenuItem } from "@/lib/pricing/menu";
import { getDb } from "@/lib/db";
import { useTestDb } from "../../../helpers/db";

const DAY = 86_400_000;
const NOW = new Date("2026-11-11T12:00:00Z");
const item: MenuItem = { id: "massage-150", name: "Massage", price: "150.00", per: "person", durationMinutes: 60, sourceUrl: "https://spauno.com/" };
const place = { placeId: "ChIJ1", name: "Spa Uno", address: "1 Main St", website: "https://spauno.com", typeLabel: "Spa" };
const claude = (items: string) => new Response(JSON.stringify({
  stop_reason: "end_turn",
  content: [
    { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://spauno.com/menu", content: { source: { type: "text", data: "Massage $150" } } } },
    { type: "text", text: items },
  ],
}), { status: 200 });

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); vi.stubEnv("ANTHROPIC_API_KEY", "sk"); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("the menu cache", () => {
  it("saves and reads back a menu, and a second save replaces it", async () => {
    await saveMenu("ChIJ1", { items: [item], checkedAt: NOW });
    expect(await cachedMenu("ChIJ1", NOW)).toEqual({ items: [item], checkedAt: NOW });
    await saveMenu("ChIJ1", { items: [], checkedAt: NOW });
    expect(await cachedMenu("ChIJ1", NOW)).toEqual({ items: [], checkedAt: NOW });
  });
  it("unknown venue: nothing cached", async () => expect(await cachedMenu("nope", NOW)).toBeNull());
  it(`boundary: menus with prices last ${FOUND_TTL_DAYS} days`, async () => {
    await saveMenu("ChIJ1", { items: [item], checkedAt: NOW });
    expect(await cachedMenu("ChIJ1", new Date(NOW.getTime() + FOUND_TTL_DAYS * DAY - 1))).not.toBeNull();
    expect(await cachedMenu("ChIJ1", new Date(NOW.getTime() + FOUND_TTL_DAYS * DAY))).toBeNull();
  });
  it(`boundary: "no prices published" is re-checked after ${EMPTY_TTL_DAYS} day`, async () => {
    await saveMenu("ChIJ1", { items: [], checkedAt: NOW });
    expect(await cachedMenu("ChIJ1", new Date(NOW.getTime() + EMPTY_TTL_DAYS * DAY - 1))).not.toBeNull();
    expect(await cachedMenu("ChIJ1", new Date(NOW.getTime() + EMPTY_TTL_DAYS * DAY))).toBeNull();
  });
  it("reads items stored as text too (some drivers return JSON as a string)", async () => {
    const db = await getDb();
    const orig = db.query.bind(db);
    vi.spyOn(db, "query").mockImplementation(async (...a: Parameters<typeof db.query>) => {
      const r = await orig(...a);
      return { rows: r.rows.map((x) => ({ ...(x as object), items: JSON.stringify((x as { items: unknown }).items) })) } as never;
    });
    await saveMenu("ChIJ1", { items: [item], checkedAt: NOW });
    expect((await cachedMenu("ChIJ1", NOW))!.items).toEqual([item]);
    vi.restoreAllMocks();
  });
});

describe("menuFor", () => {
  it("a cached menu is returned without asking Claude", async () => {
    await saveMenu("ChIJ1", { items: [item], checkedAt: new Date() });
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await menuFor(place)).items).toEqual([item]);
    expect(f).not.toHaveBeenCalled();
  });
  it("a miss looks it up once, saves it, and concurrent requests share that one lookup", async () => {
    const f = vi.fn(async () => claude("ITEM | Massage | 150 | person | 60"));
    vi.stubGlobal("fetch", f);
    const [a, b] = await Promise.all([menuFor(place, NOW), menuFor(place, NOW)]);
    expect(a.items.map((i) => i.id)).toEqual(["massage-150"]);
    expect(b).toBe(a);
    expect(f).toHaveBeenCalledTimes(1);
    expect((await cachedMenu("ChIJ1", NOW))!.items).toEqual(a.items);
    await menuFor(place, NOW);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("a lookup that opened no page isn't cached either", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "I couldn't reach their site." }] }))));
    expect((await menuFor(place, NOW)).items).toEqual([]);
    expect(await cachedMenu("ChIJ1", NOW)).toBeNull();
  });
  it("menus are stored under a version, so older lookups are redone", async () => {
    await saveMenu("ChIJ1", { items: [item], checkedAt: NOW });
    const { rows } = await (await getDb()).query<{ place_id: string }>("SELECT place_id FROM venue_menus");
    expect(rows.map((r) => r.place_id)).toEqual([`${MENU_VERSION}:ChIJ1`]);
  });
  it("a failed lookup isn't cached, so the next visit tries again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await expect(menuFor(place, NOW)).rejects.toThrow("Price lookup failed");
    expect(await cachedMenu("ChIJ1", NOW)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => claude("NONE")));
    expect((await menuFor(place, NOW)).items).toEqual([]);
  });
  it("defaults now to the current time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => claude("NONE")));
    expect((await menuFor(place)).checkedAt.getTime()).toBeGreaterThan(NOW.getTime());
  });
});
