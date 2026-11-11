import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GiftsView } from "@/components/GiftsView";

const mock = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
afterEach(() => vi.unstubAllGlobals());

describe("GiftsView", () => {
  it("lists gifts you started and chipped in to, with status in words", async () => {
    mock(200, {
      organized: [{ id: "g1", name: "Hugh Spa", recipientName: "Mom", status: "open", amount: "190.00", raised: "50.00", mode: "pool" }, { id: "g2", name: "Marea", recipientName: "Ana", status: "redeemed", amount: "180.00", raised: "180.00", mode: "solo" }],
      chippedIn: [
        { giftId: "g3", giftName: "Blue Room", recipientName: "Ben", amount: "20.00", status: "held", giftStatus: "open" },
        { giftId: "g4", giftName: "Spa", recipientName: "Cy", amount: "25.00", status: "captured", giftStatus: "funded" },
        { giftId: "g5", giftName: "Sail", recipientName: "Di", amount: "30.00", status: "voided", giftStatus: "expired" },
      ],
    });
    render(<GiftsView />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your gifts");
    const started = await screen.findByRole("region", { name: "Gifts you started" });
    expect(within(started).getByRole("link", { name: "Hugh Spa for Mom" })).toHaveAttribute("href", "/gift/g1");
    expect(within(started).getByText("Collecting · $50 of $190 · pool")).toBeInTheDocument();
    expect(within(started).getByText("Redeemed · $180 of $180")).toBeInTheDocument();
    const chipped = screen.getByRole("region", { name: "Gifts you chipped in to" });
    expect(within(chipped).getByText("$20 · on hold · Collecting")).toBeInTheDocument();
    expect(within(chipped).getByText("$25 · charged · Funded")).toBeInTheDocument();
    expect(within(chipped).getByText("$30 · released · Closed, released")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a gift" })).toHaveAttribute("href", "/?for=them");
  });
  it("empty lists say none yet", async () => {
    mock(200, { organized: [], chippedIn: [] });
    render(<GiftsView />);
    expect(await screen.findAllByText("None yet.")).toHaveLength(2);
  });
  it("load error", async () => {
    mock(401, {});
    render(<GiftsView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your gifts");
  });
});
