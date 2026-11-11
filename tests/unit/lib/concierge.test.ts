// @vitest-environment node
import { describe, it, expect } from "vitest";
import { runConcierge, validateInput, systemPrompt, resolvePicks, LIMITS, type ConciergeInput } from "@/lib/concierge/agent";
import { tool } from "ai";
import { z } from "zod";
import { createScriptedModel } from "../../helpers/factories";
import { verifyConcierge } from "../../helpers/verification";

const input = (o: Partial<ConciergeInput> = {}): ConciergeInput => ({ message: "romantic italian dinner for 2 by the water", mode: "you", ...o });
const present = (picks: { experienceId: string; why: string }[], partySize = 2, intro = "Two lovely options.") =>
  ({ tool: "present_options", args: { intro, partySize, picks } });

describe("runConcierge", () => {
  describe("happy path", () => {
    it("searches, then presents server-priced picks", async () => {
      const { model, prompts } = createScriptedModel([
        { tool: "search_experiences", args: { q: "romantic italian waterfront", partySize: 2 } },
        present([{ experienceId: "marea", why: "Terrace over the bay." }, { experienceId: "osteria-lume", why: "Tiny and intimate." }]),
      ]);
      const r = await runConcierge(input(), { model });
      verifyConcierge(r, { reply: "Two lovely options.", partySize: 2, picks: [{ id: "marea", total: "180.00" }, { id: "osteria-lume", total: "130.00" }] });
      expect(r.options[0].why).toBe("Terrace over the bay.");
      // The model saw real search results on its second step
      expect(JSON.stringify(prompts[1])).toContain("Ristorante Marea");
    });

    it("passes history before the new message", async () => {
      const { model, prompts } = createScriptedModel([present([{ experienceId: "blue-room", why: "Jazz." }])]);
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
        present([{ experienceId: "marea", why: "x" }]),
      ]);
      verifyConcierge(await runConcierge(input(), { model }), { partySize: 2, picks: [{ id: "marea", total: "180.00" }] });
      const toolMsg = (prompts[1] as { role: string; content: { result: unknown }[] }[]).at(-1)!;
      expect(toolMsg.role).toBe("tool");
      expect(toolMsg.content[0].result).toEqual([]);
    });
  });

  describe("the server checks every pick", () => {
    it("drops invented ids", async () => {
      const { model } = createScriptedModel([present([{ experienceId: "made-up", why: "x" }, { experienceId: "marea", why: "y" }])]);
      verifyConcierge(await runConcierge(input(), { model }), { partySize: 2, picks: [{ id: "marea", total: "180.00" }] });
    });
    it("drops picks that can't take the party", async () => {
      const { model } = createScriptedModel([present([{ experienceId: "halcyon-spa", why: "x" }, { experienceId: "still-water", why: "y" }], 3)]);
      verifyConcierge(await runConcierge(input(), { model }), { partySize: 3, picks: [{ id: "still-water", total: "285.00" }] });
    });
    it("drops duplicates", async () => {
      const { model } = createScriptedModel([present([{ experienceId: "marea", why: "x" }, { experienceId: "marea", why: "again" }])]);
      verifyConcierge(await runConcierge(input(), { model }), { partySize: 2, picks: [{ id: "marea", total: "180.00" }] });
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
    it("uses the user's area, defaulting to Miami, and today's date", () => {
      const today = new Date("2026-11-14T12:00:00Z");
      expect(systemPrompt(input({ where: "Austin", today }))).toContain("The user's area: Austin");
      expect(systemPrompt(input({ where: "  ", today }))).toContain("The user's area: Miami");
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
  it("caps at 4 picks", () => {
    const ids = ["marea", "osteria-lume", "kaito-omakase", "la-tapa", "sol-taqueria"];
    expect(resolvePicks(ids.map((experienceId) => ({ experienceId, why: "" })), 2)).toHaveLength(4);
  });
  it("0 picks gives an empty list", () => expect(resolvePicks([], 2)).toEqual([]));
});
