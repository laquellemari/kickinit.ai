// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { runConcierge, validateInput, systemPrompt, resolvePicks, withMoreOptions, LIMITS, type ConciergeInput, type PlanPick } from "@/lib/concierge/agent";
import { searchExperiences, getExperience, getExperienceByPlaceId } from "@/lib/catalog/catalog";
import { tool } from "ai";
import { z } from "zod";
import { createScriptedModel, createLivePlace, createLiveEvent } from "../../helpers/factories";
import { verifyConcierge } from "../../helpers/verification";

const ids = (r: { options: { kind: string; experience?: { id: string }; place?: { id: string } }[] }) => r.options.map((o) => (o.kind === "partner" ? o.experience!.id : o.place!.id));
const input = (o: Partial<ConciergeInput> = {}): ConciergeInput => ({ message: "romantic italian dinner for 2 by the water", mode: "you", ...o });
const present = (picks: { experienceId: string; why: string }[], partySize = 2, intro = "Two lovely options.") =>
  ({ tool: "present_options", args: { intro, partySize, picks } });

describe("runConcierge", () => {
  describe("happy path", () => {
    it("searches, then presents server-priced picks", async () => {
      const { model, prompts } = createScriptedModel([
        { tool: "search_experiences", args: { q: "romantic italian waterfront", partySize: 2 } },
        present([{ experienceId: "carasau-pasta-bar", why: "Terrace over the bay." }, { experienceId: "trattoria-daly", why: "Tiny and intimate." }]),
      ]);
      const r = await runConcierge(input(), { model });
      verifyConcierge(r, { reply: "Two lovely options.", partySize: 2, picks: [{ id: "carasau-pasta-bar", total: "180.00" }, { id: "trattoria-daly", total: "130.00" }] });
      expect(r.options[0].why).toBe("Terrace over the bay.");
      // The model saw real search results on its second step
      expect(JSON.stringify(prompts[1])).toContain("Carasau Pasta Bar");
    });

    it("passes history before the new message", async () => {
      const { model, prompts } = createScriptedModel([present([{ experienceId: "vibrato-grill-jazz", why: "Jazz." }])]);
      await runConcierge(input({ message: "make it later", history: [{ role: "user", content: "jazz tonight" }, { role: "assistant", content: "Sure" }] }), { model });
      const p = JSON.stringify(prompts[0]);
      expect(p.indexOf("jazz tonight")).toBeLessThan(p.indexOf("make it later"));
    });

    it("can use extra tools (e.g. PayPal get_order) before presenting", async () => {
      let calledWith: unknown;
      const get_order = tool({ description: "Get order", parameters: z.object({ id: z.string() }), execute: async (a) => { calledWith = a; return { status: "COMPLETED" }; } });
      const { model } = createScriptedModel([{ tool: "get_order", args: { id: "5O190127TN364715T" } }, { text: "Your payment for order 5O19… is complete." }]);
      const r = await runConcierge(input({ message: "did order 5O190127TN364715T go through?" }), { model, extraTools: { get_order } });
      expect(calledWith).toEqual({ id: "5O190127TN364715T" });
      verifyConcierge(r, { reply: /complete/, partySize: null, picks: [] });
    });

    it("a plain-text answer with no picks is returned as the reply", async () => {
      const { model } = createScriptedModel([{ text: "  Happy to help, where are you?  " }]);
      verifyConcierge(await runConcierge(input(), { model }), { reply: "Happy to help, where are you?", partySize: null, picks: [] });
    });

    it("empty text with no picks gets a fallback reply", async () => {
      const { model } = createScriptedModel([{ text: "" }]);
      verifyConcierge(await runConcierge(input(), { model }), { reply: /couldn't put options together/, partySize: null, picks: [] });
    });

    it("a search with no matches is returned to the model as an empty list, and it can search again", async () => {
      const { model, prompts } = createScriptedModel([
        { tool: "search_experiences", args: { category: "culinary", partySize: 2, maxTotal: 100, tags: ["x"], q: "y" } },
        { tool: "search_experiences", args: { partySize: 2 } },
        present([{ experienceId: "carasau-pasta-bar", why: "x" }]),
      ]);
      verifyConcierge(await runConcierge(input(), { model }), { partySize: 2, picks: [{ id: "carasau-pasta-bar", total: "180.00" }] });
      const toolMsg = (prompts[1] as { role: string; content: { result: unknown }[] }[]).at(-1)!;
      expect(toolMsg.role).toBe("tool");
      expect(toolMsg.content[0].result).toEqual([]);
    });
  });

  describe("the server checks every pick", () => {
    it("drops invented ids", async () => {
      const { model } = createScriptedModel([present([{ experienceId: "made-up", why: "x" }, { experienceId: "carasau-pasta-bar", why: "y" }])]);
      const r = await runConcierge(input(), { model });
      verifyConcierge(r, { partySize: 2, picks: [{ id: "carasau-pasta-bar", total: "180.00" }] });
      expect(ids(r)).not.toContain("made-up");
    });
    it("drops picks that can't take the party (and never adds them back as extra options)", async () => {
      const { model } = createScriptedModel([present([{ experienceId: "desuar-hollywood-spa", why: "x" }, { experienceId: "hugh-spa", why: "y" }], 3)]);
      const r = await runConcierge(input(), { model });
      verifyConcierge(r, { partySize: 3, picks: [{ id: "hugh-spa", total: "285.00" }] });
      expect(ids(r)).not.toContain("desuar-hollywood-spa");
    });
    it("drops duplicates", async () => {
      const { model } = createScriptedModel([present([{ experienceId: "carasau-pasta-bar", why: "x" }, { experienceId: "carasau-pasta-bar", why: "again" }])]);
      verifyConcierge(await runConcierge(input(), { model }), { partySize: 2, picks: [{ id: "carasau-pasta-bar", total: "180.00" }] });
    });
    it("when every pick is invalid, says so instead of showing the intro", async () => {
      const { model } = createScriptedModel([present([{ experienceId: "nope", why: "x" }], 2, "Here you go!")]);
      verifyConcierge(await runConcierge(input(), { model }), { reply: /couldn't find anything bookable/, partySize: 2, picks: [] });
    });
  });

  describe("prompting", () => {
    it("gift mode tells the model it's a gift", () => {
      expect(systemPrompt(input({ mode: "them" }))).toContain("GIFT");
      expect(systemPrompt(input({ mode: "you" }))).not.toContain("GIFT");
    });
    it("uses the user's area, defaulting to Los Angeles, and today's date", () => {
      const today = new Date("2026-11-14T12:00:00Z");
      expect(systemPrompt(input({ where: "Austin", today }))).toContain("The user's area: Austin");
      expect(systemPrompt(input({ where: "  ", today }))).toContain("The user's area: Los Angeles");
      expect(systemPrompt(input({ today }))).toContain(today.toDateString());
    });
    it("defaults today to now", () => {
      expect(systemPrompt(input())).toContain(new Date().toDateString());
    });
  });
});

describe("validateInput", () => {
  it.each([
    ["empty message", { message: "  " }, "Message is required"],
    ["non-string message", { message: 5 as unknown as string }, "Message is required"],
    ["long message", { message: "x".repeat(LIMITS.message + 1) }, `Message cannot exceed ${LIMITS.message} characters`],
    ["bad mode", { mode: "us" as never }, "Mode must be you or them"],
    ["long where", { where: "x".repeat(101) }, "Where must be text up to 100 characters"],
    ["non-string where", { where: 3 as unknown as string }, "Where must be text up to 100 characters"],
    ["history not a list", { history: "hi" as never }, "History must be a list"],
    ["too much history", { history: Array(21).fill({ role: "user", content: "x" }) }, "History cannot exceed 20 messages"],
    ["bad role", { history: [{ role: "system", content: "x" }] as never }, "History roles must be user or assistant"],
    ["null history item", { history: [null] as never }, "History roles must be user or assistant"],
    ["long history item", { history: [{ role: "user", content: "x".repeat(4001) }] as never }, "History messages must be text up to 4000 characters"],
  ])("rejects %s", (_l, o, msg) => {
    expect(() => validateInput(input(o))).toThrow(msg);
  });
  it("boundary: exactly the limits pass", () => {
    expect(() => validateInput(input({ message: "x".repeat(LIMITS.message), where: "x".repeat(100), history: Array(20).fill({ role: "assistant", content: "x".repeat(4000) }) }))).not.toThrow();
  });
  it("rejects before calling the model", async () => {
    const { model, prompts } = createScriptedModel([]);
    await expect(runConcierge(input({ message: "" }), { model })).rejects.toThrow("Message is required");
    expect(prompts).toHaveLength(0);
  });
});

describe("resolvePicks", () => {
  it("caps the model's picks at 8 (boundary: 9 in, 8 out)", () => {
    const nine = ["carasau-pasta-bar", "trattoria-daly", "n-naka", "mutsu", "sushi-gen", "bacari-silver-lake", "tacos-y-birria-la-unica", "71above", "gritz-n-wafflez"];
    expect(LIMITS.picks).toBe(8);
    expect(resolvePicks(nine.map((experienceId) => ({ experienceId, why: "" })), 2).map((p) => (p as { experience: { id: string } }).experience.id)).toEqual(nine.slice(0, 8));
  });
  it("0 picks gives an empty list", () => expect(resolvePicks([], 2)).toEqual([]));
});

describe("live search (Google Places)", () => {
  const sd = [createLivePlace(), createLivePlace({ placeId: "ChIJsd2", name: "Harbor Spa", category: "wellness", estimatePerPerson: "120.00", dining: false })];

  it("is only offered to the model when a live search function is provided", async () => {
    const without = createScriptedModel([{ text: "ok" }]);
    await runConcierge(input(), { model: without.model });
    const withLive = createScriptedModel([{ text: "ok" }]);
    await runConcierge(input(), { model: withLive.model, searchLive: async () => [] });
    expect(without.toolNames[0]).not.toContain("search_live_places");
    expect(withLive.toolNames[0]).toContain("search_live_places");
    expect(JSON.stringify(without.prompts[0])).not.toContain("search_live_places");
  });

  it("happy: live picks come back as request-to-book, with Google's spend as a hint and whether they're free to book", async () => {
    let asked = "";
    const { model, prompts } = createScriptedModel([
      { tool: "search_live_places", args: { query: "romantic italian dinner in San Diego" } },
      present([{ experienceId: "gp:ChIJsd1", why: "Candlelit." }, { experienceId: "gp:ChIJsd2", why: "Unwind after." }]),
    ]);
    const r = await runConcierge(input({ where: "San Diego" }), { model, searchLive: async (q) => { asked = q; return sd; } });
    expect(asked).toBe("romantic italian dinner in San Diego");
    verifyConcierge(r, { reply: "Two lovely options.", partySize: 2, picks: [{ id: "gp:ChIJsd1", total: null }, { id: "gp:ChIJsd2", total: null }] });
    expect(r.options.every((o) => o.kind === "live")).toBe(true);
    const toolMsg = (prompts[1] as { role: string; content: { result: unknown }[] }[]).at(-1)!;
    expect(toolMsg.content[0].result).toEqual([
      { id: "gp:ChIJsd1", name: "Cucina Sorella", type: "Italian restaurant", address: "1 Main St, San Diego, CA", googleSpendPerPerson: "60.00", freeToBook: true },
      { id: "gp:ChIJsd2", name: "Harbor Spa", type: "Italian restaurant", address: "1 Main St, San Diego, CA", googleSpendPerPerson: "120.00", freeToBook: false },
    ]);
  });

  it("mixes partner and live picks", async () => {
    const { model } = createScriptedModel([
      { tool: "search_live_places", args: { query: "spa in Miami" } },
      present([{ experienceId: "hugh-spa", why: "Partner." }, { experienceId: "gp:ChIJsd2", why: "Live." }]),
    ]);
    const r = await runConcierge(input(), { model, searchLive: async () => sd });
    verifyConcierge(r, { partySize: 2, picks: [{ id: "hugh-spa", total: "190.00" }, { id: "gp:ChIJsd2", total: null }] });
    expect(r.options.slice(0, 2).map((o) => o.kind)).toEqual(["partner", "live"]);
  });

  it("a live id the model never searched for is dropped (no invented venues)", async () => {
    const { model } = createScriptedModel([present([{ experienceId: "gp:ChIJfake", why: "x" }, { experienceId: "carasau-pasta-bar", why: "y" }])]);
    const r = await runConcierge(input(), { model, searchLive: async () => sd });
    verifyConcierge(r, { partySize: 2, picks: [{ id: "carasau-pasta-bar", total: "180.00" }] });
    expect(ids(r)).not.toContain("gp:ChIJfake");
  });

  it("duplicate live picks are dropped", async () => {
    const { model } = createScriptedModel([
      { tool: "search_live_places", args: { query: "x in y" } },
      present([{ experienceId: "gp:ChIJsd1", why: "a" }, { experienceId: "gp:ChIJsd1", why: "b" }]),
    ]);
    verifyConcierge(await runConcierge(input(), { model, searchLive: async () => sd }), { partySize: 2, picks: [{ id: "gp:ChIJsd1", total: null }] });
  });

  it("a live search failure is told to the model, logged, and doesn't crash", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { model, prompts } = createScriptedModel([
      { tool: "search_live_places", args: { query: "spa in Boise" } },
      present([{ experienceId: "hugh-spa", why: "Partner instead." }]),
    ]);
    const r = await runConcierge(input(), { model, searchLive: async () => { throw new Error("PERMISSION_DENIED"); } });
    verifyConcierge(r, { partySize: 2, picks: [{ id: "hugh-spa", total: "190.00" }] });
    const toolMsg = (prompts[1] as { role: string; content: { result: { error: string } }[] }[]).at(-1)!;
    expect(toolMsg.content[0].result.error).toMatch(/unavailable/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("the prompt explains live booking only when live search is on", () => {
    expect(systemPrompt(input(), { live: true })).toContain("request to book");
    const off = systemPrompt(input());
    expect(off).toContain("Los Angeles and its beach towns");
    expect(off).not.toContain("search_live_places");
    expect(off).toContain("doesn't have partners there yet");
  });
});

describe("withMoreOptions (the server tops up the model's picks)", () => {
  const live = (n: number) => Array.from({ length: n }, (_, i) => createLivePlace({ placeId: `L${i}`, name: `Live ${i}` }));
  const cacheOf = (ps: ReturnType<typeof live>) => new Map(ps.map((p) => [p.id, p]));
  const pick = (id: string, why = "Picked.") => resolvePicks([{ experienceId: id, why }], 2);
  const idsOf = (o: PlanPick[]) => o.map((p) => (p.kind === "partner" ? p.experience.id : p.place.id));

  it("keeps the picks first, then everything the searches found (deduped), with a factual reason", () => {
    const ps = live(2);
    const out = withMoreOptions(pick("carasau-pasta-bar"), ["carasau-pasta-bar", "gp:L0", "trattoria-daly", "gp:L0", "gp:L1"], 2, cacheOf(ps));
    expect(idsOf(out).slice(0, 4)).toEqual(["carasau-pasta-bar", "gp:L0", "trattoria-daly", "gp:L1"]);
    expect(out[0].why).toBe("Picked.");
    expect(out[1].why).toBe(`${ps[0].typeLabel} · ${ps[0].address}`);
    expect(out[2].why).toBe("A neighborhood Italian table on the Eastside.");
    expect(new Set(idsOf(out)).size).toBe(out.length);
  });
  it("under 20: fills with similar partners from the picks' categories that fit the party", () => {
    const out = withMoreOptions(resolvePicks([{ experienceId: "hugh-spa", why: "x" }], 3), [], 3, new Map());
    const spas = searchExperiences({ category: "wellness", partySize: 3, limit: 50 }).map((e) => e.id);
    expect(new Set(idsOf(out))).toEqual(new Set(spas));
    expect(idsOf(out)).not.toContain("desuar-hollywood-spa"); // max 2 guests
    expect(out.every((p) => p.kind === "partner" && p.experience.category === "wellness")).toBe(true);
  });
  it("20 or more already: no similar fill", () => {
    const ps = live(19);
    const out = withMoreOptions(pick("hugh-spa"), ps.map((p) => p.id), 2, cacheOf(ps));
    expect(out).toHaveLength(20);
    expect(idsOf(out).filter((id) => !id.startsWith("gp:"))).toEqual(["hugh-spa"]);
  });
  it("boundary: 19 shows the similar fill", () => {
    const ps = live(18);
    expect(withMoreOptions(pick("hugh-spa"), ps.map((p) => p.id), 2, cacheOf(ps)).length).toBeGreaterThan(19);
  });
  it("only live picks and few results: no partner categories to fill from", () => {
    const ps = live(3);
    expect(idsOf(withMoreOptions([], ps.map((p) => p.id), 2, cacheOf(ps)))).toEqual(["gp:L0", "gp:L1", "gp:L2"]);
  });
  it("caps at 30 (boundary: 35 found, 30 shown, picks still first)", () => {
    const ps = live(35);
    const out = withMoreOptions(pick("carasau-pasta-bar"), ps.map((p) => p.id), 2, cacheOf(ps));
    expect(LIMITS.options).toBe(30);
    expect(out).toHaveLength(30);
    expect(idsOf(out)[0]).toBe("carasau-pasta-bar");
  });
  it("runConcierge returns the picks plus the rest of what it searched", async () => {
    const { model } = createScriptedModel([
      { tool: "search_experiences", args: { category: "culinary", partySize: 2 } },
      present([{ experienceId: "n-naka", why: "Best." }]),
    ]);
    const r = await runConcierge(input(), { model });
    const culinary = searchExperiences({ category: "culinary", partySize: 2, limit: 50 }).map((e) => e.id);
    expect(ids(r)[0]).toBe("n-naka");
    expect(new Set(ids(r))).toEqual(new Set(culinary));
    expect(culinary.length).toBeGreaterThan(8);
  });
});

describe("a Google result that is one of our partners", () => {
  const carasau = getExperience("carasau-pasta-bar")!;
  const dupe = createLivePlace({ placeId: carasau.placeId, name: "Carasau Pasta Bar" });
  const cache = new Map([[dupe.id, dupe]]);
  const idsOf = (o: PlanPick[]) => o.map((p) => `${p.kind}:${p.kind === "partner" ? p.experience.id : p.place.id}`);
  it("books as the partner, keeping the model's reason", () => {
    const out = resolvePicks([{ experienceId: dupe.id, why: "Handmade pasta." }], 2, cache);
    expect(idsOf(out)).toEqual(["partner:carasau-pasta-bar"]);
    expect(out[0].why).toBe("Handmade pasta.");
    expect(out[0].quote.total).toBe("180.00");
  });
  it("is shown once when the model picks both the partner and its Google listing", () => {
    expect(idsOf(resolvePicks([{ experienceId: "carasau-pasta-bar", why: "a" }, { experienceId: dupe.id, why: "b" }], 2, cache))).toEqual(["partner:carasau-pasta-bar"]);
    expect(idsOf(resolvePicks([{ experienceId: dupe.id, why: "b" }, { experienceId: "carasau-pasta-bar", why: "a" }], 2, cache))).toEqual(["partner:carasau-pasta-bar"]);
  });
  it("and isn't added back by the top-up", () => {
    const out = withMoreOptions(resolvePicks([{ experienceId: "carasau-pasta-bar", why: "a" }], 2), [dupe.id, "carasau-pasta-bar"], 2, cache);
    expect(idsOf(out).filter((i) => i.endsWith("carasau-pasta-bar") || i.endsWith(dupe.id))).toEqual(["partner:carasau-pasta-bar"]);
  });
  it("too big a party for the partner: dropped, not shown as a request instead", () => {
    const spa = getExperience("desuar-hollywood-spa")!;
    const d = createLivePlace({ placeId: spa.placeId });
    expect(resolvePicks([{ experienceId: d.id, why: "x" }], 4, new Map([[d.id, d]]))).toEqual([]);
  });
  it("getExperienceByPlaceId finds partners by Google id, or nothing", () => {
    expect(getExperienceByPlaceId(carasau.placeId)?.id).toBe("carasau-pasta-bar");
    expect(getExperienceByPlaceId("ChIJnot-ours")).toBeUndefined();
  });
});


describe("events (Ticketmaster)", () => {
  const shows = [createLiveEvent(), createLiveEvent({ id: "tm:G2", name: "Usher", localTime: null, priceMin: null, priceMax: null })];
  const sphere = createLivePlace({ placeId: "ChIJsphere", name: "Sphere", primaryType: "arena", dining: false });

  it("is only offered to the model, and explained, when event search is on", async () => {
    const off = createScriptedModel([{ text: "ok" }]);
    await runConcierge(input(), { model: off.model });
    expect(off.toolNames[0]).not.toContain("search_events");
    expect(systemPrompt(input())).not.toContain("search_events");
    const on = createScriptedModel([{ text: "ok" }]);
    await runConcierge(input(), { model: on.model, searchEvents: async () => [] });
    expect(on.toolNames[0]).toContain("search_events");
    expect(systemPrompt(input(), { events: true })).toContain("recommend the actual events, never the venue building");
  });

  it("happy: what's on at a venue comes back as events, and the model sees when, where and price", async () => {
    let asked: unknown;
    const { model, prompts } = createScriptedModel([
      { tool: "search_events", args: { venue: "The Colosseum", city: "Las Vegas" } },
      present([{ experienceId: "tm:G5v1", why: "Her residency." }, { experienceId: "tm:G2", why: "Big voice." }]),
    ]);
    const r = await runConcierge(input({ message: "what's on at the Colosseum", where: "Las Vegas, NV" }), { model, searchEvents: async (q) => { asked = q; return shows; } });
    expect(asked).toEqual({ venue: "The Colosseum", city: "Las Vegas" });
    verifyConcierge(r, { partySize: 2, picks: [{ id: "tm:G5v1", total: null }, { id: "tm:G2", total: null }] });
    expect(r.options[0]).toMatchObject({ kind: "event", why: "Her residency." });
    const toolMsg = (prompts[1] as { role: string; content: { result: unknown }[] }[]).at(-1)!;
    expect(toolMsg.content[0].result).toEqual([
      { id: "tm:G5v1", name: "Adele", when: "Sat, Nov 14 · 8:00 PM", venue: "The Colosseum at Caesars Palace", city: "Las Vegas", price: "$60–$250", genre: "Pop" },
      { id: "tm:G2", name: "Usher", when: "Sat, Nov 14 · time TBA", venue: "The Colosseum at Caesars Palace", city: "Las Vegas", price: null, genre: "Pop" },
    ]);
  });

  it("events the model didn't pick are shown after its picks, with when and where as the reason", async () => {
    const { model } = createScriptedModel([{ tool: "search_events", args: { keyword: "concerts", city: "Las Vegas" } }, present([{ experienceId: "tm:G2", why: "x" }])]);
    const r = await runConcierge(input(), { model, searchEvents: async () => shows });
    const extra = r.options.find((o) => o.kind === "event" && o.event.id === "tm:G5v1")!;
    expect(extra.why).toBe("The Colosseum at Caesars Palace, Las Vegas · Sat, Nov 14 · 8:00 PM");
  });

  it("an event with no city reads cleanly", () => {
    const e = createLiveEvent({ city: "" });
    const out = withMoreOptions([], [e.id], 2, new Map(), new Map([[e.id, e]]));
    expect(out[0].why).toBe("The Colosseum at Caesars Palace · Sat, Nov 14 · 8:00 PM");
  });

  it("once there are real events, the arena building itself is dropped (but not restaurants)", async () => {
    const { model } = createScriptedModel([
      { tool: "search_live_places", args: { query: "concert venues Las Vegas" } },
      { tool: "search_events", args: { keyword: "concerts", city: "Las Vegas" } },
      present([{ experienceId: "gp:ChIJsphere", why: "Big room." }, { experienceId: "tm:G5v1", why: "Show." }, { experienceId: "gp:ChIJsd1", why: "Dinner first." }]),
    ]);
    const r = await runConcierge(input(), { model, searchLive: async () => [sphere, createLivePlace()], searchEvents: async () => shows });
    const kinds = r.options.map((o) => (o.kind === "event" ? o.event.id : o.kind === "live" ? o.place.id : o.experience.id));
    expect(kinds).not.toContain("gp:ChIJsphere");
    expect(kinds.slice(0, 2)).toEqual(["tm:G5v1", "gp:ChIJsd1"]);
  });

  it("without events, an arena can still be shown (its page lists what's on)", () => {
    const out = resolvePicks([{ experienceId: "gp:ChIJsphere", why: "x" }], 2, new Map([["gp:ChIJsphere", sphere]]));
    expect(out).toHaveLength(1);
  });

  it("respects the pick limit with events", () => {
    const many = Array.from({ length: 3 }, (_, i) => createLiveEvent({ id: `tm:E${i}` }));
    const out = resolvePicks(many.map((e) => ({ experienceId: e.id, why: "x" })), 2, new Map(), 2, new Map(many.map((e) => [e.id, e])));
    expect(out).toHaveLength(2);
  });

  it.each([
    ["an input problem is passed to the model as is", new Error("Say what, where or which venue"), "Say what, where or which venue"],
    ["a date problem too", new Error("Dates must look like 2026-11-14"), "Dates must look like 2026-11-14"],
    ["anything else is 'unavailable', and logged", new Error("Ticketmaster: HTTP 500"), "Event search is unavailable right now."],
  ])("%s", async (_l, err, msg) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { model, prompts } = createScriptedModel([{ tool: "search_events", args: { keyword: "x" } }, present([{ experienceId: "hugh-spa", why: "y" }])]);
    await runConcierge(input(), { model, searchEvents: async () => { throw err; } });
    const toolMsg = (prompts[1] as { role: string; content: { result: { error: string } }[] }[]).at(-1)!;
    expect(toolMsg.content[0].result.error).toBe(msg);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
