export const CATEGORIES = ["culinary", "wellness", "movement", "culture", "nightlife", "outdoors", "create", "getaways"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Experience = {
  id: string;
  name: string;
  category: Category;
  tags: string[];
  city: string;
  country: string;
  neighborhood: string;
  lat: number;
  lng: number;
  /** Decimal string, e.g. "90.00". Per person or per group, see `pricing`. */
  price: string;
  currency: string;
  pricing: "per_person" | "per_group";
  durationMinutes: number;
  partyMin: number;
  partyMax: number;
  description: string;
  /** Google place id of the real venue, used for its photo. */
  placeId: string;
  bg: string;
  cuisine?: string;
};

export type SearchParams = {
  q?: string;
  category?: string;
  tags?: string[];
  maxTotal?: number;
  partySize?: number;
  near?: { lat: number; lng: number; radiusKm: number };
  limit?: number;
};

export type SearchResult = Experience & { distanceKm?: number; total: string };

export type Quote = {
  experienceId: string; partySize: number; unitPrice: string; total: string; currency: string; description: string;
  /** Request-to-book only: what the hold is made of. */
  breakdown?: { billEstimate: string; headroom: string; fee: string };
};
