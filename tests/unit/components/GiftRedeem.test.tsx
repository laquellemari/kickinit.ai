import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GiftRedeem } from "@/components/GiftRedeem";
import { routerPush } from "../../helpers/setup";

const NOW = new Date(2026, 10, 11, 12, 0);
const g = (o: Record<string, unknown> = {}) => ({ name: "Still Water Bathhouse", experienceId: "still-water", partySize: 2, status: "funded", recipientName: "Mom", organizerName: "Kavon", note: "Happy 60th", bookingId: null, ...o });
type Reply = { status: number; body: unknown };
function mockApi(...replies: Reply[]) {
  const f = vi.fn(async () => { const r = replies.shift()!; return new Response(JSON.stringify(r.body), { status: r.status }); });
  vi.stubGlobal("fetch", f);
  return f;
}
const pick = () => {
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-14" } });
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "11:00" } });
};
afterEach(() => vi.unstubAllGlobals());

describe("GiftRedeem", () => {
  it("funded: pick a time and book it, then go to the booking", async () => {
    const f = mockApi({ status: 200, body: g() }, { status: 201, body: { id: "bk9" } });
    render(<GiftRedeem code="CODE" now={NOW} />);
    expect(screen.getByRole("status")).toHaveTextContent("Opening your gift");
    expect(await screen.findByRole("heading", { name: "Kavon sent you something." })).toBeInTheDocument();
    expect(screen.getByText("“Happy 60th”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book it" })).toBeDisabled();
    pick();
    fireEvent.click(screen.getByRole("button", { name: "Book it" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/booking/bk9"));
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/gifts/redeem/CODE");
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({ startsAt: new Date(2026, 10, 14, 11, 0).toISOString() });
  });
  it.each([
    ["open", "still putting this together"],
    ["redeemed", "already booked this one"],
    ["expired", "nobody was charged"],
  ])("%s: explains and doesn't offer booking", async (status, text) => {
    mockApi({ status: 200, body: g({ status, note: "" }) });
    render(<GiftRedeem code="CODE" now={NOW} />);
    expect(await screen.findByText(text, { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Book it" })).toBeNull();
  });
  it("booking error is shown and you can retry", async () => {
    mockApi({ status: 200, body: g() }, { status: 409, body: { error: "This gift has already been redeemed" } });
    render(<GiftRedeem code="CODE" now={NOW} />);
    await screen.findByRole("button", { name: "Book it" });
    pick();
    fireEvent.click(screen.getByRole("button", { name: "Book it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already been redeemed");
    expect(screen.getByRole("button", { name: "Book it" })).toBeEnabled();
  });
  it("booking error with no message", async () => {
    mockApi({ status: 200, body: g() }, { status: 500, body: {} });
    render(<GiftRedeem code="CODE" now={NOW} />);
    await screen.findByRole("button", { name: "Book it" });
    pick();
    fireEvent.click(screen.getByRole("button", { name: "Book it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't book it.");
  });
  it("unknown code", async () => {
    mockApi({ status: 404, body: { error: "Gift not found" } });
    render(<GiftRedeem code="x" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Gift not found");
  });
  it("load error with no message", async () => {
    mockApi({ status: 500, body: {} });
    render(<GiftRedeem code="x" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this gift.");
  });
});
