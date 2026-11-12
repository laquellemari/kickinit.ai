import { getBooking } from "@/lib/bookings/repo";
import { BookingError } from "@/lib/bookings/service";
import { getDb } from "@/lib/db";

export type Rating = { stars: number; note: string; createdAt: Date };
export const MAX_NOTE = 280;

/** A guest rates a visit they checked in to. Once per booking. */
export async function rateBooking(input: { bookingId: string; userId: string; stars: unknown; note?: unknown }): Promise<Rating> {
  const stars = input.stars;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) throw new BookingError(400, "Pick 1 to 5 stars");
  if (input.note !== undefined && typeof input.note !== "string") throw new BookingError(400, "A note must be text");
  const note = ((input.note as string | undefined) ?? "").trim();
  if (note.length > MAX_NOTE) throw new BookingError(400, `Keep the note to ${MAX_NOTE} characters`);
  const b = await getBooking(input.bookingId);
  if (!b || b.userId !== input.userId) throw new BookingError(404, "Booking not found");
  if (!b.checkedInAt) throw new BookingError(409, "You can rate a visit after you check in");
  const { rows } = await (await getDb()).query<{ stars: number; note: string; created_at: Date }>(
    "INSERT INTO ratings (booking_id, user_id, item_id, stars, note) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (booking_id) DO NOTHING RETURNING stars, note, created_at",
    [b.id, b.userId, b.itemId, stars, note],
  );
  if (!rows[0]) throw new BookingError(409, "You've already rated this visit");
  return { stars: rows[0].stars, note: rows[0].note, createdAt: new Date(rows[0].created_at) };
}

export async function ratingFor(bookingId: string): Promise<Rating | null> {
  const { rows } = await (await getDb()).query<{ stars: number; note: string; created_at: Date }>("SELECT stars, note, created_at FROM ratings WHERE booking_id = $1", [bookingId]);
  return rows[0] ? { stars: rows[0].stars, note: rows[0].note, createdAt: new Date(rows[0].created_at) } : null;
}

/** How many visits this guest has rated (the Critic badge). */
export async function countRatings(userId: string): Promise<number> {
  const { rows } = await (await getDb()).query<{ n: string | number }>("SELECT count(*) AS n FROM ratings WHERE user_id = $1", [userId]);
  return Number(rows[0].n);
}

/** What kickinit guests think of a venue: average stars (1 decimal) and how many ratings. */
export async function averageFor(itemId: string): Promise<{ average: number; count: number } | null> {
  const { rows } = await (await getDb()).query<{ avg: string | number | null; n: string | number }>("SELECT avg(stars) AS avg, count(*) AS n FROM ratings WHERE item_id = $1", [itemId]);
  const count = Number(rows[0].n);
  return count ? { average: Math.round(Number(rows[0].avg) * 10) / 10, count } : null;
}
