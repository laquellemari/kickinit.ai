import type { Slide } from "@/components/Carousel";

export const createSlide = (overrides: Partial<Slide> = {}): Slide => ({
  title: "Dinner on the bay",
  where: "Coconut Grove",
  photo: "waterfront dinner",
  stamp: "DINING",
  bg: "#D7E6F2",
  ...overrides,
});

export const createSlides = (n: number): Slide[] =>
  Array.from({ length: n }, (_, i) => createSlide({ title: `Slide ${i + 1}`, where: `Place ${i + 1}` }));

import type { Booking, Quest, Requirement, UserContext } from "@/lib/quests/types";

export const DAY = 86_400_000;
export const BASE = new Date("2026-11-02T19:00:00Z"); // a Monday

let seq = 0;
export const createBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: `b${++seq}`,
  status: "captured",
  checkedIn: true,
  source: "in_app",
  tags: ["restaurant", "italian"],
  startsAt: BASE,
  bookedAt: new Date(BASE.getTime() - 7 * DAY),
  localHour: 19,
  partySize: 2,
  venue: "Marea",
  city: "Miami",
  country: "US",
  isGift: false,
  ...overrides,
});

/** n bookings spaced `gapDays` apart starting at BASE. */
export const createBookingSeries = (n: number, gapDays: number, overrides: Partial<Booking> = {}) =>
  Array.from({ length: n }, (_, i) => createBooking({ startsAt: new Date(BASE.getTime() + i * gapDays * DAY), ...overrides }));

export const createRequirement = (overrides: Partial<Requirement> = {}): Requirement => ({
  type: "count", count: 3, tags: ["italian"], window_days: null, ...overrides,
});

export const createQuest = (req: Partial<Requirement> = {}, overrides: Partial<Quest> = {}): Quest => ({
  id: "q-test", category: "culinary", order: 1, title: "Test", description: "", emoji: "", difficulty: "Easy",
  xp: 100, mode: "duo", requirement: createRequirement(req),
  badge: { id: "badge-q-test", name: "Test", emoji: "", tier: "bronze" }, ...overrides,
});

export const HOME: UserContext = { homeCity: "Miami", homeCountry: "US" };

import type { Achievement, AchievementRule, Counters } from "@/lib/quests/types";

export const createCounters = (overrides: Partial<Counters> = {}): Counters => ({
  poolsFundedAsOrganizer: 0, poolContributions: 0, giftsRedeemed: 0, referralsConverted: 0, reviews: 0, ...overrides,
});

export const createAchievement = (rule: Partial<AchievementRule> & Pick<AchievementRule, "type">, overrides: Partial<Achievement> = {}): Achievement => ({
  id: "ach-test", name: "Test", emoji: "", description: "", tier: "bronze", xp: 250, group: "test",
  rule: { count: 1, ...rule } as AchievementRule, ...overrides,
});

import type { Experience } from "@/lib/catalog/types";

export const createExperience = (overrides: Partial<Experience> = {}): Experience => ({
  id: "exp-test", name: "Test Dinner", category: "culinary", tags: ["restaurant", "italian"],
  city: "Miami", country: "US", neighborhood: "Brickell", lat: 25.765, lng: -80.193,
  price: "50.00", currency: "USD", pricing: "per_person", durationMinutes: 90, partyMin: 1, partyMax: 8,
  description: "A test dinner by the water.", photo: "test", bg: "#fff", ...overrides,
});

import { MockLanguageModelV1 } from "ai/test";

type ScriptedCall = { tool: string; args: Record<string, unknown> } | { text: string };

/** A fake Claude that plays back one tool call (or text) per step, and records every prompt it was given. */
export function createScriptedModel(steps: ScriptedCall[]) {
  const prompts: unknown[] = [];
  const toolNames: string[][] = [];
  let i = 0;
  const model = new MockLanguageModelV1({
    doGenerate: async (opts) => {
      prompts.push(opts.prompt);
      toolNames.push(opts.mode.type === "regular" ? (opts.mode.tools ?? []).map((x) => x.name) : []);
      const s = steps[i++];
      if (!s) throw new Error("Model called more times than scripted");
      const base = { rawCall: { rawPrompt: null, rawSettings: {} }, usage: { promptTokens: 10, completionTokens: 10 } };
      if ("text" in s) return { ...base, finishReason: "stop" as const, text: s.text };
      return { ...base, finishReason: "tool-calls" as const, toolCalls: [{ toolCallType: "function" as const, toolCallId: `c${i}`, toolName: s.tool, args: JSON.stringify(s.args) }] };
    },
  });
  return { model, prompts, toolNames };
}

import type { LivePlace } from "@/lib/places/types";

export const createLivePlace = (overrides: Partial<LivePlace> = {}): LivePlace => {
  const placeId = overrides.placeId ?? "ChIJsd1";
  return {
    id: `gp:${placeId}`, placeId, name: "Cucina Sorella", address: "1 Main St, San Diego, CA", lat: 32.7, lng: -117.16,
    category: "culinary", typeLabel: "Italian restaurant", mapsUrl: "https://maps.google.com/?cid=1", estimatePerPerson: "60.00", ...overrides,
  };
};
