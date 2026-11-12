import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { paypalReact } from "../../helpers/paypal-react";
import { CheckoutPanel, type CheckoutItem } from "@/components/CheckoutPanel";
import { routerPush } from "../../helpers/setup";

const NOW = new Date(2026, 10, 11, 12, 0);
const SAT = new Date(2026, 10, 14, 19, 30).toISOString();
const spa: CheckoutItem = { kind: "partner", itemId: "hugh-spa", name: "Hugh Spa", unitPrice: "95.00", perGroup: false, partyMin: 1, partyMax: 8, free: false };
const restaurant: CheckoutItem = { kind: "partner", itemId: "carasau-pasta-bar", name: "Carasau Pasta Bar", unitPrice: "90.00", perGroup: false, partyMin: 1, partyMax: 8, free: true };
const liveSpa: CheckoutItem = { kind: "live", itemId: "gp:ChIJ1", name: "Spa Uno", unitPrice: "150.00", perGroup: false, partyMin: 1, partyMax: 20, free: false, serviceId: "massage-150" };
const liveDiner: CheckoutItem = { kind: "live", itemId: "gp:ChIJ2", name: "Barbusa", unitPrice: "0.00", perGroup: false, partyMin: 1, partyMax: 20, free: true };

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
  return { url, body: init?.body ? JSON.parse(init.body as string) : undefined };
};
const pick = (day = "2026-11-14", time = "19:30") => {
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: day } });
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: time } });
};
const panel = (item = spa, o: { party?: number; clientId?: string; member?: boolean | null } = {}) =>
  render(<CheckoutPanel item={item} initialParty={o.party ?? 2} clientId={o.clientId ?? "client-123"} now={NOW} member={o.member === null ? undefined : (o.member ?? false)} />);

beforeEach(() => { paypalReact.approve = true; });
afterEach(() => vi.unstubAllGlobals());

describe("CheckoutPanel", () => {
  describe("paid: exact price + concierge fee", () => {
    it("partner: shows venue price and 20% fee, pays with PayPal, saves, then goes to the booking page", async () => {
      const f = mockApi({ status: 201, body: { id: "ORDER-9" } }, { status: 201, body: { id: "bk-1" } });
      panel();
      expect(screen.getByText("Book")).toBeInTheDocument();
      const lines = screen.getByRole("group", { name: "What you pay" });
      expect(lines).toHaveTextContent("Venue price ($95 × 2 guests)$190");
      expect(lines).toHaveTextContent("Concierge fee (20%)$38");
      expect(screen.getByTestId("total")).toHaveTextContent("$228");
      expect(screen.getByRole("link", { name: "Join for $9.99/month" })).toHaveAttribute("href", "/membership");
      expect(screen.getByText(/save \$38 on this booking/)).toBeInTheDocument();
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/booking/bk-1"));
      expect(call(f, 0)).toEqual({ url: "/api/paypal/orders", body: { kind: "partner", itemId: "hugh-spa", partySize: 2 } });
      expect(call(f, 1)).toEqual({ url: "/api/bookings", body: { kind: "partner", itemId: "hugh-spa", partySize: 2, startsAt: SAT, orderId: "ORDER-9" } });
      expect(paypalReact.options).toEqual({ clientId: "client-123", intent: "authorize", currency: "USD" });
      expect(screen.queryByText(/pay the venue's bill/)).toBeNull();
    });
    it("members: no fee line amount, no join pitch", () => {
      panel(spa, { member: true });
      expect(screen.getByRole("group", { name: "What you pay" })).toHaveTextContent("Concierge fee (members pay none)$0");
      expect(screen.getByTestId("total")).toHaveTextContent("$190");
      expect(screen.queryByRole("link", { name: /Join/ })).toBeNull();
    });
    it("live: the venue's published price, its service id is sent, and it's charged only once confirmed", async () => {
      const f = mockApi({ status: 201, body: { id: "O" } }, { status: 201, body: { id: "b" } });
      panel(liveSpa, { party: 3 });
      expect(screen.getByText("Book", { selector: "span" })).toBeInTheDocument();
      expect(screen.getByTestId("total")).toHaveTextContent("$540");
      expect(screen.getByText(/charges it once your booking is confirmed\. If the venue can't take you, the hold is released/)).toBeInTheDocument();
      expect(screen.getByLabelText("Date")).toHaveAttribute("max", "2026-12-08");
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      await waitFor(() => expect(routerPush).toHaveBeenCalled());
      expect(call(f, 0).body).toEqual({ kind: "live", itemId: "gp:ChIJ1", partySize: 3, serviceId: "massage-150" });
      expect(call(f, 1).body).toMatchObject({ serviceId: "massage-150", orderId: "O" });
    });
    it("changing guests updates the total and what's ordered", async () => {
      const f = mockApi({ status: 201, body: { id: "O" } }, { status: 201, body: { id: "b" } });
      panel();
      fireEvent.change(screen.getByLabelText("Guests"), { target: { value: "5" } });
      expect(screen.getByTestId("total")).toHaveTextContent("$570");
      pick();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      await waitFor(() => expect(routerPush).toHaveBeenCalled());
      expect(call(f, 0).body.partySize).toBe(5);
    });
    it("per-group pricing isn't multiplied by guests", () => {
      panel({ ...spa, unitPrice: "120.00", perGroup: true, partyMin: 2, partyMax: 10 }, { party: 6 });
      expect(screen.getByRole("group", { name: "What you pay" })).toHaveTextContent("Venue price (per group)$120");
      expect(screen.getByTestId("total")).toHaveTextContent("$144");
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

  describe("free: restaurants and bars", () => {
    it("partner restaurant: no PayPal, no fee; one button books it", async () => {
      const f = mockApi({ status: 201, body: { id: "bk-free" } });
      panel(restaurant);
      expect(screen.getByText("Book a table · free")).toBeInTheDocument();
      expect(screen.getByTestId("total")).toHaveTextContent("Free");
      expect(screen.queryByRole("group", { name: "What you pay" })).toBeNull();
      expect(screen.getByText(/you pay the venue's bill at the end/)).toBeInTheDocument();
      pick();
      expect(screen.queryByRole("button", { name: "PayPal" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Book this table" }));
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/booking/bk-free"));
      expect(call(f, 0)).toEqual({ url: "/api/bookings", body: { kind: "partner", itemId: "carasau-pasta-bar", partySize: 2, startsAt: SAT, free: true } });
    });
    it("any other restaurant: a request, and it works without PayPal set up", async () => {
      mockApi({ status: 201, body: { id: "bk-r" } });
      panel(liveDiner, { clientId: "" });
      expect(screen.getByText("Book a table · free")).toBeInTheDocument();
      expect(screen.getByText(/We confirm your table with the venue/)).toBeInTheDocument();
      pick();
      fireEvent.click(screen.getByRole("button", { name: "Book this table" }));
      await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/booking/bk-r"));
    });
    it("a refused free booking shows the server's reason, or a fallback", async () => {
      mockApi({ status: 429, body: { error: "You already have 5 upcoming restaurant bookings." } }, { status: 500, body: {} });
      panel(restaurant);
      pick();
      fireEvent.click(screen.getByRole("button", { name: "Book this table" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("You already have 5 upcoming restaurant bookings.");
      fireEvent.click(screen.getByRole("button", { name: "Book this table" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save the booking. Please try again."));
      expect(routerPush).not.toHaveBeenCalled();
    });
    it("free bookings never ask whether you're a member", () => {
      const f = mockApi();
      panel(restaurant, { member: null });
      expect(f).not.toHaveBeenCalled();
    });
  });

  describe("membership lookup (display only)", () => {
    it("asks /api/membership when not told, and drops the fee for members", async () => {
      const f = mockApi({ status: 200, body: { member: true } });
      panel(spa, { member: null });
      await waitFor(() => expect(screen.getByTestId("total")).toHaveTextContent("$190"));
      expect(call(f, 0).url).toBe("/api/membership");
    });
    it.each([{ status: 500, body: {} }, { status: 200, body: { member: "yes" } }])("anything else counts as not a member (%j)", async (r) => {
      const f = mockApi(r);
      panel(spa, { member: null });
      await waitFor(() => expect(f).toHaveBeenCalled());
      expect(screen.getByTestId("total")).toHaveTextContent("$228");
    });
    it("a network error counts as not a member", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
      panel(spa, { member: null });
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(screen.getByTestId("total")).toHaveTextContent("$228");
    });
    it("an answer after leaving the page is ignored", async () => {
      let release!: (r: Response) => void;
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { release = r; })));
      const { unmount } = panel(spa, { member: null });
      unmount();
      release(new Response(JSON.stringify({ member: true }), { status: 200 }));
      await new Promise((r) => setTimeout(r, 0));
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
    it("the date picker allows today through 89 days out for partners", () => {
      panel();
      expect(screen.getByLabelText("Date")).toHaveAttribute("min", "2026-11-11");
      expect(screen.getByLabelText("Date")).toHaveAttribute("max", "2027-02-08");
    });
    it("without a PayPal client id, says payments aren't set up", () => {
      panel(spa, { clientId: "" });
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
      panel({ ...spa, partyMin: 2, partyMax: 4 }, { party: 9 });
      expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("4");
      expect((screen.getByLabelText("Guests") as HTMLSelectElement).options).toHaveLength(3);
    });
    it("below the minimum starts at the minimum", () => {
      panel({ ...spa, partyMin: 2, partyMax: 4 }, { party: 1 });
      expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("2");
    });
  });

  it("defaults now to the current time", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    render(<CheckoutPanel item={spa} initialParty={2} clientId="c" />);
    expect(screen.getByLabelText("Date")).toHaveAttribute("min");
  });
});

describe("CheckoutPanel: a time filled in ahead (dinner before a show)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("starts with the given day and time, ready to book", () => {
    render(<CheckoutPanel item={liveDiner} initialParty={2} clientId="c" now={NOW} member={false} initialDay="2026-11-14" initialTime="18:00" />);
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-11-14");
    expect((screen.getByLabelText("Time") as HTMLSelectElement).value).toBe("18:00");
    expect(screen.getByRole("button", { name: "Book this table" })).toBeInTheDocument();
  });
});
