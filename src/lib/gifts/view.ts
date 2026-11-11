import type { Contribution, Gift } from "./repo";
import { contributionBounds, fromCents, raisedCents } from "./service";

/** What anyone with the gift link sees. The redeem code is only ever shown to the organizer. */
export function giftView(g: Gift, cs: Contribution[], viewerId: string | null) {
  const raised = raisedCents(cs);
  const bounds = contributionBounds(g, cs);
  const isOrganizer = viewerId === g.organizerId;
  return {
    id: g.id, experienceId: g.experienceId, name: g.name, partySize: g.partySize, mode: g.mode, status: g.status,
    amount: fromCents(g.amountCents), raised: fromCents(raised), remaining: fromCents(Math.max(0, g.amountCents - raised)),
    minContribution: fromCents(bounds.minCents), maxContribution: fromCents(bounds.maxCents), currency: g.currency,
    recipientName: g.recipientName, organizerName: g.organizerName, note: g.note, deadline: g.deadline.toISOString(),
    contributors: cs.filter((c) => c.status !== "voided").map((c) => ({ name: c.name, amount: fromCents(c.amountCents) })),
    isOrganizer,
    redeemCode: isOrganizer ? g.redeemCode : null,
  };
}
export type GiftView = ReturnType<typeof giftView>;

/** What the recipient sees on their redeem link (no amounts). */
export function redeemView(g: Gift) {
  return {
    name: g.name, experienceId: g.experienceId, partySize: g.partySize, status: g.status,
    recipientName: g.recipientName, organizerName: g.organizerName, note: g.note, bookingId: g.bookingId,
  };
}
export type RedeemView = ReturnType<typeof redeemView>;
