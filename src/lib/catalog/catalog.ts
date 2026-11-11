import data from "../../../data/experiences.json";
import { CATEGORIES, type Experience, type Quote, type SearchParams, type SearchResult } from "./types";

export const ALL_EXPERIENCES: readonly Experience[] = data.experiences as Experience[];

const toCents = (s: string) => Math.round(Number(s) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9áéíóúñ]+/).filter(Boolean);

export function distanceKm(p: { lat: number; lng: number }, q: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(q.lat - p.lat);
  const dLng = rad(q.lng - p.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function checkPartySize(n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error("Party size must be a whole number from 1 to 20");
}

function totalCents(e: Experience, partySize: number): number {
  return e.pricing === "per_group" ? toCents(e.price) : toCents(e.price) * partySize;
}

export function getExperience(id: string, list: readonly Experience[] = ALL_EXPERIENCES): Experience | undefined {
  return list.find((e) => e.id === id);
}

/** Server-side price for a booking. The browser never decides what the buyer pays. */
export function quote(experienceId: string, partySize: number, list: readonly Experience[] = ALL_EXPERIENCES): Quote {
  checkPartySize(partySize);
  const e = getExperience(experienceId, list);
  if (!e) throw new Error(`Experience not found: ${experienceId}`);
  if (partySize < e.partyMin || partySize > e.partyMax) {
    throw new Error(`Party size for ${e.name} must be from ${e.partyMin} to ${e.partyMax}`);
  }
  const suffix = ` · ${partySize} ${partySize === 1 ? "guest" : "guests"}`;
  return {
    experienceId: e.id,
    partySize,
    unitPrice: e.price,
    total: fromCents(totalCents(e, partySize)),
    currency: e.currency,
    description: e.name.slice(0, 127 - suffix.length) + suffix,
  };
}

function validate(p: SearchParams): void {
  if (p.category !== undefined && !(CATEGORIES as readonly string[]).includes(p.category)) throw new Error(`Unknown category: ${p.category}`);
  if (p.partySize !== undefined) checkPartySize(p.partySize);
  if (p.maxTotal !== undefined && !(p.maxTotal >= 0)) throw new Error("Max total must be zero or more");
  if (p.limit !== undefined && (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 50)) throw new Error("Limit must be a whole number from 1 to 50");
  if (p.near) {
    if (!(p.near.lat >= -90 && p.near.lat <= 90)) throw new Error("Latitude must be between -90 and 90");
    if (!(p.near.lng >= -180 && p.near.lng <= 180)) throw new Error("Longitude must be between -180 and 180");
    if (!(p.near.radiusKm > 0 && p.near.radiusKm <= 500)) throw new Error("Radius must be more than 0 and at most 500 km");
  }
}

export function searchExperiences(p: SearchParams, list: readonly Experience[] = ALL_EXPERIENCES): SearchResult[] {
  validate(p);
  const terms = words(p.q ?? "");
  const party = p.partySize;

  const scored = list.flatMap((e) => {
    if (p.category && e.category !== p.category) return [];
    if (p.tags?.length && !e.tags.some((t) => p.tags!.includes(t))) return [];
    if (party !== undefined && (party < e.partyMin || party > e.partyMax)) return [];

    const size = party ?? e.partyMin;
    const cents = totalCents(e, size);
    if (p.maxTotal !== undefined && cents > Math.round(p.maxTotal * 100)) return [];

    let distance: number | undefined;
    if (p.near) {
      distance = distanceKm(p.near, e);
      if (distance > p.near.radiusKm) return [];
    }

    let score = 0;
    if (terms.length) {
      const hay = new Set(words([e.name, e.description, e.tags.join(" "), e.neighborhood, e.city, e.cuisine ?? ""].join(" ")));
      score = terms.filter((t) => hay.has(t)).length;
      if (score === 0) return [];
    }
    return [{ e, score, distance, total: fromCents(cents) }];
  });

  scored.sort((x, y) => y.score - x.score || (x.distance ?? 0) - (y.distance ?? 0) || x.e.name.localeCompare(y.e.name));
  return scored.slice(0, p.limit ?? 20).map(({ e, distance, total }) => ({ ...e, total, ...(distance !== undefined && { distanceKm: distance }) }));
}
