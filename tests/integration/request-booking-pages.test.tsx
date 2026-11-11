// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "../helpers/paypal-react";
import RequestPage from "@/app/request/[placeId]/page";
import BookingPage from "@/app/booking/[id]/page";
import AdminPage from "@/app/admin/page";

vi.mock("next/navigation", async (orig) => ({ ...(await orig<object>()), notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/places/client", async (orig) => {
  const real = await orig<typeof import("@/lib/places/client")>();
  return { ...real, getLivePlace: vi.fn() };
});
import { getLivePlace, PlacesError } from "@/lib/places/client";

const place = { id: "gp:ChIJ1", placeId: "ChIJ1", name: "Barbusa", address: "1917 India St, San Diego", lat: 1, lng: 2, category: "culinary" as const, typeLabel: "Italian restaurant", mapsUrl: "https://maps.google.com/x", estimatePerPerson: "60.00" };
const requestPage = async (placeId: string, sp: Record<string, string | string[]> = {}) =>
  render(await RequestPage({ params: Promise.resolve({ placeId }), searchParams: Promise.resolve(sp) }));

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID", "cid"));
afterEach(() => { vi.unstubAllEnvs(); vi.mocked(getLivePlace).mockReset(); vi.unstubAllGlobals(); });

describe("/request/[placeId]", () => {
  it("shows the live venue and a request-to-book checkout with the party from the URL", async () => {
    vi.mocked(getLivePlace).mockResolvedValue(place);
    await requestPage("ChIJ1", { party: ["3"] });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Barbusa");
    expect(screen.getByText("1917 India St, San Diego")).toBeInTheDocument();
    expect(screen.getByText("Request to book")).toBeInTheDocument();
    expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("3");
    expect(screen.getByTestId("total")).toHaveTextContent("$180");
    expect(screen.getByRole("link", { name: "View on Google Maps" })).toHaveAttribute("href", "https://maps.google.com/x");
  });
  it("defaults to 2 guests", async () => {
    vi.mocked(getLivePlace).mockResolvedValue(place);
    await requestPage("ChIJ1");
    expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("2");
  });
  it("no PayPal client id: says payments aren't set up", async () => {
    vi.stubEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID", "");
    vi.mocked(getLivePlace).mockResolvedValue(place);
    await requestPage("ChIJ1");
    expect(screen.getByText("Payments aren’t set up yet.")).toBeInTheDocument();
  });
  it.each([
    ["Google says not found", new PlacesError(404, "x")],
    ["a bad id", new Error("Place id has invalid characters")],
    ["the place is closed", new Error("This place is closed")],
  ])("404 when %s", async (_l, err) => {
    vi.mocked(getLivePlace).mockRejectedValue(err);
    await expect(requestPage("x")).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("a Google outage is an error, not a 404", async () => {
    vi.mocked(getLivePlace).mockRejectedValue(new PlacesError(503, "down"));
    await expect(requestPage("x")).rejects.toThrow("down");
  });
});

describe("/booking/[id] and /admin", () => {
  it("booking page renders the status loader for that id", async () => {
    const f = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", f);
    render(await BookingPage({ params: Promise.resolve({ id: "b1" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Postcard sent.");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/bookings/b1");
  });
  it("admin page shows the key form", () => {
    render(<AdminPage />);
    expect(screen.getByLabelText("Admin key")).toBeInTheDocument();
  });
});
