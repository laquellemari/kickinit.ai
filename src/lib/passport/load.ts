import { listBookings } from "@/lib/bookings/repo";
import { listContributionsBy, listGiftsByOrganizer } from "@/lib/gifts/repo";
import { getProfile } from "@/lib/profile/repo";
import { buildActivity } from "./activity";
import { computePassport } from "./passport";

/** A visitor's passport, from everything they've booked, gifted and chipped in to. */
export async function loadPassport(userId: string) {
  const [profile, bookings, organized, contributions] = await Promise.all([
    getProfile(userId), listBookings({ userId, limit: 200 }), listGiftsByOrganizer(userId), listContributionsBy(userId),
  ]);
  return computePassport(buildActivity({ bookings, organized, contributions, ctx: { homeCity: profile.homeCity, homeCountry: profile.homeCountry } }));
}
