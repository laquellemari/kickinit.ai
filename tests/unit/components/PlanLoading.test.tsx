import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import { PlanLoading, STEPS, STEP_MS, SLIDE_MS, VISIBLE, type ExploreItem, type QuestTeaser } from "@/components/PlanLoading";

const item = (i: number): ExploreItem => ({ id: `e${i}`, name: `Venue ${i}`, meta: `Hood ${i} · from $${i}0`, placeId: `P${i}`, bg: "#fff", label: "SPA" });
const teaser = (i: number): QuestTeaser => ({ id: `q${i}`, emoji: "🍝", title: `Quest ${i}`, description: `Do thing ${i}.`, xp: 1000 * i + 100, category: "culinary" });

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("PlanLoading", () => {
  it("walks through the steps, ticking each off, and stays on the last", () => {
    render(<PlanLoading />);
    const steps = () => within(screen.getByRole("region", { name: "Finding your options" })).getAllByRole("listitem");
    expect(screen.getByRole("status")).toHaveTextContent(`${STEPS[0]}…`);
    expect(steps()[0]).toHaveAttribute("aria-current", "step");
    act(() => { vi.advanceTimersByTime(STEP_MS); });
    expect(screen.getByRole("status")).toHaveTextContent(`${STEPS[1]}…`);
    expect(steps()[0]).toHaveTextContent("✓");
    expect(steps()[0]).toHaveClass("step-done");
    act(() => { vi.advanceTimersByTime(STEP_MS * 10); });
    expect(screen.getByRole("status")).toHaveTextContent(`${STEPS[3]}…`);
    expect(steps()[3]).toHaveAttribute("aria-current", "step");
  });
  it("says how long it usually takes, and reassures once it runs long", () => {
    render(<PlanLoading />);
    expect(screen.getByText("Usually 8 to 15 seconds.")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(STEP_MS * 6); });
    expect(screen.getByText(/Almost there: big searches take a little longer\./)).toBeInTheDocument();
  });
  it(`"More to explore!" shows ${VISIBLE} experiences and rotates by one every ${SLIDE_MS / 1000}s, wrapping around`, () => {
    render(<PlanLoading explore={[0, 1, 2, 3, 4, 5].map(item)} />);
    const names = () => within(screen.getByRole("region", { name: "More to explore!" })).getAllByRole("link").map((l) => l.getAttribute("aria-label"));
    expect(screen.getByRole("heading", { name: "More to explore!" })).toBeInTheDocument();
    expect(names()).toEqual(["Venue 0", "Venue 1", "Venue 2", "Venue 3"]);
    act(() => { vi.advanceTimersByTime(SLIDE_MS); });
    expect(names()).toEqual(["Venue 1", "Venue 2", "Venue 3", "Venue 4"]);
    act(() => { vi.advanceTimersByTime(SLIDE_MS * 4); });
    expect(names()).toEqual(["Venue 5", "Venue 0", "Venue 1", "Venue 2"]);
    const first = within(screen.getByRole("region", { name: "More to explore!" })).getAllByRole("link")[0];
    expect(first).toHaveAttribute("href", "/experience/e5");
    expect(first).toHaveTextContent("Hood 5 · from $50");
  });
  it(`boundary: ${VISIBLE} or fewer experiences don't rotate; none hides the row`, () => {
    const { unmount } = render(<PlanLoading explore={[0, 1].map(item)} />);
    act(() => { vi.advanceTimersByTime(SLIDE_MS * 3); });
    expect(within(screen.getByRole("region", { name: "More to explore!" })).getAllByRole("link")).toHaveLength(2);
    unmount();
    render(<PlanLoading />);
    expect(screen.queryByRole("region", { name: "More to explore!" })).toBeNull();
  });
  it("a passport quest to aim for, changing every few steps", () => {
    render(<PlanLoading teasers={[teaser(1), teaser(2)]} />);
    const box = () => screen.getByRole("region", { name: "A quest to aim for" });
    expect(box()).toHaveTextContent("Passport quest · +1,100 XP");
    expect(box()).toHaveTextContent("Quest 1");
    expect(within(box()).getByRole("link", { name: "See quests" })).toHaveAttribute("href", "/passport/culinary");
    act(() => { vi.advanceTimersByTime(STEP_MS * 3); });
    expect(box()).toHaveTextContent("Quest 2");
  });
  it("no quests: no quest box", () => {
    render(<PlanLoading />);
    expect(screen.queryByRole("region", { name: "A quest to aim for" })).toBeNull();
  });
});
