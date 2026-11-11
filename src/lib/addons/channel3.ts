import { getExperience } from "@/lib/catalog/catalog";
import type { Category } from "@/lib/catalog/types";

const URL_SEARCH = "https://api.trychannel3.com/v1/search";
const TTL_MS = 60 * 60 * 1000;
export const MAX_ADDON_PRICE = 75;

/** Something physical to unwrap alongside the experience. Bought from the merchant, not through kickinit. */
export type AddOn = { id: string; title: string; brand: string | null; imageUrl: string | null; price: string; currency: string; url: string; merchant: string };

type C3Product = {
  id: string; title: string; brands?: { id: string; name: string }[];
  images?: { url: string; is_main_image?: boolean }[];
  offers?: { url: string; domain: string; price: { price: number; currency: string }; availability: string }[];
};

/** What to pair with each kind of experience. */
export const PAIRINGS: Record<Category, string> = {
  culinary: "gourmet chocolate truffles gift box",
  wellness: "luxury bath and body spa gift set",
  movement: "insulated water bottle gift",
  culture: "art print or coffee table book gift",
  nightlife: "cocktail glasses gift set",
  outdoors: "picnic blanket gift",
  create: "artisan ceramic mug gift",
  getaways: "travel toiletry bag gift",
};

const cache = new Map<string, { at: number; items: AddOn[] }>();
export const clearAddOnCache = () => cache.clear();

function toAddOn(p: C3Product): AddOn | null {
  const offer = (p.offers ?? [])
    .filter((o) => o.availability === "InStock" && o.price.currency === "USD" && o.price.price <= MAX_ADDON_PRICE)
    .sort((a, b) => a.price.price - b.price.price)[0];
  if (!offer) return null;
  const img = p.images?.find((i) => i.is_main_image) ?? p.images?.[0];
  return {
    id: p.id, title: p.title, brand: p.brands?.[0]?.name ?? null, imageUrl: img?.url ?? null,
    price: offer.price.price.toFixed(2), currency: "USD", url: offer.url, merchant: offer.domain,
  };
}

/** Up to 3 in-stock add-ons under $75 that suit the experience. Empty when Channel3 isn't configured or fails. */
export async function addOnsFor(experienceId: string, now = Date.now()): Promise<AddOn[]> {
  const e = getExperience(experienceId);
  if (!e) throw new Error(`Experience not found: ${experienceId}`);
  const key = process.env.CHANNEL3_API_KEY;
  if (!key) return [];
  const query = PAIRINGS[e.category];
  const hit = cache.get(query);
  if (hit && now - hit.at < TTL_MS) return hit.items;
  try {
    const res = await fetch(URL_SEARCH, {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ query, limit: 12, filters: { price: { max_price: MAX_ADDON_PRICE }, availability: ["InStock"], condition: "new" } }),
    });
    if (!res.ok) throw new Error(`Channel3 HTTP ${res.status}`);
    const body = (await res.json()) as { products?: C3Product[] };
    const items = (body.products ?? []).map(toAddOn).filter((a): a is AddOn => a !== null).slice(0, 3);
    cache.set(query, { at: now, items });
    return items;
  } catch (err) {
    console.error("Channel3 add-ons failed:", err);
    return [];
  }
}
