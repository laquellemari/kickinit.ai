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
