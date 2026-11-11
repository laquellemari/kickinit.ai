import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../helpers/paypal-react";
import ExperiencePage, { generateMetadata } from "@/app/experience/[id]/page";

vi.mock("next/navigation", async (orig) => ({ ...(await orig<object>()), notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn() }) }));

const page = async (id: string, sp: Record<string, string | string[] | undefined> = {}) =>
  render(await ExperiencePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));

describe("/experience/[id]", () => {
  it("shows the experience with facts, tags and the booking panel", async () => {
    await page("carasau-pasta-bar", { party: "4" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Carasau Pasta Bar");
    expect(screen.getByText("$90 per person")).toBeInTheDocument();
    expect(screen.getByText("2 hr")).toBeInTheDocument();
    expect(screen.getByText("1–8 guests")).toBeInTheDocument();
    expect(screen.getByText("romantic")).toBeInTheDocument();
    expect(screen.getByText(/Demo partner: a real venue/)).toHaveTextContent("kickinit has no partnership with it");
    expect((screen.getByLabelText("Guests") as HTMLSelectElement).value).toBe("4");
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
});
