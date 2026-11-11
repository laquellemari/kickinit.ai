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
};
