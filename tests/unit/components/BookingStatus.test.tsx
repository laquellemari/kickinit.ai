import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookingStatus } from "@/components/BookingStatus";

const booking = (o: Record<string, unknown> = {}) => ({
  id: "b1", kind: "partner", itemId: "marea", name: "Ristorante Marea", partySize: 2, startsAt: "2026-11-15T03:30:00.000Z",
  amount: "180.00", currency: "USD", status: "confirmed", paypalOrderId: "5KY78813NL6193526", holdExpiresAt: null, createdAt: "2026-11-11T00:00:00.000Z", ...o,
});
const mock = (status: number, body: unknown) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", f);
  return f;
};
afterEach(() => vi.unstubAllGlobals());

describe("BookingStatus", () => {
  it.each([
    ["confirmed", "You're booked.", "CONFIRMED", "$180 charged to PayPal", "Paid"],
    ["held", "Request sent.", "ON HOLD", "PayPal is holding $180", "Amount"],
    ["declined", "Not available.", "RELEASED", "You weren't charged", "Amount"],
    ["failed", "Something went wrong.", "FAILED", "didn't go through", "Amount"],
  ])("%s", async (status, title, stamp, body, amountLabel) => {
    const f = mock(200, booking({ status }));
    render(<BookingStatus id="b1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your booking");
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(stamp)).toBeInTheDocument();
    expect(screen.getByText(body, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(amountLabel)).toBeInTheDocument();
    expect(screen.getByText("5KY78813NL6193526")).toBeInTheDocument();
    expect(screen.getByText("2 guests")).toBeInTheDocument();
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/bookings/b1");
  });
  it("not yours / not found shows the server's message", async () => {
    mock(404, { error: "Booking not found" });
    render(<BookingStatus id="x" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Booking not found");
  });
  it("error with no message falls back", async () => {
    mock(500, {});
    render(<BookingStatus id="x" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this booking.");
  });
});
