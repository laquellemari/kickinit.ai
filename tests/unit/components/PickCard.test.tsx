import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PickCard } from "@/components/PickCard";
import { partnerPick, livePick } from "../../helpers/factories";

describe("PickCard", () => {
  it("partner: instant-book stamp, fixed total, link to details with party size", () => {
    render(<PickCard pick={partnerPick("carasau-pasta-bar", 2, "Terrace over the bay.")} partySize={2} />);
    const card = screen.getByRole("article", { name: "Carasau Pasta Bar" });
    expect(within(card).getByText("INSTANT BOOK")).toBeInTheDocument();
    expect(within(card).getByText("Mid-City, Los Angeles")).toBeInTheDocument();
    expect(within(card).getByText("Terrace over the bay.")).toBeInTheDocument();
    expect(within(card).getByText("$180")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "See details" })).toHaveAttribute("href", "/experience/carasau-pasta-bar?party=2");
  });
  it("live: request stamp, estimated hold, request-to-book link, and Google Maps in a new tab", () => {
    render(<PickCard pick={livePick({}, 3)} partySize={3} />);
    const card = screen.getByRole("article", { name: "Cucina Sorella" });
    expect(within(card).getByText("REQUEST")).toBeInTheDocument();
    expect(within(card).getByText("Est. hold · 3 guests")).toBeInTheDocument();
    expect(within(card).getByText("$180")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Request to book" })).toHaveAttribute("href", "/request/ChIJsd1?party=3");
    const maps = within(card).getByRole("link", { name: "Map" });
    expect(maps).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(maps).toHaveAttribute("target", "_blank");
    expect(maps).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(card).queryByText("INSTANT BOOK")).toBeNull();
  });
  it("gift mode: partner cards offer Gift this instead of details", () => {
    render(<PickCard pick={partnerPick("hugh-spa", 2)} partySize={2} gift />);
    expect(screen.getByRole("link", { name: "Gift this" })).toHaveAttribute("href", "/gift/new?experience=hugh-spa&party=2");
    expect(screen.queryByRole("link", { name: "See details" })).toBeNull();
  });
  it("boundary: 1 guest is singular", () => {
    render(<PickCard pick={livePick({}, 1)} partySize={1} />);
    expect(screen.getByText("Est. hold · 1 guest")).toBeInTheDocument();
  });
});
