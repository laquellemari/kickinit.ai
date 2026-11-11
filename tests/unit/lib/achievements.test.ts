import { describe, it, expect } from "vitest";
import { evaluateAchievement, evaluateAllAchievements, totalXp, ALL_ACHIEVEMENTS, type ActivityInput } from "@/lib/quests/achievements";
import type { Quest, QuestProgress } from "@/lib/quests/types";
import { createAchievement, createBooking, createBookingSeries, createCounters, createQuest, HOME, BASE, DAY } from "../../helpers/factories";
import { verifyAchievement } from "../../helpers/verification";

const CATS = ["culinary", "wellness", "movement", "culture", "nightlife", "outdoors", "create", "getaways"];

/** Quests q0..qN with a category/difficulty, and progress marking the first `done` of them complete. */
function questSet(spec: { category: string; difficulty?: Quest["difficulty"]; done: boolean; xp?: number }[]) {
  const quests = spec.map((s, i) => createQuest({}, { id: `q${i}`, category: s.category, difficulty: s.difficulty ?? "Easy", xp: s.xp ?? 100 }));
  const progress: QuestProgress[] = spec.map((s, i) => ({ questId: `q${i}`, current: s.done ? 1 : 0, target: 1, complete: s.done, progress: s.done ? 1 : 0 }));
  return { quests, progress };
}

const input = (over: Partial<ActivityInput> = {}): ActivityInput => ({
  bookings: [], ctx: HOME, questProgress: [], counters: createCounters(), quests: [], ...over,
});

describe("evaluateAchievement — quest-based rules", () => {
  it("quests_in_category counts only completed quests in that category", () => {
    const { quests, progress } = questSet([{ category: "culinary", done: true }, { category: "culinary", done: true }, { category: "culinary", done: false }, { category: "spa", done: true }]);
    verifyAchievement(createAchievement({ type: "quests_in_category", category: "culinary", count: 2 }), input({ quests, questProgress: progress }), { current: 2, unlocked: true });
  });
  it("quests counts all completed quests", () => {
    const { quests, progress } = questSet([{ category: "a", done: true }, { category: "b", done: true }, { category: "c", done: false }]);
    verifyAchievement(createAchievement({ type: "quests", count: 3 }), input({ quests, questProgress: progress }), { current: 2, unlocked: false });
  });
  it("categories_with_quest counts categories with at least one completion", () => {
    const { quests, progress } = questSet([{ category: "culinary", done: true }, { category: "culinary", done: true }, { category: "wellness", done: true }, { category: "culture", done: false }]);
    verifyAchievement(createAchievement({ type: "categories_with_quest", count: 8 }), input({ quests, questProgress: progress }), { current: 2, unlocked: false });
  });
  it("min_quests_per_category is the weakest of the 8 categories", () => {
    const spec = CATS.flatMap((c, i) => Array.from({ length: i === 3 ? 1 : 5 }, () => ({ category: c, done: true })));
    const { quests, progress } = questSet(spec);
    verifyAchievement(createAchievement({ type: "min_quests_per_category", count: 5 }), input({ quests, questProgress: progress }), { current: 1, unlocked: false });
  });
  it("min_quests_per_category is 0 when a category has no completions", () => {
    const { quests, progress } = questSet([{ category: "culinary", done: true }]);
    verifyAchievement(createAchievement({ type: "min_quests_per_category", count: 1 }), input({ quests, questProgress: progress }), { current: 0, unlocked: false });
  });
  it("quests_by_difficulty counts completions of that difficulty only", () => {
    const { quests, progress } = questSet([{ category: "a", difficulty: "Legendary", done: true }, { category: "a", difficulty: "Hard", done: true }]);
    verifyAchievement(createAchievement({ type: "quests_by_difficulty", difficulty: "Legendary", count: 1 }), input({ quests, questProgress: progress }), { current: 1, unlocked: true });
  });
  it("progress for a quest id not in the quest list is ignored", () => {
    const { quests } = questSet([{ category: "culinary", done: false }]);
    const progress: QuestProgress[] = [{ questId: "ghost", current: 1, target: 1, complete: true, progress: 1 }];
    verifyAchievement(createAchievement({ type: "quests_in_category", category: "culinary", count: 1 }), input({ quests, questProgress: progress }), { current: 0, unlocked: false });
  });
});

describe("evaluateAchievement — booking-based rules", () => {
  it("bookings counts only paid, attended, in-app bookings for yourself", () => {
    const b = [...createBookingSeries(2, 1), createBooking({ checkedIn: false }), createBooking({ isGift: true })];
    verifyAchievement(createAchievement({ type: "bookings", count: 2 }), input({ bookings: b }), { current: 2, unlocked: true });
  });
  it("gifts_sent counts paid gifts", () => {
    const b = [createBooking({ isGift: true }), createBooking({ isGift: true, status: "held" })];
    verifyAchievement(createAchievement({ type: "gifts_sent", count: 1 }), input({ bookings: b }), { current: 1, unlocked: true });
  });
  it("weekly_streak uses all your bookings", () => {
    verifyAchievement(createAchievement({ type: "weekly_streak", count: 4 }), input({ bookings: createBookingSeries(4, 7, { tags: ["anything"] }) }), { current: 4, unlocked: true });
  });
  it("distinct_cities and distinct_countries", () => {
    const b = [["Miami", "US"], ["Austin", "US"], ["Mexico City", "MX"], ["Miami", "US"]].map(([city, country]) => createBooking({ city, country }));
    verifyAchievement(createAchievement({ type: "distinct_cities", count: 3 }), input({ bookings: b }), { current: 3, unlocked: true });
    verifyAchievement(createAchievement({ type: "distinct_countries", count: 3 }), input({ bookings: b }), { current: 2, unlocked: false });
  });
  it("same_companion is the most-booked companion", () => {
    const b = ["Ana", "Ana", "Ben", undefined].map((companion) => createBooking({ companion }));
    verifyAchievement(createAchievement({ type: "same_companion", count: 2 }), input({ bookings: b }), { current: 2, unlocked: true });
  });
  it("same_companion is 0 with no companions recorded", () => {
    verifyAchievement(createAchievement({ type: "same_companion", count: 1 }), input({ bookings: [createBooking()] }), { current: 0, unlocked: false });
  });
  it("party_size_bookings counts bookings at or above min_party", () => {
    const b = [3, 4, 6].map((partySize) => createBooking({ partySize }));
    verifyAchievement(createAchievement({ type: "party_size_bookings", count: 2, min_party: 4 }), input({ bookings: b }), { current: 2, unlocked: true });
  });
  it("bookings_filter applies the time-of-day filter", () => {
    const b = [6, 7, 12].map((localHour) => createBooking({ localHour }));
    verifyAchievement(createAchievement({ type: "bookings_filter", filter: "early", count: 5 }), input({ bookings: b }), { current: 2, unlocked: false });
  });
});

describe("evaluateAchievement — counter rules", () => {
  it.each([
    ["pools_funded_as_organizer", "poolsFundedAsOrganizer"],
    ["pool_contributions", "poolContributions"],
    ["gifts_redeemed", "giftsRedeemed"],
    ["referrals_converted", "referralsConverted"],
    ["reviews", "reviews"],
  ] as const)("%s reads counters.%s", (type, key) => {
    verifyAchievement(createAchievement({ type, count: 3 }), input({ counters: createCounters({ [key]: 3 }) }), { current: 3, unlocked: true });
  });
});

describe("evaluateAchievement — validation", () => {
  it("rejects an unknown rule type", () => {
    expect(() => evaluateAchievement(createAchievement({ type: "bogus" as never }), input())).toThrow("Unknown achievement rule: bogus");
  });
  it("rejects a non-positive target", () => {
    expect(() => evaluateAchievement(createAchievement({ type: "reviews", count: 0 }), input())).toThrow("Achievement count must be a positive integer");
  });
  it("rejects a negative counter", () => {
    expect(() => evaluateAchievement(createAchievement({ type: "reviews" }), input({ counters: createCounters({ reviews: -1 }) }))).toThrow("Counter reviews cannot be negative");
  });
  it("rejects a non-integer counter", () => {
    expect(() => evaluateAchievement(createAchievement({ type: "reviews" }), input({ counters: createCounters({ giftsRedeemed: 1.5 }) }))).toThrow("Counter giftsRedeemed must be a whole number");
  });
});

describe("evaluateAchievement — boundary", () => {
  it("target - 1 is locked, target unlocks, above target caps at target", () => {
    const a = createAchievement({ type: "reviews", count: 10 });
    verifyAchievement(a, input({ counters: createCounters({ reviews: 9 }) }), { current: 9, unlocked: false });
    verifyAchievement(a, input({ counters: createCounters({ reviews: 10 }) }), { current: 10, unlocked: true });
    verifyAchievement(a, input({ counters: createCounters({ reviews: 50 }) }), { current: 10, unlocked: true });
  });
  it("zero activity unlocks nothing in the shipped list", () => {
    const r = evaluateAllAchievements(input());
    expect(r).toHaveLength(58);
    expect(r.filter((x) => x.unlocked)).toHaveLength(0);
  });
});

describe("shipped achievements", () => {
  it("has 58 achievements and the first booking unlocks First Stamp-style booking achievements", () => {
    expect(ALL_ACHIEVEMENTS).toHaveLength(58);
    const r = evaluateAllAchievements(input({ bookings: [createBooking()] }));
    const unlocked = r.filter((x) => x.unlocked).map((x) => x.achievementId);
    const bookingOne = ALL_ACHIEVEMENTS.find((a) => a.rule.type === "bookings" && a.rule.count === 1)!;
    expect(unlocked).toContain(bookingOne.id);
  });
});

describe("default quest list", () => {
  it("uses the shipped 403 quests when no quest list is given", () => {
    const progress: QuestProgress[] = [{ questId: "culinary-pasta-pilgrim", current: 3, target: 3, complete: true, progress: 1 }];
    const { quests: _omit, ...rest } = input({ questProgress: progress });
    void _omit;
    verifyAchievement(createAchievement({ type: "quests_in_category", category: "culinary", count: 1 }), rest, { current: 1, unlocked: true });
  });
});

describe("totalXp", () => {
  it("adds XP from completed quests and unlocked achievements", () => {
    const { quests, progress } = questSet([{ category: "a", done: true, xp: 100 }, { category: "a", done: true, xp: 500 }, { category: "a", done: false, xp: 1000 }]);
    const achievements = [createAchievement({ type: "reviews", count: 1 }, { id: "a1", xp: 250 }), createAchievement({ type: "reviews", count: 9 }, { id: "a2", xp: 999 })];
    const achProgress = achievements.map((a) => evaluateAchievement(a, input({ counters: createCounters({ reviews: 1 }) })));
    expect(totalXp(progress, achProgress, quests, achievements)).toBe(850);
  });
  it("is 0 with no activity", () => {
    expect(totalXp([], [], [], [])).toBe(0);
  });
  it("ignores progress for unknown ids", () => {
    expect(totalXp([{ questId: "x", current: 1, target: 1, complete: true, progress: 1 }], [{ achievementId: "y", current: 1, target: 1, unlocked: true }], [], [])).toBe(0);
  });
});

void BASE; void DAY;
