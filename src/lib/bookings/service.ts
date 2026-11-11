import { authorizeOrder, captureAuthorization, voidAuthorization } from "@/lib/paypal/client";
import { getBooking, getBookingByOrder, insertBooking, markCheckedIn, transition, type Booking } from "./repo";
import { priceFor } from "./pricing";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export class BookingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "BookingError";
  }
}

export type PlaceBookingInput = { orderId: string; kind: unknown; itemId: unknown; partySize: number; startsAt: unknown; userId: string; now?: Date };

export function parseStartsAt(value: unknown, now: Date): Date {
  const d = typeof value === "string" ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) throw new BookingError(400, "Pick a date and time");
  if (d.getTime() < now.getTime() + HOUR) throw new BookingError(400, "Pick a time at least an hour from now");
  if (d.getTime() > now.getTime() + 90 * DAY) throw new BookingError(400, "Bookings open up to 90 days ahead");
  return d;
}

/**
 * After the buyer approves in PayPal: place the hold, check PayPal is holding exactly our price, and save the booking.
 * Partner experiences are confirmed and charged immediately; live venues stay held until the venue confirms.
 * Safe to retry: a second call for the same PayPal order returns the existing booking.
 */
export async function placeBooking(input: PlaceBookingInput): Promise<Booking> {
  const now = input.now ?? new Date();
  if (!input.orderId) throw new BookingError(400, "Order id is required");
  const startsAt = parseStartsAt(input.startsAt, now);
  const existing = await getBookingByOrder(input.orderId);
  if (existing) {
    if (existing.userId !== input.userId) throw new BookingError(409, "This payment belongs to another booking");
    return existing;
  }

  let priced;
  try {
    priced = await priceFor(input.kind, input.itemId, input.partySize);
  } catch (err) {
    const msg = (err as Error).message;
    throw new BookingError(msg.startsWith("Experience not found") ? 404 : 400, msg);
  }

  const auth = await authorizeOrder(input.orderId, `authorize-${input.orderId}`);
  if (!auth.amount || auth.amount.value !== priced.quote.total || auth.amount.currency !== priced.quote.currency) {
    await voidAuthorization(auth.authorizationId, `void-mismatch-${auth.authorizationId}`);
    throw new BookingError(400, "The payment amount doesn't match the price, so we released the hold");
  }

  const booking = await insertBooking({
    userId: input.userId,
    kind: priced.kind,
    itemId: priced.quote.experienceId,
    name: priced.name,
    partySize: input.partySize,
    startsAt,
    amount: priced.quote.total,
    currency: priced.quote.currency,
    paypalOrderId: input.orderId,
    authorizationId: auth.authorizationId,
    holdExpiresAt: auth.expiresAt ? new Date(auth.expiresAt) : null,
    facts: priced.factsAt(startsAt),
  });

  if (booking.kind !== "partner") return booking;
  try {
    return await confirmBooking(booking.id);
  } catch (err) {
    console.error("Instant-book capture failed; booking stays held:", err);
    return booking;
  }
}

/** Venue confirmed: charge the hold. */
export async function confirmBooking(id: string): Promise<Booking> {
  const b = await getBooking(id);
  if (!b) throw new BookingError(404, "Booking not found");
  if (b.status !== "held") throw new BookingError(409, `Booking is already ${b.status}`);
  const cap = await captureAuthorization(b.authorizationId, `capture-${b.id}`);
  const done = await transition(b.id, ["held"], "confirmed", cap.captureId);
  if (!done) throw new BookingError(409, "Booking changed while confirming");
  return done;
}

/** Venue declined (or no answer): release the hold so nothing is charged. */
export async function declineBooking(id: string): Promise<Booking> {
  const b = await getBooking(id);
  if (!b) throw new BookingError(404, "Booking not found");
  if (b.status !== "held") throw new BookingError(409, `Booking is already ${b.status}`);
  await voidAuthorization(b.authorizationId, `void-${b.id}`);
  const done = await transition(b.id, ["held"], "declined");
  if (!done) throw new BookingError(409, "Booking changed while declining");
  return done;
}

/**
 * Mark a confirmed booking as attended, which is what makes it count toward quests.
 * Guests can check in from 2 hours before the start until 24 hours after; the venue desk (admin) any time.
 */
export async function checkIn(input: { id: string; userId: string | null; admin: boolean; now?: Date }): Promise<Booking> {
  const now = input.now ?? new Date();
  const b = await getBooking(input.id);
  if (!b || (!input.admin && b.userId !== input.userId)) throw new BookingError(404, "Booking not found");
  if (b.checkedInAt) return b;
  if (b.status !== "confirmed") throw new BookingError(409, "Only confirmed bookings can be checked in");
  if (!input.admin) {
    const t = b.startsAt.getTime();
    if (now.getTime() < t - 2 * HOUR) throw new BookingError(409, "Check-in opens 2 hours before your booking");
    if (now.getTime() > t + DAY) throw new BookingError(409, "Check-in closed 24 hours after your booking");
  }
  return (await markCheckedIn(b.id, now)) ?? (await getBooking(b.id))!;
}
