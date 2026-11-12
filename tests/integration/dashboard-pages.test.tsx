import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/components/PlansCalendar", () => ({ default: () => <div /> }));
const { default: PassportPage } = await import("@/app/passport/page");
const { default: ProfilePage } = await import("@/app/profile/page");
const { default: GiftsPage } = await import("@/app/gifts/page");
const { default: Home } = await import("@/app/page");

afterEach(() => vi.unstubAllGlobals());
const pending = () => vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

describe("nav pages", () => {
  it.each([
    ["/passport", PassportPage, "Stamps collected.", "Passport"],
    ["/profile", ProfilePage, "Your dashboard.", "Explore"],
    ["/gifts", GiftsPage, "Gifts.", "Explore"],
  ] as const)("%s renders with the right heading and active nav", (_p, Page, heading, active) => {
    pending();
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(heading);
    expect(screen.getByRole("link", { name: active })).toHaveAttribute("aria-current", "page");
  });
  it("home with ?for=them opens search in gift mode; without it, for you", async () => {
    const { unmount } = render(await Home({ searchParams: Promise.resolve({ for: "them" }) }));
    expect(screen.getByRole("button", { name: "For them" })).toHaveAttribute("aria-pressed", "true");
    unmount();
    render(await Home({}));
    expect(screen.getByRole("button", { name: "For you" })).toHaveAttribute("aria-pressed", "true");
  });
});
