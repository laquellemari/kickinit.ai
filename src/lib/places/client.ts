import { isDiningType } from "@/lib/pricing/fees";
import type { Category } from "@/lib/catalog/types";
import type { LivePlace } from "./types";

const BASE = "https://places.googleapis.com/v1";
/** Search fields: the basics plus Google's price data, which sizes the PayPal hold (price fields are Enterprise-priced). */
export const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.location", "places.primaryType",
  "places.primaryTypeDisplayName", "places.googleMapsUri", "places.businessStatus", "places.addressComponents", "places.utcOffsetMinutes",
  "places.priceLevel", "places.priceRange",
].join(",");
/** One venue's page: the search fields plus Google's description and rating. */
export const DETAIL_MASK = `${FIELD_MASK.replaceAll("places.", "")},editorialSummary,generativeSummary,rating,userRatingCount,websiteUri`;
const ID_RE = /^[A-Za-z0-9_-]{1,300}$/;

export class PlacesError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "PlacesError";
  }
}

type GPlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  googleMapsUri?: string;
  businessStatus?: string;
  addressComponents?: { longText: string; shortText: string; types?: string[] }[];
  utcOffsetMinutes?: number;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  priceRange?: { startPrice?: { units?: string; currencyCode?: string }; endPrice?: { units?: string; currencyCode?: string } };
  editorialSummary?: { text?: string };
  websiteUri?: string;
  generativeSummary?: { overview?: { text?: string } };
};

/** Rough per-person spend by venue type: a budget hint for the concierge only, never charged. */
const RULES: [RegExp, Category, string][] = [
  [/(^|_)(cafe|coffee_shop|bakery|ice_cream_shop|dessert_shop)$/, "culinary", "20.00"],
  [/restaurant$|^(meal_takeaway|food_court|steak_house|sushi_bar)$/, "culinary", "40.00"],
  [/^(spa|massage|sauna|wellness_center|day_spa|beauty_salon)$/, "wellness", "100.00"],
  [/^(gym|fitness_center|yoga_studio|pilates_studio|sports_club|swimming_pool)$/, "movement", "35.00"],
  [/^(performing_arts_theater|concert_hall|opera_house|comedy_club)$/, "culture", "70.00"],
  [/^(museum|art_gallery|cultural_center|historical_landmark)$/, "culture", "30.00"],
  [/^(night_club|bar|pub|wine_bar|karaoke|cocktail_bar|live_music_venue)$/, "nightlife", "45.00"],
  [/^(park|marina|hiking_area|beach|national_park|tour_agency|tourist_attraction|zoo|aquarium)$/, "outdoors", "40.00"],
  [/^(hotel|lodging|resort_hotel|bed_and_breakfast|inn|motel)$/, "getaways", "250.00"],
  [/class$|^(art_studio|cooking_school)$/, "create", "80.00"],
];

export function estimateFor(primaryType: string | undefined): { category: Category; estimatePerPerson: string } {
  for (const [re, category, estimatePerPerson] of RULES) if (primaryType && re.test(primaryType)) return { category, estimatePerPerson };
  return { category: "culture", estimatePerPerson: "50.00" };
}

/** Google's $ to $$$$ levels as a per-person spend. */
export const PRICE_LEVEL_USD: Record<string, [number, string]> = {
  PRICE_LEVEL_INEXPENSIVE: [15, "$"], PRICE_LEVEL_MODERATE: [30, "$$"], PRICE_LEVEL_EXPENSIVE: [60, "$$$"], PRICE_LEVEL_VERY_EXPENSIVE: [100, "$$$$"],
};

/** Per-person hold: Google's price range for the venue if it has one, else its price level, else a typical spend for the venue type. */
export function estimateSpend(p: { primaryType?: string; priceLevel?: string; priceRange?: GPlace["priceRange"]; typeLabel: string }): { category: Category; estimatePerPerson: string; estimateBasis: string } {
  const byType = estimateFor(p.primaryType);
  const usd = (m?: { units?: string; currencyCode?: string }) => (m?.currencyCode === "USD" && Number(m.units) > 0 ? Number(m.units) : null);
  const start = usd(p.priceRange?.startPrice);
  const end = usd(p.priceRange?.endPrice);
  if (start !== null) {
    const mid = end !== null ? (start + end) / 2 : start;
    return { category: byType.category, estimatePerPerson: mid.toFixed(2), estimateBasis: end !== null ? `Google lists $${start}–$${end} per person` : `Google lists from $${start} per person` };
  }
  const level = p.priceLevel ? PRICE_LEVEL_USD[p.priceLevel] : undefined;
  if (level) return { category: byType.category, estimatePerPerson: level[0].toFixed(2), estimateBasis: `Google rates it ${level[1]}` };
  return { ...byType, estimateBasis: `Typical spend for a ${p.typeLabel.toLowerCase()}` };
}

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("Live search is not configured");
  return key;
}

async function call(url: string, init: RequestInit, mask: string): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-goog-api-key": apiKey() };
  if (mask) headers["x-goog-fieldmask"] = mask;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const status = json?.error?.status ?? "UNKNOWN";
    throw new PlacesError(res.status, `Google Places ${status}: ${json?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return json;
}

function component(p: GPlace, type: string, short = false): string {
  const c = p.addressComponents?.find((x) => x.types?.includes(type));
  return (short ? c?.shortText : c?.longText) ?? "";
}

function toLivePlace(p: GPlace): LivePlace {
  return {
    city: component(p, "locality") || component(p, "postal_town"),
    country: component(p, "country", true),
    state: component(p, "administrative_area_level_1", true),
    utcOffsetMinutes: p.utcOffsetMinutes ?? null,
    primaryType: p.primaryType ?? null,
    dining: isDiningType(p.primaryType),
    website: p.websiteUri && /^https?:\/\//.test(p.websiteUri) ? p.websiteUri : null,
    id: `gp:${p.id}`,
    placeId: p.id,
    name: p.displayName?.text ?? "Unnamed place",
    address: p.formattedAddress ?? "",
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    typeLabel: p.primaryTypeDisplayName?.text ?? "Place",
    mapsUrl: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id}`,
    summary: p.editorialSummary?.text || p.generativeSummary?.overview?.text || null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? 0,
    ...estimateSpend({ ...p, typeLabel: p.primaryTypeDisplayName?.text ?? "Place" }),
  };
}

const isOpen = (p: GPlace) => !p.businessStatus || p.businessStatus === "OPERATIONAL";

export async function searchLivePlaces(query: string): Promise<LivePlace[]> {
  const q = query.trim();
  if (!q) throw new Error("Search text is required");
  if (q.length > 200) throw new Error("Search text cannot exceed 200 characters");
  const body = (await call(`${BASE}/places:searchText`, { method: "POST", body: JSON.stringify({ textQuery: q, pageSize: 20 }) }, FIELD_MASK)) as { places?: GPlace[] };
  return (body.places ?? []).filter(isOpen).map(toLivePlace);
}

export async function getLivePlace(placeId: string): Promise<LivePlace> {
  if (!ID_RE.test(placeId)) throw new Error("Place id has invalid characters");
  const p = (await call(`${BASE}/places/${placeId}`, { method: "GET" }, DETAIL_MASK)) as GPlace;
  if (!isOpen(p)) throw new Error("This place is closed");
  return toLivePlace(p);
}

/** A venue with its Google rating, used to pick the demo partner catalog. Rating fields are Enterprise-priced, so this is not used per visitor. */
export type RatedPlace = {
  placeId: string; name: string; address: string; lat: number; lng: number; primaryType: string | null; typeLabel: string;
  neighborhood: string; city: string; country: string; rating: number | null; ratingCount: number; mapsUrl: string;
};
export const RATED_MASK = `${FIELD_MASK},places.rating,places.userRatingCount`;

/** Top-rated open venues for a query, best first (rating, then number of ratings). */
export async function searchRatedPlaces(query: string): Promise<RatedPlace[]> {
  const q = query.trim();
  if (!q) throw new Error("Search text is required");
  if (q.length > 200) throw new Error("Search text cannot exceed 200 characters");
  const body = (await call(`${BASE}/places:searchText`, { method: "POST", body: JSON.stringify({ textQuery: q, pageSize: 20 }) }, RATED_MASK)) as { places?: GPlace[] };
  return (body.places ?? []).filter(isOpen).map((p) => {
    const l = toLivePlace(p);
    return {
      placeId: p.id, name: l.name, address: l.address, lat: l.lat, lng: l.lng, primaryType: l.primaryType, typeLabel: l.typeLabel,
      neighborhood: component(p, "neighborhood") || component(p, "sublocality_level_1") || component(p, "sublocality"),
      city: l.city, country: l.country, rating: p.rating ?? null, ratingCount: p.userRatingCount ?? 0, mapsUrl: l.mapsUrl,
    };
  }).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.ratingCount - a.ratingCount);
}

/** A venue photo and the credit Google requires us to show with it. */
export type PlacePhoto = { uri: string; author: string | null; authorUri: string | null };
const PHOTO_TTL_MS = 12 * 60 * 60 * 1000;
const photoCache = new Map<string, { at: number; photo: PlacePhoto | null }>();
export const clearPhotoCache = () => photoCache.clear();

/** The venue's first Google photo (800px wide), or null if it has none. Cached per place for 12 hours. */
export async function getPlacePhoto(placeId: string, now = Date.now()): Promise<PlacePhoto | null> {
  if (!ID_RE.test(placeId)) throw new Error("Place id has invalid characters");
  const hit = photoCache.get(placeId);
  if (hit && now - hit.at < PHOTO_TTL_MS) return hit.photo;
  const details = (await call(`${BASE}/places/${placeId}`, { method: "GET" }, "photos")) as {
    photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
  };
  const first = details.photos?.[0];
  let photo: PlacePhoto | null = null;
  if (first) {
    const media = (await call(`${BASE}/${first.name}/media?maxWidthPx=800&skipHttpRedirect=true`, { method: "GET" }, "")) as { photoUri?: string };
    const by = first.authorAttributions?.[0];
    if (media.photoUri) photo = { uri: media.photoUri, author: by?.displayName ?? null, authorUri: by?.uri ?? null };
  }
  photoCache.set(placeId, { at: now, photo });
  return photo;
}

/** Google's yes/no facts about a venue, and how each reads in a description. */
export const FEATURES: [string, string][] = [
  ["servesBreakfast", "serves breakfast"], ["servesBrunch", "serves brunch"], ["servesLunch", "serves lunch"], ["servesDinner", "serves dinner"],
  ["servesCocktails", "serves cocktails"], ["servesWine", "serves wine"], ["servesBeer", "serves beer"], ["servesCoffee", "serves coffee"],
  ["servesDessert", "serves dessert"], ["servesVegetarianFood", "has vegetarian dishes"], ["outdoorSeating", "has outdoor seating"],
  ["liveMusic", "has live music"], ["goodForGroups", "is good for groups"], ["goodForChildren", "is good for children"],
  ["goodForWatchingSports", "shows sports"], ["allowsDogs", "allows dogs"], ["reservable", "takes reservations"],
];
export const MAX_REVIEWS = 5;
export const MAX_REVIEW_CHARS = 500;

/** Everything Google Maps says about a venue that helps describe it. */
export type PlaceFacts = {
  name: string; typeLabel: string; types: string[]; neighborhood: string; city: string;
  editorial: string | null; overview: string | null; reviewSummary: string | null;
  reviews: string[]; rating: number | null; ratingCount: number; priceLevel: string | null; features: string[];
};

export const FACTS_MASK = [
  "displayName", "primaryTypeDisplayName", "types", "addressComponents", "editorialSummary", "generativeSummary", "reviewSummary",
  "reviews", "rating", "userRatingCount", "priceLevel", ...FEATURES.map(([k]) => k),
].join(",");

type GFacts = GPlace & {
  types?: string[];
  reviewSummary?: { text?: { text?: string } };
  reviews?: { text?: { text?: string }; originalText?: { text?: string } }[];
} & Record<string, unknown>;

const text = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim() || null;

/** A venue's Google Maps details for writing its description. Enterprise + Atmosphere priced, so callers cache the result. */
export async function getPlaceFacts(placeId: string): Promise<PlaceFacts> {
  if (!ID_RE.test(placeId)) throw new Error("Place id has invalid characters");
  const p = (await call(`${BASE}/places/${placeId}`, { method: "GET" }, FACTS_MASK)) as GFacts;
  const reviews = (p.reviews ?? [])
    .map((r) => text(r.originalText?.text ?? r.text?.text))
    .filter((r): r is string => r !== null)
    .slice(0, MAX_REVIEWS)
    .map((r) => r.slice(0, MAX_REVIEW_CHARS));
  return {
    name: p.displayName?.text ?? "Unnamed place",
    typeLabel: p.primaryTypeDisplayName?.text ?? "Place",
    types: (p.types ?? []).filter((t) => t !== "point_of_interest" && t !== "establishment"),
    neighborhood: component(p, "neighborhood") || component(p, "sublocality_level_1") || component(p, "sublocality"),
    city: component(p, "locality") || component(p, "postal_town"),
    editorial: text(p.editorialSummary?.text),
    overview: text(p.generativeSummary?.overview?.text),
    reviewSummary: text(p.reviewSummary?.text?.text),
    reviews,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? 0,
    priceLevel: (p.priceLevel && PRICE_LEVEL_USD[p.priceLevel]?.[1]) || null,
    features: FEATURES.filter(([k]) => p[k] === true).map(([, label]) => label),
  };
}
