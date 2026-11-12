// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { rateBooking, ratingFor, countRatings, averageFor, MAX_NOTE } from "@/lib/ratings/ratings";
import { insertBooking, markCheckedIn, transition } from "@/lib/bookings/repo";
import { loadPassport } from "@/lib/passport/load";
import { useTestDb } from "../../helpers/db";
import { createNewBooking } from "../../helpers/factories";

const ME = "11111111-1111-4111-8111-111111111111";
let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); });
const visited = async (o: Parameters<typeof createNewBooking>[0] = {}) => {
  const b = await insertBooking(createNewBooking({ userId: ME, itemId: "hugh-spa", ...o }));
  await transition(b.id, ["held"], "confirmed");
  await markCheckedIn(b.id, new Date());
  return b;
};

describe("rateBooking", () => {
  it("happy: stars and a trimmed note, readable afterwards", async () => {
    const b = await visited();
    expect(await rateBooking({ bookingId: b.id, userId: ME, stars: 4, note: "  Lovely sauna  " })).toMatchObject({ stars: 4, note: "Lovely sauna" });
    expect(await ratingFor(b.id)).toMatchObject({ stars: 4, note: "Lovely sauna" });
  });
  it("no note is fine", async () => {
    const b = await visited();
    expect((await rateBooking({ bookingId: b.id, userId: ME, stars: 5 })).note).toBe("");
  });
  it.each([0, 6, 2.5, "5", undefined, null])("stars %j → 400", async (stars) => {
    const b = await visited();
    await expect(rateBooking({ bookingId: b.id, userId: ME, stars })).rejects.toMatchObject({ status: 400, message: "Pick 1 to 5 stars" });
  });
  it("boundary: 1 and 5 stars are allowed", async () => {
    expect((await rateBooking({ bookingId: (await visited()).id, userId: ME, stars: 1 })).stars).toBe(1);
    expect((await rateBooking({ bookingId: (await visited()).id, userId: ME, stars: 5 })).stars).toBe(5);
  });
  it("a note must be text", async () => {
    await expect(rateBooking({ bookingId: (await visited()).id, userId: ME, stars: 3, note: 7 })).rejects.toMatchObject({ status: 400, message: "A note must be text" });
  });
  it("boundary: a 280-character note is fine, 281 is too long", async () => {
    expect(MAX_NOTE).toBe(280);
    expect((await rateBooking({ bookingId: (await visited()).id, userId: ME, stars: 3, note: "x".repeat(280) })).note).toHaveLength(280);
    await expect(rateBooking({ bookingId: (await visited()).id, userId: ME, stars: 3, note: "x".repeat(281) })).rejects.toMatchObject({ status: 400, message: "Keep the note to 280 characters" });
  });
  it("someone else's booking looks like it doesn't exist", async () => {
    const b = await visited();
    await expect(rateBooking({ bookingId: b.id, userId: "someone-else", stars: 3 })).rejects.toMatchObject({ status: 404 });
    await expect(rateBooking({ bookingId: "00000000-0000-0000-0000-000000000000", userId: ME, stars: 3 })).rejects.toMatchObject({ status: 404 });
  });
  it("only after checking in", async () => {
    const b = await insertBooking(createNewBooking({ userId: ME }));
    await expect(rateBooking({ bookingId: b.id, userId: ME, stars: 3 })).rejects.toMatchObject({ status: 409, message: "You can rate a visit after you check in" });
  });
  it("once per visit", async () => {
    const b = await visited();
    await rateBooking({ bookingId: b.id, userId: ME, stars: 3 });
    await expect(rateBooking({ bookingId: b.id, userId: ME, stars: 5 })).rejects.toMatchObject({ status: 409, message: "You've already rated this visit" });
    expect((await ratingFor(b.id))!.stars).toBe(3);
  });
});

describe("counts and averages", () => {
  it("no ratings yet", async () => {
    expect(await ratingFor("nope")).toBeNull();
    expect(await countRatings(ME)).toBe(0);
    expect(await averageFor("hugh-spa")).toBeNull();
  });
  it("average to one decimal, per venue; count per guest", async () => {
    for (const stars of [5, 4, 4]) await rateBooking({ bookingId: (await visited()).id, userId: ME, stars });
    await rateBooking({ bookingId: (await visited({ itemId: "the-broad" })).id, userId: ME, stars: 1 });
    expect(await averageFor("hugh-spa")).toEqual({ average: 4.3, count: 3 });
    expect(await countRatings(ME)).toBe(4);
    expect(await countRatings("other")).toBe(0);
  });
  it("10 ratings unlock the Critic badge in the passport", async () => {
    const before = (await loadPassport(ME)).badges.find((x) => x.id === "ach-critic")!;
    expect(before).toMatchObject({ current: 0, target: 10, unlocked: false });
    for (let i = 0; i < 9; i++) await rateBooking({ bookingId: (await visited()).id, userId: ME, stars: 4 });
    expect((await loadPassport(ME)).badges.find((x) => x.id === "ach-critic")).toMatchObject({ current: 9, unlocked: false });
    await rateBooking({ bookingId: (await visited()).id, userId: ME, stars: 4 });
    expect((await loadPassport(ME)).badges.find((x) => x.id === "ach-critic")).toMatchObject({ current: 10, unlocked: true });
  });
});
