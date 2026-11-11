// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  insertGift, getGift, getGiftByCode, transitionGift, openGiftsPastDeadline,
  insertContribution, getContributionByOrder, listContributions, setContributionStatus,
} from "@/lib/gifts/repo";
import { useTestDb } from "../../../helpers/db";
import { createNewGift, createNewContribution } from "../../../helpers/factories";

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); });

describe("gifts repo", () => {
  it("inserts an open gift with an unguessable redeem code and reads it by id and code", async () => {
    const g = await insertGift(createNewGift());
    expect(g).toMatchObject({ status: "open", mode: "pool", amountCents: 19000, recipientName: "Mom", note: "Happy 60th!", bookingId: null, organizerName: "Kavon" });
    expect(g.redeemCode).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await getGift(g.id))?.id).toBe(g.id);
    expect((await getGiftByCode(g.redeemCode))?.id).toBe(g.id);
    expect(g.deadline.toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });
  it("redeem codes differ per gift", async () => {
    const a = await insertGift(createNewGift());
    const b = await insertGift(createNewGift());
    expect(a.redeemCode).not.toBe(b.redeemCode);
  });
  it("unknown id/code return null", async () => {
    expect(await getGift("nope")).toBeNull();
    expect(await getGiftByCode("nope")).toBeNull();
  });
  it("transitions atomically and records the booking on redeem", async () => {
    const g = await insertGift(createNewGift());
    expect((await transitionGift(g.id, ["open"], "funded"))?.status).toBe("funded");
    expect(await transitionGift(g.id, ["open"], "funded")).toBeNull();
    expect(await transitionGift(g.id, ["open"], "expired")).toBeNull();
    expect((await transitionGift(g.id, ["funded"], "redeemed", "bk-1"))).toMatchObject({ status: "redeemed", bookingId: "bk-1" });
  });
  it("finds only open gifts whose deadline has passed (boundary: exactly at the deadline counts)", async () => {
    const due = await insertGift(createNewGift({ deadline: new Date("2026-11-12T00:00:00Z") }));
    await insertGift(createNewGift({ deadline: new Date("2026-11-12T00:00:00.001Z") }));
    const funded = await insertGift(createNewGift({ deadline: new Date("2026-11-01T00:00:00Z") }));
    await transitionGift(funded.id, ["open"], "funded");
    expect((await openGiftsPastDeadline(new Date("2026-11-12T00:00:00Z"))).map((g) => g.id)).toEqual([due.id]);
  });
  it.each([
    ["party size 0", { partySize: 0 }],
    ["amount 0", { amountCents: 0 }],
    ["unknown mode", { mode: "group" as never }],
  ])("rejects %s", async (_l, o) => {
    await expect(insertGift(createNewGift(o))).rejects.toThrow(/check/i);
  });
});

describe("contributions repo", () => {
  it("inserts held contributions, lists them in order, finds by PayPal order", async () => {
    const g = await insertGift(createNewGift());
    const a = await insertContribution(createNewContribution(g.id, { name: "Ana", paypalOrderId: "P1" }));
    const b = await insertContribution(createNewContribution(g.id, { name: "Ben" }));
    expect(a).toMatchObject({ status: "held", amountCents: 5000, captureId: null, giftId: g.id });
    expect((await listContributions(g.id)).map((c) => c.id)).toEqual([a.id, b.id]);
    expect((await getContributionByOrder("P1"))?.id).toBe(a.id);
    expect(await getContributionByOrder("nope")).toBeNull();
  });
  it("status changes only from the expected state", async () => {
    const g = await insertGift(createNewGift());
    const c = await insertContribution(createNewContribution(g.id));
    expect(await setContributionStatus(c.id, "held", "captured", "CAP")).toBe(true);
    expect(await setContributionStatus(c.id, "held", "voided")).toBe(false);
    expect((await listContributions(g.id))[0]).toMatchObject({ status: "captured", captureId: "CAP" });
  });
  it("a PayPal order can only fund one contribution", async () => {
    const g = await insertGift(createNewGift());
    await insertContribution(createNewContribution(g.id, { paypalOrderId: "DUP" }));
    await expect(insertContribution(createNewContribution(g.id, { paypalOrderId: "DUP" }))).rejects.toThrow(/unique|duplicate/i);
  });
  it("a contribution must belong to a real gift and be positive", async () => {
    await expect(insertContribution(createNewContribution("no-such-gift"))).rejects.toThrow(/foreign key/i);
    const g = await insertGift(createNewGift());
    await expect(insertContribution(createNewContribution(g.id, { amountCents: 0 }))).rejects.toThrow(/check/i);
  });
});
