// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import {
  factsText, aboutPrompt, cleanAbout, writeAbout, cachedAbout, saveAbout, aboutFor, AboutError,
  MAX_WORDS, MAX_CHARS, MAX_TOKENS, FOUND_TTL_DAYS, EMPTY_TTL_DAYS, ABOUT_VERSION,
} from "@/lib/about/about";
import type { PlaceFacts } from "@/lib/places/client";
import { getDb } from "@/lib/db";
import { useTestDb } from "../../../helpers/db";

const DAY = 86_400_000;
const NOW = new Date("2026-11-11T12:00:00Z");
const facts = (o: Partial<PlaceFacts> = {}): PlaceFacts => ({
  name: "Perch", typeLabel: "Bar", types: ["bar", "restaurant"], neighborhood: "Downtown", city: "Los Angeles",
  editorial: "French-inspired rooftop bar.", overview: "Rooftop with fire pits.", reviewSummary: "People love the view.",
  reviews: ["Great view", "Lovely brunch"], rating: 4.4, ratingCount: 9000, priceLevel: "$$", features: ["serves cocktails", "has live music"], ...o,
});
const bare = facts({ types: [], neighborhood: "", city: "", editorial: null, overview: null, reviewSummary: null, reviews: [], rating: null, priceLevel: null, features: [] });
const GOOD = "A French-inspired rooftop bar fifteen floors above Pershing Square, with fire pits, live jazz and sweeping skyline views.";

const claude = (status: number, body: unknown) => new Response(body === undefined ? "" : JSON.stringify(body), { status });
const answer = (text: string) => claude(200, { content: [{ type: "text", text }] });
const google = () => new Response(JSON.stringify({ id: "ChIJ1", displayName: { text: "Perch" }, editorialSummary: { text: "Rooftop bar." } }), { status: 200 });

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); vi.stubEnv("ANTHROPIC_API_KEY", "sk"); vi.stubEnv("GOOGLE_PLACES_API_KEY", "g"); vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("factsText", () => {
  it("lists every fact Google gave, one per line", () => {
    expect(factsText(facts())).toBe([
      "Name: Perch", "Type: Bar (bar, restaurant)", "Location: Downtown, Los Angeles", "Price level: $$", "Rating: 4.4 from 9000 reviews",
      "Features: serves cocktails; has live music", "Google's description: French-inspired rooftop bar.", "Google's overview: Rooftop with fire pits.",
      "What reviewers say: People love the view.", "Review 1: Great view", "Review 2: Lovely brunch",
    ].join("\n"));
  });
  it("leaves out what Google didn't give", () => expect(factsText(bare)).toBe("Name: Perch\nType: Bar"));
  it("a city alone is still a location", () => expect(factsText({ ...bare, city: "LA" })).toContain("Location: LA"));
});

describe("aboutPrompt", () => {
  it("asks for 1–2 grounded sentences, no numbers or hype, and allows NONE", () => {
    const p = aboutPrompt(facts());
    expect(p).toContain(`In 1 or 2 sentences (at most ${MAX_WORDS} words)`);
    expect(p).toContain("Use only the facts below. Never invent a detail");
    expect(p).toContain("No ratings, prices, hours, addresses or review counts");
    expect(p).toContain("reply with the single word NONE");
    expect(p.endsWith(factsText(facts()))).toBe(true);
  });
});

describe("cleanAbout", () => {
  it("keeps a good description as is", () => expect(cleanAbout(GOOD)).toBe(GOOD));
  it("strips quotes, markdown and extra spaces", () => expect(cleanAbout(`"**A rooftop  bar** with fire pits."\n`)).toBe("A rooftop bar with fire pits."));
  it("keeps only the first two sentences", () => expect(cleanAbout("One is here. Two is here! Three is here?")).toBe("One is here. Two is here!"));
  it("text without a full stop is kept whole", () => expect(cleanAbout("A rooftop bar with fire pits")).toBe("A rooftop bar with fire pits"));
  it.each(["NONE", "none.", "", "   ", "Too short."])("%j → null", (r) => expect(cleanAbout(r)).toBeNull());
  it("two sentences too long together: keeps the first", () => {
    const one = `${"a".repeat(300)}.`;
    expect(cleanAbout(`${one} ${"b".repeat(300)}.`)).toBe(one);
  });
  it(`boundary: 20 to ${MAX_CHARS} characters`, () => {
    expect(cleanAbout("x".repeat(19))).toBeNull();
    expect(cleanAbout("x".repeat(20))).toBe("x".repeat(20));
    expect(cleanAbout("x".repeat(MAX_CHARS))).toBe("x".repeat(MAX_CHARS));
    expect(cleanAbout("x".repeat(MAX_CHARS + 1))).toBeNull();
  });
});

describe("writeAbout", () => {
  it("happy: sends the prompt to Claude and returns the cleaned description", async () => {
    const f = vi.fn(async () => claude(200, { content: [{ type: "text", text: GOOD }, { type: "tool_use" }, { type: "text" }] }));
    vi.stubGlobal("fetch", f);
    expect(await writeAbout(facts())).toBe(GOOD);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(new Headers(init.headers).get("x-api-key")).toBe("sk");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: MAX_TOKENS, messages: [{ role: "user", content: aboutPrompt(facts()) }] });
    expect(body.tools).toBeUndefined();
    expect(vi.mocked(console.info)).toHaveBeenCalledWith("[about]", JSON.stringify({
      venue: "Perch", editorial: true, overview: true, reviewSummary: true, reviews: 2, features: 2, stop: null, kept: true, reply: `${GOOD} `,
    }));
  });
  it("the model can be changed: ABOUT_MODEL, else CONCIERGE_MODEL", async () => {
    const f = vi.fn(async () => answer(GOOD));
    vi.stubGlobal("fetch", f);
    vi.stubEnv("CONCIERGE_MODEL", "c-model");
    await writeAbout(facts());
    vi.stubEnv("ABOUT_MODEL", "a-model");
    await writeAbout(facts());
    expect(f.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).model)).toEqual(["c-model", "a-model"]);
  });
  it("a finished reply (end_turn) is kept", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => claude(200, { stop_reason: "end_turn", content: [{ type: "text", text: GOOD }] })));
    expect(await writeAbout(facts())).toBe(GOOD);
  });
  it("a reply cut off by the token limit is thrown away, and logged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => claude(200, { stop_reason: "max_tokens", content: [{ type: "thinking" }, { type: "text", text: "Elevated French rooftop bistro known for a wide range of well" }] })));
    expect(await writeAbout(facts())).toBeNull();
    expect(String(vi.mocked(console.info).mock.calls.at(-1)?.[1])).toContain('"stop":"max_tokens","kept":false');
  });
  it("NONE → null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer("NONE")));
    expect(await writeAbout(bare)).toBeNull();
  });
  it("no content → null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => claude(200, {})));
    expect(await writeAbout(facts())).toBeNull();
  });
  it("503 when no Anthropic key, without calling out", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(writeAbout(facts())).rejects.toMatchObject({ status: 503, message: "Venue descriptions are not configured" });
    expect(f).not.toHaveBeenCalled();
  });
  it("502 with Claude's message when it fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => claude(529, { error: { message: "Overloaded" } })));
    const err = await writeAbout(facts()).catch((e) => e);
    expect(err).toBeInstanceOf(AboutError);
    expect(err).toMatchObject({ status: 502, message: "Description failed: Overloaded" });
  });
  it("502 with the HTTP status when the failure has no body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => claude(500, undefined)));
    await expect(writeAbout(facts())).rejects.toMatchObject({ status: 502, message: "Description failed: HTTP 500" });
  });
});

describe("the description cache", () => {
  it("saves and reads back, and a second save replaces it", async () => {
    await saveAbout("ChIJ1", { about: GOOD, checkedAt: NOW });
    expect(await cachedAbout("ChIJ1", NOW)).toEqual({ about: GOOD, checkedAt: NOW });
    await saveAbout("ChIJ1", { about: null, checkedAt: NOW });
    expect(await cachedAbout("ChIJ1", NOW)).toEqual({ about: null, checkedAt: NOW });
  });
  it("keys rows by prompt version", async () => {
    await saveAbout("ChIJ1", { about: GOOD, checkedAt: NOW });
    const { rows } = await (await getDb()).query<{ place_id: string }>("SELECT place_id FROM venue_about");
    expect(rows).toEqual([{ place_id: `${ABOUT_VERSION}:ChIJ1` }]);
  });
  it("unknown venue: nothing cached (now defaults to the clock)", async () => expect(await cachedAbout("nope")).toBeNull());
  it(`boundary: descriptions last ${FOUND_TTL_DAYS} days`, async () => {
    await saveAbout("ChIJ1", { about: GOOD, checkedAt: NOW });
    expect(await cachedAbout("ChIJ1", new Date(NOW.getTime() + FOUND_TTL_DAYS * DAY - 1))).not.toBeNull();
    expect(await cachedAbout("ChIJ1", new Date(NOW.getTime() + FOUND_TTL_DAYS * DAY))).toBeNull();
  });
  it(`boundary: "too little to say" is tried again after ${EMPTY_TTL_DAYS} days`, async () => {
    await saveAbout("ChIJ1", { about: null, checkedAt: NOW });
    expect(await cachedAbout("ChIJ1", new Date(NOW.getTime() + EMPTY_TTL_DAYS * DAY - 1))).not.toBeNull();
    expect(await cachedAbout("ChIJ1", new Date(NOW.getTime() + EMPTY_TTL_DAYS * DAY))).toBeNull();
  });
});

describe("aboutFor", () => {
  it("a cached description is returned without calling Google or Claude", async () => {
    await saveAbout("ChIJ1", { about: GOOD, checkedAt: NOW });
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await aboutFor("ChIJ1", NOW)).toEqual({ about: GOOD, checkedAt: NOW });
    expect(f).not.toHaveBeenCalled();
  });
  it("a miss reads Google, asks Claude once, and saves the result", async () => {
    const f = vi.fn(async (url: string) => (url.startsWith("https://places") ? google() : answer(GOOD)));
    vi.stubGlobal("fetch", f);
    expect(await aboutFor("ChIJ1", NOW)).toEqual({ about: GOOD, checkedAt: NOW });
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body)).messages[0].content).toContain("Google's description: Rooftop bar.");
    expect(await cachedAbout("ChIJ1", NOW)).toEqual({ about: GOOD, checkedAt: NOW });
  });
  it("NONE is remembered too, so the venue isn't re-asked for a week", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("https://places") ? google() : answer("NONE"))));
    expect((await aboutFor("ChIJ1")).about).toBeNull();
    expect(await cachedAbout("ChIJ1")).toMatchObject({ about: null });
  });
  it("concurrent requests share one write", async () => {
    const f = vi.fn(async (url: string) => (url.startsWith("https://places") ? google() : answer(GOOD)));
    vi.stubGlobal("fetch", f);
    const [a, b] = await Promise.all([aboutFor("ChIJ1", NOW), aboutFor("ChIJ1", NOW)]);
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("a failure isn't cached, and the next request tries again", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("https://places") ? google() : claude(500, undefined))));
    await expect(aboutFor("ChIJ1", NOW)).rejects.toMatchObject({ status: 502 });
    expect(await cachedAbout("ChIJ1", NOW)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("https://places") ? google() : answer(GOOD))));
    expect((await aboutFor("ChIJ1", NOW)).about).toBe(GOOD);
  });
});
