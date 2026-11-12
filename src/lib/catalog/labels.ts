import type { Category } from "./types";

/** The short stamp on a venue's photo, by category. Every venue gets one, the same way. */
export const STAMP: Record<Category, string> = {
  culinary: "DINE", wellness: "SPA", movement: "MOVE", culture: "ARTS", nightlife: "NIGHT", outdoors: "OUTSIDE", create: "MAKE", getaways: "AWAY",
};
