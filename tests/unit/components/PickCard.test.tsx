import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PickCard } from "@/components/PickCard";
import { partnerPick, livePick, eventPick } from "../../helpers/factories";

describe("PickCard", () => {
  it("partner restaurant: instant-book stamp, free to book, link to details with party size", () => {
    render(<PickCard pick={partnerPick("carasau-pasta-bar", 2, "Terrace over the bay.")} partySize={2} />);
    const card = screen.getByRole("article", { name: "Carasau Pasta Bar" });
    expect(within(card).getByText("DINE")).toBeInTheDocument();
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
    expect(within(card).getByText("DINE")).toBeInTheDocument();
    expect(within(card).getByText("Free to book")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "See details" })).toHaveAttribute("href", "/request/ChIJsd1?party=3");
    const maps = within(card).getByRole("link", { name: "Map" });
    expect(maps).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(maps).toHaveAttribute("target", "_blank");
    expect(maps).toHaveAttribute("rel", "noopener noreferrer");
    expect(card).not.toHaveTextContent(/instant book|request|partner/i);
  });
  it("live spa: no estimate, the exact price comes from the venue", () => {
    render(<PickCard pick={livePick({ dining: false, name: "Spa Uno", typeLabel: "Spa" })} partySize={2} />);
    const card = screen.getByRole("article", { name: "Spa Uno" });
    expect(within(card).getByText("See prices")).toBeInTheDocument();
    expect(within(card).getByText("Exact price from the venue")).toBeInTheDocument();
    expect(within(card).queryByText(/\$/)).toBeNull();
  });
  it("event: when, venue, price range and a Get tickets link to Ticketmaster in a new tab", () => {
    render(<PickCard pick={eventPick()} partySize={2} />);
    const card = screen.getByRole("article", { name: "Adele" });
    expect(within(card).getByText("TICKETS")).toBeInTheDocument();
    expect(within(card).getByText("Sat, Nov 14 · 8:00 PM · Pop")).toBeInTheDocument();
    expect(within(card).getByText("The Colosseum at Caesars Palace, Las Vegas")).toBeInTheDocument();
    expect(within(card).getByText("$60–$250")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "Adele" })).toHaveStyle({ backgroundImage: "url(https://s1.ticketm.net/a.jpg)" });
    const link = within(card).getByRole("link", { name: "Get tickets" });
    expect(link).toHaveAttribute("href", "https://www.ticketmaster.com/event/G5v1");
    expect(within(card).getByRole("link", { name: "Plan the night" })).toHaveAttribute("href", "/night/G5v1?party=2");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer sponsored");
  });
  it("event without image, genre, city or published price", () => {
    render(<PickCard pick={eventPick({ image: null, genre: null, city: "", priceMin: null, priceMax: null })} partySize={2} />);
    const card = screen.getByRole("article", { name: "Adele" });
    expect(within(card).queryByRole("img")).toBeNull();
    expect(within(card).getByText("Sat, Nov 14 · 8:00 PM")).toBeInTheDocument();
    expect(within(card).getByText("The Colosseum at Caesars Palace")).toBeInTheDocument();
    expect(within(card).getByText("See prices")).toBeInTheDocument();
  });
  it("a stage or arena found on Google points to what's on there", () => {
    render(<PickCard pick={livePick({ name: "Sphere", primaryType: "arena", dining: false })} partySize={2} />);
    const card = screen.getByRole("article", { name: "Sphere" });
    expect(within(card).getByText("See what's on")).toBeInTheDocument();
    expect(within(card).getByText("Upcoming shows here")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "See events" })).toHaveAttribute("href", "/request/ChIJsd1?party=2");
  });
  it("every card has the same parts in the same order: kicker, name, place, reason, price, buttons", () => {
    const { container } = render(<>
      <PickCard pick={partnerPick("hugh-spa", 2)} partySize={2} />
      <PickCard pick={livePick()} partySize={2} />
      <PickCard pick={eventPick()} partySize={2} />
    </>);
    const shapes = [...container.querySelectorAll("article")].map((a) => [...a.children].map((c) => c.className.split(" ").find((k) => k.startsWith("pick-") || k.startsWith("photo") || k.startsWith("event")) ?? c.tagName));
    expect(shapes[0].slice(1)).toEqual(["pick-kicker", "pick-name", "pick-meta", "pick-why", "pick-price", "pick-actions"]);
    expect(shapes[1].slice(1)).toEqual(shapes[0].slice(1));
    expect(shapes[2].slice(1)).toEqual(shapes[0].slice(1));
    expect(screen.getByText("Wellness & spa")).toBeInTheDocument();
  });
});
