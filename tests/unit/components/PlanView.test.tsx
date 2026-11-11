import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlanView } from "@/components/PlanView";
import { createConciergeResult } from "../../helpers/factories";

type Reply = { status: number; body: unknown };
function mockConcierge(...replies: Reply[]) {
  const f = vi.fn(async () => {
    const r = replies.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const sent = (f: ReturnType<typeof vi.fn>, n: number) => JSON.parse((f.mock.calls[n] as unknown as [string, RequestInit])[1].body as string);

/** Waits for the concierge reply and checks the cards shown. */
async function verifyPlan(expected: { reply: string; cards: string[] }) {
  expect(await screen.findByText(expected.reply)).toBeInTheDocument();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(expected.cards);
}

afterEach(() => vi.unstubAllGlobals());

describe("PlanView", () => {
  describe("happy path", () => {
    it("asks the concierge once, shows a loading state, then the reply and both kinds of card", async () => {
      const f = mockConcierge({ status: 200, body: createConciergeResult() });
      render(<PlanView q="dinner for 2" mode="you" where="Miami" />);
      expect(screen.getByRole("status")).toHaveTextContent("Finding the table");
      expect(screen.getByText("“dinner for 2”")).toBeInTheDocument();
      await verifyPlan({ reply: "Here are two good ones.", cards: ["Ristorante Marea", "Cucina Sorella"] });
      expect(f).toHaveBeenCalledTimes(1);
      expect(sent(f, 0)).toEqual({ message: "dinner for 2", mode: "you", where: "Miami", history: [] });
      expect(screen.getByText(/we hold an estimate on PayPal/)).toBeInTheDocument();
    });

    it("gift mode changes the heading and highlights Gifts in the nav", async () => {
      mockConcierge({ status: 200, body: createConciergeResult() });
      render(<PlanView q="spa day for mom" mode="them" where="San Diego" />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Gift ideas.");
      expect(screen.getByText("For them · San Diego")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Gifts" })).toHaveAttribute("aria-current", "page");
      await screen.findByText("Here are two good ones.");
      expect(screen.getByRole("link", { name: "Gift this" })).toHaveAttribute("href", "/gift/new?experience=marea&party=2");
    });

    it("refining sends the conversation so far, then shows the new answer", async () => {
      const f = mockConcierge(
        { status: 200, body: createConciergeResult() },
        { status: 200, body: createConciergeResult({ reply: "Something cheaper.", options: [] }) },
      );
      render(<PlanView q="dinner for 2" mode="you" where="Miami" />);
      await screen.findByText("Here are two good ones.");
      fireEvent.change(screen.getByLabelText("Refine it:"), { target: { value: "  cheaper  " } });
      fireEvent.click(screen.getByRole("button", { name: "Update →" }));
      await verifyPlan({ reply: "Something cheaper.", cards: [] });
      expect(sent(f, 1)).toEqual({
        message: "cheaper", mode: "you", where: "Miami",
        history: [{ role: "user", content: "dinner for 2" }, { role: "assistant", content: "Here are two good ones." }],
      });
      expect(screen.getByText("“cheaper”")).toBeInTheDocument();
      expect((screen.getByLabelText("Refine it:") as HTMLInputElement).value).toBe("");
    });

    it("uses 2 guests when the concierge didn't settle on a party size", async () => {
      mockConcierge({ status: 200, body: createConciergeResult({ partySize: null }) });
      render(<PlanView q="x" mode="you" where="Miami" />);
      await screen.findByText("Here are two good ones.");
      expect(screen.getByRole("link", { name: "See details" })).toHaveAttribute("href", "/experience/marea?party=2");
    });
  });

  describe("validation and empty states", () => {
    it("with no request, points back home and never calls the concierge", () => {
      const f = mockConcierge();
      render(<PlanView q="" mode="you" where="Miami" />);
      expect(screen.getByRole("link", { name: "home page" })).toHaveAttribute("href", "/");
      expect(screen.queryByRole("status")).toBeNull();
      expect(f).not.toHaveBeenCalled();
    });
    it("an empty refine does nothing", async () => {
      const f = mockConcierge({ status: 200, body: createConciergeResult() });
      render(<PlanView q="x" mode="you" where="Miami" />);
      await screen.findByText("Here are two good ones.");
      fireEvent.click(screen.getByRole("button", { name: "Update →" }));
      expect(f).toHaveBeenCalledTimes(1);
    });
  });

  describe("errors", () => {
    it.each([
      [503, "The concierge is offline right now."],
      [429, "That's a lot of requests in a minute."],
      [502, "Something went wrong finding options."],
      [400, "Something went wrong finding options."],
    ])("HTTP %i shows a friendly message and lets you try again", async (status, msg) => {
      mockConcierge({ status, body: { error: "x" } }, { status: 200, body: createConciergeResult() });
      render(<PlanView q="x" mode="you" where="Miami" />);
      expect(await screen.findByRole("alert")).toHaveTextContent(msg);
      fireEvent.change(screen.getByLabelText("Refine it:"), { target: { value: "try again" } });
      fireEvent.click(screen.getByRole("button", { name: "Update →" }));
      await verifyPlan({ reply: "Here are two good ones.", cards: ["Ristorante Marea", "Cucina Sorella"] });
    });
    it("a network failure shows the generic message", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
      render(<PlanView q="x" mode="you" where="Miami" />);
      expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong finding options.");
    });
  });
});
