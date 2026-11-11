import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AdminBookings } from "@/components/AdminBookings";

const held = (id: string, name: string) => ({ id, name, kind: "live", itemId: "gp:1", partySize: 2, startsAt: "2026-11-15T03:30:00.000Z", amount: "120.00", currency: "USD", status: "held", paypalOrderId: "O", holdExpiresAt: null, createdAt: "x" });
type Reply = { status: number; body: unknown };
/** Ordered replies for app calls; the confirmed-arrivals list answers from `arrivals` (default none). */
function mockApi(...replies: Reply[]) {
  return mockApiWithArrivals([], ...replies);
}
function mockApiWithArrivals(arrivals: unknown[], ...replies: Reply[]) {
  const all = vi.fn(async (url: string) => {
    if (url.endsWith("status=confirmed")) return new Response(JSON.stringify({ bookings: arrivals }));
    const r = replies.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal("fetch", all);
  return { mock: { get calls() { return all.mock.calls.filter((c) => !(c[0] as string).endsWith("status=confirmed")); } } } as unknown as ReturnType<typeof vi.fn>;
}
const req = (f: ReturnType<typeof vi.fn>, n: number) => {
  const [url, init] = f.mock.calls[n] as unknown as [string, RequestInit];
  return { url, method: init?.method ?? "GET", key: new Headers(init?.headers).get("x-admin-key") };
};
const login = (k = "secret") => {
  fireEvent.change(screen.getByLabelText("Admin key"), { target: { value: k } });
  fireEvent.click(screen.getByRole("button", { name: "Open requests" }));
};

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("AdminBookings", () => {
  it("asks for the key, then lists held requests", async () => {
    const f = mockApi({ status: 200, body: { bookings: [held("b1", "Barbusa"), held("b2", "Bencotto")] } });
    render(<AdminBookings />);
    login();
    expect(await screen.findByLabelText("Barbusa")).toBeInTheDocument();
    expect(screen.getByLabelText("Bencotto")).toHaveTextContent("$120 on hold");
    expect(req(f, 0)).toEqual({ url: "/api/admin/bookings?status=held", method: "GET", key: "secret" });
    expect(sessionStorage.getItem("kickinit-admin-key")).toBe("secret");
  });
  it("confirm charges and refreshes the list", async () => {
    const f = mockApi(
      { status: 200, body: { bookings: [held("b1", "Barbusa")] } },
      { status: 200, body: { id: "b1", status: "confirmed" } },
      { status: 200, body: { bookings: [] } },
    );
    render(<AdminBookings />);
    login();
    fireEvent.click(within(await screen.findByLabelText("Barbusa")).getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText(/No requests waiting/)).toBeInTheDocument();
    expect(req(f, 1)).toEqual({ url: "/api/bookings/b1/confirm", method: "POST", key: "secret" });
  });
  it("decline releases", async () => {
    const f = mockApi({ status: 200, body: { bookings: [held("b1", "Barbusa")] } }, { status: 200, body: {} }, { status: 200, body: { bookings: [] } });
    render(<AdminBookings />);
    login();
    fireEvent.click(within(await screen.findByLabelText("Barbusa")).getByRole("button", { name: "Decline & release" }));
    await screen.findByText(/No requests waiting/);
    expect(req(f, 1).url).toBe("/api/bookings/b1/decline");
  });
  it("an action error is shown and the list stays", async () => {
    mockApi({ status: 200, body: { bookings: [held("b1", "Barbusa")] } }, { status: 409, body: { error: "Booking is already confirmed" } });
    render(<AdminBookings />);
    login();
    fireEvent.click(within(await screen.findByLabelText("Barbusa")).getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Booking is already confirmed");
    expect(screen.getByLabelText("Barbusa")).toBeInTheDocument();
  });
  describe("access control", () => {
    it("a wrong key shows the server error and keeps the form", async () => {
      mockApi({ status: 401, body: { error: "Admin key required" } });
      render(<AdminBookings />);
      login("nope");
      expect(await screen.findByRole("alert")).toHaveTextContent("Admin key required");
      expect(screen.getByLabelText("Admin key")).toBeInTheDocument();
    });
    it("reuses a key saved earlier in this browser tab", async () => {
      sessionStorage.setItem("kickinit-admin-key", "saved");
      const f = mockApi({ status: 200, body: { bookings: [] } });
      render(<AdminBookings />);
      expect(await screen.findByText(/No requests waiting/)).toBeInTheDocument();
      expect(req(f, 0).key).toBe("saved");
    });
  });
  it("arrivals: confirmed bookings not yet checked in can be checked in", async () => {
    const arrival = { ...held("a1", "Vibrato Grill Jazz"), status: "confirmed", checkedInAt: null };
    const done = { ...held("a2", "Marea"), status: "confirmed", checkedInAt: "2026-11-15T03:00:00.000Z" };
    let checkedIn = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("status=confirmed")) return new Response(JSON.stringify({ bookings: checkedIn ? [] : [arrival, done] }));
      if (url === "/api/bookings/a1/check-in" && init?.method === "POST") { checkedIn = true; return new Response(JSON.stringify({ ...arrival, checkedInAt: "x" })); }
      return new Response(JSON.stringify({ bookings: [] }));
    }));
    render(<AdminBookings />);
    login();
    const row = await screen.findByLabelText("Arrival: Vibrato Grill Jazz");
    expect(screen.queryByLabelText("Arrival: Marea")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Check in" }));
    expect(await screen.findByText("No confirmed guests waiting to check in.")).toBeInTheDocument();
  });
  it("arrivals list failing to load just shows none", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("status=confirmed")
      ? new Response(JSON.stringify({ error: "x" }), { status: 500 })
      : new Response(JSON.stringify({ bookings: [] }))));
    render(<AdminBookings />);
    login();
    expect(await screen.findByText("No confirmed guests waiting to check in.")).toBeInTheDocument();
  });
  it("still works when sessionStorage is blocked", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mockApi({ status: 200, body: { bookings: [] } });
    render(<AdminBookings />);
    login();
    expect(await screen.findByText(/No requests waiting/)).toBeInTheDocument();
    get.mockRestore(); set.mockRestore();
  });

  it("a held partner booking says it will be charged on confirm; a request-to-book doesn't", async () => {
    mockApi({ status: 200, body: { bookings: [{ ...held("p1", "Partner Spa"), kind: "partner" }, held("l1", "Barbusa")] } });
    render(<AdminBookings />);
    login();
    expect(within(await screen.findByLabelText("Partner Spa")).getByRole("button", { name: "Confirm & charge" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Barbusa")).getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });
  describe("open bills", () => {
    const conf = (id: string, name: string, o: Record<string, unknown> = {}) => ({ ...held(id, name), status: "confirmed", checkedInAt: "2026-11-15T03:40:00.000Z", fee: "4.00", overageConsent: false, settlement: null, ...o });
    const settled = (b: Record<string, unknown>, s: Record<string, unknown>) => ({ ...b, settlement: { billTotal: "130.00", capturedTotal: "120.00", overage: "14.00", overageStatus: "none", settledAt: "x", ...s } });
    function api(confirmed: unknown[], closeReply: Reply) {
      const f = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("status=held")) return new Response(JSON.stringify({ bookings: [] }));
        if (url.endsWith("status=confirmed")) return new Response(JSON.stringify({ bookings: confirmed }));
        if (url.includes("/close-bill")) return new Response(JSON.stringify(closeReply.body), { status: closeReply.status });
        throw new Error(`unexpected ${url} ${init?.method}`);
      });
      vi.stubGlobal("fetch", f);
      return f;
    }
    it("lists confirmed request-to-book bookings without a closed bill (not partners, not settled)", async () => {
      api([conf("b1", "Barbusa", { overageConsent: true }), conf("b2", "Bencotto"), conf("b3", "Partner", { kind: "partner" }), settled(conf("b4", "Done"), {})], { status: 200, body: {} });
      render(<AdminBookings />);
      login();
      const bills = await screen.findByRole("region", { name: "Open bills" });
      expect(within(bills).getByLabelText("Bill: Barbusa")).toHaveTextContent("$120 on hold · saved PayPal for overage");
      expect(within(bills).getByLabelText("Bill: Bencotto")).toHaveTextContent("overage paid at table");
      expect(within(bills).queryByLabelText("Bill: Partner")).toBeNull();
      expect(within(bills).queryByLabelText("Bill: Done")).toBeNull();
    });
    it.each([
      ["none", "Barbusa: $120 captured from the hold."],
      ["charged", "Barbusa: $120 captured from the hold. $14 charged to the guest's saved PayPal."],
      ["pay_at_table", "Barbusa: $120 captured from the hold. Collect $14 from the guest at the table."],
    ])("closing a bill (%s) posts the amount and says what happened", async (overageStatus, msg) => {
      const b = conf("b1", "Barbusa");
      const f = api([b], { status: 200, body: settled(b, { overageStatus }) });
      render(<AdminBookings />);
      login();
      const row = await screen.findByLabelText("Bill: Barbusa");
      fireEvent.change(within(row).getByLabelText(/Final bill/), { target: { value: "130.00" } });
      fireEvent.click(within(row).getByRole("button", { name: "Close bill" }));
      expect(await screen.findByText(msg)).toBeInTheDocument();
      const call = f.mock.calls.find((c) => (c[0] as string).includes("close-bill")) as unknown as [string, RequestInit];
      expect(call[0]).toBe("/api/bookings/b1/close-bill");
      expect(JSON.parse(call[1].body as string)).toEqual({ billTotal: "130.00" });
      expect(new Headers(call[1].headers).get("x-admin-key")).toBe("secret");
    });
    it("an empty amount is sent as empty and the server's error is shown", async () => {
      const f = api([conf("b1", "Barbusa")], { status: 400, body: { error: "Enter the final bill, like 96.50" } });
      render(<AdminBookings />);
      login();
      fireEvent.click(within(await screen.findByLabelText("Bill: Barbusa")).getByRole("button", { name: "Close bill" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Enter the final bill, like 96.50");
      const call = f.mock.calls.find((c) => (c[0] as string).includes("close-bill")) as unknown as [string, RequestInit];
      expect(JSON.parse(call[1].body as string)).toEqual({ billTotal: "" });
    });
    it("no open bills", async () => {
      api([], { status: 200, body: {} });
      render(<AdminBookings />);
      login();
      expect(await screen.findByText("No open bills.")).toBeInTheDocument();
    });
  });
});
