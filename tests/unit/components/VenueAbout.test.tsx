import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VenueAbout } from "@/components/VenueAbout";

const GOOD = "A French-inspired rooftop bar with fire pits, live jazz and skyline views.";
const answer = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
afterEach(() => vi.unstubAllGlobals());

describe("VenueAbout", () => {
  it("shows the fallback first, then the written description", async () => {
    answer(200, { about: GOOD });
    render(<VenueAbout placeId="ChIJ1" fallback="Rooftop bar." className="concierge-reply" />);
    const p = screen.getByTestId("venue-about");
    expect(p).toHaveTextContent("Rooftop bar.");
    expect(p).toHaveClass("concierge-reply");
    await waitFor(() => expect(p).toHaveTextContent(GOOD));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/places/ChIJ1/about");
  });
  it.each([
    ["no description", 200, { about: null }],
    ["an error", 502, { error: "x" }],
    ["a description on an error status", 500, { about: GOOD }],
  ])("keeps the fallback on %s", async (_, status, body) => {
    answer(status, body);
    render(<VenueAbout placeId="ChIJ1" fallback="Rooftop bar." className="c" />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("venue-about")).toHaveTextContent("Rooftop bar.");
  });
  it("keeps the fallback when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<VenueAbout placeId="ChIJ1" fallback="Rooftop bar." className="c" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("venue-about")).toHaveTextContent("Rooftop bar.");
  });
  it("an answer after leaving the page is ignored", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const { unmount } = render(<VenueAbout placeId="ChIJ1" fallback="Rooftop bar." className="c" />);
    unmount();
    resolve(new Response(JSON.stringify({ about: GOOD })));
    await new Promise((r) => setTimeout(r, 0));
  });
});
