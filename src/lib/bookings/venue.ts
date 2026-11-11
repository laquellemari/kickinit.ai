import { getExperience } from "@/lib/catalog/catalog";
import type { Category } from "@/lib/catalog/types";
import type { LivePlace } from "@/lib/places/types";

/** What the quest engine needs to know about where and when a booking happens. */
export type VenueFacts = { tags: string[]; city: string; country: string; neighborhood: string | null; cuisine: string | null; localHour: number };

/** Partner cities and their time zones. */
export const CITY_TZ: Record<string, string> = {
  Miami: "America/New_York",
  Islamorada: "America/New_York",
  Austin: "America/Chicago",
  "Mexico City": "America/Mexico_City",
  Tulum: "America/Cancun",
};

/** Tags a live venue gets from its category, so it can count toward quests. */
const CATEGORY_TAGS: Record<Category, string[]> = {
  culinary: ["restaurant"], wellness: ["wellness", "spa"], movement: ["fitness"], culture: ["arts"],
  nightlife: ["nightlife", "bar"], outdoors: ["outdoors"], create: ["workshop"], getaways: ["getaway"],
};

export function hourIn(timeZone: string, at: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(at));
}

export function partnerFacts(experienceId: string, startsAt: Date): VenueFacts {
  const e = getExperience(experienceId);
  if (!e) throw new Error(`Experience not found: ${experienceId}`);
  return {
    tags: e.tags, city: e.city, country: e.country, neighborhood: e.neighborhood, cuisine: e.cuisine ?? null,
    localHour: hourIn(CITY_TZ[e.city], startsAt), // every partner city is mapped (enforced by a test)
  };
}

export function liveFacts(place: LivePlace, startsAt: Date): VenueFacts {
  const offset = place.utcOffsetMinutes ?? 0;
  const local = new Date(startsAt.getTime() + offset * 60_000);
  const tags = [...CATEGORY_TAGS[place.category], ...(place.primaryType ? [place.primaryType] : [])];
  return { tags, city: place.city, country: place.country, neighborhood: null, cuisine: null, localHour: local.getUTCHours() };
}
