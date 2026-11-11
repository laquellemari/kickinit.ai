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
  return { ...real, getLivePlace: vi.fn(), searchLivePlaces: vi.fn(async () => []) };
});
import { getLivePlace, searchLivePlaces, PlacesError } from "@/lib/places/client";
import { createLivePlace } from "../helpers/factories";

const place = createLivePlace({ placeId: "ChIJ1", name: "Barbusa", address: "1917 India St, San Diego", lat: 32.72, lng: -117.17, mapsUrl: "https://maps.google.com/x", estimatePerPerson: "60.00", estimateBasis: "Google rates it $$$" });
const requestPage = async (placeId: string, sp: Record<string, string | string[]> = {}) =>
  render(await RequestPage({ params: Promise.resolve({ placeId }), searchParams: Promise.resolve(sp) }));

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID", "cid"); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); });
afterEach(() => { vi.unstubAllEnvs(); vi.mocked(getLivePlace).mockReset(); vi.unstubAllGlobals(); });

describe("/request/[placeId]", () => {
  it("shows the live venue and a request-to-book checkout with the party from the URL", async () => {
    vi.mocked(getLivePlace).mockResolvedValue(place);
    await requestPage("ChIJ1", { party: ["3"] });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Barbusa");
    expect(screen.getByText("1917 India St, San Diego")).toBeInTheDocument();
    expect(screen.getByText("Request to book")).toBeInTheDocument();
    expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("3");
    expect(screen.getByTestId("total")).toHaveTextContent("$220");
    expect(screen.getByRole("link", { name: "View on Google Maps" })).toHaveAttribute("href", "https://maps.google.com/x");
  });
  it("about: Google's description, rating and how the hold was estimated", async () => {
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, summary: "Lively Italian spot with handmade pasta.", rating: 4.6, ratingCount: 1234 });
    await requestPage("ChIJ1");
    const about = screen.getByRole("region", { name: "About this place" });
    expect(about).toHaveTextContent("Lively Italian spot with handmade pasta.");
    expect(about).toHaveTextContent("★ 4.6 on Google · 1,234 reviews");
    expect(about).toHaveTextContent("Estimated spend: $60 per person (Google rates it $$$). You pay the venue’s real bill, not the estimate.");
    expect(screen.getByText(/pay the bill for you/)).toHaveTextContent("you’re charged the real bill plus our booking fee when it closes");
  });
  it("no Google description or rating: a plain line instead, no rating", async () => {
    vi.mocked(getLivePlace).mockResolvedValue(place);
    await requestPage("ChIJ1");
    const about = screen.getByRole("region", { name: "About this place" });
    expect(about).toHaveTextContent("Italian restaurant in San Diego.");
    expect(about).not.toHaveTextContent("on Google");
  });
  it("one review is singular; no city falls back to 'the area'", async () => {
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, city: "", rating: 5, ratingCount: 1 });
    await requestPage("ChIJ1");
    expect(screen.getByText("★ 5.0 on Google · 1 review")).toBeInTheDocument();
    expect(screen.getByText("Italian restaurant in the area.")).toBeInTheDocument();
  });
  it("shows similar places below, searched near this venue, for the same party", async () => {
    vi.mocked(getLivePlace).mockResolvedValue(place);
    vi.mocked(searchLivePlaces).mockResolvedValueOnce([createLivePlace({ placeId: "ChIJ9", name: "Cucina Urbana" })]);
    await requestPage("ChIJ1", { party: "4" });
    expect(searchLivePlaces).toHaveBeenCalledWith("Italian restaurant near 1917 India St, San Diego");
    const recs = screen.getByRole("region", { name: "You might also like" });
    expect(screen.getByRole("link", { name: /Cucina Urbana/ })).toHaveAttribute("href", "/request/ChIJ9?party=4");
    expect(recs).toHaveTextContent("≈ $240");
  });
  it("a silly party in the URL is clamped for recommendations", async () => {
    vi.mocked(getLivePlace).mockResolvedValue(place);
    vi.mocked(searchLivePlaces).mockResolvedValueOnce([createLivePlace({ placeId: "ChIJ9", name: "Cucina Urbana" })]);
    await requestPage("ChIJ1", { party: "99" });
    expect(screen.getByRole("link", { name: /Cucina Urbana/ })).toHaveAttribute("href", "/request/ChIJ9?party=20");
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
