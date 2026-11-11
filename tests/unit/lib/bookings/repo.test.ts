// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { insertBooking, getBooking, getBookingByOrder, transition, listBookings } from "@/lib/bookings/repo";
import { getDb, setDb } from "@/lib/db";
import { useTestDb } from "../../../helpers/db";
import { createNewBooking } from "../../../helpers/factories";
import { verifyBooking } from "../../../helpers/verification";

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); });
afterEach(() => vi.unstubAllEnvs());

describe("bookings repo", () => {
  describe("happy path", () => {
    it("inserts a held booking and reads it back by id and by PayPal order", async () => {
      const b = await insertBooking(createNewBooking({ paypalOrderId: "O-1", authorizationId: "A-1" }));
      verifyBooking(b, { status: "held", userId: "user-1", kind: "partner", itemId: "marea", partySize: 2, amount: "180.00", paypalOrderId: "O-1", authorizationId: "A-1", captureId: null });
      expect(b.startsAt.toISOString()).toBe("2026-11-14T19:30:00.000Z");
      verifyBooking(await getBooking(b.id), { status: "held", id: b.id });
      verifyBooking(await getBookingByOrder("O-1"), { status: "held", id: b.id });
    });
    it("held → confirmed records the capture id", async () => {
      const b = await insertBooking(createNewBooking());
      verifyBooking(await transition(b.id, ["held"], "confirmed", "CAP-1"), { status: "confirmed", captureId: "CAP-1" });
    });
    it("held → declined keeps capture id empty", async () => {
      const b = await insertBooking(createNewBooking());
      verifyBooking(await transition(b.id, ["held"], "declined"), { status: "declined", captureId: null });
    });
    it("lists newest first, filtered by user and status", async () => {
      const a = await insertBooking(createNewBooking({ userId: "u1" }));
      const b = await insertBooking(createNewBooking({ userId: "u1" }));
      await insertBooking(createNewBooking({ userId: "u2" }));
      await transition(a.id, ["held"], "confirmed", "C");
      expect((await listBookings({ userId: "u1" })).map((x) => x.id)).toEqual([b.id, a.id]);
      expect((await listBookings({ status: "held" })).length).toBe(2);
      expect((await listBookings({ userId: "u1", status: "confirmed" })).map((x) => x.id)).toEqual([a.id]);
      expect(await listBookings()).toHaveLength(3);
    });
    it("a live booking stores the place id and a null hold expiry", async () => {
      verifyBooking(await insertBooking(createNewBooking({ kind: "live", itemId: "gp:ChIJ1", holdExpiresAt: null })), { status: "held", kind: "live", itemId: "gp:ChIJ1", holdExpiresAt: null });
    });
  });

  describe("state rules", () => {
    it("can't confirm twice (second attempt returns null and doesn't change anything)", async () => {
      const b = await insertBooking(createNewBooking());
      await transition(b.id, ["held"], "confirmed", "CAP-1");
      expect(await transition(b.id, ["held"], "confirmed", "CAP-2")).toBeNull();
      verifyBooking(await getBooking(b.id), { status: "confirmed", captureId: "CAP-1" });
    });
    it("can't decline a confirmed booking", async () => {
      const b = await insertBooking(createNewBooking());
      await transition(b.id, ["held"], "confirmed", "C");
      expect(await transition(b.id, ["held"], "declined")).toBeNull();
    });
    it("unknown ids return null", async () => {
      expect(await getBooking("00000000-0000-0000-0000-000000000000")).toBeNull();
      expect(await getBookingByOrder("nope")).toBeNull();
      expect(await transition("00000000-0000-0000-0000-000000000000", ["held"], "confirmed")).toBeNull();
    });
  });

  describe("validation (database constraints)", () => {
    it("the same PayPal order can't be booked twice", async () => {
      await insertBooking(createNewBooking({ paypalOrderId: "DUP" }));
      await expect(insertBooking(createNewBooking({ paypalOrderId: "DUP" }))).rejects.toThrow(/unique|duplicate/i);
    });
    it.each([0, 21])("party size %i is rejected", async (partySize) => {
      await expect(insertBooking(createNewBooking({ partySize }))).rejects.toThrow(/check/i);
    });
    it("an unknown kind is rejected", async () => {
      await expect(insertBooking(createNewBooking({ kind: "other" as never }))).rejects.toThrow(/check/i);
    });
  });

  describe("boundary", () => {
    it("party sizes 1 and 20 are accepted", async () => {
      verifyBooking(await insertBooking(createNewBooking({ partySize: 1 })), { status: "held", partySize: 1 });
      verifyBooking(await insertBooking(createNewBooking({ partySize: 20 })), { status: "held", partySize: 20 });
    });
    it("list limit is clamped to 1..200", async () => {
      for (let i = 0; i < 3; i++) await insertBooking(createNewBooking());
      expect(await listBookings({ limit: 0 })).toHaveLength(1);
      expect(await listBookings({ limit: 2 })).toHaveLength(2);
      expect(await listBookings({ limit: 9999 })).toHaveLength(3);
    });
  });
});

describe("getDb", () => {
  it("throws when DATABASE_URL is missing and no db was set", async () => {
    setDb(null);
    vi.stubEnv("DATABASE_URL", "");
    await expect(getDb()).rejects.toThrow("Database is not configured");
  });
  it("creates a pg pool from DATABASE_URL and retries schema setup after a failure", async () => {
    setDb(null);
    vi.stubEnv("DATABASE_URL", "postgres://u:p@127.0.0.1:1/none");
    await expect(getDb()).rejects.toThrow(); // nothing listening on port 1
    await expect(getDb()).rejects.toThrow(); // retried, not a cached rejection
    await t.reset();
  });
  it("creates the schema only once per database", async () => {
    const calls: string[] = [];
    setDb({ query: async (text: string) => { calls.push(text); return { rows: [] }; } });
    await getDb();
    await getDb();
    expect(calls).toHaveLength(1);
    await t.reset();
  });
});
