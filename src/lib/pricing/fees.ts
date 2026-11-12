/**
 * kickinit's pricing model.
 * - Restaurants and bars: free to book. The guest pays the venue's bill at the end; kickinit charges nothing.
 * - Everything else has an exact price (the partner's price, or the venue's own published price):
 *   the guest pays that price plus a 20% concierge fee. Members pay no fee.
 */
export const CONCIERGE_FEE_RATE = 0.2;
export const MEMBERSHIP_PRICE = "9.99";

export type Fees = { venueTotal: string; fee: string; total: string };

const dollars = (c: number) => (c / 100).toFixed(2);

/** The exact venue price plus kickinit's fee (none for members). */
export function withFee(venueCents: number, member: boolean): Fees {
  if (!Number.isInteger(venueCents) || venueCents < 0) throw new Error("Venue price must be a whole number of cents, zero or more");
  const fee = member ? 0 : Math.round(venueCents * CONCIERGE_FEE_RATE);
  return { venueTotal: dollars(venueCents), fee: dollars(fee), total: dollars(venueCents + fee) };
}

const DINING_TAGS = ["restaurant", "bar", "cocktail_bar", "rooftop_bar", "speakeasy"];
/** Ticketed or priced-by-the-hour nights out stay paid even when there's a bar. */
const TICKETED_TAGS = ["magic", "bowling", "karaoke"];

/** A partner restaurant or bar: free to book, pay the bill at the end. */
export function isDiningExperience(e: { tags: readonly string[] }): boolean {
  return e.tags.some((t) => DINING_TAGS.includes(t)) && !e.tags.some((t) => TICKETED_TAGS.includes(t));
}

const DINING_TYPE = /(^|_)(restaurant|bar|cafe|coffee_shop|bakery|ice_cream_shop|dessert_shop|meal_takeaway|food_court|steak_house|pub|night_club|bistro|diner|gastropub|brewpub)$/;

/** A Google place whose primary type is a restaurant, cafe or bar. */
export function isDiningType(primaryType: string | null | undefined): boolean {
  return !!primaryType && DINING_TYPE.test(primaryType);
}
