import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BookingStatus } from "@/components/BookingStatus";

const booking = (o: Record<string, unknown> = {}) => ({
  id: "b1", kind: "partner", itemId: "carasau-pasta-bar", name: "Carasau Pasta Bar", partySize: 2, startsAt: "2026-11-15T03:30:00.000Z",
  amount: "180.00", currency: "USD", status: "confirmed", paypalOrderId: "5KY78813NL6193526", holdExpiresAt: null, createdAt: "2026-11-11T00:00:00.000Z", checkedInAt: null, city: "Miami",
  fee: "0.00", serviceName: null, free: false, ...o,
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

  it("a paid booking with a concierge fee says what the total is made of", async () => {
    mock(200, booking({ amount: "360.00", fee: "60.00", kind: "live", serviceName: "60-minute massage" }));
    render(<BookingStatus id="b1" />);
    expect(await screen.findByText("$360 charged to PayPal (the venue's price plus our $60 concierge fee). Show this page when you arrive.")).toBeInTheDocument();
    expect(screen.getByText("Booked")).toBeInTheDocument();
    expect(screen.getByText("60-minute massage")).toBeInTheDocument();
  });
  it("held with a fee", async () => {
    mock(200, booking({ status: "held", amount: "228.00", fee: "38.00" }));
    render(<BookingStatus id="b1" />);
    expect(await screen.findByText(/PayPal is holding \$228 \(the venue's price plus our \$38 concierge fee\)/)).toBeInTheDocument();
  });
  it("no fee recorded (older bookings, members): no fee note", async () => {
    mock(200, booking({ fee: null }));
    render(<BookingStatus id="b1" />);
    expect(await screen.findByText("$180 charged to PayPal. Show this page when you arrive.")).toBeInTheDocument();
  });
  it.each([
    ["confirmed", "You're booked.", "CONFIRMED", "There's nothing to pay kickinit"],
    ["held", "Request sent.", "REQUESTED", "We're asking Barbusa for your table"],
    ["declined", "Not available.", "DECLINED", "The venue couldn't take this booking. Nothing was charged."],
    ["failed", "Something went wrong.", "FAILED", "This booking didn't go through. Nothing was charged."],
  ])("free restaurant booking, %s: no PayPal order, cost to book is free", async (status, title, stamp, body) => {
    mock(200, booking({ status, free: true, paypalOrderId: null, amount: "0.00", name: "Barbusa", kind: "live" }));
    render(<BookingStatus id="b1" />);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(stamp)).toBeInTheDocument();
    expect(screen.getByText(body, { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Cost to book")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByText("PayPal order")).toBeNull();
  });
  describe("rating a visit", () => {
    function api(first: unknown, rate?: { status: number; body: unknown }) {
      const f = vi.fn(async (url: string) => url.endsWith("/rating") ? new Response(JSON.stringify(rate!.body), { status: rate!.status }) : new Response(JSON.stringify(first)));
      vi.stubGlobal("fetch", f);
      return f;
    }
    const visited = { checkedInAt: "2026-11-15T03:40:00.000Z", rating: null };
    it("after check-in: pick stars, add a note, save; then it shows what you gave", async () => {
      const f = api(booking(visited), { status: 201, body: { stars: 4, note: "Great tub", createdAt: "x" } });
      render(<BookingStatus id="b1" />);
      const form = await screen.findByRole("form", { name: "Rate your visit" });
      expect(within(form).getByRole("button", { name: "Save rating" })).toBeDisabled();
      fireEvent.click(within(form).getByRole("button", { name: "4 stars" }));
      expect(within(form).getByRole("button", { name: "4 stars" })).toHaveAttribute("aria-pressed", "true");
      expect(within(form).getAllByText("★")).toHaveLength(4);
      fireEvent.change(within(form).getByLabelText(/A note/), { target: { value: "Great tub" } });
      fireEvent.click(within(form).getByRole("button", { name: "Save rating" }));
      expect(await screen.findByLabelText("Your rating")).toHaveTextContent("You rated it ★★★★☆: “Great tub”");
      expect(screen.queryByRole("form", { name: "Rate your visit" })).toBeNull();
      const call = f.mock.calls.find((c) => (c[0] as string).endsWith("/rating")) as unknown as [string, RequestInit];
      expect(call[0]).toBe("/api/bookings/b1/rating");
      expect(JSON.parse(call[1].body as string)).toEqual({ stars: 4, note: "Great tub" });
    });
    it("1 star is singular", async () => {
      api(booking(visited));
      render(<BookingStatus id="b1" />);
      expect(await screen.findByRole("button", { name: "1 star" })).toBeInTheDocument();
    });
    it("already rated, without a note", async () => {
      api(booking({ ...visited, rating: { stars: 2, note: "" } }));
      render(<BookingStatus id="b1" />);
      expect(await screen.findByLabelText("Your rating")).toHaveTextContent(/^You rated it ★★☆☆☆$/);
      expect(screen.queryByRole("form", { name: "Rate your visit" })).toBeNull();
    });
    it("not checked in yet: no rating form", async () => {
      api(booking());
      render(<BookingStatus id="b1" />);
      await screen.findByRole("heading", { name: "You're booked." });
      expect(screen.queryByRole("form", { name: "Rate your visit" })).toBeNull();
    });
    it.each([[{ status: 409, body: { error: "You've already rated this visit" } }, "You've already rated this visit"], [{ status: 500, body: {} }, "Couldn't save your rating."]])("errors are shown (%j)", async (reply, msg) => {
      api(booking(visited), reply);
      render(<BookingStatus id="b1" />);
      fireEvent.click(await screen.findByRole("button", { name: "5 stars" }));
      fireEvent.click(screen.getByRole("button", { name: "Save rating" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(msg);
    });
  });
  describe("a new time from the venue", () => {
    const offered = (o: Record<string, unknown> = {}) => booking({ status: "held", proposedStartsAt: "2026-11-15T05:00:00.000Z", amount: "360.00", fee: "60.00", name: "Spa Uno", ...o });
    const api = (first: unknown, answer?: { status: number; body: unknown }) => {
      const f = vi.fn(async (url: string) => (url.endsWith("/proposal") ? new Response(JSON.stringify(answer!.body), { status: answer!.status }) : new Response(JSON.stringify(first))));
      vi.stubGlobal("fetch", f);
      return f;
    };
    it("shows the offer; taking it confirms the booking", async () => {
      const f = api(offered(), { status: 200, body: booking({ status: "confirmed", amount: "360.00" }) });
      render(<BookingStatus id="b1" />);
      expect(await screen.findByRole("heading", { name: "A new time is offered." })).toBeInTheDocument();
      expect(screen.getByText("NEW TIME")).toBeInTheDocument();
      const offer = screen.getByRole("region", { name: "A new time from the venue" });
      expect(offer).toHaveTextContent("Spa Uno can’t do");
      expect(offer).toHaveTextContent("Take it and your $360 is charged now; say no and the hold is released.");
      fireEvent.click(within(offer).getByRole("button", { name: "Take the new time" }));
      expect(await screen.findByRole("heading", { name: "You're booked." })).toBeInTheDocument();
      const call = f.mock.calls.find((c) => (c[0] as string).endsWith("/proposal")) as unknown as [string, RequestInit];
      expect(JSON.parse(call[1].body as string)).toEqual({ accept: true });
    });
    it("saying no on a free booking cancels it; errors are shown, with a fallback", async () => {
      const f = api(offered({ free: true, paypalOrderId: null, amount: "0.00" }), { status: 409, body: { error: "There's no new time waiting for an answer" } });
      render(<BookingStatus id="b1" />);
      const offer = await screen.findByRole("region", { name: "A new time from the venue" });
      expect(offer).not.toHaveTextContent("charged");
      fireEvent.click(within(offer).getByRole("button", { name: "No thanks, cancel" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("There's no new time waiting for an answer");
      expect(JSON.parse((f.mock.calls.find((c) => (c[0] as string).endsWith("/proposal")) as unknown as [string, RequestInit])[1].body as string)).toEqual({ accept: false });
    });
    it("an error with no message falls back", async () => {
      api(offered(), { status: 500, body: {} });
      render(<BookingStatus id="b1" />);
      fireEvent.click(within(await screen.findByRole("region", { name: "A new time from the venue" })).getByRole("button", { name: "No thanks, release my hold" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your answer.");
    });
  });
});
