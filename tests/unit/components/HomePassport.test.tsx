import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HomePassport } from "@/components/HomePassport";
import { computePassport } from "@/lib/passport/passport";
import { createBookingSeries, HOME } from "../../helpers/factories";

const counters = { poolsFundedAsOrganizer: 0, poolContributions: 0, giftsRedeemed: 0, referralsConverted: 0, reviews: 0 };
const passport = (n: number) => JSON.parse(JSON.stringify(computePassport({ bookings: n ? createBookingSeries(n, 7) : [], ctx: HOME, questProgress: [], counters })));
const mock = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
afterEach(() => vi.unstubAllGlobals());

describe("HomePassport", () => {
  it("new visitor: real level and XP, a nudge, no stamps", async () => {
    mock(200, passport(0));
    render(<HomePassport />);
    expect(screen.getByText("Opening…")).toBeInTheDocument();
    expect(await screen.findByText("Newcomer · 0 XP")).toBeInTheDocument();
    expect(screen.getByText(/No stamps yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All 403 stamps" })).toHaveAttribute("href", "/passport");
    expect(within(screen.getByRole("region", { name: "Your passport" })).getAllByRole("link")).toHaveLength(1);
  });
  it("active traveler: at most 4 stamps, collected ones first, then progress as 'x of y'", async () => {
    const p = passport(3);
    mock(200, p);
    render(<HomePassport />);
    await screen.findByText(new RegExp(`${p.level.title} · `));
    const stamps = within(screen.getByRole("region", { name: "Your passport" })).getAllByRole("link").slice(1);
    const expected = [...p.completed.map((q: { title: string }) => [q.title, "Collected"]), ...p.inProgress.map((q: { title: string; current: number; target: number }) => [q.title, `${q.current} of ${q.target}`])].slice(0, 4);
    expect(stamps).toHaveLength(Math.min(4, expected.length));
    expect(stamps.length).toBeGreaterThan(0);
    stamps.forEach((s, i) => { expect(s).toHaveTextContent(expected[i][0]); expect(s).toHaveTextContent(expected[i][1]); });
    expect(screen.queryByText(/No stamps yet/)).toBeNull();
  });
  it("only in-progress quests: shows them dashed", async () => {
    const p = passport(0);
    p.inProgress = [{ id: "q1", title: "Pasta Pilgrim", current: 1, target: 3 }];
    mock(200, p);
    render(<HomePassport />);
    expect(await screen.findByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Pasta Pilgrim").parentElement).toHaveStyle({ borderStyle: "dashed" });
  });
  it("XP uses thousands separators", async () => {
    const p = passport(0);
    p.level = { ...p.level, title: "Adventurer", xp: 1570 };
    mock(200, p);
    render(<HomePassport />);
    expect(await screen.findByText("Adventurer · 1,570 XP")).toBeInTheDocument();
  });
  it("load error", async () => {
    mock(500, {});
    render(<HomePassport />);
    expect(await screen.findByText("Couldn't load your passport.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All 403 stamps" })).toBeInTheDocument();
  });
});
