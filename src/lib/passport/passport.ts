import { ALL_ACHIEVEMENTS, evaluateAllAchievements, totalXp, type ActivityInput } from "@/lib/quests/achievements";
import { ALL_QUESTS, evaluateAllQuests } from "@/lib/quests/engine";
import { levelForXp } from "@/lib/quests/levels";
import questData from "../../../data/quests.json";

type CategoryInfo = { id: string; name: string; emoji: string };
export const CATEGORY_INFO: CategoryInfo[] = (questData.categories as CategoryInfo[]).map(({ id, name, emoji }) => ({ id, name, emoji }));
export const categoryInfo = (id: string) => CATEGORY_INFO.find((c) => c.id === id) ?? null;

/** Every quest with this visitor's progress on it. */
function questRows(activity: ActivityInput, questProgress = evaluateAllQuests(activity.bookings, activity.ctx)) {
  const byQuest = new Map(ALL_QUESTS.map((q) => [q.id, q]));
  return questProgress.map((p) => {
    const q = byQuest.get(p.questId)!;
    return {
      id: q.id, category: q.category, order: q.order, title: q.title, description: q.description, emoji: q.emoji,
      difficulty: q.difficulty, xp: q.xp, mode: q.mode, current: p.current, target: p.target, complete: p.complete,
    };
  });
}

/** One category's page: all of its quests in their set order, with progress and XP. Null for an unknown category. */
export function computeCategory(activity: ActivityInput, categoryId: string) {
  const category = categoryInfo(categoryId);
  if (!category) return null;
  const quests = questRows(activity).filter((q) => q.category === category.id).sort((a, b) => a.order - b.order);
  const done = quests.filter((q) => q.complete);
  return {
    category,
    completed: done.length,
    total: quests.length,
    xpEarned: done.reduce((n, q) => n + q.xp, 0),
    xpTotal: quests.reduce((n, q) => n + q.xp, 0),
    quests,
  };
}
export type CategoryPage = NonNullable<ReturnType<typeof computeCategory>>;

/** Everything the Passport page shows, computed from real activity. */
export function computePassport(activity: ActivityInput) {
  const questProgress = evaluateAllQuests(activity.bookings, activity.ctx);
  const achievementProgress = evaluateAllAchievements({ ...activity, questProgress });
  const xp = totalXp(questProgress, achievementProgress);
  const byAch = new Map(ALL_ACHIEVEMENTS.map((a) => [a.id, a]));
  const quests = questRows(activity, questProgress);
  const categories = CATEGORY_INFO.map((c) => {
    const inCat = quests.filter((q) => q.category === c.id);
    return { ...c, completed: inCat.filter((q) => q.complete).length, total: inCat.length };
  });
  const inProgress = quests.filter((q) => !q.complete && q.current > 0).sort((a, b) => b.current / b.target - a.current / a.target || b.xp - a.xp).slice(0, 8);
  const completed = quests.filter((q) => q.complete);
  const badges = achievementProgress.map((p) => {
    const a = byAch.get(p.achievementId)!;
    return { id: a.id, name: a.name, emoji: a.emoji, description: a.description, tier: a.tier, xp: a.xp, current: p.current, target: p.target, unlocked: p.unlocked };
  });
  const attended = activity.bookings.filter((b) => !b.isGift && b.status === "captured" && b.checkedIn);

  return {
    level: levelForXp(xp),
    stats: {
      attended: attended.length,
      giftsSent: activity.bookings.filter((b) => b.isGift).length,
      cities: new Set(attended.map((b) => b.city)).size,
      questsCompleted: completed.length,
      questsTotal: quests.length,
      badgesUnlocked: badges.filter((b) => b.unlocked).length,
      badgesTotal: badges.length,
    },
    categories,
    inProgress,
    completed,
    badges,
  };
}
export type Passport = ReturnType<typeof computePassport>;
