import { describe, it, expect } from "vitest";
import { money, guests, duration } from "@/lib/format";

describe("format", () => {
  it.each([["180.00", "$180"], ["59.97", "$59.97"], ["1234.5", "$1,234.50"], ["0", "$0"]])("money(%s) = %s", (v, out) => expect(money(v)).toBe(out));
  it("money in another currency", () => expect(money("10", "EUR")).toBe("€10"));
  it.each([[1, "1 guest"], [2, "2 guests"], [0, "0 guests"]])("guests(%i)", (n, out) => expect(guests(n)).toBe(out));
  it.each([[45, "45 min"], [60, "1 hr"], [90, "1 hr 30 min"], [1440, "1 day"], [2880, "2 days"], [0, ""]])("duration(%i) = %s", (m, out) => expect(duration(m)).toBe(out));
});
