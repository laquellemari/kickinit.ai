import { describe, it, expect } from "vitest";
import { exploreItems, questTeasers, shuffled } from "@/lib/explore";
import { ALL_EXPERIENCES } from "@/lib/catalog/catalog";

describe("explore", () => {
  it("shuffled keeps every item and doesn't touch the original", () => {
    const list = [1, 2, 3, 4, 5];
    const out = shuffled(list);
    expect([...out].sort()).toEqual(list);
    expect(list).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled(list, () => 0)).toEqual([2, 3, 4, 5, 1]);
  });
  it("experiences: 12 by default, with a label, place and price or 'Free to book'", () => {
    const items = exploreItems(undefined, () => 0.999);
    expect(items).toHaveLength(12);
    expect(new Set(items.map((i) => i.id)).size).toBe(12);
    const all = exploreItems(ALL_EXPERIENCES.length, () => 0.5);
    expect(all.find((i) => i.id === "carasau-pasta-bar")).toMatchObject({ label: "DINE", meta: "Mid-City · Free to book" });
    expect(all.find((i) => i.id === "hugh-spa")).toMatchObject({ label: "SPA", meta: expect.stringMatching(/ · from \$95$/) });
    expect(all.every((i) => i.label && i.placeId)).toBe(true);
  });
  it("quests: 3 by default, only Easy or Medium", () => {
    const t = questTeasers();
    expect(t).toHaveLength(3);
    expect(t.every((q) => q.xp === 100 || q.xp === 250)).toBe(true);
    expect(questTeasers(5, () => 0)).toHaveLength(5);
  });
});
