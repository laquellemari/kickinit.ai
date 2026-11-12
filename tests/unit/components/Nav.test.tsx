import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Nav } from "@/components/Nav";

const links = ["Explore", "Passport", "Gifts", "Membership"] as const;
const keys = { Explore: "explore", Passport: "passport", Gifts: "gifts", Membership: "membership" } as const;
const hrefs = { Explore: "/", Passport: "/passport", Gifts: "/gifts", Membership: "/membership" } as const;

describe("Nav", () => {
  it.each(links)("marks only %s as the current page when active", (label) => {
    render(<Nav active={keys[label]} />);
    for (const l of links) {
      const a = screen.getByRole("link", { name: l });
      expect(a).toHaveAttribute("href", hrefs[l]);
      if (l === label) expect(a).toHaveAttribute("aria-current", "page");
      else expect(a).not.toHaveAttribute("aria-current");
    }
  });

  it("shows the default region when none is given", () => {
    render(<Nav active="explore" />);
    expect(screen.getByRole("button", { name: "Los Angeles · 10 mi" })).toBeInTheDocument();
  });

  it("shows a custom region", () => {
    render(<Nav active="explore" region="Lisbon · 5 km" />);
    expect(screen.getByRole("button", { name: "Lisbon · 5 km" })).toBeInTheDocument();
  });

  it("links the brand home and the avatar to the profile", () => {
    render(<Nav active="explore" />);
    expect(screen.getByRole("link", { name: "kickinit" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Your profile" })).toHaveAttribute("href", "/profile");
  });
});
