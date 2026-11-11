import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchCard } from "@/components/SearchCard";
import { routerPush } from "../../helpers/setup";
import { verifyPlanNavigation } from "../../helpers/verification";

const REGION = "Miami · 10 mi";
const renderCard = () => render(<SearchCard region={REGION} />);
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("SearchCard", () => {
  describe("happy path", () => {
    it("defaults to For you with the region prefilled", () => {
      renderCard();
      expect(screen.getByRole("button", { name: "For you" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "For them" })).toHaveAttribute("aria-pressed", "false");
      expect(field("Where").value).toBe(REGION);
    });

    it("Plan it for me sends the structured fields as the query", () => {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Plan it for me" }));
      verifyPlanNavigation({ mode: "you", where: REGION, q: "Dinner, Sat · evening, 2 guests" });
    });

    it("edited fields flow into the query", () => {
      renderCard();
      fireEvent.change(field("What"), { target: { value: "Spa" } });
      fireEvent.change(field("Where"), { target: { value: "Austin" } });
      fireEvent.change(field("When"), { target: { value: "Sunday" } });
      fireEvent.change(field("Who"), { target: { value: "1 guest" } });
      fireEvent.click(screen.getByRole("button", { name: "Plan it for me" }));
      verifyPlanNavigation({ mode: "you", where: "Austin", q: "Spa, Sunday, 1 guest" });
    });

    it("free text request is sent as-is (trimmed)", () => {
      renderCard();
      fireEvent.change(screen.getByLabelText("Or just say it:"), { target: { value: "  jazz tonight  " } });
      fireEvent.click(screen.getByRole("button", { name: "Make it happen →" }));
      verifyPlanNavigation({ mode: "you", where: REGION, q: "jazz tonight" });
    });

    it("For them relabels the fields and the button, and sends mode=them", () => {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "For them" }));
      expect(screen.getByRole("button", { name: "For them" })).toHaveAttribute("aria-pressed", "true");
      expect(field("Who's it for")).toBeInTheDocument();
      expect(field("Occasion")).toBeInTheDocument();
      expect(field("Budget")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Find the gift" }));
      verifyPlanNavigation({ mode: "them", where: REGION, q: "Dinner, Sat · evening, 2 guests" });
    });

    it("switching back to For you restores the original labels", () => {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "For them" }));
      fireEvent.click(screen.getByRole("button", { name: "For you" }));
      expect(field("What")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Plan it for me" })).toBeInTheDocument();
    });
  });

  describe("validation", () => {
    it("empty free text does not navigate", () => {
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Make it happen →" }));
      expect(routerPush).not.toHaveBeenCalled();
    });

    it("whitespace-only free text does not navigate", () => {
      renderCard();
      fireEvent.change(screen.getByLabelText("Or just say it:"), { target: { value: "   " } });
      fireEvent.click(screen.getByRole("button", { name: "Make it happen →" }));
      expect(routerPush).not.toHaveBeenCalled();
    });
  });

  describe("boundary", () => {
    it("a 1-character request navigates", () => {
      renderCard();
      fireEvent.change(screen.getByLabelText("Or just say it:"), { target: { value: "x" } });
      fireEvent.click(screen.getByRole("button", { name: "Make it happen →" }));
      verifyPlanNavigation({ mode: "you", where: REGION, q: "x" });
    });

    it("special characters are URL-encoded and round-trip intact", () => {
      renderCard();
      const q = "dinner & drinks? 50% off #date";
      fireEvent.change(screen.getByLabelText("Or just say it:"), { target: { value: q } });
      fireEvent.click(screen.getByRole("button", { name: "Make it happen →" }));
      verifyPlanNavigation({ mode: "you", where: REGION, q });
    });
  });
});
