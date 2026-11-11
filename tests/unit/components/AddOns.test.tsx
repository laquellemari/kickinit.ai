import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { AddOns } from "@/components/AddOns";

const a = (o: Record<string, unknown> = {}) => ({ id: "p1", title: "Lavender Bath Set", brand: "Aesop", imageUrl: "https://img/main.jpg", price: "42.00", currency: "USD", url: "https://aff/buy", merchant: "nordstrom.com", ...o });
afterEach(() => vi.unstubAllGlobals());

describe("AddOns", () => {
  it("shows up to 3 products that open the merchant in a new tab", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ addOns: [a(), a({ id: "p2", title: "Candle", brand: null, imageUrl: null })] })));
    vi.stubGlobal("fetch", f);
    render(<AddOns experienceId="hugh-spa" recipientName="Mom" />);
    const link = await screen.findByRole("link", { name: "Lavender Bath Set" });
    expect(link).toHaveAttribute("href", "https://aff/buy");
    expect(link).toHaveAttribute("rel", "noopener noreferrer sponsored");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("Aesop · nordstrom.com")).toBeInTheDocument();
    expect(within(link).getByText("$42")).toBeInTheDocument();
    expect(screen.getByText(/Hand Mom something/)).toBeInTheDocument();
    expect(screen.getByText("[No photo]")).toBeInTheDocument();
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/addons?experience=hugh-spa");
  });
  it.each([
    ["no add-ons", async () => new Response(JSON.stringify({ addOns: [] }))],
    ["an error status", async () => new Response("{}", { status: 404 })],
    ["a network failure", async () => { throw new TypeError("offline"); }],
  ])("renders nothing for %s", async (_l, impl) => {
    const f = vi.fn(impl);
    vi.stubGlobal("fetch", f);
    const { container } = render(<AddOns experienceId="x" recipientName="Mom" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
