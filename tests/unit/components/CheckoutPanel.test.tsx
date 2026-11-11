import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { paypalReact } from "../../helpers/paypal-react";
import { CheckoutPanel, type CheckoutItem } from "@/components/CheckoutPanel";
import { routerPush } from "../../helpers/setup";

const NOW = new Date(2026, 10, 11, 12, 0);
const partner: CheckoutItem = { kind: "partner", itemId: "marea", name: "Ristorante Marea", unitPrice: "90.00", perGroup: false, partyMin: 1, partyMax: 8 };
const live: CheckoutItem = { kind: "live", itemId: "gp:ChIJ1", name: "Barbusa", unitPrice: "60.00", perGroup: false, partyMin: 1, partyMax: 20 };

type Reply = { status: number; body: unknown };
function mockApi(...replies: Reply[]) {
  const f = vi.fn(async () => {
    const r = replies.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const call = (f: ReturnType<typeof vi.fn>, n: number) => {
  const [url, init] = f.mock.calls[n] as unknown as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) };
};
const pick = (day = "2026-11-14", time = "19:30") => {
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: day } });
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: time } });
};
const panel = (item = partner, o: { party?: number; clientId?: string } = {}) =>
  render(<CheckoutPanel item={item} initialParty={o.party ?? 2} clientId={o.clientId ?? "client-123"} now={NOW} />);

beforeEach(() => { paypalReact.approve = true; });
afterEach(() => vi.unstubAllGlobals());

describe("CheckoutPanel", () => {
  describe("happy path", () => {
    it("partner: pick a time, pay with PayPal, booking is saved, then go to the booking page", async () => {
      const f = mockApi({ status: 201, body: { id: "ORDER-9" } }, { status: 201, body: { id: "bk-1" } });
      panel();
      expect(screen.getByText("Instant book · kickinit partner")).toBeInTheDocument();
      expect(screen.getByTestId("total")).toHaveTextContent("$180");
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/booking/bk-1"));
      expect(call(f, 0)).toEqual({ url: "/api/paypal/orders", body: { kind: "partner", itemId: "marea", partySize: 2 } });
      expect(call(f, 1)).toEqual({ url: "/api/bookings", body: { orderId: "ORDER-9", kind: "partner", itemId: "marea", partySize: 2, startsAt: new Date(2026, 10, 14, 19, 30).toISOString() } });
      expect(paypalReact.options).toEqual({ clientId: "client-123", intent: "authorize", currency: "USD" });
    });
    it("live: labelled as a request with an estimate, and the copy explains the hold", () => {
      panel(live, { party: 3 });
      expect(screen.getByText("Request to book")).toBeInTheDocument();
      expect(screen.getByText("Est. $60 × 3 guests")).toBeInTheDocument();
      expect(screen.getByTestId("total")).toHaveTextContent("$180");
      expect(screen.getByText(/only charged once the venue confirms/)).toBeInTheDocument();
    });
    it("changing guests updates the total and what's ordered", async () => {
      const f = mockApi({ status: 201, body: { id: "O" } }, { status: 201, body: { id: "b" } });
      panel();
      fireEvent.change(screen.getByLabelText("Guests"), { target: { value: "5" } });
      expect(screen.getByTestId("total")).toHaveTextContent("$450");
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      await waitFor(() => expect(routerPush).toHaveBeenCalled());
      expect(call(f, 0).body.partySize).toBe(5);
    });
    it("per-group pricing shows a flat price", () => {
      panel({ ...partner, unitPrice: "120.00", perGroup: true, partyMin: 2, partyMax: 10 }, { party: 6 });
      expect(screen.getByText("Flat price for the group")).toBeInTheDocument();
      expect(screen.getByTestId("total")).toHaveTextContent("$120");
    });
    it("shows a progress state while saving the booking", async () => {
      let release!: (r: Response) => void;
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "O" }), { status: 201 }))
        .mockReturnValueOnce(new Promise<Response>((r) => { release = r; })));
      panel();
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("status")).toHaveTextContent("Securing your booking");
      release(new Response(JSON.stringify({ id: "b" }), { status: 201 }));
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/booking/b"));
    });
  });

  describe("validation", () => {
    it("no PayPal button until both date and time are chosen", () => {
      panel();
      expect(screen.queryByRole("button", { name: "PayPal" })).toBeNull();
      expect(screen.getByText("Choose a date and time to continue.")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-14" } });
      expect(screen.queryByRole("button", { name: "PayPal" })).toBeNull();
      fireEvent.change(screen.getByLabelText("Time"), { target: { value: "19:30" } });
      expect(screen.getByRole("button", { name: "PayPal" })).toBeInTheDocument();
    });
    it("the date picker allows today through 89 days out", () => {
      panel();
      expect(screen.getByLabelText("Date")).toHaveAttribute("min", "2026-11-11");
      expect(screen.getByLabelText("Date")).toHaveAttribute("max", "2027-02-08");
    });
    it("without a PayPal client id, says payments aren't set up", () => {
      panel(partner, { clientId: "" });
      pick();
      expect(screen.getByText("Payments aren’t set up yet.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "PayPal" })).toBeNull();
    });
  });

  describe("errors", () => {
    it("order creation fails: shows the server's reason, no booking call", async () => {
      const f = mockApi({ status: 400, body: { error: "Party size for X must be from 1 to 2" } });
      panel();
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Party size for X must be from 1 to 2");
      expect(f).toHaveBeenCalledTimes(1);
    });
    it("order creation fails with no message: generic text", async () => {
      mockApi({ status: 500, body: {} });
      panel();
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start the payment.");
    });
    it("booking save fails: shows why and lets you try again", async () => {
      mockApi({ status: 201, body: { id: "O" } }, { status: 400, body: { error: "The payment amount doesn't match the price, so we released the hold" } });
      panel();
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("released the hold");
      expect(screen.getByRole("button", { name: "PayPal" })).toBeInTheDocument();
      expect(routerPush).not.toHaveBeenCalled();
    });
    it("booking save fails with no message: reassures nothing was charged", async () => {
      mockApi({ status: 201, body: { id: "O" } }, { status: 500, body: {} });
      panel();
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was charged");
    });
    it("PayPal itself errors: friendly message", async () => {
      paypalReact.approve = false;
      mockApi({ status: 201, body: { id: "O" } });
      panel();
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("PayPal ran into a problem. Nothing was charged");
    });
  });

  describe("boundary", () => {
    it("starting party is clamped to the venue's range", () => {
      panel({ ...partner, partyMin: 2, partyMax: 4 }, { party: 9 });
      expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("4");
      expect((screen.getByLabelText("Guests") as HTMLSelectElement).options).toHaveLength(3);
    });
    it("below the minimum starts at the minimum", () => {
      panel({ ...partner, partyMin: 2, partyMax: 4 }, { party: 1 });
      expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("2");
    });
  });

  it("defaults now to the current time", () => {
    render(<CheckoutPanel item={partner} initialParty={2} clientId="c" />);
    expect(screen.getByLabelText("Date")).toHaveAttribute("min");
  });
});
