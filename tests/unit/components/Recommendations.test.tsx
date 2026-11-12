import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Recommendations } from "@/components/Recommendations";
import type { Recommendation } from "@/lib/places/similar";

const rec = (i: number, kind: "partner" | "live" = "live"): Recommendation => ({ key: `k${i}`, kind, href: `/x/${i}`, name: `Venue ${i}`, meta: "Bar", price: "≈ $90", placeId: `P${i}`, bg: "#fff", stamp: kind === "live" ? "NIGHT" : "SPA" });
afterEach(() => vi.unstubAllGlobals());

describe("Recommendations", () => {
  it("cards link to each venue with photo, stamp, meta and price; arrows scroll the row", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<Recommendations items={[rec(1, "partner"), rec(2)]} />);
    const region = screen.getByRole("region", { name: "You might also like" });
    const links = within(region).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/x/1", "/x/2"]);
    expect(links[0]).toHaveTextContent("SPA");
    expect(links[1]).toHaveTextContent("NIGHT");
    expect(links[1]).toHaveTextContent("≈ $90");
    const row = screen.getByTestId("recs-row");
    const scrollBy = vi.fn();
    Object.defineProperty(row, "scrollBy", { value: scrollBy });
    Object.defineProperty(row, "clientWidth", { value: 1000 });
    fireEvent.click(screen.getByRole("button", { name: "Scroll right" }));
    fireEvent.click(screen.getByRole("button", { name: "Scroll left" }));
    expect(scrollBy.mock.calls).toEqual([[{ left: 900, behavior: "smooth" }], [{ left: -900, behavior: "smooth" }]]);
  });
  it("custom title", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<Recommendations items={[rec(1)]} title="More like this" />);
    expect(screen.getByRole("heading", { name: "More like this" })).toBeInTheDocument();
  });
  it("nothing to recommend: renders nothing", () => {
    const { container } = render(<Recommendations items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
