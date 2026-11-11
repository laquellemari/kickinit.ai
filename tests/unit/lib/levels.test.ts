import { describe, it, expect } from "vitest";
import { levelForXp, LEVELS } from "@/lib/quests/levels";

function verifyLevel(xp: number, expected: { level: number; title: string; nextLevelXp: number | null; progress: number }) {
  const r = levelForXp(xp);
  expect(r.level).toBe(expected.level);
  expect(r.title).toBe(expected.title);
  expect(r.nextLevelXp).toBe(expected.nextLevelXp);
  expect(r.progressToNext).toBeCloseTo(expected.progress, 5);
  expect(r.xp).toBe(xp);
}

describe("levelForXp", () => {
  describe("happy path", () => {
    it("loads the 7 levels from achievements.json in order", () => {
      expect(LEVELS.map((l) => l.title)).toEqual(["Newcomer", "Explorer", "Adventurer", "Connoisseur", "Trailblazer", "Luminary", "Legend"]);
    });
    it("mid-level XP reports progress toward the next level", () => {
      verifyLevel(1570, { level: 3, title: "Adventurer", nextLevelXp: 4000, progress: 70 / 2500 });
    });
  });

  describe("validation", () => {
    it("rejects negative XP", () => { expect(() => levelForXp(-1)).toThrow("XP cannot be negative"); });
    it("rejects NaN", () => { expect(() => levelForXp(NaN)).toThrow("XP must be a finite number"); });
    it("rejects Infinity", () => { expect(() => levelForXp(Infinity)).toThrow("XP must be a finite number"); });
  });

  describe("boundary", () => {
    it("0 XP is Newcomer with 0 progress", () => verifyLevel(0, { level: 1, title: "Newcomer", nextLevelXp: 500, progress: 0 }));
    it("1 XP is still Newcomer", () => verifyLevel(1, { level: 1, title: "Newcomer", nextLevelXp: 500, progress: 1 / 500 }));
    it("threshold - 1 stays on the lower level", () => verifyLevel(499, { level: 1, title: "Newcomer", nextLevelXp: 500, progress: 499 / 500 }));
    it("exactly the threshold promotes", () => verifyLevel(500, { level: 2, title: "Explorer", nextLevelXp: 1500, progress: 0 }));
    it("one below the top level", () => verifyLevel(29999, { level: 6, title: "Luminary", nextLevelXp: 30000, progress: 14999 / 15000 }));
    it("top level has no next level and full progress", () => verifyLevel(30000, { level: 7, title: "Legend", nextLevelXp: null, progress: 1 }));
    it("far above the top level stays Legend", () => verifyLevel(1_000_000, { level: 7, title: "Legend", nextLevelXp: null, progress: 1 }));
  });
});
