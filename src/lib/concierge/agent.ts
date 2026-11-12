import { eventPrice, eventWhen, isEventVenue, type EventQuery, type LiveEvent } from "@/lib/events/ticketmaster";
import { generateText, tool, type CoreMessage, type LanguageModelV1, type ToolSet } from "ai";
import { z } from "zod";
import { getExperience, getExperienceByPlaceId, quote, searchExperiences } from "@/lib/catalog/catalog";
import { CATEGORIES, type Quote, type SearchResult } from "@/lib/catalog/types";
import type { LivePlace } from "@/lib/places/types";

export type Mode = "you" | "them";
export type HistoryItem = { role: "user" | "assistant"; content: string };
export type ConciergeInput = { message: string; mode: Mode; where?: string; history?: HistoryItem[]; today?: Date };
/** Partner experiences book instantly at a fixed price; live venues are a request at the venue's published price. Restaurants and bars are free to book. */
export type PlanPick =
  | { kind: "partner"; experience: SearchResult; why: string; quote: Quote }
  | { kind: "live"; place: LivePlace; why: string }
  | { kind: "event"; event: LiveEvent; why: string };
export type SearchLive = (query: string) => Promise<LivePlace[]>;
export type SearchEvents = (q: EventQuery) => Promise<LiveEvent[]>;
export const PARTNER_CITIES = "Los Angeles and its beach towns (most), plus getaways in Palm Springs, Ojai, Malibu and Santa Barbara";
export type ConciergeResult = { reply: string; partySize: number | null; options: PlanPick[] };

/** picks: hand-picked by the model, each with a reason. options: everything shown, topped up by the server. */
export const LIMITS = { message: 1000, historyItems: 20, historyContent: 4000, picks: 8, options: 30, minOptions: 20, searchLimit: 30 } as const;

export function validateInput(input: ConciergeInput): void {
  if (typeof input.message !== "string" || !input.message.trim()) throw new Error("Message is required");
  if (input.message.length > LIMITS.message) throw new Error(`Message cannot exceed ${LIMITS.message} characters`);
  if (input.mode !== "you" && input.mode !== "them") throw new Error("Mode must be you or them");
  if (input.where !== undefined && (typeof input.where !== "string" || input.where.length > 100)) throw new Error("Where must be text up to 100 characters");
  const h = input.history ?? [];
  if (!Array.isArray(h)) throw new Error("History must be a list");
  if (h.length > LIMITS.historyItems) throw new Error(`History cannot exceed ${LIMITS.historyItems} messages`);
  for (const m of h) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) throw new Error("History roles must be user or assistant");
    if (typeof m.content !== "string" || m.content.length > LIMITS.historyContent) throw new Error(`History messages must be text up to ${LIMITS.historyContent} characters`);
  }
}

export function systemPrompt(input: ConciergeInput, opts: { live?: boolean; events?: boolean } = {}): string {
  const today = (input.today ?? new Date()).toDateString();
  const who =
    input.mode === "them"
      ? "The user is buying an experience as a GIFT for someone else. Pick things that suit the person they describe, mention why it fits them, and respect any budget as a total."
      : "The user is planning something for themselves (and anyone they bring).";
  return [
    "You are the kickinit concierge. You find bookable experiences (restaurants, spas, classes, nights out, outdoors, getaways) from kickinit's partner catalog and real venues, and books them. Restaurants and bars are free to book (the user pays the bill at the end); everything else is paid with PayPal at its exact price plus a 20% concierge fee (members pay no fee).",
    who,
    `Today is ${today}. The user's area: ${input.where?.trim() || "Los Angeles"}.`,
    "Rules:",
    `- kickinit partners (search_experiences) are in ${PARTNER_CITIES}. They book instantly at a fixed price; prefer them when they fit.`,
    opts.live
      ? "- Also call search_live_places with what + where (e.g. 'romantic italian dinner in San Diego') so the user gets plenty of choice, and always when the area isn't covered or partners don't fit. Live venues are 'request to book': restaurants and bars are free; for anything else we use the venue's own published prices and PayPal only charges once the venue confirms. Say so briefly."
      : `- If the user's area isn't covered, say kickinit doesn't have partners there yet and suggest the closest options.`,
    ...(opts.events
      ? ["- For concerts, live music, shows, theater, comedy or sports, or when the user names a theater, arena, stadium or concert venue, call search_events (pass venue when they named one) and recommend the actual events, never the venue building. Tickets are bought on Ticketmaster; say so briefly."]
      : []),
    "- Only recommend places returned by your search tools, using their exact id. Never invent venues, prices or availability.",
    "- Search at least once. Try a broader search if the first returns nothing.",
    "- Infer party size from the request (\"for 2\", \"me and my sister\" = 2, a gift for one person = 1 unless they say otherwise). Default 2 for dates and dinners, otherwise 1.",
    `- Finish by calling present_options with your 1 to ${LIMITS.picks} best picks, best first, each with a one-sentence reason in a warm, specific voice. The app also shows the other good matches from your searches below them. Do not list the picks in plain text as well.`,
    "- If nothing fits, call present_options with your best near-misses and say plainly what's missing.",
    "- If the user asks about a payment or booking and gives a PayPal order id, use get_order (when available) and explain the status in plain words.",
    "- Keep the intro to 2 sentences. No emojis.",
  ].join("\n");
}

function buildTools(searchLive: SearchLive | undefined, liveCache: Map<string, LivePlace>, found: string[], searchEvents?: SearchEvents, eventCache: Map<string, LiveEvent> = new Map()) {
  const tools: ToolSet = {
    search_experiences: tool({
      description: `Search kickinit's partner catalog (${PARTNER_CITIES}). Returns matching experiences with the total price for the party.`,
      parameters: z.object({
        q: z.string().optional().describe("Free-text keywords, e.g. 'romantic italian waterfront'"),
        category: z.enum(CATEGORIES).optional(),
        tags: z.array(z.string()).optional().describe("e.g. ['spa','massage'] or ['jazz']"),
        partySize: z.number().int().min(1).max(20).optional(),
        maxTotal: z.number().min(0).optional().describe("Budget for the whole party, in USD"),
      }),
      // The schema above already enforces everything searchExperiences validates.
      execute: async (args) =>
        searchExperiences({ ...args, limit: LIMITS.searchLimit }).map((e) => {
          found.push(e.id);
          return {
            id: e.id, name: e.name, category: e.category, neighborhood: e.neighborhood, city: e.city,
            total: e.total, pricing: e.pricing, partyMin: e.partyMin, partyMax: e.partyMax, description: e.description, tags: e.tags,
          };
        }),
    }),
    present_options: tool({
      description: "Show your final picks to the user. Call this exactly once, last. Use ids exactly as returned by the search tools.",
      parameters: z.object({
        intro: z.string().max(400),
        partySize: z.number().int().min(1).max(20),
        picks: z.array(z.object({ experienceId: z.string(), why: z.string().max(200) })).max(LIMITS.picks),
      }),
      // No execute: calling this ends the agent run.
    }),
  };
  if (searchLive) {
    tools.search_live_places = tool({
      description: "Search real venues anywhere via Google Maps. Results are request-to-book (not partners). Include the place in the query.",
      parameters: z.object({ query: z.string().min(1).max(200).describe("What and where, e.g. 'day spa in San Diego'") }),
      execute: async ({ query }) => {
        try {
          const places = await searchLive(query);
          for (const p of places) { liveCache.set(p.id, p); found.push(p.id); }
          return places.map((p) => ({ id: p.id, name: p.name, type: p.typeLabel, address: p.address, googleSpendPerPerson: p.estimatePerPerson, freeToBook: p.dining }));
        } catch (err) {
          console.error("Live search failed:", err);
          return { error: "Live search is unavailable right now. Use partner experiences or ask the user to try again." };
        }
      },
    });
  }
  if (searchEvents) {
    tools.search_events = tool({
      description: "Upcoming concerts, shows, comedy and games from Ticketmaster (US). Use venue for 'what's on at X'. Tickets are bought on Ticketmaster.",
      parameters: z.object({
        keyword: z.string().max(100).optional().describe("Artist, show or kind of event, e.g. 'jazz', 'Adele', 'comedy'"),
        venue: z.string().max(100).optional().describe("A venue name, e.g. 'The Colosseum at Caesars Palace'"),
        city: z.string().max(60).optional(),
        stateCode: z.string().length(2).optional().describe("Two-letter US state, e.g. NV"),
        category: z.string().max(40).optional().describe("music, sports, arts & theatre, comedy"),
        from: z.string().optional().describe("First local date, YYYY-MM-DD"),
        to: z.string().optional().describe("Last local date, YYYY-MM-DD"),
      }),
      execute: async (q) => {
        try {
          const events = await searchEvents(q);
          for (const e of events) { eventCache.set(e.id, e); found.push(e.id); }
          return events.map((e) => ({ id: e.id, name: e.name, when: eventWhen(e), venue: e.venue, city: e.city, price: eventPrice(e), genre: e.genre }));
        } catch (err) {
          console.error("Event search failed:", err);
          return { error: (err as Error).message.startsWith("Say what") || (err as Error).message.startsWith("Dates") ? (err as Error).message : "Event search is unavailable right now." };
        }
      },
    });
  }
  return tools;
}

/** Keeps only picks that exist and can be booked for the party, priced by the server. */
export function resolvePicks(
  picks: { experienceId: string; why: string }[], partySize: number, liveCache: Map<string, LivePlace> = new Map(), max: number = LIMITS.picks,
  eventCache: Map<string, LiveEvent> = new Map(),
): PlanPick[] {
  const seen = new Set<string>();
  const out: PlanPick[] = [];
  for (const p of picks) {
    if (seen.has(p.experienceId)) continue;
    const event = eventCache.get(p.experienceId);
    if (event) {
      seen.add(event.id);
      out.push({ kind: "event", event, why: p.why });
      if (out.length === max) break;
      continue;
    }
    const live = liveCache.get(p.experienceId);
    // When we have real events, a stage or arena itself isn't something to book.
    if (live && eventCache.size && isEventVenue(live.primaryType)) continue;
    // A Google result that is one of our partners books as the partner (instant, fixed price), shown once.
    const partner = live && getExperienceByPlaceId(live.placeId);
    if (partner) {
      out.push(...resolvePicks([{ experienceId: partner.id, why: p.why }], partySize, new Map(), 1).filter((x) => !seen.has(idOf(x))));
      seen.add(live.id);
      for (const x of out) seen.add(idOf(x));
    } else if (live) {
      seen.add(live.id);
      out.push({ kind: "live", place: live, why: p.why });
    } else {
      const e = getExperience(p.experienceId);
      if (!e) continue;
      let q: Quote;
      try {
        q = quote(e.id, partySize);
      } catch {
        continue;
      }
      seen.add(e.id);
      out.push({ kind: "partner", experience: { ...e, total: q.total }, why: p.why, quote: q });
    }
    if (out.length === max) break;
  }
  return out;
}

/** The model's picks first, then every other bookable match its searches found, then similar partners from the same categories, up to LIMITS.options. */
export function withMoreOptions(picks: PlanPick[], found: string[], partySize: number, liveCache: Map<string, LivePlace>, eventCache: Map<string, LiveEvent> = new Map()): PlanPick[] {
  const shown = new Set(picks.map(idOf));
  const reason = (id: string) => {
    const event = eventCache.get(id);
    if (event) return `${event.venue}${event.city ? `, ${event.city}` : ""} · ${eventWhen(event)}`;
    const live = liveCache.get(id);
    return live ? `${live.typeLabel} · ${live.address}` : getExperience(id)!.description;
  };
  const extra = (ids: string[]) => {
    const fresh = [...new Set(ids)].filter((id) => !shown.has(id));
    const more = resolvePicks(fresh.map((id) => ({ experienceId: id, why: reason(id) })), partySize, liveCache, LIMITS.options - picks.length, eventCache)
      .filter((m) => !shown.has(idOf(m))); // a Google listing of a partner already shown
    for (const m of more) shown.add(idOf(m));
    return more;
  };
  let out = [...picks, ...extra(found)];
  if (out.length < LIMITS.minOptions) {
    const cats = new Set(out.filter((p) => p.kind === "partner").map((p) => (p as Extract<PlanPick, { kind: "partner" }>).experience.category));
    const similar = searchExperiences({ partySize, limit: 50 }).filter((e) => cats.has(e.category)).map((e) => e.id);
    out = [...out, ...extra(similar)];
  }
  return out.slice(0, LIMITS.options);
}

export const idOf = (p: PlanPick) => (p.kind === "live" ? p.place.id : p.kind === "event" ? p.event.id : p.experience.id);

export async function runConcierge(
  input: ConciergeInput,
  deps: { model: LanguageModelV1; extraTools?: ToolSet; searchLive?: SearchLive; searchEvents?: SearchEvents },
): Promise<ConciergeResult> {
  validateInput(input);
  const liveCache = new Map<string, LivePlace>();
  const eventCache = new Map<string, LiveEvent>();
  const found: string[] = [];
  const messages: CoreMessage[] = [...(input.history ?? []), { role: "user", content: input.message.trim() }];
  const result = await generateText({
    model: deps.model,
    system: systemPrompt(input, { live: !!deps.searchLive, events: !!deps.searchEvents }),
    messages,
    tools: { ...(deps.extraTools ?? {}), ...buildTools(deps.searchLive, liveCache, found, deps.searchEvents, eventCache) },
    maxSteps: 6,
    maxTokens: 1600,
  });

  const call = result.steps.flatMap((s) => s.toolCalls).find((c) => c.toolName === "present_options");
  if (!call) return { reply: result.text.trim() || "Sorry, I couldn't put options together. Try rephrasing?", partySize: null, options: [] };

  const args = call.args as { intro: string; partySize: number; picks: { experienceId: string; why: string }[] };
  const options = withMoreOptions(resolvePicks(args.picks, args.partySize, liveCache, LIMITS.picks, eventCache), found, args.partySize, liveCache, eventCache);
  const reply = options.length ? args.intro : "I couldn't find anything bookable that fits. Try a different area, date or budget?";
  return { reply, partySize: args.partySize, options };
}
