// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  lookupMenu, menuPrompt, parseItems, pagePrices, pageNames, verify, fetchedPages, isVenueSource, hostOf, slug,
  MAX_ITEMS, MAX_ITEM_PRICE, MAX_CONTINUATIONS, MenuError, BOOKING_HOSTS,
} from "@/lib/pricing/menu";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const venue = { name: "Spa Uno", address: "1 Main St, Los Angeles", website: "https://www.spauno.com/", typeLabel: "Spa" };
const page = (url: string, text: string) => ({ type: "web_fetch_tool_result", tool_use_id: "f1", content: { type: "web_fetch_result", url, content: { type: "document", source: { type: "text", media_type: "text/plain", data: text } } } });
const text = (t: string) => ({ type: "text", text: t });
const PRICES = "Our menu. Swedish Massage 60 min $150. Deep Tissue Massage 90 min $210.00. Gift cards from $50.";

describe("menuPrompt", () => {
  it("names the venue and website, demands the venue's own pages, the exact line format, and NONE", () => {
    const p = menuPrompt(venue);
    expect(p).toContain("Spa Uno (Spa), 1 Main St, Los Angeles. Their website: https://www.spauno.com/");
    expect(p).toContain("Use ONLY the venue's own website or its official online booking page");
    expect(p).toContain(`up to ${MAX_ITEMS}`);
    expect(p).toContain("ITEM | <service name as listed> |");
    expect(p).toContain("Never estimate");
    expect(p).toContain("NONE");
  });
  it("without a website, says nothing about one", () => expect(menuPrompt({ ...venue, website: null })).not.toContain("Their website"));
});

describe("where a price may come from", () => {
  it("hostOf strips www and rejects non-web URLs", () => {
    expect(hostOf("https://www.SpaUno.com/x")).toBe("spauno.com");
    expect(hostOf("http://book.spauno.com")).toBe("book.spauno.com");
    expect(hostOf("ftp://spauno.com")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });
  it.each([
    ["https://spauno.com/prices", true],
    ["https://www.spauno.com/menu.pdf", true],
    ["https://book.spauno.com/", true],
    ["https://www.vagaro.com/spauno", true],
    ["https://spauno.square.site/", true],
    ["https://yelp.com/biz/spa-uno", false],
    ["https://notspauno.com/", false],
    ["https://spauno.com.evil.io/", false],
    ["garbage", false],
  ])("%s → %s", (url, ok) => expect(isVenueSource(url, venue.website)).toBe(ok));
  it("without a website only booking platforms count", () => {
    expect(isVenueSource("https://spauno.com/", null)).toBe(false);
    expect(isVenueSource(`https://${BOOKING_HOSTS[0]}/x`, null)).toBe(true);
  });
  it("a malformed website counts as none", () => expect(isVenueSource("https://spauno.com/", "nope")).toBe(false));
});

describe("parseItems", () => {
  it("reads ITEM lines, ignores everything else", () => {
    expect(parseItems("Here you go:\nITEM | Swedish Massage | 150 | person | 60\n- ITEM | Couples Suite | $1,200.5 | group | -\nthanks")).toEqual([
      { name: "Swedish Massage", price: "150.00", per: "person", durationMinutes: 60 },
      { name: "Couples Suite", price: "1200.50", per: "group", durationMinutes: null },
    ]);
  });
  it.each([
    ["too few fields", "ITEM | A | 10 | person"],
    ["not an ITEM line", "THING | A | 10 | person | 60"],
    ["no name", "ITEM | ** | 10 | person | 60"],
    ["not a number", "ITEM | A | ten | person | 60"],
    ["three decimals", "ITEM | A | 10.505 | person | 60"],
    ["zero", "ITEM | A | 0 | person | 60"],
    ["over the max", `ITEM | A | ${MAX_ITEM_PRICE + 1} | person | 60`],
  ])("drops %s", (_l, line) => expect(parseItems(line)).toEqual([]));
  it("boundary: the max price is kept; unknown per means per person; odd lengths become null", () => {
    expect(parseItems(`ITEM | A | ${MAX_ITEM_PRICE} | someone | 4\nITEM | B | 1 | GROUP | 1441\nITEM | C | 2 | person | 5\nITEM | D | 3 | person | 1440`)).toEqual([
      { name: "A", price: "5000.00", per: "person", durationMinutes: null },
      { name: "B", price: "1.00", per: "group", durationMinutes: null },
      { name: "C", price: "2.00", per: "person", durationMinutes: 5 },
      { name: "D", price: "3.00", per: "person", durationMinutes: 1440 },
    ]);
  });
  it("names are cleaned and cut to 80 characters", () => {
    expect(parseItems(`ITEM | **\`${"x".repeat(100)}\`** | 5 | person | -`)[0].name).toBe("x".repeat(80));
  });
});

describe("pagePrices: the price must be written on the page", () => {
  it.each([
    ["$150", "150.00", true], ["$150.00", "150.00", true], ["$ 150", "150.00", true], ["150 USD", "150.00", true], ["150 dollars", "150.00", true],
    ["$1,200", "1200.00", true], ["$1200", "1200.00", true], ["$19.99", "19.99", true],
    ["$1500", "150.00", false], ["$150.50", "150.00", false], ["$15", "150.00", false], ["150 minutes", "150.00", false],
    ["$19.9", "19.99", false], ["$2150", "150.00", false], ["$150,000", "150.00", false],
  ])("%j has %s: %s", (t, price, found) => expect(pagePrices(t, price)).toBe(found));
});

describe("pageNames", () => {
  it("a meaningful word of the name must appear", () => {
    expect(pageNames(PRICES, "Swedish Massage (60 minutes)")).toBe(true);
    expect(pageNames(PRICES, "Hot stone")).toBe(false);
    expect(pageNames(PRICES, "60 min session")).toBe(false);
  });
});

describe("verify", () => {
  const cands = parseItems("ITEM | Swedish Massage | 150 | person | 60\nITEM | Deep Tissue Massage | 210 | person | 90\nITEM | Hot Stone | 180 | person | 60\nITEM | Swedish Massage | 150 | group | 60");
  it("keeps only prices found, with their name, on a venue page Claude opened", () => {
    const items = verify(cands, [{ url: "https://spauno.com/menu", text: PRICES }, { url: "https://yelp.com/x", text: "Hot Stone $180" }], venue.website);
    expect(items.map((i) => [i.id, i.price, i.sourceUrl])).toEqual([
      ["swedish-massage-150", "150.00", "https://spauno.com/menu"],
      ["deep-tissue-massage-210", "210.00", "https://spauno.com/menu"],
      ["swedish-massage-150~2", "150.00", "https://spauno.com/menu"],
    ]);
  });
  it("nothing fetched from the venue: nothing kept", () => expect(verify(cands, [{ url: "https://yelp.com/x", text: PRICES }], venue.website)).toEqual([]));
  it("cent prices get a dashed id, and at most MAX_ITEMS are kept", () => {
    const many = Array.from({ length: MAX_ITEMS + 2 }, (_, i) => ({ name: `Massage ${i}`, price: "19.99", per: "person" as const, durationMinutes: null }));
    const items = verify(many, [{ url: "https://spauno.com/", text: "Massage $19.99" }], venue.website);
    expect(items).toHaveLength(MAX_ITEMS);
    expect(items[0].id).toBe("massage-0-19-99");
  });
  it("triplicate names get increasing suffixes", () => {
    const same = Array.from({ length: 3 }, () => ({ name: "Massage", price: "150.00", per: "person" as const, durationMinutes: null }));
    expect(verify(same, [{ url: "https://spauno.com/", text: PRICES }], venue.website).map((i) => i.id)).toEqual(["massage-150", "massage-150~2", "massage-150~3"]);
  });
  it("slug falls back to 'item'", () => expect(slug("***")).toBe("item"));
});

describe("fetchedPages", () => {
  it("only successful text fetches, by URL", () => {
    expect(fetchedPages([
      page("https://spauno.com/", "hello") as never,
      { type: "web_fetch_tool_result", content: { type: "web_fetch_tool_error", error_code: "url_not_accessible" } },
      { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://spauno.com/menu.pdf", content: { source: { type: "base64", data: "JVBER" } } } },
      { type: "web_fetch_tool_result" },
      { type: "web_search_tool_result", content: [] },
      text("x") as never,
    ])).toEqual([{ url: "https://spauno.com/", text: "hello" }]);
  });
});

describe("lookupMenu", () => {
  const reply = (content: unknown[], stop_reason = "end_turn", status = 200) => new Response(JSON.stringify({ content, stop_reason }), { status });
  const env = () => vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");

  it("happy: asks Claude with web search + fetch, keeps verified prices", async () => {
    env();
    const f = vi.fn(async () => reply([page("https://spauno.com/menu", PRICES), text("ITEM | Swedish Massage | 150 | person | 60\nITEM | Invented Facial | 99 | person | 30")]));
    vi.stubGlobal("fetch", f);
    const now = new Date("2026-11-11T12:00:00Z");
    const m = await lookupMenu(venue, now);
    expect(m).toEqual({ checkedAt: now, items: [{ id: "swedish-massage-150", name: "Swedish Massage", price: "150.00", per: "person", durationMinutes: 60, sourceUrl: "https://spauno.com/menu" }] });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const h = new Headers(init.headers);
    expect(h.get("x-api-key")).toBe("sk-test");
    expect(h.get("anthropic-version")).toBe("2023-06-01");
    expect(h.get("anthropic-beta")).toBe("web-fetch-2025-09-10");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.tools.map((t: { type: string }) => t.type)).toEqual(["web_search_20250305", "web_fetch_20250910"]);
    expect(body.messages[0]).toEqual({ role: "user", content: menuPrompt(venue) });
  });
  it("uses PRICING_MODEL, then CONCIERGE_MODEL, when set", async () => {
    env();
    const f = vi.fn(async () => reply([text("NONE")]));
    vi.stubGlobal("fetch", f);
    vi.stubEnv("CONCIERGE_MODEL", "claude-sonnet-5-5");
    await lookupMenu(venue);
    vi.stubEnv("PRICING_MODEL", "claude-opus-5-5");
    await lookupMenu(venue);
    const models = f.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string).model);
    expect(models).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]);
  });
  it("NONE: an empty menu (nothing guessed)", async () => {
    env();
    vi.stubGlobal("fetch", vi.fn(async () => reply([text("NONE")])));
    expect((await lookupMenu(venue)).items).toEqual([]);
  });
  it("a paused turn is sent back so Claude can finish, then the pages from every turn count", async () => {
    env();
    const f = vi.fn()
      .mockResolvedValueOnce(reply([page("https://spauno.com/menu", PRICES)], "pause_turn"))
      .mockResolvedValueOnce(reply([text("ITEM | Deep Tissue Massage | 210 | person | 90")]));
    vi.stubGlobal("fetch", f);
    expect((await lookupMenu(venue)).items.map((i) => i.id)).toEqual(["deep-tissue-massage-210"]);
    const second = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
  });
  it(`boundary: stops after ${MAX_CONTINUATIONS} continuations`, async () => {
    env();
    const f = vi.fn(async () => reply([], "pause_turn"));
    vi.stubGlobal("fetch", f);
    expect((await lookupMenu(venue)).items).toEqual([]);
    expect(f).toHaveBeenCalledTimes(MAX_CONTINUATIONS + 1);
  });
  it("a reply with no content is an empty menu", async () => {
    env();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    expect((await lookupMenu(venue)).items).toEqual([]);
  });
  it("an API error is a 502 MenuError with Anthropic's message", async () => {
    env();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "web search is disabled" } }), { status: 400 })));
    await expect(lookupMenu(venue)).rejects.toMatchObject({ name: "MenuError", status: 502, message: "Price lookup failed: web search is disabled" });
  });
  it("an error without a body says the HTTP status", async () => {
    env();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 529 })));
    await expect(lookupMenu(venue)).rejects.toThrow("Price lookup failed: HTTP 529");
  });
  it("not configured: 503, no request", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(lookupMenu(venue)).rejects.toEqual(new MenuError(503, "Price lookup is not configured"));
    expect(f).not.toHaveBeenCalled();
  });
});
