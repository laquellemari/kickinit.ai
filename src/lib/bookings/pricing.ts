import { quote } from "@/lib/catalog/catalog";
import type { Quote } from "@/lib/catalog/types";
import { getLivePlace } from "@/lib/places/client";
import { quoteLive } from "@/lib/places/quote";
import type { LivePlace } from "@/lib/places/types";
import { liveFacts, partnerFacts, type VenueFacts } from "./venue";

export type ItemKind = "partner" | "live";

/** The one place prices come from: the partner catalog, or Google Places for request-to-book venues. */
export type Priced = { kind: ItemKind; quote: Quote; name: string; factsAt: (startsAt: Date) => VenueFacts };

export async function priceFor(kind: unknown, itemId: unknown, partySize: number): Promise<Priced> {
  if (kind !== "partner" && kind !== "live") throw new Error("Kind must be partner or live");
  if (typeof itemId !== "string" || !itemId) throw new Error("Item id is required");
  if (kind === "partner") {
    const q = quote(itemId, partySize);
    return { kind, quote: q, name: q.description.replace(/ · .*$/, ""), factsAt: (at) => partnerFacts(itemId, at) };
  }
  if (!itemId.startsWith("gp:")) throw new Error("Live item ids start with gp:");
  const place: LivePlace = await getLivePlace(itemId.slice(3));
  return { kind, quote: quoteLive(place, partySize), name: place.name, factsAt: (at) => liveFacts(place, at) };
}
