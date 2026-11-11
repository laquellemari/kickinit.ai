import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders the headline, search, postcards and passport", async () => {
    render(await Home({}));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Plans,\s*without the\s*planning\./);
    expect(screen.getByRole("region", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Postcards from this weekend" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your passport" })).toBeInTheDocument();
  });

  it("each postcard links to its experience page", async () => {
    render(await Home({}));
    const ids = ["marea", "still-water", "biscayne-dusk", "blue-room"];
    for (const id of ids) {
      expect(document.querySelector(`a[href="/experience/${id}"]`)).not.toBeNull();
    }
  });

  it("shows 2 collected and 2 in-progress stamps", async () => {
    render(await Home({}));
    const band = screen.getByRole("heading", { name: "Your passport" }).closest("section")!;
    expect(within(band).getAllByText("Collected")).toHaveLength(2);
    expect(within(band).getByText("1 of 3")).toBeInTheDocument();
    expect(within(band).getByText("2 of 4")).toBeInTheDocument();
  });
});
