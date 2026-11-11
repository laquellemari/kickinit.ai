import type { Quote } from "@/lib/catalog/types";
import type { LivePlace } from "./types";

/** The PayPal hold for a request-to-book venue: estimate × party. The venue confirms; we capture up to this amount. */
export function quoteLive(place: LivePlace, partySize: number): Quote {
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) throw new Error("Party size must be a whole number from 1 to 20");
  const cents = Math.round(Number(place.estimatePerPerson) * 100) * partySize;
  const suffix = ` · ${partySize} ${partySize === 1 ? "guest" : "guests"} (request)`;
  return {
    experienceId: place.id,
    partySize,
    unitPrice: place.estimatePerPerson,
    total: (cents / 100).toFixed(2),
    currency: "USD",
    description: place.name.slice(0, 127 - suffix.length) + suffix,
  };
}
