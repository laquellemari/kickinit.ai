import { describe, it, expect } from "vitest";
import { TIME_SLOTS, slotLabel, isoDay, startsAtIso } from "@/lib/slots";

describe("slots", () => {
  it("27 half-hour slots from 9:00 to 22:00", () => {
    expect(TIME_SLOTS).toHaveLength(27);
    expect(TIME_SLOTS[0]).toBe("09:00");
    expect(TIME_SLOTS[1]).toBe("09:30");
    expect(TIME_SLOTS.at(-1)).toBe("22:00");
  });
  it.each([["09:00", "9:00 am"], ["12:00", "12:00 pm"], ["12:30", "12:30 pm"], ["19:30", "7:30 pm"], ["00:15", "12:15 am"]])("%s → %s", (t, l) => expect(slotLabel(t)).toBe(l));
  it("isoDay pads month and day", () => expect(isoDay(new Date(2026, 0, 5))).toBe("2026-01-05"));
  it("startsAtIso combines local date and time", () => {
    expect(startsAtIso("2026-11-14", "19:30")).toBe(new Date(2026, 10, 14, 19, 30).toISOString());
  });
  it.each([["", "19:30"], ["2026-11-14", ""], ["2026-13-45", "19:30"]])("startsAtIso(%s, %s) is null", (d, t) => expect(startsAtIso(d, t)).toBeNull());
});
