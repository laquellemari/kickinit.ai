import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookPanel } from "@/components/BookPanel";
import { createExperience } from "../../helpers/factories";

const select = () => screen.getByLabelText("Guests") as HTMLSelectElement;
function verifyPanel(expected: { party: number; total: string; options: number }) {
  expect(select().value).toBe(String(expected.party));
  expect(select().options).toHaveLength(expected.options);
  expect(screen.getByTestId("total")).toHaveTextContent(expected.total);
}

describe("BookPanel", () => {
  it("per person: total follows the guest count", () => {
    render(<BookPanel experience={createExperience({ price: "90.00", partyMin: 1, partyMax: 8 })} initialParty={2} />);
    verifyPanel({ party: 2, total: "$180", options: 8 });
    expect(screen.getByText("$90 × 2 guests")).toBeInTheDocument();
    fireEvent.change(select(), { target: { value: "5" } });
    verifyPanel({ party: 5, total: "$450", options: 8 });
  });
  it("per group: flat total whatever the guest count", () => {
    render(<BookPanel experience={createExperience({ price: "120.00", pricing: "per_group", partyMin: 2, partyMax: 10 })} initialParty={6} />);
    verifyPanel({ party: 6, total: "$120", options: 9 });
    expect(screen.getByText("Flat price for the group")).toBeInTheDocument();
  });
  it("checkout button is shown but disabled until PayPal checkout ships", () => {
    render(<BookPanel experience={createExperience()} initialParty={2} />);
    expect(screen.getByRole("button", { name: "Hold it with PayPal" })).toBeDisabled();
  });
  describe("boundary: the starting party is clamped to what the venue takes", () => {
    it("below the minimum starts at the minimum", () => {
      render(<BookPanel experience={createExperience({ partyMin: 2, partyMax: 4 })} initialParty={1} />);
      verifyPanel({ party: 2, total: "$100", options: 3 });
    });
    it("above the maximum starts at the maximum", () => {
      render(<BookPanel experience={createExperience({ partyMin: 1, partyMax: 2 })} initialParty={9} />);
      verifyPanel({ party: 2, total: "$100", options: 2 });
    });
    it("a single fixed size has one option", () => {
      render(<BookPanel experience={createExperience({ partyMin: 4, partyMax: 4 })} initialParty={2} />);
      verifyPanel({ party: 4, total: "$200", options: 1 });
    });
  });
});
