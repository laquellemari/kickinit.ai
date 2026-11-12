/**
 * Exact prices for venues kickinit has no deal with, read from the venue's own published menu.
 * Claude searches the web and opens the venue's pages (Anthropic's web search and web fetch tools); we then keep
 * only the prices that appear word for word in a page it opened on the venue's own site or its official booking page.
 * Nothing is estimated: a venue that doesn't publish prices gets an empty menu.
 */

export type MenuItem = { id: string; name: string; price: string; per: "person" | "group"; durationMinutes: number | null; sourceUrl: string };
export type Menu = { items: MenuItem[]; checkedAt: Date };
export type MenuVenue = { name: string; address: string; website: string | null; typeLabel: string };

export class MenuError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "MenuError";
  }
}

export const MAX_ITEMS = 8;
export const MAX_ITEM_PRICE = 5000;
export const MAX_CONTINUATIONS = 3;
const API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-5-5";

/** Where a venue's own booking page often lives. A price from anywhere else (reviews, articles, resellers) is ignored. */
export const BOOKING_HOSTS = [
  "vagaro.com", "mindbodyonline.com", "mindbody.io", "joinblvd.com", "blvd.co", "squareup.com", "square.site", "fresha.com",
  "booksy.com", "glossgenius.com", "schedulicity.com", "acuityscheduling.com", "zenoti.com", "exploretock.com", "fareharbor.com",
  "peek.com", "xola.com", "bookeo.com", "checkfront.com", "momence.com", "walla.app", "arketa.co",
];

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

const sameSite = (host: string, base: string) => host === base || host.endsWith(`.${base}`);

/** The venue's own site (any subdomain) or an official booking platform. */
export function isVenueSource(url: string, website: string | null): boolean {
  const host = hostOf(url);
  if (!host) return false;
  const own = website ? hostOf(website) : null;
  return (own !== null && sameSite(host, own)) || BOOKING_HOSTS.some((b) => sameSite(host, b));
}

export function menuPrompt(v: MenuVenue): string {
  return [
    `Find the exact published prices for ${v.name} (${v.typeLabel}), ${v.address}.${v.website ? ` Their website: ${v.website}` : ""}`,
    "Search for their price list, menu of services, or online booking page, then open the page with web_fetch so you read the prices on it.",
    "Use ONLY the venue's own website or its official online booking page. Ignore reviews, articles, deal sites, resellers and directories.",
    `Reply with up to ${MAX_ITEMS} of their main bookable services, one per line, exactly in this format and nothing else:`,
    "ITEM | <service name as listed> | <price in US dollars, digits only, e.g. 150 or 150.00> | <person or group> | <length in minutes, or ->",
    "Copy each price exactly as the page shows it. Never estimate, average, convert or round. Skip anything without a listed price, and skip gift cards, memberships, packages for more than one visit, and add-ons.",
    "If you can't find any published prices, reply with the single word NONE.",
  ].join("\n");
}

type Block =
  | { type: "text"; text: string }
  | { type: "web_fetch_tool_result"; content?: { type?: string; url?: string; content?: { source?: { type?: string; data?: string } } } }
  | { type: string; [k: string]: unknown };

/** The plain text of each page Claude opened, by URL. PDFs and failed fetches are skipped. */
export function fetchedPages(blocks: Block[]): { url: string; text: string }[] {
  const pages: { url: string; text: string }[] = [];
  for (const b of blocks) {
    if (b.type !== "web_fetch_tool_result") continue;
    const c = (b as Extract<Block, { type: "web_fetch_tool_result" }>).content;
    const src = c?.content?.source;
    if (c?.type === "web_fetch_result" && c.url && src?.type === "text" && typeof src.data === "string") pages.push({ url: c.url, text: src.data });
  }
  return pages;
}

export type Candidate = { name: string; price: string; per: "person" | "group"; durationMinutes: number | null };

/** "ITEM | name | price | person | 60" lines. Anything malformed is dropped. */
export function parseItems(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length !== 5 || parts[0].replace(/^[-*\s]+/, "") !== "ITEM") continue;
    const [, rawName, rawPrice, rawPer, rawMin] = parts;
    const name = rawName.replace(/[\u0000-\u001f*`]/g, "").trim().slice(0, 80);
    const price = rawPrice.replace(/^\$/, "").replace(/,/g, "");
    if (!name || !/^\d+(\.\d{1,2})?$/.test(price) || Number(price) <= 0 || Number(price) > MAX_ITEM_PRICE) continue;
    const per = rawPer.toLowerCase() === "group" ? "group" : "person";
    const minutes = /^\d+$/.test(rawMin) && Number(rawMin) >= 5 && Number(rawMin) <= 1440 ? Number(rawMin) : null;
    out.push({ name, price: Number(price).toFixed(2), per, durationMinutes: minutes });
  }
  return out;
}

/** True if `price` ("150.00") is written on the page as a dollar amount: $150, $150.00, $ 150, $1,200, 150 USD. */
export function pagePrices(text: string, price: string): boolean {
  const [int, cents] = price.split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const ints = Array.from(new Set([int, withCommas])).join("|");
  const dec = cents === "00" ? "(\\.00)?" : `\\.${cents}`;
  return new RegExp(`(\\$\\s?(${ints})${dec}(?!\\d)(?![.,]\\d))|((?<![\\d.,])(${ints})${dec}\\s?(USD|dollars))`, "i").test(text);
}

const STOP = new Set(["with", "and", "the", "for", "minute", "minutes", "min", "hour", "hours", "session"]);
/** At least one meaningful word of the service name appears on the page. */
export function pageNames(text: string, name: string): boolean {
  const lower = text.toLowerCase();
  return name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)).some((w) => lower.includes(w));
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";

/** Keep only candidates whose price and name both appear on one venue page Claude actually fetched. */
export function verify(candidates: Candidate[], pages: { url: string; text: string }[], website: string | null): MenuItem[] {
  const own = pages.filter((p) => isVenueSource(p.url, website));
  const items: MenuItem[] = [];
  const ids = new Set<string>();
  for (const c of candidates) {
    const page = own.find((p) => pagePrices(p.text, c.price) && pageNames(p.text, c.name));
    if (!page) continue;
    let id = `${slug(c.name)}-${c.price.replace(".00", "").replace(".", "-")}`;
    for (let n = 2; ids.has(id); n++) id = `${id.replace(/~\d+$/, "")}~${n}`;
    ids.add(id);
    items.push({ id, ...c, sourceUrl: page.url });
    if (items.length === MAX_ITEMS) break;
  }
  return items;
}

type ApiResponse = { content?: Block[]; stop_reason?: string; error?: { type?: string; message?: string } };

/** Ask Claude to find and read the venue's published prices, then verify them. */
export async function lookupMenu(v: MenuVenue, now: Date = new Date()): Promise<Menu> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new MenuError(503, "Price lookup is not configured");
  const messages: { role: "user" | "assistant"; content: string | Block[] }[] = [{ role: "user", content: menuPrompt(v) }];
  const blocks: Block[] = [];
  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "web-fetch-2025-09-10" },
      body: JSON.stringify({
        model: process.env.PRICING_MODEL || process.env.CONCIERGE_MODEL || DEFAULT_MODEL,
        max_tokens: 2000,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 3 },
          { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3, max_content_tokens: 20000 },
        ],
        messages,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    const json = (text ? JSON.parse(text) : {}) as ApiResponse;
    if (!res.ok) throw new MenuError(502, `Price lookup failed: ${json.error?.message ?? `HTTP ${res.status}`}`);
    const content = json.content ?? [];
    blocks.push(...content);
    // Long searches pause; send the turn back so Claude can finish.
    if (json.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content });
  }
  const answer = blocks.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("\n");
  return { items: verify(parseItems(answer), fetchedPages(blocks), v.website), checkedAt: now };
}
