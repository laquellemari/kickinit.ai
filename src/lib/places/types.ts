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
  /** Google's rough per-person spend, a hint for the concierge's budget only. Never charged. Decimal string. */
  estimatePerPerson: string;
  /** Where that hint came from. */
  estimateBasis: string;
  /** A restaurant, cafe or bar: free to book, the guest pays the bill at the end. */
  dining: boolean;
  /** The venue's own website, where its published prices are read from (venue page only). */
  website: string | null;
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
