// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { toResponse } from "@/lib/paypal/http";
import { BookingError } from "@/lib/bookings/service";
import { PlacesError } from "@/lib/places/client";

afterEach(() => vi.restoreAllMocks());
async function verifyMapped(err: unknown, status: number, error: string) {
  const res = toResponse(err);
  expect(res.status).toBe(status);
  expect((await res.json()).error).toBe(error);
}

describe("toResponse", () => {
  it("BookingError keeps its status", () => verifyMapped(new BookingError(409, "Booking is already confirmed"), 409, "Booking is already confirmed"));
  it("Google 404 → Place not found", () => verifyMapped(new PlacesError(404, "Google Places NOT_FOUND: x"), 404, "Place not found"));
  it("other Google errors → 502 without Google's message", () => verifyMapped(new PlacesError(403, "Google Places PERMISSION_DENIED: key"), 502, "Live venue lookup failed. Try again in a moment."));
  it.each(["Database is not configured", "Live search is not configured"])("%s → 503", (m) => verifyMapped(new Error(m), 503, m));
  it("database errors never leak their message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await verifyMapped(Object.assign(new Error('relation "secret_table" does not exist'), { code: "42P01" }), 500, "Unexpected error");
  });
});
