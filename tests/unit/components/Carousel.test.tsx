import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Carousel } from "@/components/Carousel";
import { createSlides } from "../../helpers/factories";
import { verifyCarouselShows } from "../../helpers/verification";

describe("Carousel", () => {
  describe("happy path", () => {
    it("shows the first slide with a 01 / NN counter", () => {
      render(<Carousel slides={createSlides(6)} />);
      verifyCarouselShows({ title: "Slide 1", where: "Place 1", index: 1, total: 6 });
    });

    it("next advances one slide", () => {
      render(<Carousel slides={createSlides(6)} />);
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      verifyCarouselShows({ title: "Slide 2", where: "Place 2", index: 2, total: 6 });
    });

    it("previous goes back one slide", () => {
      render(<Carousel slides={createSlides(6)} />);
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.click(screen.getByRole("button", { name: "Previous" }));
      verifyCarouselShows({ title: "Slide 1", where: "Place 1", index: 1, total: 6 });
    });

    it("auto-advances every 6 seconds", () => {
      vi.useFakeTimers();
      render(<Carousel slides={createSlides(6)} />);
      act(() => { vi.advanceTimersByTime(6000); });
      verifyCarouselShows({ title: "Slide 2", where: "Place 2", index: 2, total: 6 });
    });

    it("stops the timer on unmount", () => {
      vi.useFakeTimers();
      const { unmount } = render(<Carousel slides={createSlides(3)} />);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("boundary", () => {
    it("previous on the first slide wraps to the last", () => {
      render(<Carousel slides={createSlides(6)} />);
      fireEvent.click(screen.getByRole("button", { name: "Previous" }));
      verifyCarouselShows({ title: "Slide 6", where: "Place 6", index: 6, total: 6 });
    });

    it("next on the last slide wraps to the first", () => {
      render(<Carousel slides={createSlides(6)} />);
      for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
      verifyCarouselShows({ title: "Slide 1", where: "Place 1", index: 1, total: 6 });
    });

    it("a single slide stays on itself in both directions", () => {
      render(<Carousel slides={createSlides(1)} />);
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      fireEvent.click(screen.getByRole("button", { name: "Previous" }));
      verifyCarouselShows({ title: "Slide 1", where: "Place 1", index: 1, total: 1 });
    });
  });

  describe("validation", () => {
    it("renders nothing for an empty slide list", () => {
      const { container } = render(<Carousel slides={[]} />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});
