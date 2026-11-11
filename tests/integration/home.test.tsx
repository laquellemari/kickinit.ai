import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))));
  afterEach(() => vi.unstubAllGlobals());

  it("renders the headline, search, postcards and passport", async () => {
    render(await Home({}));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Plans,\s*without the\s*planning\./);
    expect(screen.getByRole("region", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Postcards from this weekend" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your passport" })).toBeInTheDocument();
  });

  it("each postcard links to its experience page", async () => {
    render(await Home({}));
    const ids = ["carasau-pasta-bar", "desuar-hollywood-spa", "kapowui-surf", "the-normandie-club"];
    for (const id of ids) {
      expect(document.querySelector(`a[href="/experience/${id}"]`)).not.toBeNull();
    }
  });

  it("hero slides are real partner venues and link to them", async () => {
    render(await Home({}));
    const carousel = screen.getByLabelText("This week's experiences");
    expect(within(carousel).getByRole("link", { name: "Dinner above the city" })).toHaveAttribute("href", "/experience/71above");
  });

  it("the passport band is the visitor's own (loaded live)", async () => {
    render(await Home({}));
    expect(screen.getByRole("region", { name: "Your passport" })).toHaveTextContent("Opening…");
  });
});
