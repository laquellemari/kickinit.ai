/**
 * Concerts, shows and games from the Ticketmaster Discovery API. kickinit shows what's on; tickets are bought on
 * Ticketmaster (we have no ticketing deal, so we never sell or resell tickets ourselves).
 */

export type LiveEvent = {
  id: string; // "tm:<ticketmaster id>"
  name: string;
  /** Ticketmaster's event page, where tickets are bought. */
  url: string;
  /** The venue's local date and time, as Ticketmaster lists it ("2026-11-14", "20:00:00" or null when TBA). */
  localDate: string;
  localTime: string | null;
  venue: string;
  city: string;
  state: string;
  image: string | null;
  /** Face-value range when Ticketmaster publishes one (often it doesn't). */
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  genre: string | null;
};

export class EventsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "EventsError";
  }
}

const BASE = "https://app.ticketmaster.com/discovery/v2";
export const MAX_EVENTS = 30;
export const CACHE_MS = 10 * 60_000;

type TmImage = { url?: string; ratio?: string; width?: number };
type TmEvent = {
  id: string; name?: string; url?: string;
  dates?: { start?: { localDate?: string; localTime?: string }; status?: { code?: string } };
  images?: TmImage[];
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  classifications?: { genre?: { name?: string }; segment?: { name?: string } }[];
  _embedded?: { venues?: { name?: string; city?: { name?: string }; state?: { stateCode?: string } }[] };
};

/** The widest 16:9 image (cards are wide), else any image. */
export function bestImage(images: TmImage[] | undefined): string | null {
  const all = (images ?? []).filter((i) => typeof i.url === "string" && i.url.startsWith("https://"));
  const wide = all.filter((i) => i.ratio === "16_9");
  const pick = (wide.length ? wide : all).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return pick?.url ?? null;
}

const real = (g?: string) => (g && g !== "Undefined" ? g : null);

/** Ticketmaster's shape as ours. Cancelled, postponed and undated events, and ones with no ticket page, are dropped. */
export function toLiveEvent(e: TmEvent): LiveEvent | null {
  const start = e.dates?.start;
  const status = e.dates?.status?.code;
  if (!e.name || !e.url || !start?.localDate || status === "cancelled" || status === "postponed") return null;
  const v = e._embedded?.venues?.[0];
  const price = e.priceRanges?.find((p) => typeof p.min === "number");
  const c = e.classifications?.[0];
  return {
    id: `tm:${e.id}`, name: e.name, url: e.url, localDate: start.localDate, localTime: start.localTime ?? null,
    venue: v?.name ?? "", city: v?.city?.name ?? "", state: v?.state?.stateCode ?? "",
    image: bestImage(e.images),
    priceMin: price?.min ?? null, priceMax: price && typeof price.max === "number" ? price.max : null, currency: price?.currency ?? null,
    genre: real(c?.genre?.name) ?? real(c?.segment?.name),
  };
}

function apiKey(): string {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) throw new EventsError(503, "Event search is not configured");
  return key;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("apikey", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new EventsError(res.status === 429 ? 429 : 502, `Ticketmaster: ${json?.fault?.faultstring ?? json?.errors?.[0]?.detail ?? `HTTP ${res.status}`}`);
  return json as T;
}

export type EventQuery = {
  /** Artist, show or kind of event, e.g. "jazz" or "Adele". */
  keyword?: string;
  /** Only events at this venue (looked up by name). */
  venue?: string;
  city?: string;
  /** Two-letter US state, e.g. "NV". */
  stateCode?: string;
  /** "music", "sports", "arts & theatre", "comedy"... */
  category?: string;
  /** Local dates, YYYY-MM-DD. */
  from?: string;
  to?: string;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s: string | undefined, max: number) => (s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

const GENERIC = /\b(theater|theatre|arena|amphitheatre|amphitheater|stadium|hall|center|centre|venue|auditorium|live)\b/gi;

/**
 * Ways to write a venue's name, most specific first. Google and Ticketmaster often differ:
 * "The Colosseum Theater at Caesars Palace" on Google is "The Colosseum at Caesars Palace" on Ticketmaster.
 * The last one ("Colosseum", the part before " at ") is only trusted inside the same city.
 */
export function venueNames(name: string): { name: string; cityOnly: boolean }[] {
  const full = clean(name, 100);
  const plain = full.replace(/^the\s+/i, "").replace(GENERIC, " ").replace(/\s+/g, " ").trim();
  const head = plain.split(/\s+at\s+/i)[0].trim();
  const out: { name: string; cityOnly: boolean }[] = [];
  for (const [n, cityOnly] of [[full, false], [plain, false], [head, true]] as const) {
    if (n.length >= 3 && !out.some((o) => o.name.toLowerCase() === n.toLowerCase())) out.push({ name: n, cityOnly });
  }
  return out;
}

/** Ticketmaster venue ids matching a name (best matches first), in the given city or state if known. */
export async function findVenueIds(name: string, where: Pick<EventQuery, "city" | "stateCode"> = {}): Promise<string[]> {
  const city = where.city?.toLowerCase();
  for (const v of venueNames(name)) {
    if (v.cityOnly && !city) continue;
    const params: Record<string, string> = { keyword: v.name, size: "5", countryCode: "US" };
    if (where.stateCode) params.stateCode = where.stateCode;
    const r = await get<{ _embedded?: { venues?: { id: string; city?: { name?: string } }[] } }>("/venues.json", params);
    const venues = r._embedded?.venues ?? [];
    const inCity = city ? venues.filter((x) => x.city?.name?.toLowerCase() === city) : [];
    const ids = (inCity.length || v.cityOnly ? inCity : venues).map((x) => x.id).slice(0, 3);
    if (ids.length) return ids;
  }
  return [];
}

const cache = new Map<string, { at: number; events: LiveEvent[] }>();
export const clearEventCache = () => cache.clear();

/** Upcoming events, soonest first. Results are cached for 10 minutes to stay inside Ticketmaster's daily quota. */
export async function searchEvents(q: EventQuery, now: Date = new Date()): Promise<LiveEvent[]> {
  const keyword = clean(q.keyword, 100);
  const venue = clean(q.venue, 100);
  const stateCode = /^[A-Za-z]{2}$/.test(q.stateCode ?? "") ? q.stateCode!.toUpperCase() : "";
  if (!keyword && !venue && !q.city && !stateCode) throw new EventsError(400, "Say what, where or which venue");
  for (const d of [q.from, q.to]) if (d !== undefined && !DAY_RE.test(d)) throw new EventsError(400, "Dates must look like 2026-11-14");

  const key = JSON.stringify([keyword, venue, q.city ?? "", stateCode, q.category ?? "", q.from ?? "", q.to ?? ""]);
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_MS) return hit.events;

  const params: Record<string, string> = { size: String(MAX_EVENTS), sort: "date,asc", countryCode: "US" };
  if (venue) {
    const ids = await findVenueIds(venue, { city: q.city, stateCode });
    if (!ids.length) return [];
    params.venueId = ids.join(",");
  } else {
    if (q.city) params.city = clean(q.city, 60);
    if (stateCode) params.stateCode = stateCode;
  }
  if (keyword) params.keyword = keyword;
  if (q.category) params.classificationName = clean(q.category, 40);
  // Ticketmaster wants UTC timestamps; a day either side of local dates is filtered back to local dates below.
  params.startDateTime = `${q.from ?? now.toISOString().slice(0, 10)}T00:00:00Z`;
  if (q.to) params.endDateTime = `${q.to}T23:59:59Z`;

  const r = await get<{ _embedded?: { events?: TmEvent[] } }>("/events.json", params);
  const seen = new Set<string>();
  const events = (r._embedded?.events ?? [])
    .map(toLiveEvent)
    .filter((e): e is LiveEvent => e !== null && (!q.to || e.localDate <= q.to))
    // The same show often has one listing per ticket type; keep one per name, venue and day.
    .filter((e) => {
      const k = `${e.name}|${e.venue}|${e.localDate}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  cache.set(key, { at: now.getTime(), events });
  return events;
}

const EVENT_VENUE_TYPE = /^(performing_arts_theater|concert_hall|opera_house|stadium|arena|amphitheatre|amphitheater|live_music_venue|event_venue|comedy_club|sports_complex|auditorium)$/;

/** A Google place that's a stage or arena: what people want there is its events, not the building. */
export function isEventVenue(primaryType: string | null | undefined): boolean {
  return !!primaryType && EVENT_VENUE_TYPE.test(primaryType);
}

/** "Sat, Nov 14 · 8:00 PM" from Ticketmaster's local date and time. */
export function eventWhen(e: Pick<LiveEvent, "localDate" | "localTime">): string {
  const [y, m, d] = e.localDate.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  if (!e.localTime) return `${day} · time TBA`;
  const [h, min] = e.localTime.split(":").map(Number);
  return `${day} · ${((h + 11) % 12) + 1}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "From $59", "$59–$250", or null when Ticketmaster doesn't publish prices. */
export function eventPrice(e: Pick<LiveEvent, "priceMin" | "priceMax" | "currency">): string | null {
  if (e.priceMin === null || (e.currency && e.currency !== "USD")) return null;
  const f = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  return e.priceMax !== null && Math.round(e.priceMax) > Math.round(e.priceMin) ? `${f(e.priceMin)}–${f(e.priceMax)}` : `From ${f(e.priceMin)}`;
}
