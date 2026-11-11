import achievementData from "../../../data/achievements.json";
import { ALL_QUESTS, countsAsGift, countsForSelf, longestWeeklyStreak, matchesFilter } from "./engine";
import type { Achievement, AchievementProgress, Booking, Counters, Quest, QuestProgress, UserContext } from "./types";

export const ALL_ACHIEVEMENTS: readonly Achievement[] = achievementData.achievements as Achievement[];
const CATEGORIES = ["culinary", "wellness", "movement", "culture", "nightlife", "outdoors", "create", "getaways"];

export type ActivityInput = {
  bookings: Booking[];
  ctx: UserContext;
  questProgress: QuestProgress[];
  counters: Counters;
  quests?: readonly Quest[];
};

const COUNTER_FOR = {
  pools_funded_as_organizer: "poolsFundedAsOrganizer",
  pool_contributions: "poolContributions",
  gifts_redeemed: "giftsRedeemed",
  referrals_converted: "referralsConverted",
  reviews: "reviews",
} as const;

function validateCounters(c: Counters): void {
  for (const [k, v] of Object.entries(c)) {
    if (!Number.isInteger(v)) throw new Error(`Counter ${k} must be a whole number`);
    if (v < 0) throw new Error(`Counter ${k} cannot be negative`);
  }
}

function maxRepeat(values: (string | undefined)[]): number {
  const tally = new Map<string, number>();
  for (const v of values) if (v !== undefined) tally.set(v, (tally.get(v) ?? 0) + 1);
  return Math.max(0, ...tally.values());
}

function rawValue(a: Achievement, input: ActivityInput): number {
  const { rule } = a;
  const quests = input.quests ?? ALL_QUESTS;
  const byId = new Map(quests.map((q) => [q.id, q]));
  const done = input.questProgress.filter((p) => p.complete).map((p) => byId.get(p.questId)).filter((q): q is Quest => !!q);
  const mine = input.bookings.filter(countsForSelf);

  switch (rule.type) {
    case "quests_in_category": return done.filter((q) => q.category === rule.category).length;
    case "quests": return done.length;
    case "categories_with_quest": return new Set(done.map((q) => q.category)).size;
    case "min_quests_per_category": return Math.min(...CATEGORIES.map((c) => done.filter((q) => q.category === c).length));
    case "quests_by_difficulty": return done.filter((q) => q.difficulty === rule.difficulty).length;
    case "bookings": return mine.length;
    case "gifts_sent": return input.bookings.filter(countsAsGift).length;
    case "weekly_streak": return longestWeeklyStreak(mine);
    case "distinct_cities": return new Set(mine.map((b) => b.city)).size;
    case "distinct_countries": return new Set(mine.map((b) => b.country)).size;
    case "same_companion": return maxRepeat(mine.map((b) => b.companion));
    case "party_size_bookings": return mine.filter((b) => b.partySize >= rule.min_party!).length;
    case "bookings_filter": return mine.filter((b) => matchesFilter(rule.filter!, b, input.ctx)).length;
    case "pools_funded_as_organizer":
    case "pool_contributions":
    case "gifts_redeemed":
    case "referrals_converted":
    case "reviews":
      return input.counters[COUNTER_FOR[rule.type]];
    default:
      throw new Error(`Unknown achievement rule: ${(rule as { type: string }).type}`);
  }
}

export function evaluateAchievement(a: Achievement, input: ActivityInput): AchievementProgress {
  if (!Number.isInteger(a.rule.count) || a.rule.count <= 0) throw new Error("Achievement count must be a positive integer");
  validateCounters(input.counters);
  const current = Math.min(rawValue(a, input), a.rule.count);
  return { achievementId: a.id, current, target: a.rule.count, unlocked: current >= a.rule.count };
}

export function evaluateAllAchievements(input: ActivityInput, achievements: readonly Achievement[] = ALL_ACHIEVEMENTS): AchievementProgress[] {
  return achievements.map((a) => evaluateAchievement(a, input));
}

export function totalXp(
  questProgress: QuestProgress[],
  achievementProgress: AchievementProgress[],
  quests: readonly Quest[] = ALL_QUESTS,
  achievements: readonly Achievement[] = ALL_ACHIEVEMENTS,
): number {
  const qXp = new Map(quests.map((q) => [q.id, q.xp]));
  const aXp = new Map(achievements.map((a) => [a.id, a.xp]));
  return (
    questProgress.filter((p) => p.complete).reduce((s, p) => s + (qXp.get(p.questId) ?? 0), 0) +
    achievementProgress.filter((p) => p.unlocked).reduce((s, p) => s + (aXp.get(p.achievementId) ?? 0), 0)
  );
}
