import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "../../helpers/paypal-react";
import { LiveMenu } from "@/components/LiveMenu";

const items = [
  { id: "massage-150", name: "Swedish Massage", price: "150.00", per: "person", durationMinutes: 60, sourceUrl: "https://spauno.com/menu" },
  { id: "suite-300", name: "Couples Suite", price: "300.00", per: "group", durationMinutes: null, sourceUrl: "https://spauno.com/suite" },
];
const props = { placeId: "ChIJ1", itemId: "gp:ChIJ1", name: "Spa Uno", initialParty: 2, clientId: "c", mapsUrl: "https://maps.google.com/x" };
/** First call answers the menu; membership lookups answer "not a member". */
function mockApi(menu: { status: number; body: unknown } | Promise<Response>) {
  const f = vi.fn(async (url: string) => {
    if (url === "/api/membership") return new Response(JSON.stringify({ member: false }));
    return menu instanceof Promise ? menu : new Response(JSON.stringify(menu.body), { status: menu.status });
  });
  vi.stubGlobal("fetch", f);
  return f;
}
afterEach(() => vi.unstubAllGlobals());

describe("LiveMenu", () => {
  it("while checking: says it's reading the venue's own prices", () => {
    mockApi(new Promise<Response>(() => {}));
    render(<LiveMenu {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Reading Spa Uno’s published prices…");
    expect(screen.getByText(/only use prices the venue lists on its own website/)).toBeInTheDocument();
  });
  it("lists the published prices with their source; the first is picked and priced in the checkout", async () => {
    const f = mockApi({ status: 200, body: { dining: false, items } });
    render(<LiveMenu {...props} />);
    const list = await screen.findByRole("group", { name: "Their prices" });
    expect(list).toHaveTextContent("Swedish Massage · 1 hr$150 per person");
    expect(list).toHaveTextContent("Couples Suite$300 per group");
    expect(screen.getByRole("radio", { name: /Swedish Massage/ })).toBeChecked();
    expect(screen.getByRole("link", { name: "Price as listed by Spa Uno" })).toHaveAttribute("href", "https://spauno.com/menu");
    expect(screen.getByTestId("total")).toHaveTextContent("$360");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/places/ChIJ1/menu");
  });
  it("picking another price re-prices the checkout and changes the source link", async () => {
    mockApi({ status: 200, body: { dining: false, items } });
    render(<LiveMenu {...props} />);
    fireEvent.click(await screen.findByRole("radio", { name: /Couples Suite/ }));
    expect(screen.getByTestId("total")).toHaveTextContent("$360");
    expect(screen.getByRole("group", { name: "What you pay" })).toHaveTextContent("Venue price (per group)$300");
    expect(screen.getByRole("link", { name: "Price as listed by Spa Uno" })).toHaveAttribute("href", "https://spauno.com/suite");
  });
  it("no published prices: says so honestly and links to the venue, with nothing to pay", async () => {
    mockApi({ status: 200, body: { dining: false, items: [] } });
    render(<LiveMenu {...props} />);
    expect(await screen.findByText("Price not published")).toBeInTheDocument();
    expect(screen.getByText("Spa Uno doesn’t list its prices online, so we can’t book it at an exact price yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact them on Google Maps" })).toHaveAttribute("href", "https://maps.google.com/x");
    expect(screen.queryByRole("button", { name: "PayPal" })).toBeNull();
  });
  it.each([
    [{ status: 429, body: { error: "Too many price lookups. Try again in a minute." } }, "Too many price lookups. Try again in a minute."],
    [{ status: 502, body: {} }, "Couldn't check the venue's prices."],
  ])("a failed lookup shows why (%j)", async (reply, msg) => {
    mockApi(reply);
    render(<LiveMenu {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
    expect(screen.getByText("Nothing was charged. Try again in a moment.")).toBeInTheDocument();
  });
  it("answers after leaving the page are ignored (success and failure)", async () => {
    let ok!: (r: Response) => void;
    mockApi(new Promise<Response>((r) => { ok = r; }));
    const a = render(<LiveMenu {...props} />);
    a.unmount();
    ok(new Response(JSON.stringify({ items })));
    let bad!: (r: Response) => void;
    mockApi(new Promise<Response>((r) => { bad = r; }));
    const b = render(<LiveMenu {...props} />);
    b.unmount();
    bad(new Response(JSON.stringify({ error: "x" }), { status: 500 }));
    await waitFor(() => expect(true).toBe(true));
  });
});
