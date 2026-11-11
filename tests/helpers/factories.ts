import type { Slide } from "@/components/Carousel";

export const createSlide = (overrides: Partial<Slide> = {}): Slide => ({
  title: "Dinner on the bay",
  where: "Coconut Grove",
  photo: "waterfront dinner",
  stamp: "DINING",
  bg: "#D7E6F2",
  ...overrides,
});

export const createSlides = (n: number): Slide[] =>
  Array.from({ length: n }, (_, i) => createSlide({ title: `Slide ${i + 1}`, where: `Place ${i + 1}` }));

import type { Booking, Quest, Requirement, UserContext } from "@/lib/quests/types";

export const DAY = 86_400_000;
export const BASE = new Date("2026-11-02T19:00:00Z"); // a Monday

let seq = 0;
export const createBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: `b${++seq}`,
  status: "captured",
  checkedIn: true,
  source: "in_app",
  tags: ["restaurant", "italian"],
  startsAt: BASE,
  bookedAt: new Date(BASE.getTime() - 7 * DAY),
  localHour: 19,
  partySize: 2,
  venue: "Marea",
  city: "Miami",
  country: "US",
  isGift: false,
  ...overrides,
});

/** n bookings spaced `gapDays` apart starting at BASE. */
export const createBookingSeries = (n: number, gapDays: number, overrides: Partial<Booking> = {}) =>
  Array.from({ length: n }, (_, i) => createBooking({ startsAt: new Date(BASE.getTime() + i * gapDays * DAY), ...overrides }));

export const createRequirement = (overrides: Partial<Requirement> = {}): Requirement => ({
  type: "count", count: 3, tags: ["italian"], window_days: null, ...overrides,
});

export const createQuest = (req: Partial<Requirement> = {}, overrides: Partial<Quest> = {}): Quest => ({
  id: "q-test", category: "culinary", order: 1, title: "Test", description: "", emoji: "", difficulty: "Easy",
  xp: 100, mode: "duo", requirement: createRequirement(req),
  badge: { id: "badge-q-test", name: "Test", emoji: "", tier: "bronze" }, ...overrides,
});

export const HOME: UserContext = { homeCity: "Miami", homeCountry: "US" };

import type { Achievement, AchievementRule, Counters } from "@/lib/quests/types";

export const createCounters = (overrides: Partial<Counters> = {}): Counters => ({
  poolsFundedAsOrganizer: 0, poolContributions: 0, giftsRedeemed: 0, referralsConverted: 0, reviews: 0, ...overrides,
});

export const createAchievement = (rule: Partial<AchievementRule> & Pick<AchievementRule, "type">, overrides: Partial<Achievement> = {}): Achievement => ({
  id: "ach-test", name: "Test", emoji: "", description: "", tier: "bronze", xp: 250, group: "test",
  rule: { count: 1, ...rule } as AchievementRule, ...overrides,
});
