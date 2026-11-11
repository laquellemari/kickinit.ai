import { insertBooking, transition, type Booking } from "@/lib/bookings/repo";
import { BookingError, parseStartsAt } from "@/lib/bookings/service";
import { quote } from "@/lib/catalog/catalog";
import { authorizeOrder, captureAuthorization, voidAuthorization } from "@/lib/paypal/client";
import {
  getContributionByOrder, getGift, getGiftByCode, insertContribution, insertGift, listContributions, openGiftsPastDeadline,
  setContributionStatus, transitionGift, type Contribution, type Gift,
} from "./repo";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const MIN_CONTRIBUTION_CENTS = 500;
export const toCents = (v: string) => Math.round(Number(v) * 100);
export const fromCents = (c: number) => (c / 100).toFixed(2);

export type CreateGiftInput = {
  organizerId: string; organizerName: unknown; experienceId: unknown; partySize: number; recipientName: unknown;
  note: unknown; mode: unknown; deadline?: unknown; now?: Date;
};

function text(v: unknown, label: string, max: number, required = true): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new BookingError(400, `${label} is required`);
  if (s.length > max) throw new BookingError(400, `${label} can be at most ${max} characters`);
  return s;
}

export async function createGift(input: CreateGiftInput): Promise<Gift> {
  const now = input.now ?? new Date();
  const organizerName = text(input.organizerName, "Your name", 60);
  const recipientName = text(input.recipientName, "Their name", 60);
  const note = text(input.note, "The note", 500, false);
  if (input.mode !== "solo" && input.mode !== "pool") throw new BookingError(400, "Choose to pay in full or start a group pool");
  if (typeof input.experienceId !== "string" || !input.experienceId) throw new BookingError(400, "Experience id is required");

  let deadline = new Date(now.getTime() + DAY); // solo: time to finish paying
  if (input.mode === "pool") {
    const d = typeof input.deadline === "string" ? new Date(input.deadline) : null;
    if (!d || Number.isNaN(d.getTime()) || d.getTime() < now.getTime() + HOUR || d.getTime() > now.getTime() + 14 * DAY) {
      throw new BookingError(400, "Pick a pool deadline between 1 hour and 14 days from now");
    }
    deadline = d;
  }

  let q;
  try {
    q = quote(input.experienceId, input.partySize);
  } catch (err) {
    const msg = (err as Error).message;
    throw new BookingError(msg.startsWith("Experience not found") ? 404 : 400, msg);
  }
  return insertGift({
    organizerId: input.organizerId, organizerName, experienceId: q.experienceId, name: q.description.replace(/ · .*$/, ""),
    partySize: q.partySize, amountCents: toCents(q.total), currency: q.currency, recipientName, note, mode: input.mode, deadline,
  });
}

const live = (c: Contribution) => c.status !== "voided";

export function raisedCents(contributions: Contribution[]): number {
  return contributions.filter(live).reduce((s, c) => s + c.amountCents, 0);
}

/** What the next contribution may be. Solo gifts take exactly the full amount in one go. */
export function contributionBounds(g: Gift, contributions: Contribution[]): { minCents: number; maxCents: number } {
  const remaining = Math.max(0, g.amountCents - raisedCents(contributions));
  if (g.mode === "solo") return { minCents: remaining, maxCents: remaining };
  return { minCents: Math.min(MIN_CONTRIBUTION_CENTS, remaining), maxCents: remaining };
}

/** Throws unless a contribution of `amountCents` can be taken right now. */
export function checkContribution(g: Gift, contributions: Contribution[], amountCents: number, now: Date): void {
  if (g.status !== "open" || g.deadline.getTime() <= now.getTime()) throw new BookingError(409, "This gift isn't taking contributions anymore");
  const { minCents, maxCents } = contributionBounds(g, contributions);
  if (!Number.isInteger(amountCents) || amountCents < minCents || amountCents > maxCents) {
    throw new BookingError(400, g.mode === "solo"
      ? `The gift costs $${fromCents(maxCents)}`
      : `Chip in between $${fromCents(minCents)} and $${fromCents(maxCents)}`);
  }
}

/** Once holds cover the price, charge every hold and mark the gift funded. Safe to call repeatedly. */
export async function fundIfComplete(giftId: string): Promise<Gift> {
  const g = (await getGift(giftId))!;
  const cs = await listContributions(giftId);
  if (g.status !== "open" || raisedCents(cs) < g.amountCents) return g;
  for (const c of cs.filter((x) => x.status === "held")) {
    const cap = await captureAuthorization(c.authorizationId, `capture-contribution-${c.id}`);
    await setContributionStatus(c.id, "held", "captured", cap.captureId);
  }
  return (await transitionGift(g.id, ["open"], "funded")) ?? (await getGift(g.id))!;
}

export type AddContributionInput = { giftId: string; orderId: string; name: unknown; contributorId: string; now?: Date };

/** After a contributor approves in PayPal: place their hold, check the amount fits, save, and fund the gift if it's now covered. */
export async function addContribution(input: AddContributionInput): Promise<{ gift: Gift; contribution: Contribution }> {
  const now = input.now ?? new Date();
  if (!input.orderId) throw new BookingError(400, "Order id is required");
  const name = text(input.name, "Your name", 60);
  const existing = await getContributionByOrder(input.orderId);
  if (existing) {
    if (existing.contributorId !== input.contributorId || existing.giftId !== input.giftId) throw new BookingError(409, "This payment belongs to another contribution");
    return { gift: (await getGift(existing.giftId))!, contribution: existing };
  }
  const g = await getGift(input.giftId);
  if (!g) throw new BookingError(404, "Gift not found");

  const auth = await authorizeOrder(input.orderId, `authorize-${input.orderId}`);
  const cents = auth.amount ? toCents(auth.amount.value) : NaN;
  try {
    if (auth.amount?.currency !== g.currency) throw new BookingError(400, "The payment currency doesn't match the gift");
    checkContribution(g, await listContributions(g.id), cents, now);
  } catch (err) {
    await voidAuthorization(auth.authorizationId, `void-contribution-${auth.authorizationId}`);
    throw err;
  }
  const contribution = await insertContribution({
    giftId: g.id, contributorId: input.contributorId, name, amountCents: cents, paypalOrderId: input.orderId, authorizationId: auth.authorizationId,
  });
  let gift = g;
  try {
    gift = await fundIfComplete(g.id);
  } catch (err) {
    console.error("Funding the gift failed; holds stay in place for retry:", err);
  }
  return { gift, contribution };
}

/** Deadline passed without full funding: release every hold. If it was actually covered, fund it instead. */
export async function closeIfDue(g: Gift, now: Date): Promise<Gift> {
  if (g.status !== "open" || g.deadline.getTime() > now.getTime()) return g;
  const cs = await listContributions(g.id);
  if (raisedCents(cs) >= g.amountCents) return fundIfComplete(g.id);
  for (const c of cs.filter((x) => x.status === "held")) {
    await voidAuthorization(c.authorizationId, `void-contribution-${c.id}`);
    await setContributionStatus(c.id, "held", "voided");
  }
  return (await transitionGift(g.id, ["open"], "expired")) ?? (await getGift(g.id))!;
}

/** Run by the scheduled job: close every pool whose deadline has passed. */
export async function closeDuePools(now = new Date()): Promise<{ checked: number; funded: number; expired: number; failed: number }> {
  const due = await openGiftsPastDeadline(now);
  const out = { checked: due.length, funded: 0, expired: 0, failed: 0 };
  for (const g of due) {
    try {
      const after = await closeIfDue(g, now);
      if (after.status === "funded") out.funded++;
      else out.expired++;
    } catch (err) {
      console.error(`Closing gift ${g.id} failed:`, err);
      out.failed++;
    }
  }
  return out;
}

/** The recipient picks a time; the already-paid gift becomes a confirmed booking for them. */
export async function redeemGift(input: { code: string; userId: string; startsAt: unknown; now?: Date }): Promise<{ gift: Gift; booking: Booking }> {
  const now = input.now ?? new Date();
  const g = await getGiftByCode(input.code);
  if (!g) throw new BookingError(404, "Gift not found");
  if (g.status === "open") throw new BookingError(409, "This gift is still being funded");
  if (g.status === "redeemed") throw new BookingError(409, "This gift has already been redeemed");
  if (g.status === "expired") throw new BookingError(410, "This gift pool closed before it was fully funded");
  const startsAt = parseStartsAt(input.startsAt, now);
  const claimed = await transitionGift(g.id, ["funded"], "redeemed");
  if (!claimed) throw new BookingError(409, "This gift has already been redeemed");
  const held = await insertBooking({
    userId: input.userId, kind: "partner", itemId: g.experienceId, name: g.name, partySize: g.partySize, startsAt,
    amount: fromCents(g.amountCents), currency: g.currency, paypalOrderId: `gift:${g.id}`, authorizationId: `gift:${g.id}`, holdExpiresAt: null,
  });
  const booking = (await transition(held.id, ["held"], "confirmed", `gift:${g.id}`))!;
  const gift = (await transitionGift(g.id, ["redeemed"], "redeemed", booking.id))!;
  return { gift, booking };
}
