import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PickCard } from "@/components/PickCard";
import { partnerPick, livePick } from "../../helpers/factories";

describe("PickCard", () => {
  it("partner restaurant: instant-book stamp, free to book, link to details with party size", () => {
    render(<PickCard pick={partnerPick("carasau-pasta-bar", 2, "Terrace over the bay.")} partySize={2} />);
    const card = screen.getByRole("article", { name: "Carasau Pasta Bar" });
    expect(within(card).getByText("INSTANT BOOK")).toBeInTheDocument();
    expect(within(card).getByText("Mid-City, Los Angeles")).toBeInTheDocument();
    expect(within(card).getByText("Terrace over the bay.")).toBeInTheDocument();
    expect(within(card).getByText("Free to book")).toBeInTheDocument();
    expect(within(card).getByText("Pay the bill at the end")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "See details" })).toHaveAttribute("href", "/experience/carasau-pasta-bar?party=2");
  });
  it("partner with a fixed price: the venue's price, plus a note about the concierge fee", () => {
    render(<PickCard pick={partnerPick("hugh-spa", 2)} partySize={2} />);
    const card = screen.getByRole("article", { name: "Hugh Spa" });
    expect(within(card).getByText("$190")).toBeInTheDocument();
    expect(within(card).getByText("2 guests · + concierge fee")).toBeInTheDocument();
  });
  it("gift mode: partner cards offer Gift this, and a restaurant gift shows its price (gifts are prepaid)", () => {
    render(<PickCard pick={partnerPick("carasau-pasta-bar", 2)} partySize={2} gift />);
    expect(screen.getByRole("link", { name: "Gift this" })).toHaveAttribute("href", "/gift/new?experience=carasau-pasta-bar&party=2");
    expect(screen.queryByRole("link", { name: "See details" })).toBeNull();
    expect(screen.getByText("$180")).toBeInTheDocument();
  });
  it("live restaurant: request stamp, free to book, request link, Google Maps in a new tab", () => {
    render(<PickCard pick={livePick()} partySize={3} />);
    const card = screen.getByRole("article", { name: "Cucina Sorella" });
    expect(within(card).getByText("REQUEST")).toBeInTheDocument();
    expect(within(card).getByText("Free to book")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Request to book" })).toHaveAttribute("href", "/request/ChIJsd1?party=3");
    const maps = within(card).getByRole("link", { name: "Map" });
    expect(maps).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(maps).toHaveAttribute("target", "_blank");
    expect(maps).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(card).queryByText("INSTANT BOOK")).toBeNull();
  });
  it("live spa: no estimate, the exact price comes from the venue", () => {
    render(<PickCard pick={livePick({ dining: false, name: "Spa Uno", typeLabel: "Spa" })} partySize={2} />);
    const card = screen.getByRole("article", { name: "Spa Uno" });
    expect(within(card).getByText("See prices")).toBeInTheDocument();
    expect(within(card).getByText("Exact price from the venue")).toBeInTheDocument();
    expect(within(card).queryByText(/\$/)).toBeNull();
  });
});
