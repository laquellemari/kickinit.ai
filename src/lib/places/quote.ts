import type { Quote } from "@/lib/catalog/types";
import type { LivePlace } from "./types";

/** Extra held on top of the estimated bill, for tip and extras. Only the real bill is charged. */
export const HEADROOM = 0.2;
/** kickinit's fee for a request-to-book booking, charged with the bill. */
export const BOOKING_FEE_CENTS = 400;

export type HoldBreakdown = { billEstimate: string; headroom: string; fee: string; total: string };

/** The PayPal hold for a request-to-book venue: estimated bill + headroom + booking fee. Shared by server and checkout. */
export function holdFor(estimatePerPerson: string, partySize: number): HoldBreakdown {
  const bill = Math.round(Number(estimatePerPerson) * 100) * partySize;
  const headroom = Math.round(bill * HEADROOM);
  const c = (n: number) => (n / 100).toFixed(2);
  return { billEstimate: c(bill), headroom: c(headroom), fee: c(BOOKING_FEE_CENTS), total: c(bill + headroom + BOOKING_FEE_CENTS) };
}

/** The hold for a live venue. The venue confirms; at the end we capture the real bill + fee and release the rest. */
export function quoteLive(place: LivePlace, partySize: number): Quote {
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) throw new Error("Party size must be a whole number from 1 to 20");
  const h = holdFor(place.estimatePerPerson, partySize);
  const suffix = ` · ${partySize} ${partySize === 1 ? "guest" : "guests"} (request)`;
  return {
    experienceId: place.id,
    partySize,
    unitPrice: place.estimatePerPerson,
    total: h.total,
    currency: "USD",
    description: place.name.slice(0, 127 - suffix.length) + suffix,
    breakdown: { billEstimate: h.billEstimate, headroom: h.headroom, fee: h.fee },
  };
}
