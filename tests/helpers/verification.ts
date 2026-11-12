import { expect } from "vitest";
import { screen } from "@testing-library/react";
import { routerPush } from "./setup";

/** Carousel shows the expected slide and counter. */
export function verifyCarouselShows(expected: { title: string; where: string; index: number; total: number }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  expect(screen.getByText(expected.title)).toBeInTheDocument();
  expect(screen.getByText(expected.where)).toBeInTheDocument();
  expect(screen.getByText(`${pad(expected.index)} / ${pad(expected.total)}`)).toBeInTheDocument();
}

/** Search navigated exactly once to /plan with the expected params. */
export function verifyPlanNavigation(expected: { mode: "you" | "them"; where: string; q: string }) {
  expect(routerPush).toHaveBeenCalledTimes(1);
  const url = new URL(routerPush.mock.calls[0][0] as string, "http://x");
  expect(url.pathname).toBe("/plan");
  expect(url.searchParams.get("mode")).toBe(expected.mode);
  expect(url.searchParams.get("where")).toBe(expected.where);
  expect(url.searchParams.get("q")).toBe(expected.q);
}

import { evaluateQuest } from "@/lib/quests/engine";
import type { Booking, Quest, UserContext } from "@/lib/quests/types";

/** Evaluates a quest and checks current/target/complete/progress together. */
export function verifyQuestProgress(quest: Quest, bookings: Booking[], ctx: UserContext, expected: { current: number; complete: boolean }) {
  const r = evaluateQuest(quest, bookings, ctx);
  const target = quest.requirement.count;
  expect(r.questId).toBe(quest.id);
  expect(r.target).toBe(target);
  expect(r.current).toBe(expected.current);
  expect(r.complete).toBe(expected.complete);
  expect(r.progress).toBeCloseTo(expected.current / target, 5);
  return r;
}

import { evaluateAchievement, type ActivityInput } from "@/lib/quests/achievements";
import type { Achievement } from "@/lib/quests/types";

export function verifyAchievement(a: Achievement, input: ActivityInput, expected: { current: number; unlocked: boolean }) {
  const r = evaluateAchievement(a, input);
  expect(r.achievementId).toBe(a.id);
  expect(r.target).toBe(a.rule.count);
  expect(r.current).toBe(expected.current);
  expect(r.unlocked).toBe(expected.unlocked);
  return r;
}

import type { Quote, SearchResult } from "@/lib/catalog/types";

export function verifyQuote(q: Quote, expected: Partial<Quote>) {
  expect(q).toMatchObject(expected);
  expect(q.total).toMatch(/^\d+\.\d{2}$/);
  expect(q.description.length).toBeLessThanOrEqual(127);
}

export function verifyResultIds(results: SearchResult[], ids: string[]) {
  expect(results.map((r) => r.id)).toEqual(ids);
}

import type { ConciergeResult } from "@/lib/concierge/agent";

/** Checks the concierge reply, party size and the server-priced picks in order. */
/** Partner picks carry the venue price; live picks carry none (restaurants are free, others use the venue's own menu). */
export function verifyConcierge(r: ConciergeResult, expected: { reply?: string | RegExp; partySize: number | null; picks: { id: string; total: string | null }[] }) {
  if (expected.reply instanceof RegExp) expect(r.reply).toMatch(expected.reply);
  else if (expected.reply !== undefined) expect(r.reply).toBe(expected.reply);
  expect(r.partySize).toBe(expected.partySize);
  // The model's picks lead, in order; the server may add more matches after them.
  const got = r.options.map((o) => ({ id: o.kind === "partner" ? o.experience.id : o.place.id, total: o.kind === "partner" ? o.quote.total : null }));
  expect(got.slice(0, expected.picks.length)).toEqual(expected.picks);
  if (!expected.picks.length) expect(got).toEqual([]);
  expect(new Set(got.map((g) => g.id)).size).toBe(got.length);
  for (const o of r.options) {
    if (o.kind !== "partner") continue;
    expect(o.experience.total).toBe(o.quote.total);
    expect(o.quote.partySize).toBe(expected.partySize);
  }
}

import type { Booking as StoredBooking } from "@/lib/bookings/repo";

/** Checks a booking's identity, money and state together. */
export function verifyBooking(b: StoredBooking | null, expected: Partial<StoredBooking> & { status: StoredBooking["status"] }) {
  expect(b).not.toBeNull();
  expect(b!.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(b).toMatchObject(expected);
  expect(b!.createdAt).toBeInstanceOf(Date);
  expect(b!.updatedAt.getTime()).toBeGreaterThanOrEqual(b!.createdAt.getTime());
}
