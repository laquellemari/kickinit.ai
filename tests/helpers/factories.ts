import type { Slide } from "@/components/Carousel";

export const createSlide = (overrides: Partial<Slide> = {}): Slide => ({
  title: "Dinner on the bay",
  where: "Coconut Grove",
  photo: "waterfront dinner",
  stamp: "DINING",
  bg: "#D7E6F2",
  ...overrides,
});

export const createSlides = (n: number): Slide[] =>
  Array.from({ length: n }, (_, i) => createSlide({ title: `Slide ${i + 1}`, where: `Place ${i + 1}` }));
