import { ALL_EXPERIENCES } from "@/lib/catalog/catalog";
import { ALL_QUESTS } from "@/lib/quests/engine";
import type { ExploreItem, QuestTeaser } from "@/components/PlanLoading";
import { isDiningExperience } from "@/lib/pricing/fees";
import { STAMP } from "@/lib/catalog/labels";

/** A shuffled copy (Fisher–Yates), so each search shows a different mix. `rand` is injectable for tests. */
export function shuffled<T>(list: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}


/** Experiences for the "More to explore!" row while a search runs. */
export function exploreItems(count = 12, rand?: () => number): ExploreItem[] {
  return shuffled(ALL_EXPERIENCES, rand).slice(0, count).map((e) => ({
    id: e.id, name: e.name, placeId: e.placeId, bg: e.bg, label: STAMP[e.category],
    meta: `${e.neighborhood} · ${isDiningExperience(e) ? "Free to book" : `from $${Math.round(Number(e.price))}`}`,
  }));
}

/** A few passport quests to aim for, from the easier end so they feel reachable. */
export function questTeasers(count = 3, rand?: () => number): QuestTeaser[] {
  return shuffled(ALL_QUESTS.filter((q) => q.difficulty === "Easy" || q.difficulty === "Medium"), rand).slice(0, count)
    .map((q) => ({ id: q.id, emoji: q.emoji, title: q.title, description: q.description, xp: q.xp, category: q.category }));
}
