import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "../helpers/paypal-react";
import NewGiftPage from "@/app/gift/new/page";
import GiftRoute from "@/app/gift/[id]/page";
import RedeemRoute from "@/app/gift/redeem/[code]/page";

const hdrs = vi.hoisted(() => ({ map: new Map<string, string>() }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => hdrs.map.get(k) ?? null }) }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<object>()), notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => { vi.unstubAllGlobals(); hdrs.map.clear(); });
const pending = () => vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

describe("gift pages", () => {
  it("/gift/new shows the experience and the setup form", async () => {
    render(await NewGiftPage({ searchParams: Promise.resolve({ experience: "hugh-spa", party: ["3"] }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Gift Hugh Spa.");
    expect(screen.getByLabelText("Guests")).toHaveValue("3");
  });
  it("/gift/new defaults to 2 guests", async () => {
    render(await NewGiftPage({ searchParams: Promise.resolve({ experience: "hugh-spa" }) }));
    expect(screen.getByLabelText("Guests")).toHaveValue("2");
  });
  it("/gift/new 404s for an unknown experience", async () => {
    await expect(NewGiftPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("/gift/[id] builds share links from the request's host", async () => {
    pending();
    hdrs.map.set("host", "kickinit.onrender.com").set("x-forwarded-proto", "https");
    render(await GiftRoute({ params: Promise.resolve({ id: "g1" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Chip in.");
  });
  it("/gift/[id] falls back when headers are missing", async () => {
    pending();
    render(await GiftRoute({ params: Promise.resolve({ id: "g1" }) }));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it("/gift/redeem/[code] renders the redeem view", async () => {
    pending();
    render(await RedeemRoute({ params: Promise.resolve({ code: "C" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("For you.");
  });
});
