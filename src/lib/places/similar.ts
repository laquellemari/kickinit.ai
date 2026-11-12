import { isDiningExperience } from "@/lib/pricing/fees";
import { getExperienceByPlaceId, searchExperiences } from "@/lib/catalog/catalog";
import { searchLivePlaces } from "./client";
import type { LivePlace } from "./types";

export type Recommendation = {
  key: string; kind: "partner" | "live"; href: string; name: string; meta: string; price: string; placeId: string; bg: string;
};
export const MAX_RECOMMENDATIONS = 12;
export const NEARBY_KM = 40;

/** Venues like this one: nearby kickinit partners in the same category first (instant book), then similar places from Google. */
export async function similarTo(place: LivePlace, partySize: number, search: (q: string) => Promise<LivePlace[]> = searchLivePlaces): Promise<Recommendation[]> {
  const partners: Recommendation[] = searchExperiences({ category: place.category, partySize, near: { lat: place.lat, lng: place.lng, radiusKm: NEARBY_KM }, limit: 6 })
    .filter((e) => e.placeId !== place.placeId)
    .map((e) => ({ key: e.id, kind: "partner", href: `/experience/${e.id}?party=${partySize}`, name: e.name, meta: `${e.neighborhood} · Instant book`, price: isDiningExperience(e) ? "Free to book" : `$${Number(e.total).toLocaleString("en-US")}`, placeId: e.placeId, bg: e.bg }));
  let found: LivePlace[] = [];
  try {
    found = await search(`${place.typeLabel} near ${place.address}`);
  } catch {
    // Recommendations are a bonus; the venue page still works without them.
  }
  const live: Recommendation[] = found
    .filter((l) => l.placeId !== place.placeId && !getExperienceByPlaceId(l.placeId))
    .map((l) => ({ key: l.id, kind: "live", href: `/request/${l.placeId}?party=${partySize}`, name: l.name, meta: `${l.typeLabel} · Request`, price: l.dining ? "Free to book" : "See prices", placeId: l.placeId, bg: "#E6EDF3" }));
  return [...partners, ...live].slice(0, MAX_RECOMMENDATIONS);
}
