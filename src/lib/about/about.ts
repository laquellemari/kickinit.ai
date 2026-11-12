/**
 * A short description of each venue: what it is and what makes it worth going to, written by Claude from
 * everything Google Maps knows about the place (Google's own summaries, guest reviews, its features).
 * Written once per venue and kept for 30 days.
 */
import { getDb } from "@/lib/db";
import { getPlaceFacts, type PlaceFacts } from "@/lib/places/client";

export class AboutError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AboutError";
  }
}

const API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-5-5";
export const MAX_WORDS = 55;
export const MAX_CHARS = 500;
/** Room for the model to think before it writes; a reply that still runs out is thrown away, never kept half-written. */
export const MAX_TOKENS = 1500;

/** The facts as plain lines for the prompt. Empty facts are left out. */
export function factsText(f: PlaceFacts): string {
  const lines = [
    `Name: ${f.name}`,
    `Type: ${f.typeLabel}${f.types.length ? ` (${f.types.slice(0, 8).join(", ")})` : ""}`,
    (f.neighborhood || f.city) && `Location: ${[f.neighborhood, f.city].filter(Boolean).join(", ")}`,
    f.priceLevel && `Price level: ${f.priceLevel}`,
    f.rating !== null && `Rating: ${f.rating.toFixed(1)} from ${f.ratingCount} reviews`,
    f.features.length && `Features: ${f.features.join("; ")}`,
    f.editorial && `Google's description: ${f.editorial}`,
    f.overview && `Google's overview: ${f.overview}`,
    f.reviewSummary && `What reviewers say: ${f.reviewSummary}`,
    ...f.reviews.map((r, i) => `Review ${i + 1}: ${r}`),
  ];
  return lines.filter(Boolean).join("\n");
}

export function aboutPrompt(f: PlaceFacts): string {
  return [
    "Write the description for this venue's page on an experiences-booking site.",
    `In 1 or 2 sentences (at most ${MAX_WORDS} words), say what the place is and what makes it stand out: its signature dishes, treatments or activities, its setting, or what guests single out.`,
    "Use only the facts below. Never invent a detail, and leave out anything only one reviewer mentions in passing.",
    "No ratings, prices, hours, addresses or review counts. Don't mention Google, reviews or reviewers. No hype words like \"hidden gem\" or \"must-visit\".",
    "Reply with the description only, as plain text. If the facts are too thin to say anything specific, reply with the single word NONE.",
    "",
    factsText(f),
  ].join("\n");
}

/** Claude's reply as a description, or null if it declined or wrote something unusable. */
export function cleanAbout(reply: string): string | null {
  const s = reply.replace(/[*_`#]/g, "").replace(/^["“'\s]+|["”'\s]+$/g, "").replace(/\s+/g, " ").trim();
  if (!s || /^NONE\.?$/i.test(s)) return null;
  // Keep at most two sentences.
  const sentences = s.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [s];
  const two = sentences.slice(0, 2).join("").trim();
  // Two long sentences can run over; one is still a good description.
  const out = two.length <= MAX_CHARS ? two : sentences[0].trim();
  return out.length >= 20 && out.length <= MAX_CHARS ? out : null;
}

type ApiResponse = { content?: { type: string; text?: string }[]; stop_reason?: string; error?: { message?: string } };

/** Claude writes the description from the venue's Google Maps facts. */
export async function writeAbout(f: PlaceFacts): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AboutError(503, "Venue descriptions are not configured");
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ABOUT_MODEL || process.env.CONCIERGE_MODEL || DEFAULT_MODEL, max_tokens: MAX_TOKENS, messages: [{ role: "user", content: aboutPrompt(f) }] }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await res.text();
  const json = (raw ? JSON.parse(raw) : {}) as ApiResponse;
  if (!res.ok) throw new AboutError(502, `Description failed: ${json.error?.message ?? `HTTP ${res.status}`}`);
  const reply = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ");
  const finished = json.stop_reason === undefined || json.stop_reason === "end_turn";
  const about = finished ? cleanAbout(reply) : null;
  // One line per venue, so an empty description can be understood from the logs.
  console.info("[about]", JSON.stringify({
    venue: f.name, editorial: !!f.editorial, overview: !!f.overview, reviewSummary: !!f.reviewSummary, reviews: f.reviews.length,
    features: f.features.length, stop: json.stop_reason ?? null, kept: about !== null, reply: reply.slice(0, 600),
  }));
  return about;
}

const DAY = 86_400_000;
/** A description is rewritten monthly; a venue Google knows too little about is tried again after a week. */
export const FOUND_TTL_DAYS = 30;
export const EMPTY_TTL_DAYS = 7;
/** Bumped when the prompt changes, so descriptions written by an older prompt are rewritten. */
export const ABOUT_VERSION = "v3";
const keyOf = (placeId: string) => `${ABOUT_VERSION}:${placeId}`;

export type About = { about: string | null; checkedAt: Date };

export async function cachedAbout(placeId: string, now: Date = new Date()): Promise<About | null> {
  const { rows } = await (await getDb()).query<{ about: string | null; checked_at: Date | string }>(
    "SELECT about, checked_at FROM venue_about WHERE place_id = $1", [keyOf(placeId)],
  );
  const r = rows[0];
  if (!r) return null;
  const checkedAt = new Date(r.checked_at);
  const ttl = (r.about ? FOUND_TTL_DAYS : EMPTY_TTL_DAYS) * DAY;
  return now.getTime() - checkedAt.getTime() < ttl ? { about: r.about, checkedAt } : null;
}

export async function saveAbout(placeId: string, a: About): Promise<void> {
  await (await getDb()).query(
    "INSERT INTO venue_about (place_id, about, checked_at) VALUES ($1, $2, $3) ON CONFLICT (place_id) DO UPDATE SET about = EXCLUDED.about, checked_at = EXCLUDED.checked_at",
    [keyOf(placeId), a.about, a.checkedAt.toISOString()],
  );
}

const inflight = new Map<string, Promise<About>>();

/** The venue's description: from the cache, or written once (concurrent requests share one write). */
export async function aboutFor(placeId: string, now: Date = new Date()): Promise<About> {
  const hit = await cachedAbout(placeId, now);
  if (hit) return hit;
  let p = inflight.get(placeId);
  if (!p) {
    p = (async () => {
      const a = { about: await writeAbout(await getPlaceFacts(placeId)), checkedAt: now };
      await saveAbout(placeId, a);
      return a;
    })().finally(() => inflight.delete(placeId));
    inflight.set(placeId, p);
  }
  return p;
}
