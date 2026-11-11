/** A booking as seen by the quest engine. */
export type Booking = {
  id: string;
  status: "held" | "captured" | "voided" | "refunded";
  checkedIn: boolean;
  source: "in_app" | "external";
  tags: string[];
  startsAt: Date;
  bookedAt: Date;
  /** Hour of day (0-23) in the venue's local time. */
  localHour: number;
  partySize: number;
  venue: string;
  city: string;
  country: string;
  cuisine?: string;
  neighborhood?: string;
  companion?: string;
  /** True when the user bought this for someone else. */
  isGift: boolean;
};

export type UserContext = { homeCity: string; homeCountry: string };

export type Requirement = {
  type: "count" | "distinct" | "same" | "weekly_streak" | "gift";
  count: number;
  tags: string[];
  window_days: number | null;
  attribute?: "cuisine" | "neighborhood" | "venue" | "companion";
  filter?: string;
};

export type Quest = {
  id: string;
  category: string;
  order: number;
  title: string;
  description: string;
  emoji: string;
  difficulty: "Easy" | "Medium" | "Hard" | "Legendary";
  xp: number;
  mode: string;
  requirement: Requirement;
  badge: { id: string; name: string; emoji: string; tier: string };
};

export type QuestProgress = { questId: string; current: number; target: number; complete: boolean; progress: number };

export type AchievementRule = {
  type:
    | "quests_in_category" | "quests" | "categories_with_quest" | "min_quests_per_category" | "quests_by_difficulty"
    | "bookings" | "gifts_sent" | "pools_funded_as_organizer" | "pool_contributions" | "gifts_redeemed"
    | "referrals_converted" | "reviews" | "weekly_streak" | "distinct_cities" | "distinct_countries"
    | "same_companion" | "party_size_bookings" | "bookings_filter";
  count: number;
  category?: string;
  difficulty?: Quest["difficulty"];
  min_party?: number;
  filter?: string;
};

export type Achievement = {
  id: string; name: string; emoji: string; description: string;
  rule: AchievementRule; tier: string; xp: number; group: string;
};

/** Activity that isn't visible from bookings alone. */
export type Counters = {
  poolsFundedAsOrganizer: number;
  poolContributions: number;
  giftsRedeemed: number;
  referralsConverted: number;
  reviews: number;
};

export type AchievementProgress = { achievementId: string; current: number; target: number; unlocked: boolean };
