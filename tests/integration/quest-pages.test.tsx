import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", async (orig) => ({ ...(await orig<object>()), notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
const { default: CategoryPage, generateMetadata } = await import("@/app/passport/[category]/page");
const { default: MembershipPage } = await import("@/app/membership/page");

afterEach(() => vi.unstubAllGlobals());
const pending = () => vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
const open = async (category: string) => render(await CategoryPage({ params: Promise.resolve({ category }) }));

describe("/passport/[category]", () => {
  it("shows the category's name, loads its quests, and links to the neighbouring categories", async () => {
    pending();
    await open("wellness");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Wellness & Spa");
    expect(screen.getByRole("status")).toHaveTextContent("Opening the quests");
    expect(screen.getByRole("link", { name: "Passport" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "← All categories" })).toHaveAttribute("href", "/passport");
    const nav = screen.getByRole("navigation", { name: "Other categories" });
    expect(nav.querySelectorAll("a")[0]).toHaveAttribute("href", "/passport/culinary");
    expect(nav.querySelectorAll("a")[1]).toHaveAttribute("href", "/passport/movement");
  });
  it("wraps around at both ends", async () => {
    pending();
    const { unmount } = await open("culinary");
    expect(screen.getByRole("navigation", { name: "Other categories" }).querySelectorAll("a")[0]).toHaveAttribute("href", "/passport/getaways");
    unmount();
    await open("getaways");
    expect(screen.getByRole("navigation", { name: "Other categories" }).querySelectorAll("a")[1]).toHaveAttribute("href", "/passport/culinary");
  });
  it("an unknown category is a 404", async () => {
    await expect(open("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("titles the tab", async () => {
    expect(await generateMetadata({ params: Promise.resolve({ category: "nightlife" }) })).toEqual({ title: "Nightlife & Music quests · kickinit" });
    expect(await generateMetadata({ params: Promise.resolve({ category: "nope" }) })).toEqual({ title: "Not found · kickinit" });
  });
});

describe("/membership", () => {
  it("renders with Membership active", () => {
    pending();
    render(<MembershipPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Skip the fee.");
    expect(screen.getByRole("link", { name: "Membership" })).toHaveAttribute("aria-current", "page");
  });
});
