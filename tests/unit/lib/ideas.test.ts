// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { ideaPrompt, parseIdeas, suggestIdeas, FALLBACK_IDEAS, IDEA_COUNT, MAX_IDEA_CHARS, cityOf, fallbackIdeas } from "@/lib/ideas/ideas";
import { recordSearch, recentSearches, MAX_SEARCH_CHARS } from "@/lib/ideas/repo";
import { createScriptedModel } from "../../helpers/factories";
import { useTestDb } from "../../helpers/db";

describe("ideaPrompt", () => {
  it("includes searches, bookings, area and the for-you framing", () => {
    const p = ideaPrompt({ mode: "you", where: "Santa Monica, CA", searches: ["jazz tonight", "sushi for 2"], booked: ["Hugh Spa"] });
    expect(p).toContain("planning something for themselves, in or near Santa Monica, CA");
    expect(p).toContain("- jazz tonight\n- sushi for 2");
    expect(p).toContain("Things they've booked:\n- Hugh Spa");
    expect(p).toContain(`Suggest exactly ${IDEA_COUNT}`);
    expect(p).toContain(`under ${MAX_IDEA_CHARS} characters`);
  });
  it("new visitor in gift mode: varied ideas, no bookings section, defaults to Los Angeles", () => {
    const p = ideaPrompt({ mode: "them", where: "", searches: [], booked: [] });
    expect(p).toContain("shopping for a GIFT");
    expect(p).toContain("in or near Los Angeles");
    expect(p).toContain("haven't searched yet");
    expect(p).not.toContain("booked");
  });
});

describe("the place the visitor picked", () => {
  it("is a hard rule in the prompt, named in every idea, and past cities only inform taste", () => {
    const p = ideaPrompt({ mode: "you", where: "Houston, TX", searches: ["sushi in San Diego Friday"], booked: [] });
    expect(p).toContain("LOCATION RULE: every idea must take place in or near Houston, TX (the place they picked) and must name Houston in its text.");
    expect(p).toContain("use them only to learn their tastes, never their location");
  });
  it.each([["Houston, TX", "Houston"], ["Las Vegas, NV", "Las Vegas"], ["Los Angeles · 10 mi", "Los Angeles"], ["", "Los Angeles"], ["  Boise ", "Boise"]])("cityOf(%j) = %j", (where, city) => {
    expect(cityOf(where)).toBe(city);
  });
  it("stock ideas are placed in the picked city", () => {
    expect(fallbackIdeas("you", "Las Vegas, NV")).toEqual(FALLBACK_IDEAS.you.map((i) => `${i} in Las Vegas`));
  });
});

describe("parseIdeas", () => {
  it("strips bullets, numbers and quotes; drops duplicates and blank lines; keeps 3", () => {
    expect(parseIdeas('Here you go\n1. "Sunset sail Saturday"\n- Jazz Friday night\n\n• jazz friday night\n2) Pottery class for 2\n* Extra one')).toEqual(["Here you go", "Sunset sail Saturday", "Jazz Friday night"]);
  });
  it("markdown bold is removed", () => {
    expect(parseIdeas("1. **Sunset sail** for two\n- **Jazz brunch Sunday**")).toEqual(["Sunset sail for two", "Jazz brunch Sunday"]);
  });
  it("a duplicate (any case) before the third idea is skipped", () => {
    expect(parseIdeas("Jazz Friday\n- jazz friday\nSauna Sunday\nPottery for 2")).toEqual(["Jazz Friday", "Sauna Sunday", "Pottery for 2"]);
  });
  it("boundaries: 3 and 140 characters are kept; 2 and 141 are dropped", () => {
    expect(parseIdeas(["ab", "abc", "x".repeat(141), "y".repeat(140)].join("\n"))).toEqual(["abc", "y".repeat(140)]);
  });
  it("nothing usable gives an empty list", () => {
    expect(parseIdeas("\n - \n")).toEqual([]);
  });
});

describe("suggestIdeas", () => {
  const ctx = { mode: "you" as const, where: "LA", searches: ["jazz tonight"], booked: [] };
  it("happy: Claude's ideas, marked personalized when there's history; the prompt is what it saw", async () => {
    const { model, prompts } = createScriptedModel([{ text: "A blues bar crawl Friday\nVinyl listening bar for 2\nJazz brunch Sunday" }]);
    // enough room for the model to answer (300 was too little in production)
    expect(await suggestIdeas(ctx, model)).toEqual({ ideas: ["A blues bar crawl Friday", "Vinyl listening bar for 2", "Jazz brunch Sunday"], personalized: true });
    expect(JSON.stringify(prompts[0])).toContain("jazz tonight");
  });
  it("bookings alone also count as personalized", async () => {
    const { model } = createScriptedModel([{ text: "Idea one" }]);
    expect((await suggestIdeas({ ...ctx, searches: [], booked: ["Hugh Spa"] }, model)).personalized).toBe(true);
  });
  it("no history: not personalized", async () => {
    const { model } = createScriptedModel([{ text: "Idea one" }]);
    expect(await suggestIdeas({ ...ctx, searches: [] }, model)).toEqual({ ideas: ["Idea one"], personalized: false });
  });
  it.each(["you", "them"] as const)("an unusable reply falls back to stock ideas and is logged (%s)", async (mode) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { model } = createScriptedModel([{ text: "" }]);
    expect(await suggestIdeas({ ...ctx, mode, where: "Houston, TX" }, model)).toEqual({ ideas: FALLBACK_IDEAS[mode].map((i) => `${i} in Houston`), personalized: false });
    expect(FALLBACK_IDEAS[mode]).toHaveLength(IDEA_COUNT);
    expect(warn).toHaveBeenCalledWith("Ideas reply was unusable:", '""');
    warn.mockRestore();
  });
});

describe("search history", () => {
  let t: Awaited<ReturnType<typeof useTestDb>>;
  beforeAll(async () => { t = await useTestDb(); });
  beforeEach(async () => { await t.reset(); });
  it("records trimmed searches and returns them newest first, per visitor", async () => {
    await recordSearch("u1", { text: "  jazz tonight ", mode: "you", where: " LA " });
    await recordSearch("u1", { text: "spa for mom", mode: "them" });
    await recordSearch("u2", { text: "other person", mode: "you" });
    const r = await recentSearches("u1");
    expect(r.map(({ text, mode, where }) => ({ text, mode, where }))).toEqual([{ text: "spa for mom", mode: "them", where: "" }, { text: "jazz tonight", mode: "you", where: "LA" }]);
    expect(r[0].createdAt).toBeInstanceOf(Date);
  });
  it("blank searches aren't stored", async () => {
    await recordSearch("u1", { text: "   ", mode: "you" });
    expect(await recentSearches("u1")).toEqual([]);
  });
  it("boundary: text is capped at 1000 characters and where at 100", async () => {
    await recordSearch("u1", { text: "a".repeat(MAX_SEARCH_CHARS + 5), mode: "you", where: "w".repeat(120) });
    const [s] = await recentSearches("u1");
    expect(s.text).toHaveLength(MAX_SEARCH_CHARS);
    expect(s.where).toHaveLength(100);
  });
  it("limit: 15 by default, or as asked", async () => {
    for (let i = 0; i < 17; i++) await recordSearch("u1", { text: `s${i}`, mode: "you" });
    expect(await recentSearches("u1")).toHaveLength(15);
    expect((await recentSearches("u1", 2)).map((s) => s.text)).toEqual(["s16", "s15"]);
  });
});
