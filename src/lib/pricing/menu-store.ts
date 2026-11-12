import { getDb } from "@/lib/db";
import type { LivePlace } from "@/lib/places/types";
import { lookupMenu, type Menu, type MenuItem } from "./menu";

const DAY = 86_400_000;
/** A menu with prices is re-read weekly; a venue with none published is checked again the next day. */
export const FOUND_TTL_DAYS = 7;
export const EMPTY_TTL_DAYS = 1;

/** Bumped when the lookup changes, so menus read by an older version are looked up again. */
export const MENU_VERSION = "v2";
const keyOf = (placeId: string) => `${MENU_VERSION}:${placeId}`;

export async function cachedMenu(placeId: string, now: Date): Promise<Menu | null> {
  const { rows } = await (await getDb()).query<{ items: MenuItem[] | string; checked_at: Date | string }>(
    "SELECT items, checked_at FROM venue_menus WHERE place_id = $1", [keyOf(placeId)],
  );
  const r = rows[0];
  if (!r) return null;
  const items: MenuItem[] = typeof r.items === "string" ? JSON.parse(r.items) : r.items;
  const checkedAt = new Date(r.checked_at);
  const ttl = (items.length ? FOUND_TTL_DAYS : EMPTY_TTL_DAYS) * DAY;
  return now.getTime() - checkedAt.getTime() < ttl ? { items, checkedAt } : null;
}

export async function saveMenu(placeId: string, menu: Menu): Promise<void> {
  await (await getDb()).query(
    "INSERT INTO venue_menus (place_id, items, checked_at) VALUES ($1, $2, $3) ON CONFLICT (place_id) DO UPDATE SET items = EXCLUDED.items, checked_at = EXCLUDED.checked_at",
    [keyOf(placeId), JSON.stringify(menu.items), menu.checkedAt.toISOString()],
  );
}

const inflight = new Map<string, Promise<Menu>>();

/** The venue's published prices: from the cache, or looked up once (concurrent requests share one lookup). */
export async function menuFor(place: Pick<LivePlace, "placeId" | "name" | "address" | "website" | "typeLabel">, now: Date = new Date()): Promise<Menu> {
  const hit = await cachedMenu(place.placeId, now);
  if (hit) return hit;
  let p = inflight.get(place.placeId);
  if (!p) {
    p = lookupMenu({ name: place.name, address: place.address, website: place.website, typeLabel: place.typeLabel }, now)
      .then(async ({ cacheable, ...m }) => {
        // A lookup that couldn't open any page isn't remembered, so the next visit tries again.
        if (cacheable) await saveMenu(place.placeId, m);
        return m;
      })
      .finally(() => inflight.delete(place.placeId));
    inflight.set(place.placeId, p);
  }
  return p;
}
