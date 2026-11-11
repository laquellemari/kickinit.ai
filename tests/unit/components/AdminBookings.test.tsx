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
    fireEvent.click(within(await screen.findByLabelText("Barbusa")).getByRole("button", { name: "Confirm & charge" }));
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
    fireEvent.click(within(await screen.findByLabelText("Barbusa")).getByRole("button", { name: "Confirm & charge" }));
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
    const arrival = { ...held("a1", "The Blue Room"), status: "confirmed", checkedInAt: null };
    const done = { ...held("a2", "Marea"), status: "confirmed", checkedInAt: "2026-11-15T03:00:00.000Z" };
    let checkedIn = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("status=confirmed")) return new Response(JSON.stringify({ bookings: checkedIn ? [] : [arrival, done] }));
      if (url === "/api/bookings/a1/check-in" && init?.method === "POST") { checkedIn = true; return new Response(JSON.stringify({ ...arrival, checkedInAt: "x" })); }
      return new Response(JSON.stringify({ bookings: [] }));
    }));
    render(<AdminBookings />);
    login();
    const row = await screen.findByLabelText("Arrival: The Blue Room");
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
});
