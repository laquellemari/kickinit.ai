import achievements from "../../../data/achievements.json";

export type Level = { level: number; title: string; min_xp: number };
export type LevelStatus = { xp: number; level: number; title: string; minXp: number; nextLevelXp: number | null; progressToNext: number };

export const LEVELS: readonly Level[] = [...(achievements.levels as Level[])].sort((a, b) => a.min_xp - b.min_xp);

export function levelForXp(xp: number): LevelStatus {
  if (!Number.isFinite(xp)) throw new Error("XP must be a finite number");
  if (xp < 0) throw new Error("XP cannot be negative");

  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min_xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  return {
    xp,
    level: cur.level,
    title: cur.title,
    minXp: cur.min_xp,
    nextLevelXp: next ? next.min_xp : null,
    progressToNext: next ? (xp - cur.min_xp) / (next.min_xp - cur.min_xp) : 1,
  };
}
