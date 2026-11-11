import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookingStatus } from "@/components/BookingStatus";

const booking = (o: Record<string, unknown> = {}) => ({
  id: "b1", kind: "partner", itemId: "marea", name: "Ristorante Marea", partySize: 2, startsAt: "2026-11-15T03:30:00.000Z",
  amount: "180.00", currency: "USD", status: "confirmed", paypalOrderId: "5KY78813NL6193526", holdExpiresAt: null, createdAt: "2026-11-11T00:00:00.000Z", checkedInAt: null, city: "Miami", ...o,
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
  describe("check-in", () => {
    const seq = (...rs: { status: number; body: unknown }[]) => {
      const f = vi.fn(async () => { const r = rs.shift()!; return new Response(JSON.stringify(r.body), { status: r.status }); });
      vi.stubGlobal("fetch", f);
      return f;
    };
    it("confirmed and not checked in: the button checks you in and links to the passport", async () => {
      const f = seq({ status: 200, body: booking() }, { status: 200, body: booking({ checkedInAt: "2026-11-15T03:00:00.000Z" }) });
      render(<BookingStatus id="b1" />);
      fireEvent.click(await screen.findByRole("button", { name: "I’m here: check in" }));
      expect(await screen.findByRole("link", { name: "See your passport" })).toHaveAttribute("href", "/passport");
      expect(screen.queryByRole("button", { name: "I’m here: check in" })).toBeNull();
      expect(f.mock.calls[1]).toEqual(["/api/bookings/b1/check-in", { method: "POST" }]);
    });
    it("too early: shows why", async () => {
      seq({ status: 200, body: booking() }, { status: 409, body: { error: "Check-in opens 2 hours before your booking" } });
      render(<BookingStatus id="b1" />);
      fireEvent.click(await screen.findByRole("button", { name: "I’m here: check in" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Check-in opens 2 hours before");
    });
    it("error with no message", async () => {
      seq({ status: 200, body: booking() }, { status: 500, body: {} });
      render(<BookingStatus id="b1" />);
      fireEvent.click(await screen.findByRole("button", { name: "I’m here: check in" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't check you in.");
    });
    it("held bookings can't be checked in", async () => {
      seq({ status: 200, body: booking({ status: "held" }) });
      render(<BookingStatus id="b1" />);
      await screen.findByRole("heading", { name: "Request sent." });
      expect(screen.queryByRole("button", { name: "I’m here: check in" })).toBeNull();
    });
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
