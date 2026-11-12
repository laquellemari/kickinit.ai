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
vi.mock("@/lib/events/ticketmaster", async (orig) => {
  const real = await orig<typeof import("@/lib/events/ticketmaster")>();
  return { ...real, searchEvents: vi.fn(async () => []) };
});
import { searchEvents } from "@/lib/events/ticketmaster";
import { getLivePlace, searchLivePlaces, PlacesError } from "@/lib/places/client";
import { createLivePlace, createLiveEvent } from "../helpers/factories";

const place = createLivePlace({ placeId: "ChIJ1", name: "Barbusa", address: "1917 India St, San Diego", lat: 32.72, lng: -117.17, mapsUrl: "https://maps.google.com/x", estimatePerPerson: "60.00", estimateBasis: "Google rates it $$$" });
const requestPage = async (placeId: string, sp: Record<string, string | string[]> = {}) =>
  render(await RequestPage({ params: Promise.resolve({ placeId }), searchParams: Promise.resolve(sp) }));

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID", "cid"); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); });
afterEach(() => { vi.unstubAllEnvs(); vi.mocked(getLivePlace).mockReset(); vi.unstubAllGlobals(); });

describe("/request/[placeId]", () => {
  it("lists the quests a visit here counts toward, by the place's tags", async () => {
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, category: "wellness", primaryType: "spa", dining: false });
    await requestPage("ChIJ1");
    expect(screen.getByRole("region", { name: "Quests" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/passport/quests?tags=wellness%2Cspa%2Cspa");
  });
  it("a restaurant: free to request, with the party from the URL, and no price lookup", async () => {
    vi.mocked(getLivePlace).mockResolvedValue(place);
    await requestPage("ChIJ1", { party: ["3"] });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Barbusa");
    expect(screen.getByText("1917 India St, San Diego")).toBeInTheDocument();
    expect(screen.getByText("Request a table · free")).toBeInTheDocument();
    expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("3");
    expect(screen.getByTestId("total")).toHaveTextContent("Free");
    expect(screen.getByText(/Restaurants and bars are free to book on kickinit/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View on Google Maps" })).toHaveAttribute("href", "https://maps.google.com/x");
    expect(screen.queryByRole("link", { name: "Their website" })).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/menu"));
  });
  it("anything else: reads the venue's own published prices, and links its website", async () => {
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, name: "Spa Uno", dining: false, typeLabel: "Spa", website: "https://spauno.com" });
    await requestPage("ChIJ1");
    expect(screen.getByText(/Reading Spa Uno’s published prices…/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/places/ChIJ1/menu");
    expect(screen.getByText(/we book it for you at the exact price it publishes/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Their website" })).toHaveAttribute("href", "https://spauno.com");
  });
  it("a stage or arena: shows what's on there from Ticketmaster instead of a booking form", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "tm");
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, name: "The Colosseum", primaryType: "performing_arts_theater", dining: false, city: "Las Vegas" });
    vi.mocked(searchEvents).mockResolvedValueOnce([createLiveEvent()]);
    await requestPage("ChIJ1");
    expect(searchEvents).toHaveBeenCalledWith({ venue: "The Colosseum", city: "Las Vegas", stateCode: "CA" });
    expect(screen.getByRole("complementary", { name: "Upcoming events" })).toHaveTextContent("Adele");
    expect(screen.getByText(/Pick a show to get tickets on Ticketmaster/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Guests")).toBeNull();
  });
  it("a stage with no city, and a failed event lookup: logged, says try again", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "tm");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, name: "Sphere", primaryType: "arena", dining: false, city: "", state: "" });
    vi.mocked(searchEvents).mockRejectedValueOnce(new Error("Ticketmaster: HTTP 500"));
    await requestPage("ChIJ1");
    expect(searchEvents).toHaveBeenCalledWith({ venue: "Sphere", city: undefined, stateCode: undefined });
    expect(screen.getByText(/couldn’t load this venue’s events/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("outside the US, Google's region code isn't passed as a US state", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "tm");
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, name: "O2 Arena", primaryType: "arena", dining: false, city: "London", country: "GB", state: "England" });
    await requestPage("ChIJ1");
    expect(searchEvents).toHaveBeenCalledWith({ venue: "O2 Arena", city: "London", stateCode: undefined });
  });
  it("a stage without event search set up falls back to the venue's price menu", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, name: "Sphere", primaryType: "arena", dining: false });
    await requestPage("ChIJ1");
    expect(screen.queryByRole("complementary", { name: "Upcoming events" })).toBeNull();
    expect(screen.getByText(/published prices…/)).toBeInTheDocument();
  });
  it("about: Google's description and rating, and no estimate anywhere", async () => {
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, summary: "Lively Italian spot with handmade pasta.", rating: 4.6, ratingCount: 1234 });
    await requestPage("ChIJ1");
    const about = screen.getByRole("region", { name: "About this place" });
    expect(about).toHaveTextContent("Lively Italian spot with handmade pasta.");
    expect(about).toHaveTextContent("★ 4.6 on Google · 1,234 reviews");
    expect(about).not.toHaveTextContent("Estimated");
    expect(screen.queryByText(/estimate/i)).toBeNull();
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
    expect(recs).toHaveTextContent("Free to book");
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
  it("no PayPal client id: a restaurant can still be requested (it needs no payment)", async () => {
    vi.stubEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID", "");
    vi.mocked(getLivePlace).mockResolvedValue(place);
    await requestPage("ChIJ1");
    expect(screen.getByText("Request a table · free")).toBeInTheDocument();
    expect(screen.queryByText("Payments aren’t set up yet.")).toBeNull();
  });
  it("no PayPal client id, no env var at all: the menu checkout still renders", async () => {
    vi.stubEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID", undefined as unknown as string);
    delete process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    vi.mocked(getLivePlace).mockResolvedValue({ ...place, dining: false });
    await requestPage("ChIJ1");
    expect(screen.getByText(/published prices…/)).toBeInTheDocument();
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
