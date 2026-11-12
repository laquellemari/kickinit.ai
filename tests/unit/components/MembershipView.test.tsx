import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { paypalReact } from "../../helpers/paypal-react";
import { MembershipView } from "@/components/MembershipView";

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
  const [url, init] = f.mock.calls[n] as unknown as [string, RequestInit | undefined];
  return { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined };
};
const notMember = { status: 200, body: { member: false, status: null, since: null, price: "9.99" } };
const member = { status: 200, body: { member: true, status: "ACTIVE", since: "2026-11-11T12:00:00.000Z", price: "9.99" } };

beforeEach(() => { paypalReact.approve = true; });
afterEach(() => vi.unstubAllGlobals());

describe("MembershipView", () => {
  it("pitches the membership and checks your status first", () => {
    mockApi(notMember);
    render(<MembershipView clientId="c" />);
    expect(screen.getByRole("heading", { name: "No fees, ever. $9.99 a month." })).toBeInTheDocument();
    expect(screen.getByText(/without our 20% concierge fee/)).toBeInTheDocument();
    expect(screen.getByText("Restaurants and bars stay free to book for everyone.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Checking your membership");
  });
  it("join: PayPal subscription created on our server, approved, then activated", async () => {
    const f = mockApi(notMember, { status: 201, body: { id: "I-SUB1" } }, { status: 200, body: { member: true, status: "ACTIVE", since: "2026-11-11T12:00:00.000Z" } });
    render(<MembershipView clientId="c" />);
    fireEvent.click(await screen.findByRole("button", { name: "PayPal" }));
    expect(await screen.findByText(/You’re a member since November 11, 2026/)).toBeInTheDocument();
    expect(paypalReact.options).toEqual({ clientId: "c", vault: true, intent: "subscription" });
    expect(call(f, 1)).toMatchObject({ url: "/api/membership/subscription", method: "POST" });
    expect(call(f, 2)).toEqual({ url: "/api/membership/activate", method: "POST", body: { subscriptionId: "I-SUB1" } });
  });
  it("shows a progress state while turning it on", async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(notMember.body)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "I-1" }), { status: 201 }))
      .mockReturnValueOnce(new Promise<Response>((r) => { release = r; })));
    render(<MembershipView clientId="c" />);
    fireEvent.click(await screen.findByRole("button", { name: "PayPal" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Turning on your membership");
    release(new Response(JSON.stringify({ member: true, status: "ACTIVE", since: null })));
    expect(await screen.findByText("You’re a member. No concierge fees on your bookings.")).toBeInTheDocument();
  });
  it("a member can cancel, and can join again afterwards", async () => {
    const f = mockApi(member, { status: 200, body: { member: false, status: "CANCELLED" } });
    render(<MembershipView clientId="c" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel membership" }));
    expect(await screen.findByText("Your membership is cancelled. You can join again below.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PayPal" })).toBeInTheDocument();
    expect(call(f, 1)).toMatchObject({ url: "/api/membership/cancel", method: "POST", body: undefined });
  });
  it.each([
    [{ status: 404, body: { error: "You don't have an active membership" } }, "You don't have an active membership"],
    [{ status: 500, body: {} }, "Couldn't cancel. Try again."],
  ])("a failed cancel shows why (%j)", async (reply, msg) => {
    mockApi(member, reply);
    render(<MembershipView clientId="c" />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel membership" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
  });
  it.each([
    [{ status: 409, body: { error: "You're already a member" } }, "You're already a member"],
    [{ status: 500, body: {} }, "Couldn't start the subscription."],
  ])("starting the subscription fails (%j)", async (reply, msg) => {
    mockApi(notMember, reply);
    render(<MembershipView clientId="c" />);
    fireEvent.click(await screen.findByRole("button", { name: "PayPal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
  });
  it.each([
    [{ status: 403, body: { error: "This subscription belongs to someone else" } }, "This subscription belongs to someone else"],
    [{ status: 500, body: {} }, "PayPal approved it, but we couldn't turn your membership on."],
  ])("activation fails (%j)", async (reply, msg) => {
    mockApi(notMember, { status: 201, body: { id: "I-1" } }, reply);
    render(<MembershipView clientId="c" />);
    fireEvent.click(await screen.findByRole("button", { name: "PayPal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
    expect(screen.getByRole("button", { name: "PayPal" })).toBeInTheDocument();
  });
  it("PayPal itself errors: nothing was charged", async () => {
    paypalReact.approve = false;
    mockApi(notMember, { status: 201, body: { id: "I-1" } });
    render(<MembershipView clientId="c" />);
    fireEvent.click(await screen.findByRole("button", { name: "PayPal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PayPal ran into a problem. Nothing was charged");
  });
  it.each([
    [{ status: 401, body: { error: "We couldn't identify your browser." } }, "We couldn't identify your browser."],
    [{ status: 500, body: {} }, "Couldn't load your membership."],
  ])("status can't load (%j)", async (reply, msg) => {
    mockApi(reply);
    render(<MembershipView clientId="c" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
    expect(screen.queryByRole("button", { name: "PayPal" })).toBeNull();
  });
  it("without a PayPal client id, says payments aren't set up", async () => {
    mockApi(notMember);
    render(<MembershipView clientId="" />);
    expect(await screen.findByText("Payments aren’t set up yet.")).toBeInTheDocument();
  });
  it("a member with no start date still reads well", async () => {
    mockApi({ status: 200, body: { ...member.body, since: null } });
    render(<MembershipView clientId="c" />);
    await waitFor(() => expect(screen.getByText("You’re a member. No concierge fees on your bookings.")).toBeInTheDocument());
  });
});
