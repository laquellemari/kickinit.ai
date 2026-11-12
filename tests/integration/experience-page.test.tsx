import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../helpers/paypal-react";
import ExperiencePage, { generateMetadata } from "@/app/experience/[id]/page";

const score = vi.hoisted(() => ({ next: (): Promise<unknown> => Promise.reject(new Error("no db")) }));
vi.mock("@/lib/ratings/ratings", () => ({ averageFor: () => score.next() }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<object>()), notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn() }) }));

const page = async (id: string, sp: Record<string, string | string[] | undefined> = {}) =>
  render(await ExperiencePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));

describe("/experience/[id]", () => {
  it("shows the experience with facts, tags and the booking panel", async () => {
    await page("carasau-pasta-bar", { party: "4" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Carasau Pasta Bar");
    expect(screen.getByText("Free to book · pay the bill at the end")).toBeInTheDocument();
    expect(screen.getByText("Book a table · free")).toBeInTheDocument();
    expect(screen.getByText("2 hr")).toBeInTheDocument();
    expect(screen.getByText("1–8 guests")).toBeInTheDocument();
    expect(screen.getByText("romantic")).toBeInTheDocument();
    expect(screen.getByText(/Demo: prices are illustrative/)).toHaveTextContent("bookings run in the PayPal sandbox, so no real money moves.");
    expect(document.body).not.toHaveTextContent(/partner|instant book|request to book/i);
    expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("4");
  });
  it("a fixed-price experience shows its price and the paid checkout", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await page("hugh-spa");
    expect(screen.getByText("$95 per person")).toBeInTheDocument();
    expect(screen.getByText("Book")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
  it("lists the quests a visit here counts toward, by the experience's tags", async () => {
    const f = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", f);
    await page("hugh-spa");
    expect(screen.getByRole("region", { name: "Quests" })).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/passport\/quests\?tags=wellness%2Cspa%2Cbathhouse%2Csauna/));
    vi.unstubAllGlobals();
  });
  it("per-group pricing and a fixed party size read naturally", async () => {
    await page("mic-drop-karaoke");
    expect(screen.getByText("$120 per group")).toBeInTheDocument();
    expect(screen.getByText("2–10 guests")).toBeInTheDocument();
  });
  it("defaults to 2 guests; repeated or junk party params fall back sensibly", async () => {
    await page("carasau-pasta-bar", { party: ["3", "9"] });
    expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("3");
  });
  it("junk party param falls back to 2", async () => {
    await page("carasau-pasta-bar", { party: "lots" });
    expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("2");
  });
  it("unknown id is a 404", async () => {
    await expect(page("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("metadata uses the experience name, or Not found", async () => {
    expect(await generateMetadata({ params: Promise.resolve({ id: "vibrato-grill-jazz" }) })).toEqual({ title: "Vibrato Grill Jazz · kickinit" });
    expect(await generateMetadata({ params: Promise.resolve({ id: "nope" }) })).toEqual({ title: "Not found · kickinit" });
  });

  it("shows the kickinit guest rating when there is one", async () => {
    score.next = async () => ({ average: 4.3, count: 3 });
    await page("hugh-spa");
    expect(screen.getByText("★ 4.3 from 3 kickinit guests")).toBeInTheDocument();
  });
  it("one rating is singular", async () => {
    score.next = async () => ({ average: 5, count: 1 });
    await page("hugh-spa");
    expect(screen.getByText("★ 5.0 from 1 kickinit guest")).toBeInTheDocument();
  });
  it("no ratings, or ratings unavailable: no line", async () => {
    score.next = async () => null;
    await page("hugh-spa");
    expect(screen.queryByText(/kickinit guest/)).toBeNull();
    score.next = () => Promise.reject(new Error("db down"));
    await page("the-broad");
    expect(screen.queryByText(/kickinit guest/)).toBeNull();
  });
});
