import { generateText, tool, type CoreMessage, type LanguageModelV1, type ToolSet } from "ai";
import { z } from "zod";
import { getExperience, quote, searchExperiences } from "@/lib/catalog/catalog";
import { CATEGORIES, type Quote, type SearchResult } from "@/lib/catalog/types";

export type Mode = "you" | "them";
export type HistoryItem = { role: "user" | "assistant"; content: string };
export type ConciergeInput = { message: string; mode: Mode; where?: string; history?: HistoryItem[]; today?: Date };
export type Pick = { experience: SearchResult; why: string; quote: Quote };
export type ConciergeResult = { reply: string; partySize: number | null; options: Pick[] };

export const LIMITS = { message: 1000, historyItems: 20, historyContent: 4000, picks: 4 } as const;

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

export function systemPrompt(input: ConciergeInput): string {
  const today = (input.today ?? new Date()).toDateString();
  const who =
    input.mode === "them"
      ? "The user is buying an experience as a GIFT for someone else. Pick things that suit the person they describe, mention why it fits them, and respect any budget as a total."
      : "The user is planning something for themselves (and anyone they bring).";
  return [
    "You are the kickinit concierge. You find bookable experiences (restaurants, spas, classes, nights out, outdoors, getaways) from kickinit's partner catalog and hold them with PayPal while the user decides.",
    who,
    `Today is ${today}. The user's area: ${input.where?.trim() || "Miami"}.`,
    "Rules:",
    "- Only recommend experiences returned by search_experiences. Never invent venues, prices or availability.",
    "- Search at least once. Try a broader search (fewer filters) if the first returns nothing.",
    "- Infer party size from the request (\"for 2\", \"me and my sister\" = 2, a gift for one person = 1 unless they say otherwise). Default 2 for dates and dinners, otherwise 1.",
    `- Finish by calling present_options with 1 to ${LIMITS.picks} picks, best first, each with a one-sentence reason in a warm, specific voice. Do not list the picks in plain text as well.`,
    "- If nothing fits, call present_options with your best near-misses and say plainly what's missing.",
    "- If the user asks about a payment or booking and gives a PayPal order id, use get_order (when available) and explain the status in plain words.",
    "- Keep the intro to 2 sentences. No emojis.",
  ].join("\n");
}

function catalogTools() {
  return {
    search_experiences: tool({
      description: "Search kickinit's partner catalog. Returns matching experiences with the total price for the party.",
      parameters: z.object({
        q: z.string().optional().describe("Free-text keywords, e.g. 'romantic italian waterfront'"),
        category: z.enum(CATEGORIES).optional(),
        tags: z.array(z.string()).optional().describe("e.g. ['spa','massage'] or ['jazz']"),
        partySize: z.number().int().min(1).max(20).optional(),
        maxTotal: z.number().min(0).optional().describe("Budget for the whole party, in USD"),
      }),
      // The schema above already enforces everything searchExperiences validates.
      execute: async (args) =>
        searchExperiences({ ...args, limit: 8 }).map((e) => ({
          id: e.id, name: e.name, category: e.category, neighborhood: e.neighborhood, city: e.city,
          total: e.total, pricing: e.pricing, partyMin: e.partyMin, partyMax: e.partyMax, description: e.description, tags: e.tags,
        })),
    }),
    present_options: tool({
      description: "Show your final picks to the user. Call this exactly once, last.",
      parameters: z.object({
        intro: z.string().max(400),
        partySize: z.number().int().min(1).max(20),
        picks: z.array(z.object({ experienceId: z.string(), why: z.string().max(200) })).max(LIMITS.picks),
      }),
      // No execute: calling this ends the agent run.
    }),
  };
}

/** Keeps only picks that exist and can be booked for the party, priced by the server. */
export function resolvePicks(picks: { experienceId: string; why: string }[], partySize: number): Pick[] {
  const seen = new Set<string>();
  const out: Pick[] = [];
  for (const p of picks) {
    if (seen.has(p.experienceId)) continue;
    const e = getExperience(p.experienceId);
    if (!e) continue;
    let q: Quote;
    try {
      q = quote(e.id, partySize);
    } catch {
      continue;
    }
    seen.add(e.id);
    out.push({ experience: { ...e, total: q.total }, why: p.why, quote: q });
    if (out.length === LIMITS.picks) break;
  }
  return out;
}

export async function runConcierge(input: ConciergeInput, deps: { model: LanguageModelV1; extraTools?: ToolSet }): Promise<ConciergeResult> {
  validateInput(input);
  const messages: CoreMessage[] = [...(input.history ?? []), { role: "user", content: input.message.trim() }];
  const result = await generateText({
    model: deps.model,
    system: systemPrompt(input),
    messages,
    tools: { ...(deps.extraTools ?? {}), ...catalogTools() },
    maxSteps: 6,
    maxTokens: 1200,
  });

  const call = result.steps.flatMap((s) => s.toolCalls).find((c) => c.toolName === "present_options");
  if (!call) return { reply: result.text.trim() || "Sorry, I couldn't put options together. Try rephrasing?", partySize: null, options: [] };

  const args = call.args as { intro: string; partySize: number; picks: { experienceId: string; why: string }[] };
  const options = resolvePicks(args.picks, args.partySize);
  const reply = options.length ? args.intro : "I couldn't find anything bookable that fits. Try a different area, date or budget?";
  return { reply, partySize: args.partySize, options };
}
