/**
 * "Plan the night": a show from Ticketmaster with dinner nearby before it and dessert or drinks after.
 * kickinit books the meals (free for restaurants and bars); the ticket is bought on Ticketmaster.
 */
import type { EventDetail, LiveEvent } from "@/lib/events/ticketmaster";
import { isEventVenue } from "@/lib/events/ticketmaster";
import { searchNear } from "@/lib/places/client";
import type { LivePlace } from "@/lib/places/types";
import { slotLabel, TIME_SLOTS } from "@/lib/slots";

/** Sit down for dinner this long before the show starts, and head out this long after it starts. */
export const DINNER_BEFORE_MIN = 120;
export const AFTER_SHOW_MIN = 150;
/** Used when Ticketmaster lists the show's time as TBA. */
export const DEFAULT_SHOW = "19:30";
export const STOPS_PER_PART = 3;
/** Places with fewer ratings than this are too unknown to recommend for a big night. */
export const MIN_RATINGS = 50;

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (m: number) => {
  const d = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}`;
};

export type NightTimes = {
  /** A bookable half-hour slot for the meal before the show. */
  dinner: string;
  /** "Dinner" in the evening, "Lunch" before a matinee. */
  meal: "Dinner" | "Lunch";
  show: string | null;
  /** Roughly when the show lets out, as a label ("10:00 pm"); a bookable slot when there is one. */
  afterLabel: string;
  afterSlot: string | null;
};

/** When to eat before the show and when it lets out, from Ticketmaster's local start time ("20:00:00" or null). */
export function nightTimes(localTime: string | null): NightTimes {
  const show = localTime && /^\d{2}:\d{2}/.test(localTime) ? localTime.slice(0, 5) : null;
  const start = toMin(show ?? DEFAULT_SHOW);
  // Round dinner down to a half hour, inside the hours venues take bookings.
  const first = toMin(TIME_SLOTS[0]);
  const last = toMin(TIME_SLOTS[TIME_SLOTS.length - 1]);
  const dinnerMin = Math.min(Math.max(Math.floor((start - DINNER_BEFORE_MIN) / 30) * 30, first), last);
  const afterMin = Math.ceil((start + AFTER_SHOW_MIN) / 30) * 30;
  const after = toHhmm(afterMin);
  return {
    dinner: toHhmm(dinnerMin),
    meal: dinnerMin >= 16 * 60 ? "Dinner" : "Lunch",
    show,
    afterLabel: slotLabel(after),
    afterSlot: afterMin < 1440 && TIME_SLOTS.includes(after) ? after : null,
  };
}

export type NightStop = Pick<LivePlace, "placeId" | "name" | "typeLabel" | "rating" | "ratingCount" | "address">;
export type NightPlan = { event: LiveEvent; times: NightTimes; before: NightStop[]; after: NightStop[] };

type Search = (query: string, near: { lat: number; lng: number } | null) => Promise<LivePlace[]>;

const stop = (p: LivePlace): NightStop => ({ placeId: p.placeId, name: p.name, typeLabel: p.typeLabel, rating: p.rating, ratingCount: p.ratingCount, address: p.address });

/** Well-rated restaurants, cafes and bars, never the venue itself or another stage. */
function pick(found: LivePlace[], taken: Set<string>): NightStop[] {
  const out: NightStop[] = [];
  for (const p of found) {
    if (out.length === STOPS_PER_PART) break;
    if (!p.dining || isEventVenue(p.primaryType) || p.ratingCount < MIN_RATINGS || taken.has(p.placeId)) continue;
    taken.add(p.placeId);
    out.push(stop(p));
  }
  return out;
}

async function safe(search: Search, q: string, near: { lat: number; lng: number } | null): Promise<LivePlace[]> {
  try {
    return await search(q, near);
  } catch {
    // One half of the night failing shouldn't lose the other.
    return [];
  }
}

const CACHE_MS = 30 * 60_000;
const cache = new Map<string, { at: number; plan: NightPlan }>();
export const clearNightCache = () => cache.clear();

/** Dinner before and dessert or drinks after, near the venue. Cached for 30 minutes per event when anything was found. */
export async function planNight(d: EventDetail, search: Search = searchNear, now: Date = new Date()): Promise<NightPlan> {
  const hit = cache.get(d.event.id);
  if (hit && now.getTime() - hit.at < CACHE_MS) return hit.plan;
  const e = d.event;
  const near = d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : null;
  const where = [e.venue, e.city, e.state].filter(Boolean).join(", ");
  const times = nightTimes(e.localTime);
  const [meals, afters] = await Promise.all([
    safe(search, `${times.meal === "Lunch" ? "lunch" : "dinner"} restaurants near ${where}`, near),
    safe(search, `dessert or cocktail bar near ${where}`, near),
  ]);
  const taken = new Set<string>();
  const plan = { event: e, times, before: pick(meals, taken), after: pick(afters, taken) };
  // A night with nothing found is worth asking again soon (Google may have just hiccuped).
  if (plan.before.length || plan.after.length) cache.set(e.id, { at: now.getTime(), plan });
  return plan;
}
