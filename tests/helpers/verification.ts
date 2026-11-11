import { expect } from "vitest";
import { screen } from "@testing-library/react";
import { routerPush } from "./setup";

/** Carousel shows the expected slide and counter. */
export function verifyCarouselShows(expected: { title: string; where: string; index: number; total: number }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  expect(screen.getByText(expected.title)).toBeInTheDocument();
  expect(screen.getByText(expected.where)).toBeInTheDocument();
  expect(screen.getByText(`${pad(expected.index)} / ${pad(expected.total)}`)).toBeInTheDocument();
}

/** Search navigated exactly once to /plan with the expected params. */
export function verifyPlanNavigation(expected: { mode: "you" | "them"; where: string; q: string }) {
  expect(routerPush).toHaveBeenCalledTimes(1);
  const url = new URL(routerPush.mock.calls[0][0] as string, "http://x");
  expect(url.pathname).toBe("/plan");
  expect(url.searchParams.get("mode")).toBe(expected.mode);
  expect(url.searchParams.get("where")).toBe(expected.where);
  expect(url.searchParams.get("q")).toBe(expected.q);
}
