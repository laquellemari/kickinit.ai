import { describe, it, expect } from "vitest";
import { evaluateQuest, evaluateAllQuests, ALL_QUESTS, matchesFilter } from "@/lib/quests/engine";
import { createBooking, createBookingSeries, createQuest, HOME, BASE, DAY } from "../../helpers/factories";
import { verifyQuestProgress } from "../../helpers/verification";

describe("evaluateQuest — count", () => {
  describe("happy path", () => {
    it("3 Italian dinners completes Pasta Pilgrim", () => {
      verifyQuestProgress(createQuest(), createBookingSeries(3, 7), HOME, { current: 3, complete: true });
    });
    it("matches when a booking has any of several tags", () => {
      const q = createQuest({ tags: ["meditation", "breathwork"], count: 2 });
      const b = [createBooking({ tags: ["meditation"] }), createBooking({ tags: ["breathwork"] })];
      verifyQuestProgress(q, b, HOME, { current: 2, complete: true });
    });
    it("caps current at the target", () => {
      verifyQuestProgress(createQuest(), createBookingSeries(5, 1), HOME, { current: 3, complete: true });
    });
    it("ignores bookings with non-matching tags", () => {
      verifyQuestProgress(createQuest(), createBookingSeries(3, 1, { tags: ["thai"] }), HOME, { current: 0, complete: false });
    });
  });

  describe("only real, attended, in-app bookings count", () => {
    it.each([
      ["held (not yet charged)", { status: "held" as const }],
      ["voided", { status: "voided" as const }],
      ["refunded", { status: "refunded" as const }],
      ["not checked in", { checkedIn: false }],
      ["booked outside the app", { source: "external" as const }],
      ["bought as a gift for someone else", { isGift: true }],
    ])("excludes a booking that is %s", (_label, override) => {
      const b = [...createBookingSeries(2, 1), createBooking({ ...override, startsAt: new Date(BASE.getTime() + 5 * DAY) })];
      verifyQuestProgress(createQuest(), b, HOME, { current: 2, complete: false });
    });
  });

  describe("time windows", () => {
    it("counts the best rolling window, not all-time", () => {
      // 5 restaurant nights, but only 4 fall inside any 7-day window
      const b = [...createBookingSeries(4, 1, { tags: ["restaurant"] }), createBooking({ tags: ["restaurant"], startsAt: new Date(BASE.getTime() + 30 * DAY) })];
      verifyQuestProgress(createQuest({ tags: ["restaurant"], count: 5, window_days: 7 }), b, HOME, { current: 4, complete: false });
    });
    it("boundary: window_days - 1 apart is inside the window", () => {
      const b = [createBooking(), createBooking({ startsAt: new Date(BASE.getTime() + 6 * DAY) })];
      verifyQuestProgress(createQuest({ count: 2, window_days: 7 }), b, HOME, { current: 2, complete: true });
    });
    it("boundary: exactly window_days apart is outside the window", () => {
      const b = [createBooking(), createBooking({ startsAt: new Date(BASE.getTime() + 7 * DAY) })];
      verifyQuestProgress(createQuest({ count: 2, window_days: 7 }), b, HOME, { current: 1, complete: false });
    });
    it("bookings given out of order are still windowed correctly", () => {
      const b = createBookingSeries(3, 1).reverse();
      verifyQuestProgress(createQuest({ count: 3, window_days: 3 }), b, HOME, { current: 3, complete: true });
    });
  });

  describe("filters", () => {
    const f = (filter: string, booking: Parameters<typeof createBooking>[0]) =>
      matchesFilter(filter, createBooking(booking), HOME);

    it.each([
      ["evening", { localHour: 19 }, true], ["evening", { localHour: 18 }, false],
      ["late", { localHour: 22 }, true], ["late", { localHour: 21 }, false], ["late", { localHour: 2 }, true], ["late", { localHour: 5 }, false],
      ["early", { localHour: 7 }, true], ["early", { localHour: 8 }, false],
      ["duo", { partySize: 2 }, true], ["duo", { partySize: 3 }, false],
      ["party4", { partySize: 4 }, true], ["party4", { partySize: 3 }, false],
      ["home_city", { city: "Miami" }, true], ["home_city", { city: "Austin" }, false],
      ["traveling", { city: "Austin" }, true], ["traveling", { city: "Miami" }, false],
      ["international", { country: "MX" }, true], ["international", { country: "US" }, false],
      ["last_minute", { bookedAt: new Date(BASE.getTime() - 48 * 3_600_000) }, true],
      ["last_minute", { bookedAt: new Date(BASE.getTime() - 48 * 3_600_000 - 1) }, false],
      ["sunset", { tags: ["sup", "sunset"] }, true], ["sunset", { tags: ["sup"] }, false],
      ["pasta", { tags: ["cooking_class", "pasta"] }, true], ["pasta", { tags: ["cooking_class"] }, false],
    ] as const)("%s with %o -> %s", (filter, booking, expected) => {
      expect(f(filter, booking as Parameters<typeof createBooking>[0])).toBe(expected);
    });

    it("applies the filter inside a quest", () => {
      const q = createQuest({ tags: ["wellness"], count: 2, filter: "evening" });
      const b = [createBooking({ tags: ["wellness"], localHour: 20 }), createBooking({ tags: ["wellness"], localHour: 10 })];
      verifyQuestProgress(q, b, HOME, { current: 1, complete: false });
    });
  });
});

describe("evaluateQuest — distinct / same", () => {
  it("distinct counts unique attribute values", () => {
    const q = createQuest({ type: "distinct", tags: ["restaurant"], count: 3, attribute: "cuisine" });
    const b = ["thai", "thai", "french", "indian"].map((c) => createBooking({ tags: ["restaurant"], cuisine: c }));
    verifyQuestProgress(q, b, HOME, { current: 3, complete: true });
  });
  it("distinct ignores bookings missing the attribute", () => {
    const q = createQuest({ type: "distinct", tags: ["restaurant"], count: 2, attribute: "neighborhood" });
    const b = [createBooking({ tags: ["restaurant"], neighborhood: "Wynwood" }), createBooking({ tags: ["restaurant"] })];
    verifyQuestProgress(q, b, HOME, { current: 1, complete: false });
  });
  it("same counts the most repeated value", () => {
    const q = createQuest({ type: "same", tags: ["restaurant"], count: 3, attribute: "venue" });
    const b = ["Marea", "Marea", "Cote", "Marea"].map((v) => createBooking({ tags: ["restaurant"], venue: v }));
    verifyQuestProgress(q, b, HOME, { current: 3, complete: true });
  });
  it("same with no matches is 0", () => {
    const q = createQuest({ type: "same", tags: ["spa"], count: 3, attribute: "companion" });
    verifyQuestProgress(q, [], HOME, { current: 0, complete: false });
  });
});

describe("evaluateQuest — weekly_streak", () => {
  const q = createQuest({ type: "weekly_streak", tags: ["wellness"], count: 4, window_days: 28 });
  it("4 consecutive weeks completes", () => {
    verifyQuestProgress(q, createBookingSeries(4, 7, { tags: ["wellness"] }), HOME, { current: 4, complete: true });
  });
  it("a missed week breaks the streak", () => {
    const b = [0, 7, 21, 28].map((d) => createBooking({ tags: ["wellness"], startsAt: new Date(BASE.getTime() + d * DAY) }));
    verifyQuestProgress(q, b, HOME, { current: 2, complete: false });
  });
  it("two bookings in the same week count as one week", () => {
    const b = [0, 2, 7].map((d) => createBooking({ tags: ["wellness"], startsAt: new Date(BASE.getTime() + d * DAY) }));
    verifyQuestProgress(q, b, HOME, { current: 2, complete: false });
  });
  it("Sunday then Monday are consecutive weeks", () => {
    const b = [6, 7].map((d) => createBooking({ tags: ["wellness"], startsAt: new Date(BASE.getTime() + d * DAY) }));
    verifyQuestProgress(q, b, HOME, { current: 2, complete: false });
  });
});

describe("evaluateQuest — gift", () => {
  const q = createQuest({ type: "gift", tags: ["gift"], count: 1, filter: "spa" });
  it("a paid spa gift completes it, even though the giver never checks in", () => {
    verifyQuestProgress(q, [createBooking({ isGift: true, checkedIn: false, tags: ["spa", "massage"] })], HOME, { current: 1, complete: true });
  });
  it("a gift of the wrong kind does not count", () => {
    verifyQuestProgress(q, [createBooking({ isGift: true, tags: ["workshop"] })], HOME, { current: 0, complete: false });
  });
  it("an unpaid (held) gift does not count", () => {
    verifyQuestProgress(q, [createBooking({ isGift: true, status: "held", tags: ["spa"] })], HOME, { current: 0, complete: false });
  });
  it("booking a spa for yourself does not count as a gift", () => {
    verifyQuestProgress(q, [createBooking({ tags: ["spa"] })], HOME, { current: 0, complete: false });
  });
});

describe("evaluateQuest — validation", () => {
  it("rejects an unknown requirement type", () => {
    const q = createQuest({ type: "bogus" as never });
    expect(() => evaluateQuest(q, [], HOME)).toThrow("Unknown requirement type: bogus");
  });
  it("rejects a count of 0", () => {
    expect(() => evaluateQuest(createQuest({ count: 0 }), [], HOME)).toThrow("Requirement count must be a positive integer");
  });
  it("rejects a non-integer count", () => {
    expect(() => evaluateQuest(createQuest({ count: 1.5 }), [], HOME)).toThrow("Requirement count must be a positive integer");
  });
  it("rejects a window of 0 days", () => {
    expect(() => evaluateQuest(createQuest({ window_days: 0 }), [], HOME)).toThrow("Window must be a positive number of days");
  });
  it("rejects distinct/same without an attribute", () => {
    expect(() => evaluateQuest(createQuest({ type: "distinct" }), [], HOME)).toThrow("distinct requirement needs an attribute");
    expect(() => evaluateQuest(createQuest({ type: "same" }), [], HOME)).toThrow("same requirement needs an attribute");
  });
  it("rejects a gift requirement without a filter", () => {
    expect(() => evaluateQuest(createQuest({ type: "gift" }), [], HOME)).toThrow("gift requirement needs a filter");
  });
});

describe("evaluateQuest — boundary", () => {
  it("count 1 with one booking completes", () => {
    verifyQuestProgress(createQuest({ count: 1 }), [createBooking()], HOME, { current: 1, complete: true });
  });
  it("target - 1 is not complete", () => {
    verifyQuestProgress(createQuest(), createBookingSeries(2, 1), HOME, { current: 2, complete: false });
  });
  it("no bookings is 0 progress", () => {
    verifyQuestProgress(createQuest(), [], HOME, { current: 0, complete: false });
  });
});

describe("the shipped quest catalog", () => {
  it("has 403 quests and every one evaluates without error", () => {
    expect(ALL_QUESTS).toHaveLength(403);
    const results = evaluateAllQuests(createBookingSeries(10, 3), HOME);
    expect(results).toHaveLength(403);
    expect(new Set(results.map((r) => r.questId)).size).toBe(403);
  });
  it("3 Italian dinners completes the real Pasta Pilgrim quest", () => {
    const r = evaluateAllQuests(createBookingSeries(3, 7), HOME).find((x) => x.questId === "culinary-pasta-pilgrim")!;
    expect(r.complete).toBe(true);
  });
});
