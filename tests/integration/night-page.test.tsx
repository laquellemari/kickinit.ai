// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import NightPage from "@/app/night/[eventId]/page";

vi.mock("next/navigation", async (orig) => ({ ...(await orig<object>()), notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/events/ticketmaster", async (orig) => {
  const real = await orig<typeof import("@/lib/events/ticketmaster")>();
  return { ...real, getEvent: vi.fn() };
});
vi.mock("@/lib/places/client", async (orig) => {
  const real = await orig<typeof import("@/lib/places/client")>();
  return { ...real, searchNear: vi.fn() };
});
import { getEvent, EventsError } from "@/lib/events/ticketmaster";
import { searchNear } from "@/lib/places/client";
import { clearNightCache } from "@/lib/night/plan";
import { createLiveEvent, createLivePlace } from "../helpers/factories";

const page = async (eventId = "G5v1", sp: Record<string, string | string[]> = {}) =>
  render(await NightPage({ params: Promise.resolve({ eventId }), searchParams: Promise.resolve(sp) }));
const spot = (id: string, o = {}) => createLivePlace({ placeId: id, name: `Spot ${id}`, typeLabel: "Steak house", address: `${id} Strip, Las Vegas`, rating: 4.7, ratingCount: 2300, ...o });
const shows = (e = {}) => vi.mocked(getEvent).mockResolvedValue({ event: createLiveEvent(e), lat: 36.1, lng: -115.2 });
const places = (before: ReturnType<typeof spot>[], after: ReturnType<typeof spot>[]) =>
  vi.mocked(searchNear).mockImplementation(async (q: string) => (q.startsWith("dessert") ? after : before));

beforeEach(() => { clearNightCache(); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); });
afterEach(() => { vi.mocked(getEvent).mockReset(); vi.mocked(searchNear).mockReset(); vi.unstubAllGlobals(); });

describe("/night/[eventId]", () => {
  it("happy: dinner before, the show, dessert or drinks after, each bookable", async () => {
    shows();
    places([spot("d1"), spot("d2")], [spot("a1", { name: "Sugar Factory", typeLabel: "Dessert shop", rating: null })]);
    await page("G5v1", { party: "4" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Adele");
    expect(screen.getByText("Your night · Sat, Nov 14 · 8:00 PM")).toBeInTheDocument();
    expect(screen.getByText(/Dinner near The Colosseum at Caesars Palace before the show, then dessert or drinks after, for 4 guests/)).toBeInTheDocument();

    const dinner = screen.getByRole("region", { name: "Dinner before the show" });
    expect(dinner).toHaveTextContent("6:00 pm");
    const d1 = within(dinner).getByRole("article", { name: "Spot d1" });
    expect(d1).toHaveTextContent("Steak house");
    expect(d1).toHaveTextContent("d1 Strip, Las Vegas");
    expect(d1).toHaveTextContent("★ 4.7 on Google · 2,300 reviews");
    expect(within(d1).getByRole("link", { name: "Book a table · free" })).toHaveAttribute("href", "/request/d1?party=4&day=2026-11-14&time=18:00");

    const show = screen.getByRole("region", { name: "The show" });
    expect(show).toHaveTextContent("8:00 pm");
    expect(show).toHaveTextContent("$60–$250");
    expect(show).toHaveTextContent("Sat, Nov 14 · 8:00 PM · Pop");
    expect(within(show).getByRole("link", { name: "Get tickets" })).toHaveAttribute("href", "https://www.ticketmaster.com/event/G5v1");
    expect(within(show).getByRole("img", { name: "Adele" })).toBeInTheDocument();

    const after = screen.getByRole("region", { name: "After the show" });
    expect(after).toHaveTextContent("around 10:30 pm");
    const a1 = within(after).getByRole("article", { name: "Sugar Factory" });
    expect(a1).not.toHaveTextContent("★");
    // 10:30 pm is past the last bookable slot, so no time is filled in.
    expect(within(a1).getByRole("link", { name: "Book a table · free" })).toHaveAttribute("href", "/request/a1?party=4");
    expect(searchNear).toHaveBeenCalledWith("dinner restaurants near The Colosseum at Caesars Palace, Las Vegas, NV", { lat: 36.1, lng: -115.2 });
  });
  it("a matinee: lunch, and a bookable time after", async () => {
    shows({ localTime: "14:00:00" });
    places([spot("d1")], [spot("a1")]);
    await page();
    expect(screen.getByRole("region", { name: "Lunch before the show" })).toHaveTextContent("12:00 pm");
    expect(within(screen.getByRole("region", { name: "After the show" })).getByRole("link")).toHaveAttribute("href", "/request/a1?party=2&day=2026-11-14&time=16:30");
  });
  it("nothing found nearby, time TBA, no image, price, genre, city or venue name", async () => {
    shows({ localTime: null, image: null, priceMin: null, priceMax: null, genre: null, city: "", venue: "" });
    places([], []);
    await page("G5v1", { party: ["99"] });
    expect(screen.getByText(/near the venue before the show, then dessert or drinks after, for 20 guests/)).toBeInTheDocument();
    expect(screen.getByText("We couldn't find a well-rated spot for dinner near the venue right now.")).toBeInTheDocument();
    expect(screen.getByText("We couldn't find a well-rated spot for after the show near the venue right now.")).toBeInTheDocument();
    const show = screen.getByRole("region", { name: "The show" });
    expect(show).toHaveTextContent("Time TBA");
    expect(show).toHaveTextContent("See prices");
    expect(within(show).queryByRole("img")).toBeNull();
  });
  it("boundary: party defaults to 2 and is at least 1", async () => {
    shows();
    places([], []);
    await page("G5v1", { party: "0" });
    expect(screen.getByText(/for 2 guests/)).toBeInTheDocument();
  });
  it("boundary: a party of 1", async () => {
    shows();
    places([], []);
    await page("G5v1", { party: "1.7" });
    expect(screen.getByText(/for 1 guest\./)).toBeInTheDocument();
  });
  it("404 for an event Ticketmaster doesn't have, or a bad id", async () => {
    vi.mocked(getEvent).mockResolvedValueOnce(null);
    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
    vi.mocked(getEvent).mockRejectedValueOnce(new EventsError(400, "Event id has invalid characters"));
    await expect(page("a b")).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("other failures (Ticketmaster down) surface as errors", async () => {
    vi.mocked(getEvent).mockRejectedValueOnce(new EventsError(502, "Ticketmaster: HTTP 500"));
    await expect(page()).rejects.toThrow("Ticketmaster: HTTP 500");
  });
});
