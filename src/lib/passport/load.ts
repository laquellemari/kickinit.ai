import { listBookings } from "@/lib/bookings/repo";
import { listContributionsBy, listGiftsByOrganizer } from "@/lib/gifts/repo";
import { getProfile } from "@/lib/profile/repo";
import { countRatings } from "@/lib/ratings/ratings";
import { buildActivity } from "./activity";
import { computeCategory, computePassport } from "./passport";

async function loadActivity(userId: string) {
  const [profile, bookings, organized, contributions, ratings] = await Promise.all([
    getProfile(userId), listBookings({ userId, limit: 200 }), listGiftsByOrganizer(userId), listContributionsBy(userId), countRatings(userId),
  ]);
  return buildActivity({ bookings, organized, contributions, ratings, ctx: { homeCity: profile.homeCity, homeCountry: profile.homeCountry } });
}

/** A visitor's passport, from everything they've booked, gifted and chipped in to. */
export async function loadPassport(userId: string) {
  return computePassport(await loadActivity(userId));
}

/** One passport category with all its quests and this visitor's progress. Null for an unknown category. */
export async function loadCategory(userId: string, categoryId: string) {
  return computeCategory(await loadActivity(userId), categoryId);
}
