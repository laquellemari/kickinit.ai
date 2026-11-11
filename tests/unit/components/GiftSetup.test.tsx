import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GiftSetup } from "@/components/GiftSetup";
import { getExperience } from "@/lib/catalog/catalog";
import { routerPush } from "../../helpers/setup";
import { createExperience } from "../../helpers/factories";

const NOW = new Date(2026, 10, 11, 12, 0);
const spa = getExperience("still-water")!;
function mockApi(status: number, body: unknown) {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", f);
  return f;
}
const sent = (f: ReturnType<typeof vi.fn>) => JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
const fill = () => {
  fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Mom" } });
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Kavon" } });
  fireEvent.change(screen.getByLabelText("A note (optional)"), { target: { value: "Happy 60th" } });
};
afterEach(() => vi.unstubAllGlobals());

describe("GiftSetup", () => {
  it("pool (default): sends the pool with a 9pm deadline on the chosen day, then opens the gift page", async () => {
    const f = mockApi(201, { id: "g1" });
    render(<GiftSetup experience={spa} initialParty={2} now={NOW} />);
    expect(screen.getByTestId("total")).toHaveTextContent("$190");
    expect(screen.getByLabelText("Pool closes on")).toHaveValue("2026-11-14");
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create the pool" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/gift/g1"));
    expect(sent(f)).toEqual({ experienceId: "still-water", partySize: 2, organizerName: "Kavon", recipientName: "Mom", note: "Happy 60th", mode: "pool", deadline: new Date(2026, 10, 14, 21, 0).toISOString() });
  });
  it("pay in full: no deadline field, no deadline sent", async () => {
    const f = mockApi(201, { id: "g2" });
    render(<GiftSetup experience={spa} initialParty={2} now={NOW} />);
    fireEvent.click(screen.getByLabelText(/I’ll pay it all/));
    expect(screen.queryByLabelText("Pool closes on")).toBeNull();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/gift/g2"));
    expect(sent(f).mode).toBe("solo");
    expect(sent(f)).not.toHaveProperty("deadline");
  });
  it("switching back to pool shows the deadline again; guests and deadline update", async () => {
    const f = mockApi(201, { id: "g3" });
    render(<GiftSetup experience={spa} initialParty={2} now={NOW} />);
    fireEvent.click(screen.getByLabelText(/I’ll pay it all/));
    fireEvent.click(screen.getByLabelText(/Start a group pool/));
    fireEvent.change(screen.getByLabelText("Guests"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Pool closes on"), { target: { value: "2026-11-20" } });
    expect(screen.getByTestId("total")).toHaveTextContent("$285");
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create the pool" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    expect(sent(f)).toMatchObject({ partySize: 3, deadline: new Date(2026, 10, 20, 21, 0).toISOString() });
  });
  it("the deadline picker allows tomorrow through 13 days out", () => {
    render(<GiftSetup experience={spa} initialParty={2} now={NOW} />);
    expect(screen.getByLabelText("Pool closes on")).toHaveAttribute("min", "2026-11-12");
    expect(screen.getByLabelText("Pool closes on")).toHaveAttribute("max", "2026-11-24");
  });
  it("shows the server's validation message and re-enables the button", async () => {
    mockApi(400, { error: "Their name is required" });
    render(<GiftSetup experience={spa} initialParty={2} now={NOW} />);
    fireEvent.click(screen.getByRole("button", { name: "Create the pool" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Their name is required");
    expect(screen.getByRole("button", { name: "Create the pool" })).toBeEnabled();
  });
  it("falls back to a generic error", async () => {
    mockApi(500, {});
    render(<GiftSetup experience={spa} initialParty={2} now={NOW} />);
    fireEvent.click(screen.getByRole("button", { name: "Create the pool" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't set up the gift.");
  });
  it("boundary: per-group price and clamped party", () => {
    render(<GiftSetup experience={createExperience({ pricing: "per_group", price: "120.00", partyMin: 2, partyMax: 4 })} initialParty={9} now={NOW} />);
    expect(screen.getByLabelText("Guests")).toHaveValue("4");
    expect(screen.getByTestId("total")).toHaveTextContent("$120");
  });
  it("below the minimum starts at the minimum; defaults now", () => {
    render(<GiftSetup experience={createExperience({ partyMin: 2, partyMax: 4 })} initialParty={1} />);
    expect(screen.getByLabelText("Guests")).toHaveValue("2");
  });
});
