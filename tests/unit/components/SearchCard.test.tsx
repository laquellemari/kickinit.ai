import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SearchCard } from "@/components/SearchCard";
import { WHAT, WHEN, WHERE, WHO, GIFT_FOR, OCCASION, BUDGET } from "@/lib/search-options";
import { routerPush } from "../../helpers/setup";
import { verifyPlanNavigation } from "../../helpers/verification";

const LA = "Los Angeles, CA";
const renderCard = (p: Parameters<typeof SearchCard>[0] = {}) => render(<SearchCard {...p} />);
const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const optionsOf = (label: string) => Array.from(select(label).options).map((o) => o.value);
const ask = () => screen.getByLabelText("Or just say it:") as HTMLTextAreaElement;
const go = () => fireEvent.click(screen.getByRole("button", { name: "Make it happen →" }));
afterEach(() => vi.unstubAllGlobals());

describe("SearchCard", () => {
  describe("dropdowns", () => {
    it("For you: What, Where (city, state), When (morning/afternoon/evening) and Who are dropdowns with defaults", () => {
      renderCard();
      expect(optionsOf("What")).toEqual([...WHAT]);
      expect(optionsOf("Where")).toEqual([...WHERE]);
      expect(optionsOf("When")).toEqual(["Morning", "Afternoon", "Evening"]);
      expect(optionsOf("Who")).toEqual([...WHO]);
      expect([select("What").value, select("Where").value, select("When").value, select("Who").value]).toEqual(["Dinner", LA, "Evening", "2 guests"]);
      expect(WHERE.every((w) => /^[A-Z][A-Za-z .]+, [A-Z]{2}$/.test(w))).toBe(true);
      expect(WHO[0]).toBe("1 guest");
      expect(WHO.at(-1)).toBe("10 guests");
      expect(WHEN).toHaveLength(3);
    });
    it("Plan it for me sends the chosen options", () => {
      renderCard();
      fireEvent.change(select("What"), { target: { value: "Spa day" } });
      fireEvent.change(select("Where"), { target: { value: "San Diego, CA" } });
      fireEvent.change(select("When"), { target: { value: "Morning" } });
      fireEvent.change(select("Who"), { target: { value: "1 guest" } });
      fireEvent.click(screen.getByRole("button", { name: "Plan it for me" }));
      verifyPlanNavigation({ mode: "you", where: "San Diego, CA", q: "Spa day, morning, 1 guest" });
    });
    it("defaults go straight through", () => {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Plan it for me" }));
      verifyPlanNavigation({ mode: "you", where: LA, q: "Dinner, evening, 2 guests" });
    });
    it("For them: who it's for, occasion and budget dropdowns; mode=them", () => {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "For them" }));
      expect(screen.getByRole("button", { name: "For them" })).toHaveAttribute("aria-pressed", "true");
      expect(optionsOf("Who's it for")).toEqual([...GIFT_FOR]);
      expect(optionsOf("Occasion")).toEqual([...OCCASION]);
      expect(optionsOf("Budget")).toEqual([...BUDGET]);
      fireEvent.change(select("Who's it for"), { target: { value: "My mom" } });
      fireEvent.change(select("Occasion"), { target: { value: "Anniversary" } });
      fireEvent.change(select("Budget"), { target: { value: "Under $500" } });
      fireEvent.click(screen.getByRole("button", { name: "Find the gift" }));
      verifyPlanNavigation({ mode: "them", where: LA, q: "Gift for my mom, Anniversary, Under $500" });
    });
    it("switching back to For you restores its fields and keeps choices", () => {
      renderCard();
      fireEvent.change(select("What"), { target: { value: "Brunch" } });
      fireEvent.click(screen.getByRole("button", { name: "For them" }));
      fireEvent.click(screen.getByRole("button", { name: "For you" }));
      expect(select("What").value).toBe("Brunch");
      expect(screen.getByRole("button", { name: "Plan it for me" })).toBeInTheDocument();
    });
    it("starts in gift mode when asked", () => {
      renderCard({ initialMode: "them" });
      expect(screen.getByLabelText("Who's it for")).toBeInTheDocument();
    });
    it("a region outside the list is offered first and selected; one in the list isn't duplicated", () => {
      const { unmount } = renderCard({ region: "Boise, ID" });
      expect(optionsOf("Where")).toEqual(["Boise, ID", ...WHERE]);
      expect(select("Where").value).toBe("Boise, ID");
      unmount();
      renderCard({ region: "Chicago, IL" });
      expect(optionsOf("Where")).toEqual([...WHERE]);
      expect(select("Where").value).toBe("Chicago, IL");
    });
  });

  describe("chat box", () => {
    it("is a large multi-line box; the request is sent trimmed", () => {
      renderCard();
      expect(ask().tagName).toBe("TEXTAREA");
      expect(ask().rows).toBe(3);
      fireEvent.change(ask(), { target: { value: "  jazz tonight  " } });
      go();
      verifyPlanNavigation({ mode: "you", where: LA, q: "jazz tonight" });
    });
    it("Enter sends; Shift+Enter makes a new line", () => {
      renderCard();
      fireEvent.change(ask(), { target: { value: "jazz" } });
      fireEvent.keyDown(ask(), { key: "Enter", shiftKey: true });
      expect(routerPush).not.toHaveBeenCalled();
      fireEvent.keyDown(ask(), { key: "a" });
      expect(routerPush).not.toHaveBeenCalled();
      fireEvent.keyDown(ask(), { key: "Enter" });
      verifyPlanNavigation({ mode: "you", where: LA, q: "jazz" });
    });
    it.each(["", "   "])("empty request %j does not navigate", (v) => {
      renderCard();
      fireEvent.change(ask(), { target: { value: v } });
      go();
      expect(routerPush).not.toHaveBeenCalled();
    });
    it("boundary: a 1-character request navigates", () => {
      renderCard();
      fireEvent.change(ask(), { target: { value: "x" } });
      go();
      verifyPlanNavigation({ mode: "you", where: LA, q: "x" });
    });
    it("special characters round-trip intact", () => {
      renderCard();
      const q = "dinner & drinks? 50% off #date";
      fireEvent.change(ask(), { target: { value: q } });
      go();
      verifyPlanNavigation({ mode: "you", where: LA, q });
    });
    it("gift mode changes the placeholder", () => {
      renderCard({ initialMode: "them" });
      expect(ask().placeholder).toMatch(/for my mom/);
    });
  });

  describe("Give me an idea", () => {
    const mock = (status: number, body: unknown) => { const f = vi.fn(async () => new Response(JSON.stringify(body), { status })); vi.stubGlobal("fetch", f); return f; };
    it("asks for ideas for this mode and place, shows them, and a click puts one in the box", async () => {
      const f = mock(200, { ideas: ["Late-night blues in Hollywood", "A sauna Sunday"], personalized: true });
      renderCard();
      fireEvent.change(select("Where"), { target: { value: "Santa Monica, CA" } });
      fireEvent.click(screen.getByRole("button", { name: "Give me an idea" }));
      expect(screen.getByRole("status")).toHaveTextContent("Thinking of ideas");
      expect(screen.getByRole("button", { name: "Give me an idea" })).toBeDisabled();
      const group = await screen.findByRole("group", { name: "Ideas" });
      expect(within(group).getByText("Based on your searches:")).toBeInTheDocument();
      expect(f).toHaveBeenCalledWith("/api/ideas", expect.objectContaining({ method: "POST", body: JSON.stringify({ mode: "you", where: "Santa Monica, CA" }) }));
      fireEvent.click(within(group).getByRole("button", { name: "A sauna Sunday" }));
      expect(ask().value).toBe("A sauna Sunday");
      expect(document.activeElement).toBe(ask());
      expect(routerPush).not.toHaveBeenCalled();
    });
    it("no history yet: says these are starters", async () => {
      mock(200, { ideas: ["One"], personalized: false });
      renderCard({ initialMode: "them" });
      fireEvent.click(screen.getByRole("button", { name: "Give me an idea" }));
      expect(await screen.findByText("A few to start with:")).toBeInTheDocument();
    });
    it("shows the server's error", async () => {
      mock(429, { error: "Too many requests. Try again in a minute." });
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Give me an idea" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
      expect(screen.getByRole("button", { name: "Give me an idea" })).not.toBeDisabled();
    });
    it("error without a message falls back", async () => {
      mock(500, {});
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Give me an idea" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't come up with ideas right now.");
    });
  });
});
