import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { VenueEvents } from "@/components/VenueEvents";
import { createLiveEvent } from "../../helpers/factories";

describe("VenueEvents", () => {
  it("lists what's on with when, price and a Get tickets link each", () => {
    render(<VenueEvents name="Sphere" mapsUrl="https://maps/x" events={[createLiveEvent(), createLiveEvent({ id: "tm:E2", name: "Eagles", priceMin: null, localTime: null })]} />);
    const panel = screen.getByRole("complementary", { name: "Upcoming events" });
    expect(panel).toHaveTextContent("What’s on at Sphere");
    const adele = within(panel).getByRole("listitem", { name: "Adele" });
    expect(adele).toHaveTextContent("Sat, Nov 14 · 8:00 PM · $60–$250");
    expect(within(adele).getByRole("link", { name: "Get tickets" })).toHaveAttribute("href", "https://www.ticketmaster.com/event/G5v1");
    expect(within(panel).getByRole("listitem", { name: "Eagles" })).toHaveTextContent("Sat, Nov 14 · time TBA");
    expect(within(panel).getByRole("listitem", { name: "Eagles" })).not.toHaveTextContent("$");
    expect(panel).toHaveTextContent("Tickets are sold by Ticketmaster");
  });
  it("nothing listed: says so and links the venue", () => {
    render(<VenueEvents name="Sphere" mapsUrl="https://maps/x" events={[]} />);
    expect(screen.getByText("No upcoming events are listed on Ticketmaster for Sphere.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the venue on Google Maps" })).toHaveAttribute("href", "https://maps/x");
  });
  it("lookup failed: asks to try again", () => {
    render(<VenueEvents name="Sphere" mapsUrl="https://maps/x" events={null} />);
    expect(screen.getByText("We couldn’t load this venue’s events right now. Try again in a moment.")).toBeInTheDocument();
  });
});
