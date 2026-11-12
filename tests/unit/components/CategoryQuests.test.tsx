import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CategoryQuests } from "@/components/CategoryQuests";
import type { CategoryPage } from "@/lib/passport/passport";

const quest = (o: Partial<CategoryPage["quests"][number]> = {}): CategoryPage["quests"][number] => ({
  id: "q1", category: "culinary", order: 1, title: "Pasta Pilgrim", description: "Dine at 3 different Italian restaurants.", emoji: "🍝",
  difficulty: "Easy", xp: 100, mode: "duo", current: 1, target: 3, complete: false, ...o,
});
const page = (quests = [
  quest(),
  quest({ id: "q2", order: 2, title: "Omakase Ace", difficulty: "Medium", xp: 250, mode: "solo", current: 0, target: 1 }),
  quest({ id: "q3", order: 3, title: "Taco Trail", current: 5, target: 3, complete: true }),
  quest({ id: "q4", order: 4, title: "Chef Whisperer", difficulty: "Legendary", xp: 1000, mode: "group", current: 0, target: 10 }),
  quest({ id: "q5", order: 5, title: "Treat a Friend", difficulty: "Hard", xp: 500, mode: "gift", current: 0, target: 1 }),
  quest({ id: "q6", order: 6, title: "Odd One", mode: "party", current: 0 }),
]): CategoryPage => ({ category: { id: "culinary", name: "Culinary", emoji: "🍽️" }, completed: 1, total: quests.length, xpEarned: 100, xpTotal: 2150, quests });
const mock = (status: number, body: unknown) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", f);
  return f;
};
afterEach(() => vi.unstubAllGlobals());

describe("CategoryQuests", () => {
  it("loads the category, shows progress and every quest grouped by difficulty", async () => {
    const f = mock(200, page());
    render(<CategoryQuests id="culinary" />);
    expect(screen.getByRole("status")).toHaveTextContent("Opening the quests");
    const progress = await screen.findByRole("region", { name: "Category progress" });
    expect(progress).toHaveTextContent("1 of 6 quests collected");
    expect(progress).toHaveTextContent("XP earned100 / 2,150");
    expect(within(progress).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "17");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/passport/culinary");
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual(["Category progress", "Easy", "Medium", "Hard", "Legendary"]);
    expect(within(screen.getByRole("region", { name: "Easy" })).getByRole("heading")).toHaveTextContent("Easy · 100 XP each");
  });
  it("a quest card: what to do, who it's for, XP, progress, and a link to find a match", async () => {
    mock(200, page());
    render(<CategoryQuests id="culinary" />);
    const card = await screen.findByRole("listitem", { name: "Pasta Pilgrim" });
    expect(card).toHaveTextContent("Dine at 3 different Italian restaurants.");
    expect(card).toHaveTextContent("For two · 100 XP");
    expect(card).toHaveTextContent("1 / 3");
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(within(card).getByRole("link", { name: "Find something for this →" })).toHaveAttribute("href", "/plan?mode=you&q=Dine%20at%203%20different%20Italian%20restaurants.");
    expect(screen.getByRole("listitem", { name: "Omakase Ace" })).toHaveTextContent("Solo · 250 XP");
    expect(screen.getByRole("listitem", { name: "Chef Whisperer" })).toHaveTextContent("With a group · 1,000 XP");
    expect(screen.getByRole("listitem", { name: "Odd One" })).toHaveTextContent("party · 100 XP");
  });
  it("a gift quest searches in gift mode", async () => {
    mock(200, page());
    render(<CategoryQuests id="culinary" />);
    const gift = await screen.findByRole("listitem", { name: "Treat a Friend" });
    expect(gift).toHaveTextContent("A gift · 500 XP");
    expect(within(gift).getByRole("link")).toHaveAttribute("href", expect.stringMatching(/^\/plan\?mode=them&q=/));
  });
  it("a collected quest is stamped, its bar is full (never over), and has no search link", async () => {
    mock(200, page());
    render(<CategoryQuests id="culinary" />);
    const done = await screen.findByRole("listitem", { name: "Taco Trail" });
    expect(done).toHaveTextContent("COLLECTED");
    expect(done).toHaveTextContent("3 / 3");
    expect(within(done).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    expect(within(done).queryByRole("link")).toBeNull();
  });
  it.each([
    ["In progress (1)", ["Pasta Pilgrim"]],
    ["Collected (1)", ["Taco Trail"]],
    ["Not started (4)", ["Odd One", "Omakase Ace", "Treat a Friend", "Chef Whisperer"]],
    ["All (6)", ["Pasta Pilgrim", "Taco Trail", "Odd One", "Omakase Ace", "Treat a Friend", "Chef Whisperer"]],
  ])("filter %s", async (label, titles) => {
    mock(200, page());
    render(<CategoryQuests id="culinary" />);
    fireEvent.click(await screen.findByRole("button", { name: "Not started (4)" }));
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"))).toEqual(titles);
  });
  it("a filter with nothing in it says so", async () => {
    mock(200, page([quest()]));
    render(<CategoryQuests id="culinary" />);
    fireEvent.click(await screen.findByRole("button", { name: "Collected (0)" }));
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });
  it("load error", async () => {
    mock(500, {});
    render(<CategoryQuests id="culinary" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load these quests");
  });
});
