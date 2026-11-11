import { quote } from "@/lib/catalog/catalog";
import type { Quote } from "@/lib/catalog/types";
import { getLivePlace } from "@/lib/places/client";
import { quoteLive } from "@/lib/places/quote";

export type ItemKind = "partner" | "live";

/** The one place prices come from: the partner catalog, or Google Places for request-to-book venues. */
export async function priceFor(kind: unknown, itemId: unknown, partySize: number): Promise<{ kind: ItemKind; quote: Quote; name: string }> {
  if (kind !== "partner" && kind !== "live") throw new Error("Kind must be partner or live");
  if (typeof itemId !== "string" || !itemId) throw new Error("Item id is required");
  if (kind === "partner") {
    const q = quote(itemId, partySize);
    return { kind, quote: q, name: q.description.replace(/ · .*$/, "") };
  }
  if (!itemId.startsWith("gp:")) throw new Error("Live item ids start with gp:");
  const place = await getLivePlace(itemId.slice(3));
  return { kind, quote: quoteLive(place, partySize), name: place.name };
}
