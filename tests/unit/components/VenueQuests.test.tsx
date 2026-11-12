import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { VenueQuests, QUEST_PAGE } from "@/components/VenueQuests";
import type { RelevantQuest } from "@/lib/passport/passport";

const quest = (i: number, o: Partial<RelevantQuest> = {}): RelevantQuest => ({
  id: `q${i}`, category: "wellness", order: i, title: `Quest ${i}`, description: `Do thing ${i}.`, emoji: "🧖",
  difficulty: "Easy", xp: 100, mode: "solo", current: 0, target: 2, complete: false, ...o,
});
const mock = (status: number, body: unknown) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", f);
  return f;
};
const titles = () => within(screen.getByRole("region", { name: "Quests" })).getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));
afterEach(() => vi.unstubAllGlobals());

describe("VenueQuests", () => {
  it(`asks for this venue's quests, then shows ${QUEST_PAGE} with a count`, async () => {
    const f = mock(200, { quests: Array.from({ length: 6 }, (_, i) => quest(i)) });
    render(<VenueQuests tags={["spa", "wellness"]} />);
    expect(screen.getByRole("heading", { name: "Quests" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Finding quests");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/passport/quests?tags=spa%2Cwellness");
    await waitFor(() => expect(titles()).toEqual(["Quest 0", "Quest 1", "Quest 2", "Quest 3"]));
    expect(screen.getByText(`Showing ${QUEST_PAGE} of 6`)).toBeInTheDocument();
  });
  it("Show more adds the next four, and goes away when there are no more", async () => {
    mock(200, { quests: Array.from({ length: 10 }, (_, i) => quest(i)) });
    render(<VenueQuests tags={["spa"]} />);
    await screen.findByText("Showing 4 of 10");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(titles()).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(titles()).toHaveLength(10);
    expect(screen.getByText("Showing 10 of 10")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
  it(`boundary: exactly ${QUEST_PAGE} quests, no Show more; cards have no search link here`, async () => {
    mock(200, { quests: Array.from({ length: QUEST_PAGE }, (_, i) => quest(i)) });
    render(<VenueQuests tags={["spa"]} />);
    await screen.findByText(`Showing ${QUEST_PAGE} of ${QUEST_PAGE}`);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Quests" })).queryByRole("link")).toBeNull();
  });
  it("no quests fit: the section isn't shown", async () => {
    const f = mock(200, { quests: [] });
    render(<VenueQuests tags={["spa"]} />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Quests" })).toBeNull());
  });
  it("loading fails: the section quietly goes away", async () => {
    mock(500, {});
    render(<VenueQuests tags={["spa"]} />);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Quests" })).toBeNull());
  });
  it("answers after leaving the page are ignored", async () => {
    let ok!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { ok = r; })));
    const a = render(<VenueQuests tags={["spa"]} />);
    a.unmount();
    ok(new Response(JSON.stringify({ quests: [] })));
    let bad!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { bad = r; })));
    const b = render(<VenueQuests tags={["spa"]} />);
    b.unmount();
    bad(new Response("{}", { status: 500 }));
    await new Promise((r) => setTimeout(r, 0));
  });
});
