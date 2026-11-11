// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { questBooking, giftAsBooking, buildActivity } from "@/lib/passport/activity";
import { computePassport } from "@/lib/passport/passport";
import { loadPassport } from "@/lib/passport/load";
import { getProfile, saveProfile, MAX_AVATAR_CHARS } from "@/lib/profile/repo";
import { GET as passportRoute } from "@/app/api/passport/route";
import { GET as getProfileRoute, PUT as putProfileRoute } from "@/app/api/profile/route";
import { insertBooking, transition, markCheckedIn, type Booking } from "@/lib/bookings/repo";
import { insertGift, insertContribution, transitionGift, setContributionStatus, listGiftsByOrganizer, listContributionsBy } from "@/lib/gifts/repo";
import { useTestDb } from "../../../helpers/db";
import { createNewBooking, createNewGift, createNewContribution } from "../../../helpers/factories";

const U = "11111111-1111-4111-8111-111111111111";
const DAY = 86_400_000;
const T0 = new Date("2026-11-02T00:30:00Z");
let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => vi.unstubAllEnvs());

/** Insert a booking, confirm it, and (optionally) check it in. */
async function attended(o: Parameters<typeof createNewBooking>[0] = {}, checkIn = true): Promise<Booking> {
  const b = await insertBooking(createNewBooking({ userId: U, ...o }));
  const c = (await transition(b.id, ["held"], "confirmed", "C"))!;
  return checkIn ? (await markCheckedIn(c.id, c.startsAt))! : c;
}

describe("questBooking", () => {
  it("maps statuses and check-in", async () => {
    const held = await insertBooking(createNewBooking());
    expect(questBooking(held)).toMatchObject({ status: "held", checkedIn: false, isGift: false, source: "in_app", city: "Miami", cuisine: "italian", neighborhood: "Coconut Grove", localHour: 19 });
    expect(questBooking((await transition(held.id, ["held"], "declined"))!).status).toBe("voided");
    const f = await insertBooking(createNewBooking());
    expect(questBooking((await transition(f.id, ["held"], "failed"))!).status).toBe("voided");
    expect(questBooking(await attended())).toMatchObject({ status: "captured", checkedIn: true });
  });
  it("null cuisine/neighborhood become undefined", async () => {
    const b = await insertBooking(createNewBooking({ facts: { tags: ["x"], city: "SD", country: "US", neighborhood: null, cuisine: null, localHour: 9 } }));
    expect(questBooking(b)).toMatchObject({ cuisine: undefined, neighborhood: undefined });
  });
});

describe("giftAsBooking", () => {
  it("funded or redeemed gifts count as sent gifts with the experience's tags plus 'gift'", async () => {
    const g = (await transitionGift((await insertGift(createNewGift())).id, ["open"], "funded"))!;
    expect(giftAsBooking(g)).toMatchObject({ isGift: true, status: "captured", tags: ["wellness", "spa", "bathhouse", "sauna", "korean_spa", "gift"], city: "Los Angeles" });
    expect(giftAsBooking((await transitionGift(g.id, ["funded"], "redeemed"))!)).not.toBeNull();
  });
  it("open or expired gifts don't count", async () => {
    const g = await insertGift(createNewGift());
    expect(giftAsBooking(g)).toBeNull();
    expect(giftAsBooking((await transitionGift(g.id, ["open"], "expired"))!)).toBeNull();
  });
  it("a gift for an experience no longer in the catalog still counts, without tags", async () => {
    const g = (await transitionGift((await insertGift(createNewGift({ experienceId: "retired" }))).id, ["open"], "funded"))!;
    expect(giftAsBooking(g)).toMatchObject({ tags: ["gift"], city: "", country: "" });
  });
});

describe("computePassport", () => {
  const ctx = { homeCity: "Miami", homeCountry: "US" };
  it("a new visitor is a Newcomer with nothing unlocked", () => {
    const p = computePassport(buildActivity({ bookings: [], organized: [], contributions: [], ctx }));
    expect(p.level).toMatchObject({ level: 1, title: "Newcomer", xp: 0 });
    expect(p.stats).toEqual({ attended: 0, giftsSent: 0, cities: 0, questsCompleted: 0, questsTotal: 403, badgesUnlocked: 0, badgesTotal: 58 });
    expect(p.categories).toHaveLength(8);
    expect(p.categories.find((c) => c.id === "culinary")).toMatchObject({ name: "Culinary", completed: 0, total: 52 });
    expect(p.inProgress).toEqual([]);
  });
  it("3 checked-in Italian dinners complete Pasta Pilgrim and earn its XP plus first-booking badges", async () => {
    const bs = [];
    for (let i = 0; i < 3; i++) bs.push(await attended({ startsAt: new Date(T0.getTime() + i * 7 * DAY) }));
    const p = computePassport(buildActivity({ bookings: bs, organized: [], contributions: [], ctx }));
    expect(p.completed.map((q) => q.id)).toContain("culinary-pasta-pilgrim");
    expect(p.stats).toMatchObject({ attended: 3, cities: 1 });
    expect(p.badges.filter((b) => b.unlocked).length).toBeGreaterThan(0);
    expect(p.level.xp).toBeGreaterThanOrEqual(100);
    expect(p.inProgress.length).toBeGreaterThan(0);
    expect(p.inProgress.every((q) => !q.complete && q.current > 0)).toBe(true);
    const ratios = p.inProgress.map((q) => q.current / q.target);
    expect([...ratios].sort((a, b) => b - a)).toEqual(ratios);
  });
  it("bookings that weren't checked in earn nothing", async () => {
    const b = await attended({}, false);
    expect(computePassport(buildActivity({ bookings: [b], organized: [], contributions: [], ctx })).level.xp).toBe(0);
  });
  it("counters: funded pools you organized, captured contributions, redeemed gifts", async () => {
    const pool = (await transitionGift((await insertGift(createNewGift({ organizerId: U, mode: "pool" }))).id, ["open"], "funded"))!;
    const solo = (await transitionGift((await insertGift(createNewGift({ organizerId: U, mode: "solo" }))).id, ["open"], "funded"))!;
    const fundedPool = (await transitionGift((await insertGift(createNewGift({ organizerId: U, mode: "pool" }))).id, ["open"], "funded"))!;
    const redeemedPool = (await transitionGift(fundedPool.id, ["funded"], "redeemed"))!;
    const c1 = await insertContribution(createNewContribution(pool.id, { contributorId: U }));
    await setContributionStatus(c1.id, "held", "captured", "CAP");
    await insertContribution(createNewContribution(pool.id, { contributorId: U })); // still held
    const redeemed = await attended({ paypalOrderId: `gift:${solo.id}` });
    const a = buildActivity({ bookings: [redeemed], organized: [pool, solo, redeemedPool], contributions: await listContributionsBy(U), ctx });
    expect(a.counters).toEqual({ poolsFundedAsOrganizer: 2, poolContributions: 1, giftsRedeemed: 1, referralsConverted: 0, reviews: 0 });
    expect(computePassport(a).stats.giftsSent).toBe(3);
  });
  it("home city from the profile drives travel quests", async () => {
    const b = await attended({ facts: { tags: ["food_tour"], city: "Austin", country: "US", neighborhood: null, cuisine: null, localHour: 12 } });
    const home = computePassport(buildActivity({ bookings: [b], organized: [], contributions: [], ctx }));
    const local = computePassport(buildActivity({ bookings: [b], organized: [], contributions: [], ctx: { homeCity: "Austin", homeCountry: "US" } }));
    expect(home.completed.map((q) => q.id)).toContain("getaways-foodie-getaway");
    expect(local.completed.map((q) => q.id)).not.toContain("getaways-foodie-getaway");
  });
});

describe("profile", () => {
  it("defaults for a new visitor", async () => {
    expect(await getProfile(U)).toEqual({ userId: U, displayName: "", homeCity: "Los Angeles", homeCountry: "US", avatar: null });
  });
  it("saves only the fields given, trims text, uppercases country", async () => {
    await saveProfile(U, { displayName: " Kavon ", homeCity: " San Diego ", homeCountry: "us" });
    await saveProfile(U, { avatar: "data:image/png;base64,iVBORw0KGgo=" });
    expect(await getProfile(U)).toEqual({ userId: U, displayName: "Kavon", homeCity: "San Diego", homeCountry: "US", avatar: "data:image/png;base64,iVBORw0KGgo=" });
    await saveProfile(U, { avatar: null });
    expect((await getProfile(U)).avatar).toBeNull();
  });
  it.each([
    ["non-text name", { displayName: 5 }, "Name must be text"],
    ["long name", { displayName: "x".repeat(41) }, "Name can be at most 40 characters"],
    ["empty home city", { homeCity: "  " }, "Home city is required"],
    ["bad country", { homeCountry: "U1" }, "Country must be a 2-letter code like US"],
    ["long country", { homeCountry: "USA" }, "Country can be at most 2 characters"],
    ["not an image", { avatar: "data:text/html;base64,PGh0bWw+" }, "Profile photo must be a PNG, JPEG or WebP image"],
    ["a URL instead of data", { avatar: "https://evil.example/x.png" }, "Profile photo must be a PNG, JPEG or WebP image"],
    ["a number", { avatar: 7 }, "Profile photo must be a PNG, JPEG or WebP image"],
    ["too big", { avatar: `data:image/jpeg;base64,${"A".repeat(MAX_AVATAR_CHARS)}` }, "Profile photo must be under 200 KB"],
  ])("rejects %s", async (_l, u, message) => {
    await expect(saveProfile(U, u)).rejects.toMatchObject({ status: 400, message });
  });
  it("boundary: 40-character name and an avatar exactly at the limit are accepted", async () => {
    const prefix = "data:image/webp;base64,";
    await expect(saveProfile(U, { displayName: "x".repeat(40), avatar: prefix + "A".repeat(MAX_AVATAR_CHARS - prefix.length) })).resolves.toBeDefined();
  });
});

describe("routes", () => {
  const req = (o: { method?: string; body?: unknown; cookie?: boolean } = {}) =>
    new Request("http://x", { method: o.method ?? "GET", headers: { "content-type": "application/json", ...(o.cookie === false ? {} : { cookie: `kid=${U}` }) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  it("GET /api/passport returns my passport", async () => {
    await attended();
    const res = await passportRoute(req());
    expect(res.status).toBe(200);
    expect((await res.json()).stats.attended).toBe(1);
  });
  it("loadPassport uses my profile's home city", async () => {
    await saveProfile(U, { homeCity: "Austin" });
    await attended({ facts: { tags: ["food_tour"], city: "Austin", country: "US", neighborhood: null, cuisine: null, localHour: 12 } });
    expect((await loadPassport(U)).completed.map((q) => q.id)).not.toContain("getaways-foodie-getaway");
  });
  it("GET/PUT /api/profile", async () => {
    const put = await putProfileRoute(req({ method: "PUT", body: { displayName: "Kavon" } }));
    expect(put.status).toBe(200);
    expect(await (await getProfileRoute(req())).json()).toMatchObject({ displayName: "Kavon", homeCity: "Los Angeles" });
    expect((await putProfileRoute(req({ method: "PUT", body: { homeCity: "" } }))).status).toBe(400);
  });
  it.each([["passport", () => passportRoute(req({ cookie: false }))], ["profile GET", () => getProfileRoute(req({ cookie: false }))], ["profile PUT", () => putProfileRoute(req({ method: "PUT", cookie: false, body: {} }))]])("%s: 401 without a visitor", async (_l, call) => {
    expect((await call()).status).toBe(401);
  });
  it("listGiftsByOrganizer returns newest first", async () => {
    const a = await insertGift(createNewGift({ organizerId: U }));
    const b = await insertGift(createNewGift({ organizerId: U }));
    expect((await listGiftsByOrganizer(U)).map((g) => g.id)).toEqual([b.id, a.id]);
  });
});
