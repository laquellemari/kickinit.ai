import type { Category } from "@/lib/catalog/types";

/** A real venue found live on Google Places. Not a kickinit partner: booking is a request, confirmed by the venue. */
export type LivePlace = {
  id: string; // "gp:<google place id>"
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: Category;
  typeLabel: string;
  mapsUrl: string;
  /** Estimated price per person, used to size the PayPal hold. Decimal string. */
  estimatePerPerson: string;
  /** Where the estimate came from, shown to the guest. */
  estimateBasis: string;
  /** Google's description of the venue (venue page only). */
  summary: string | null;
  rating: number | null;
  ratingCount: number;
  city: string;
  /** ISO country code, e.g. "US". */
  country: string;
  /** The venue's current offset from UTC, for local start times. */
  utcOffsetMinutes: number | null;
  primaryType: string | null;
};
