import type { Booking as Stored } from "@/lib/bookings/repo";
import { getExperience } from "@/lib/catalog/catalog";
import type { Contribution, Gift } from "@/lib/gifts/repo";
import type { ActivityInput } from "@/lib/quests/achievements";
import type { Booking as QuestBooking, UserContext } from "@/lib/quests/types";

const STATUS: Record<Stored["status"], QuestBooking["status"]> = { held: "held", confirmed: "captured", declined: "voided", failed: "voided" };

/** A stored booking as the quest engine sees it. */
export function questBooking(b: Stored): QuestBooking {
  return {
    id: b.id, status: STATUS[b.status], checkedIn: b.checkedInAt !== null, source: "in_app", tags: b.facts.tags,
    startsAt: b.startsAt, bookedAt: b.createdAt, localHour: b.facts.localHour, partySize: b.partySize, venue: b.itemId,
    city: b.facts.city, country: b.facts.country, cuisine: b.facts.cuisine ?? undefined, neighborhood: b.facts.neighborhood ?? undefined, isGift: false,
  };
}

/** A paid-for gift you organized counts as a gift you sent. */
export function giftAsBooking(g: Gift): QuestBooking | null {
  if (g.status !== "funded" && g.status !== "redeemed") return null;
  const e = getExperience(g.experienceId);
  return {
    id: `gift:${g.id}`, status: "captured", checkedIn: false, source: "in_app", tags: [...(e?.tags ?? []), "gift"],
    startsAt: g.createdAt, bookedAt: g.createdAt, localHour: 12, partySize: g.partySize, venue: g.experienceId,
    city: e?.city ?? "", country: e?.country ?? "", isGift: true,
  };
}

export function buildActivity(input: { bookings: Stored[]; organized: Gift[]; contributions: Contribution[]; ctx: UserContext; ratings?: number; referrals?: number }): ActivityInput {
  const gifts = input.organized.map(giftAsBooking).filter((b): b is QuestBooking => b !== null);
  return {
    bookings: [...input.bookings.map(questBooking), ...gifts],
    ctx: input.ctx,
    questProgress: [],
    counters: {
      poolsFundedAsOrganizer: input.organized.filter((g) => g.mode === "pool" && (g.status === "funded" || g.status === "redeemed")).length,
      poolContributions: input.contributions.filter((c) => c.status === "captured").length,
      giftsRedeemed: input.bookings.filter((b) => b.paypalOrderId.startsWith("gift:") && b.status === "confirmed").length,
      referralsConverted: input.referrals ?? 0,
      reviews: input.ratings ?? 0,
    },
  };
}
