import { listBookings } from "@/lib/bookings/repo";
import { listContributionsBy, listGiftsByOrganizer } from "@/lib/gifts/repo";
import { getProfile } from "@/lib/profile/repo";
import { countRatings } from "@/lib/ratings/ratings";
import { buildActivity } from "./activity";
import { computePassport } from "./passport";

/** A visitor's passport, from everything they've booked, gifted and chipped in to. */
export async function loadPassport(userId: string) {
  const [profile, bookings, organized, contributions, ratings] = await Promise.all([
    getProfile(userId), listBookings({ userId, limit: 200 }), listGiftsByOrganizer(userId), listContributionsBy(userId), countRatings(userId),
  ]);
  return computePassport(buildActivity({ bookings, organized, contributions, ratings, ctx: { homeCity: profile.homeCity, homeCountry: profile.homeCountry } }));
}
