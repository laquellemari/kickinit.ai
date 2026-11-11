import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PassportView } from "@/components/PassportView";
import { computePassport } from "@/lib/passport/passport";
import { createBookingSeries, HOME } from "../../helpers/factories";

const empty = () => computePassport({ bookings: [], ctx: HOME, questProgress: [], counters: { poolsFundedAsOrganizer: 0, poolContributions: 0, giftsRedeemed: 0, referralsConverted: 0, reviews: 0 } });
const active = () => computePassport({ bookings: createBookingSeries(3, 7), ctx: HOME, questProgress: [], counters: { poolsFundedAsOrganizer: 0, poolContributions: 0, giftsRedeemed: 0, referralsConverted: 0, reviews: 0 } });
const mock = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
afterEach(() => vi.unstubAllGlobals());

describe("PassportView", () => {
  it("new visitor: Newcomer, empty-state nudge, 8 categories and 58 locked badges", async () => {
    mock(200, JSON.parse(JSON.stringify(empty())));
    render(<PassportView />);
    expect(screen.getByRole("status")).toHaveTextContent("Opening your passport");
    expect(await screen.findByRole("heading", { name: "Newcomer" })).toBeInTheDocument();
    expect(screen.getByText(/Your passport is empty/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Categories" })).getAllByLabelText(/./)).toHaveLength(8);
    const badges = within(screen.getByRole("region", { name: "Badges" })).getAllByLabelText(/./);
    expect(badges).toHaveLength(58);
    expect(badges.some((b) => b.getAttribute("aria-label")!.includes("(unlocked)"))).toBe(false);
    expect(screen.queryByRole("region", { name: "In progress" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Collected" })).toBeNull();
  });
  it("active traveler: collected stamps, quests in progress, unlocked badges, no empty-state", async () => {
    mock(200, JSON.parse(JSON.stringify(active())));
    render(<PassportView />);
    const collected = await screen.findByRole("region", { name: "Collected" });
    expect(within(collected).getByText(/Pasta Pilgrim/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "In progress" })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/\(unlocked\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Your passport is empty/)).toBeNull();
    expect(screen.getByLabelText("Culinary")).toHaveTextContent(/[1-9]\d* \/ 52/);
  });
  it("load error", async () => {
    mock(500, {});
    render(<PassportView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your passport");
  });
});
