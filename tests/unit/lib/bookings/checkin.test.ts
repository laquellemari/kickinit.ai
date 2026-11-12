// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { checkIn, requestFreeBooking } from "@/lib/bookings/service";
import { insertBooking, transition, getBooking, markCheckedIn } from "@/lib/bookings/repo";
import { priceFor } from "@/lib/bookings/pricing";
import { POST as checkInRoute } from "@/app/api/bookings/[id]/check-in/route";
import { resetTokenCache } from "@/lib/paypal/client";
import { useTestDb } from "../../../helpers/db";
import { createNewBooking } from "../../../helpers/factories";
import { mockPayPal, setPayPalEnv } from "../../../helpers/paypal";

const HOUR = 3_600_000;
const START = new Date("2026-11-15T02:30:00Z");
const U = "11111111-1111-4111-8111-111111111111";
let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); setPayPalEnv(); resetTokenCache(); vi.stubEnv("ADMIN_API_KEY", "adm"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function confirmed(o: Parameters<typeof createNewBooking>[0] = {}) {
  const b = await insertBooking(createNewBooking({ startsAt: START, userId: U, ...o }));
  return (await transition(b.id, ["held"], "confirmed", "CAP"))!;
}

describe("venue facts are stored with the booking", () => {
  it("partner booking: tags, city, neighborhood, cuisine and Los Angeles local hour", async () => {
    const b = await requestFreeBooking({ kind: "partner", itemId: "carasau-pasta-bar", partySize: 2, startsAt: START.toISOString(), userId: U, now: new Date(START.getTime() - 48 * HOUR) });
    expect(b.facts).toEqual({ tags: ["restaurant", "italian", "romantic"], city: "Los Angeles", country: "US", neighborhood: "Mid-City", cuisine: "italian", localHour: 18 });
    expect((await getBooking(b.id))!.facts.localHour).toBe(18);
  });
  it("live booking: Google's city/country and the venue's local hour", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "g");
    mockPayPal({ status: 200, body: { id: "ChIJ1", displayName: { text: "Barbusa" }, primaryType: "italian_restaurant", location: { latitude: 1, longitude: 2 }, utcOffsetMinutes: -480,
      addressComponents: [{ longText: "San Diego", shortText: "San Diego", types: ["locality"] }, { longText: "United States", shortText: "US", types: ["country"] }] } });
    const priced = await priceFor("live", "gp:ChIJ1", 2);
    expect(priced.factsAt(START)).toMatchObject({ city: "San Diego", country: "US", localHour: 18, tags: ["restaurant", "italian_restaurant"] });
  });
});

describe("checkIn", () => {
  it("guest: allowed from 2 hours before to 24 hours after (boundaries inclusive)", async () => {
    const a = await confirmed();
    expect((await checkIn({ id: a.id, userId: U, admin: false, now: new Date(START.getTime() - 2 * HOUR) })).checkedInAt?.getTime()).toBe(START.getTime() - 2 * HOUR);
    const b = await confirmed();
    expect((await checkIn({ id: b.id, userId: U, admin: false, now: new Date(START.getTime() + 24 * HOUR) })).checkedInAt).not.toBeNull();
  });
  it.each([
    ["1 ms too early", -2 * HOUR - 1, "Check-in opens 2 hours before your booking"],
    ["1 ms too late", 24 * HOUR + 1, "Check-in closed 24 hours after your booking"],
  ])("guest: %s is refused", async (_l, offset, message) => {
    const b = await confirmed();
    await expect(checkIn({ id: b.id, userId: U, admin: false, now: new Date(START.getTime() + offset) })).rejects.toMatchObject({ status: 409, message });
  });
  it("venue desk (admin) can check in any time", async () => {
    const b = await confirmed();
    expect((await checkIn({ id: b.id, userId: null, admin: true, now: new Date(START.getTime() - 30 * 24 * HOUR) })).checkedInAt).not.toBeNull();
  });
  it("checking in twice keeps the first time", async () => {
    const b = await confirmed();
    const first = await checkIn({ id: b.id, userId: U, admin: false, now: START });
    const again = await checkIn({ id: b.id, userId: U, admin: false, now: new Date(START.getTime() + HOUR) });
    expect(again.checkedInAt?.getTime()).toBe(first.checkedInAt?.getTime());
  });
  it("only confirmed bookings", async () => {
    const b = await insertBooking(createNewBooking({ startsAt: START, userId: U }));
    await expect(checkIn({ id: b.id, userId: U, admin: false, now: START })).rejects.toMatchObject({ status: 409, message: "Only confirmed bookings can be checked in" });
  });
  it("access control: someone else's booking is 404; unknown is 404", async () => {
    const b = await confirmed();
    await expect(checkIn({ id: b.id, userId: "intruder", admin: false, now: START })).rejects.toMatchObject({ status: 404 });
    await expect(checkIn({ id: "00000000-0000-0000-0000-000000000000", userId: U, admin: true, now: START })).rejects.toMatchObject({ status: 404 });
  });
  it("defaults now to the current time", async () => {
    const b = await confirmed({ startsAt: new Date() });
    expect((await checkIn({ id: b.id, userId: U, admin: false })).checkedInAt).not.toBeNull();
  });
  it("already checked in: returns it unchanged", async () => {
    const b = await confirmed();
    await markCheckedIn(b.id, new Date(START.getTime() - HOUR));
    const r = await checkIn({ id: b.id, userId: U, admin: false, now: START });
    expect(r.checkedInAt?.getTime()).toBe(START.getTime() - HOUR);
  });
  it("two check-ins at once: both succeed with the same single check-in time", async () => {
    const b = await confirmed();
    const [x, y] = await Promise.all([
      checkIn({ id: b.id, userId: U, admin: false, now: START }),
      checkIn({ id: b.id, userId: U, admin: false, now: new Date(START.getTime() + 1000) }),
    ]);
    expect(x.checkedInAt?.getTime()).toBe(y.checkedInAt?.getTime());
  });
  it("markCheckedIn refuses non-confirmed bookings", async () => {
    const b = await insertBooking(createNewBooking());
    expect(await markCheckedIn(b.id, START)).toBeNull();
  });
});

describe("POST /api/bookings/:id/check-in", () => {
  const req = (h: Record<string, string>) => new Request("http://x", { method: "POST", headers: h });
  const p = (id: string) => ({ params: Promise.resolve({ id }) });
  it("venue desk checks in with the admin key", async () => {
    const b = await confirmed();
    const res = await checkInRoute(req({ "x-admin-key": "adm" }), p(b.id));
    expect(res.status).toBe(200);
    expect((await res.json()).checkedInAt).toMatch(/Z$/);
  });
  it("the guest, outside the window, gets 409", async () => {
    const b = await confirmed({ startsAt: new Date(Date.now() + 10 * 24 * HOUR) });
    const res = await checkInRoute(req({ cookie: `kid=${U}` }), p(b.id));
    expect(res.status).toBe(409);
  });
  it("401 without a cookie; 404 for a bad id", async () => {
    expect((await checkInRoute(req({}), p("x"))).status).toBe(401);
    expect((await checkInRoute(req({ cookie: `kid=${U}` }), p("x"))).status).toBe(404);
  });
});
